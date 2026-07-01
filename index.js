import express from "express";
import pa11y from "pa11y";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Get API Key (can be empty - will use fallback)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const HF_API_KEY = process.env.HF_API_KEY || "";

if (!OPENROUTER_API_KEY && !HF_API_KEY) {
  console.warn(
    "⚠️  WARNING: No API keys configured. Will use fallback suggestions."
  );
}

app.use(express.json());
app.use(express.static("public"));

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Accessibility Testing API is running");
});

// ✅ Support BOTH GET and POST
app.post("/api/test", testAccessibility);
app.get("/api/test", testAccessibility);

async function testAccessibility(req, res) {
  // Accept URL from body (POST) or query (GET)
  const targetUrl = req.body?.url || req.query?.url;

  // ✅ Proper validation
  if (!targetUrl || typeof targetUrl !== "string") {
    return res.status(400).json({
      success: false,
      error: "URL is required and must be a string",
    });
  }

  // ✅ URL format validation
  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Invalid URL format (e.g., https://example.com)",
    });
  }

  try {
    console.log(`🔍 Testing accessibility for: ${targetUrl}`);

    // ✅ Timeout wrapper for pa11y
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Accessibility test timeout (30s)")),
        30000
      )
    );

    const testPromise = pa11y(targetUrl, {
      chromeLaunchConfig: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
      timeout: 25000,
      includeWarnings: true,
      includeNotices: true,
    });

    const result = await Promise.race([testPromise, timeoutPromise]);

    // ✅ Proper null/undefined handling
    const issues = Array.isArray(result?.issues) ? result.issues : [];

    console.log(`✅ Found ${issues.length} accessibility issues`);

    // ✅ Better error handling in Promise.all
    const enhancedIssues = await Promise.all(
      issues.map(async (issue) => {
        try {
          // Safely get issue type
          const type = issue?.type?.toLowerCase?.() || "unknown";

          issue.severity =
            type === "error"
              ? "Critical"
              : type === "warning"
              ? "Moderate"
              : "Minor";

          // ✅ Better prompt & error handling for AI
          const prompt = `Provide a short accessibility fix in 1-2 sentences:
Issue: ${issue.message || "Unknown"}
Element: ${issue.selector || "N/A"}
Code: ${issue.code || "N/A"}`;

          // Try OpenRouter first, then HF, then fallback
          if (OPENROUTER_API_KEY) {
            try {
              console.log("🤖 Requesting AI suggestion via OpenRouter...");
              issue.aiSuggestion = await getOpenRouterSuggestion(
                prompt,
                OPENROUTER_API_KEY
              );
            } catch (aiError) {
              console.error("❌ OpenRouter error:", aiError.message);
              // Try HF as fallback
              if (HF_API_KEY) {
                try {
                  issue.aiSuggestion = await getHFSuggestion(
                    prompt,
                    HF_API_KEY
                  );
                } catch (hfError) {
                  console.error("❌ HF API error:", hfError.message);
                  issue.aiSuggestion = fallbackSuggestion(issue);
                }
              } else {
                issue.aiSuggestion = fallbackSuggestion(issue);
              }
            }
          } else if (HF_API_KEY) {
            try {
              console.log("🤖 Requesting AI suggestion via HuggingFace...");
              issue.aiSuggestion = await getHFSuggestion(prompt, HF_API_KEY);
            } catch (hfError) {
              console.error("❌ HF API error:", hfError.message);
              issue.aiSuggestion = fallbackSuggestion(issue);
            }
          } else {
            issue.aiSuggestion = fallbackSuggestion(issue);
          }

          return issue;
        } catch (mapError) {
          console.error("❌ Error processing issue:", mapError);
          return {
            ...issue,
            aiSuggestion: fallbackSuggestion(issue),
          };
        }
      })
    );

    // ✅ Success response with metadata
    res.status(200).json({
      success: true,
      url: targetUrl,
      issues: enhancedIssues,
    });
  } catch (err) {
    console.error("❌ Accessibility test error:", err.message, err.stack);

    // ✅ More specific error responses
    let statusCode = 500;
    let errorMessage = "Failed to analyze website";

    if (err.message.includes("timeout")) {
      statusCode = 504;
      errorMessage = "Website took too long to analyze";
    } else if (
      err.message.includes("ERR_INVALID_URL") ||
      err.message.includes("ENOTFOUND")
    ) {
      statusCode = 400;
      errorMessage = "Invalid or unreachable URL";
    } else if (err.message.includes("ECONNREFUSED")) {
      statusCode = 400;
      errorMessage = "Connection refused by the website";
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

// ✅ OpenRouter API Function
async function getOpenRouterSuggestion(prompt, apiKey) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 80,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "OpenRouter API error");
    }

    const data = await response.json();
    const suggestion =
      data.choices?.[0]?.message?.content?.trim() || null;

    if (!suggestion) {
      throw new Error("No response from OpenRouter");
    }

    return suggestion;
  } catch (error) {
    throw new Error(`OpenRouter: ${error.message}`);
  }
}

// ✅ HuggingFace API Function (for fallback)
async function getHFSuggestion(prompt, apiKey) {
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/gpt2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 80,
            temperature: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Handle array response from HF
    if (Array.isArray(data) && data[0]?.generated_text) {
      const suggestion = data[0].generated_text
        .replace(prompt, "")
        .trim();
      
      if (suggestion) return suggestion;
    }
    
    throw new Error("No valid response from HuggingFace");
  } catch (error) {
    throw new Error(`HuggingFace: ${error.message}`);
  }
}

// ✅ Fallback suggestion
function fallbackSuggestion(issue) {
  const msg = (issue?.message || "").toLowerCase();

  if (msg.includes("alt") || msg.includes("image"))
    return "Add descriptive alt text for all images to help screen readers.";
  if (msg.includes("contrast"))
    return "Increase color contrast to meet WCAG AA standards (at least 4.5:1).";
  if (msg.includes("heading"))
    return "Use proper hierarchical heading structure (h1, h2, h3...).";
  if (msg.includes("label") || msg.includes("form"))
    return "Add associated label elements for all form inputs.";
  if (msg.includes("link"))
    return "Use descriptive link text that explains the destination.";
  if (msg.includes("aria"))
    return "Ensure ARIA attributes are valid and necessary for functionality.";
  if (msg.includes("landmark"))
    return "Use semantic HTML5 landmarks (nav, main, aside, footer).";

  return "Review WCAG 2.1 accessibility guidelines for compliance.";
}

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ✅ Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 API endpoint: POST/GET http://localhost:${PORT}/api/test`);
  if (OPENROUTER_API_KEY) {
    console.log(`🤖 AI Provider: OpenRouter (FREE)`);
  } else if (HF_API_KEY) {
    console.log(`🤖 AI Provider: HuggingFace`);
  } else {
    console.log(`🤖 AI Provider: Fallback (No API key)`);
  }
});