import express from "express";
import pa11y from "pa11y";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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
  try {
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

    // ✅ Add smart suggestions to each issue
    const enhancedIssues = issues.map((issue) => {
      const type = issue?.type?.toLowerCase?.() || "unknown";

      issue.severity =
        type === "error"
          ? "Critical"
          : type === "warning"
          ? "Moderate"
          : "Minor";

      // ✅ Use smart fallback suggestions
      issue.aiSuggestion = getSuggestion(issue);

      return issue;
    });

    // ✅ Success response
    return res.status(200).json({
      success: true,
      url: targetUrl,
      issues: enhancedIssues,
    });
  } catch (err) {
    console.error("❌ Error:", err.message);

    // ✅ More specific error responses
    let statusCode = 500;
    let errorMessage = "Failed to analyze website";

    if (err.message.includes("timeout")) {
      statusCode = 504;
      errorMessage = "Website took too long to analyze. Please try again.";
    } else if (
      err.message.includes("ERR_INVALID_URL") ||
      err.message.includes("ENOTFOUND") ||
      err.message.includes("getaddrinfo")
    ) {
      statusCode = 400;
      errorMessage = "Website not found or unreachable. Check the URL and try again.";
    } else if (err.message.includes("ECONNREFUSED")) {
      statusCode = 400;
      errorMessage = "Cannot connect to website. Make sure it's online.";
    } else if (err.message.includes("Chrome") || err.message.includes("Chromium")) {
      statusCode = 503;
      errorMessage = "Service temporarily unavailable. Please try again in a moment.";
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

// ✅ Smart suggestion generator
function getSuggestion(issue) {
  const msg = (issue?.message || "").toLowerCase();
  const code = (issue?.code || "").toLowerCase();

  // Image/Alt text issues
  if (msg.includes("alt") || code.includes("h37") || msg.includes("image")) {
    return "Add descriptive alt text to all images. Use text that describes the image content and purpose, not just the filename.";
  }

  // Contrast issues
  if (msg.includes("contrast") || code.includes("contrast")) {
    return "Increase color contrast between text and background. Aim for at least 4.5:1 ratio for normal text to meet WCAG AA standards.";
  }

  // Heading issues
  if (msg.includes("heading") || code.includes("heading")) {
    return "Use proper heading hierarchy (h1, h2, h3). Don't skip heading levels, and use only one h1 per page.";
  }

  // Form/Label issues
  if (msg.includes("label") || msg.includes("form") || code.includes("label")) {
    return "Associate each form input with a label using the <label> tag and for attribute to make inputs accessible to screen readers.";
  }

  // Link issues
  if (msg.includes("link") || code.includes("link")) {
    return "Use descriptive link text that explains where the link goes. Avoid generic text like 'Click here' or 'Read more'.";
  }

  // ARIA issues
  if (msg.includes("aria")) {
    return "Ensure ARIA attributes are used correctly and only when necessary. Use semantic HTML elements whenever possible instead.";
  }

  // Landmark issues
  if (msg.includes("landmark") || msg.includes("main")) {
    return "Use semantic HTML5 landmark elements like <nav>, <main>, <aside>, and <footer> to structure page content.";
  }

  // Button issues
  if (msg.includes("button")) {
    return "Use semantic button elements (<button>) instead of div or other elements. Ensure buttons have descriptive labels.";
  }

  // Text issues
  if (msg.includes("text") && (msg.includes("color") || msg.includes("background"))) {
    return "Ensure text is readable with sufficient color contrast and appropriate font sizes.";
  }

  // Default suggestion
  return "Review WCAG 2.1 Level AA guidelines to fix this accessibility issue.";
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
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
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
  console.log(`🤖 AI Provider: Smart Fallback Suggestions`);
});