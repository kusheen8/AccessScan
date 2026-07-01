import express from 'express';
import pa11y from 'pa11y';
import dotenv from 'dotenv';
import { HfInference } from '@huggingface/inference';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const inference = new HfInference(process.env.HF_API_KEY);

app.use(express.static('public'));
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.send('Accessibility Testing API is running');
});

// Route — Analyze accessibility
app.get('/api/test', async (req, res) => {
  if (!req.query.url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const targetUrl = req.query.url;
  
  // Validate URL format
  try {
    new URL(targetUrl);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  console.log(`Testing accessibility for: ${targetUrl}`);

  try {
    // Run pa11y accessibility test
    const result = await pa11y(targetUrl, {
      timeout: 30000,
      wait: 1000,
    });
    
    const issues = result.issues || [];
    console.log(`Found ${issues.length} accessibility issues`);

    if (issues.length === 0) {
      return res.status(200).json({ 
        issues: [], 
        message: 'No accessibility issues found!' 
      });
    }

    // Limit to first 10 issues to avoid rate limiting
    const limitedIssues = issues.slice(0, 10);

    // For each issue, get AI suggestions
    const enhancedIssues = await Promise.all(
      limitedIssues.map(async (issue, index) => {
        console.log(`Getting AI suggestion for issue ${index + 1}/${limitedIssues.length}`);
        
        const prompt = `You are an accessibility expert. Provide a brief, actionable fix for this WCAG accessibility issue:

Issue: ${issue.message}
Element: ${issue.selector || 'N/A'}
Code: ${issue.code}

Provide only the fix suggestion in 1-2 sentences.`;

        try {
          const response = await inference.chatCompletion({
            model: 'mistralai/Mistral-7B-Instruct-v0.2',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 100,
            temperature: 0.3,
          });

          issue.aiSuggestion = response.choices[0].message.content.trim();
          console.log(`✓ Got AI suggestion for issue ${index + 1}`);
        } catch (error) {
          console.error(`✗ AI suggestion failed for issue ${index + 1}:`, error.message);
          
          // Provide a fallback suggestion based on issue type
          issue.aiSuggestion = getFallbackSuggestion(issue);
        }
        
        return issue;
      })
    );

    res.status(200).json({ 
      issues: enhancedIssues,
      totalIssues: issues.length,
      analyzedIssues: enhancedIssues.length
    });

  } catch (err) {
    console.error('Error during accessibility test:', err);
    res.status(500).json({ 
      error: 'Failed to analyze website',
      details: err.message 
    });
  }
});

// Fallback suggestions for common accessibility issues
function getFallbackSuggestion(issue) {
  const message = issue.message.toLowerCase();
  
  if (message.includes('alt') || message.includes('image')) {
    return 'Add descriptive alt text to the image that conveys its purpose and content to screen reader users.';
  } else if (message.includes('contrast')) {
    return 'Increase the color contrast ratio between text and background to at least 4.5:1 for normal text or 3:1 for large text.';
  } else if (message.includes('heading')) {
    return 'Ensure heading levels follow a logical hierarchy (h1, h2, h3) without skipping levels.';
  } else if (message.includes('label') || message.includes('form')) {
    return 'Add a descriptive label element associated with this form input using the "for" attribute or wrap the input with a label.';
  } else if (message.includes('link')) {
    return 'Provide descriptive link text that makes sense out of context. Avoid generic phrases like "click here".';
  } else if (message.includes('aria')) {
    return 'Ensure ARIA attributes are used correctly and that the element has a valid role and accessible name.';
  } else if (message.includes('landmark')) {
    return 'Use semantic HTML5 elements (header, nav, main, footer) or ARIA landmark roles to structure the page.';
  } else {
    return 'Review WCAG guidelines for this issue and ensure the element is accessible to all users.';
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test?url=https://example.com`);
});