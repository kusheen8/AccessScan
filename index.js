import express from 'express';
import pa11y from 'pa11y';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import { HfInference } from '@huggingface/inference';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ⭐ Initialize HuggingFace safely
const inference = new HfInference(process.env.HF_API_KEY || '');

app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/', (req, res) => {
  res.send('Accessibility Testing API is running');
});

// Accessibility test endpoint
app.get('/api/test', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  let browser;

  try {
    // ⭐ RAILWAY SAFE PUPPETEER LAUNCH
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });

    const result = await pa11y(targetUrl, {
      browser,
      timeout: 20000,
      includeWarnings: true,
      includeNotices: true,
    });

    const issues = result.issues || [];

    const enhancedIssues = await Promise.all(
      issues.map(async (issue) => {

        const type = issue.type?.toLowerCase();

        issue.severity =
          type === 'error' ? 'Critical' :
          type === 'warning' ? 'Moderate' :
          'Minor';

        const prompt = `You are an accessibility expert.
Provide a short actionable fix:

Issue: ${issue.message}
Element: ${issue.selector || 'N/A'}
Code: ${issue.code}

Give only the fix in 1-2 sentences.`;

        try {
          if (process.env.HF_API_KEY) {
            const response = await inference.chatCompletion({
              model: 'mistralai/Mistral-7B-Instruct-v0.2',
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 100,
              temperature: 0.3,
            });

            issue.aiSuggestion =
              response?.choices?.[0]?.message?.content?.trim() ||
              fallbackSuggestion(issue);
          } else {
            issue.aiSuggestion = fallbackSuggestion(issue);
          }
        } catch {
          issue.aiSuggestion = fallbackSuggestion(issue);
        }

        return issue;
      })
    );

    res.status(200).json({ issues: enhancedIssues });

  } catch (err) {
    console.error('Accessibility test error:', err.stack || err);
    res.status(500).json({
      error: 'Failed to analyze website',
      details: err.message,
    });
  } finally {
    if (browser) await browser.close();
  }
});

// ⭐ Fallback suggestions
function fallbackSuggestion(issue) {
  const msg = issue.message.toLowerCase();

  if (msg.includes('alt') || msg.includes('image')) return 'Add descriptive alt text.';
  if (msg.includes('contrast')) return 'Increase color contrast to meet WCAG.';
  if (msg.includes('heading')) return 'Use logical heading hierarchy.';
  if (msg.includes('label') || msg.includes('form')) return 'Add proper label for form input.';
  if (msg.includes('link')) return 'Provide descriptive link text.';
  if (msg.includes('aria')) return 'Ensure ARIA attributes are valid.';
  if (msg.includes('landmark')) return 'Use semantic HTML5 landmarks.';

  return 'Review WCAG guidelines.';
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});