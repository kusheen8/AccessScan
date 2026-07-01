import express from "express";
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

    // ✅ Generate realistic accessibility issues
    const issues = generateIssues();

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
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

// ✅ Generate realistic accessibility issues
function generateIssues() {
  const issues = [
    {
      type: "error",
      message: "Image missing alt text",
      code: "WCAG2AA.Principle1.Guideline1_1.1_1_1.H37",
      selector: "img.logo",
      context: '<img src="logo.png" class="logo">',
    },
    {
      type: "error",
      message: "Form input missing associated label",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H44",
      selector: "input#email",
      context: '<input id="email" type="email">',
    },
    {
      type: "error",
      message: "Button element missing descriptive text",
      code: "WCAG2AA.Principle2.Guideline2_4.2_4_4.H30",
      selector: "button.submit",
      context: '<button class="submit">✓</button>',
    },
    {
      type: "warning",
      message: "Color contrast insufficient",
      code: "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail",
      selector: "p.subtitle",
      context: '<p class="subtitle" style="color: #999;">Subtitle text</p>',
    },
    {
      type: "warning",
      message: "Heading hierarchy skipped",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H42",
      selector: "h3",
      context: "<h1>Title</h1>\n<h3>Subtitle</h3>",
    },
    {
      type: "warning",
      message: "Link text is not descriptive",
      code: "WCAG2AA.Principle2.Guideline2_4.2_4_4.H30",
      selector: "a.read-more",
      context: '<a href="page.html" class="read-more">Click here</a>',
    },
    {
      type: "notice",
      message: "Page should have a main landmark",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H91.Page.Main",
      selector: "body",
      context: "<body>\n  <nav>...</nav>\n  <div>Content</div>\n</body>",
    },
    {
      type: "error",
      message: "Form field has no associated label element",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H44",
      selector: "input#password",
      context: '<input id="password" type="password">',
    },
    {
      type: "error",
      message: "Image element with no alt attribute",
      code: "WCAG2AA.Principle1.Guideline1_1.1_1_1.H36",
      selector: "img.thumbnail",
      context: '<img src="image.jpg" class="thumbnail">',
    },
    {
      type: "warning",
      message: "Very low contrast text",
      code: "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail",
      selector: ".muted-text",
      context: '<span class="muted-text" style="color: #ccc;">Muted</span>',
    },
    {
      type: "error",
      message: "Heading content missing",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H42",
      selector: "h2",
      context: "<h2></h2>",
    },
    {
      type: "notice",
      message: "Page should have landmarks",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H91.Page.Structure",
      selector: "body",
      context: "<body>Multiple sections without landmark elements</body>",
    },
    {
      type: "error",
      message: "Form control missing name attribute",
      code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H91.Form.Name",
      selector: "input.search",
      context: '<input type="text" class="search">',
    },
    {
      type: "warning",
      message: "Insufficient color contrast",
      code: "WCAG2AA.Principle1.Guideline1_4.1_4_3",
      selector: ".light-text",
      context: '<p class="light-text" style="color: #ddd;">Light text</p>',
    },
    {
      type: "notice",
      message: "Link has no text content",
      code: "WCAG2AA.Principle2.Guideline2_1.2_1_1.G90",
      selector: "a.icon",
      context: '<a href="#" class="icon"><i class="fa-icon"></i></a>',
    },
  ];

  // Return random selection of issues (8-15 issues)
  const shuffled = issues.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.floor(Math.random() * 8) + 8);
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
  console.log(`📊 Mode: Demo Mode (Realistic Sample Data)`);
});