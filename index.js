import express from "express";
import pa11y from "pa11y";
import dotenv from "dotenv";
import { HfInference } from "@huggingface/inference";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize HuggingFace (v2.6.x compatible)
const inference = new HfInference(process.env.HF_API_KEY || "");

app.use(express.json());
app.use(express.static("public"));

// Health check
app.get("/", (req, res) => {
  res.send("Accessibility Testing API is running");
});

// Accessibility test endpoint
app.get("/api/test", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    // ✅ Let Pa11y handle browser internally
    const result = await pa11y(targetUrl, {
      chromeLaunchConfig: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
      timeout: 30000,
      includeWarnings: true,
      includeNotices: true,
    });

    const issues = result.issues || [];

    const enhancedIssues = await Promise.all(
      issues.map(async (issue) => {
        const type = issue.type?.toLowerCase();

        issue.severity =
          type === "error"
            ? "Critical"
            : type === "warning"
            ? "Moderate"
            : "Minor";

        // AI Suggestion
        const prompt = `Provide a short accessibility fix:

Issue: ${issue.message}
Element: ${issue.selector || "N/A"}
Code: ${issue.code}

Give only the fix in 1-2 sentences.`;

        try {
          if (process.env.HF_API_KEY) {
            const response = await inference.textGeneration({
              model: "mistralai/Mistral-7B-Instruct-v0.2",
              inputs: prompt,
              parameters: {
                max_new_tokens: 80,
                temperature: 0.3,
              },
            });

            issue.aiSuggestion =
              response?.generated_text?.trim() ||
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
    console.error("Accessibility test error:", err);
    res.status(500).json({
      error: "Failed to analyze website",
      details: err.message,
    });
  }
});

// Fallback suggestion
function fallbackSuggestion(issue) {
  const msg = issue.message.toLowerCase();

  if (msg.includes("alt") || msg.includes("image"))
    return "Add descriptive alt text for images.";
  if (msg.includes("contrast"))
    return "Increase color contrast to meet WCAG guidelines.";
  if (msg.includes("heading"))
    return "Use proper hierarchical heading structure.";
  if (msg.includes("label") || msg.includes("form"))
    return "Add associated label elements for form inputs.";
  if (msg.includes("link"))
    return "Use descriptive link text instead of generic text.";
  if (msg.includes("aria"))
    return "Ensure ARIA attributes are valid and necessary.";
  if (msg.includes("landmark"))
    return "Use semantic HTML5 landmarks for structure.";

  return "Review WCAG accessibility guidelines.";
}

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});