import express from "express";
import dotenv from "dotenv";
import pa11y from "pa11y";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "express-rate-limit";
import puppeteer from "puppeteer";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const SCAN_TIMEOUT = 60000;
const SCAN_RENDER_WAIT = 2500;
const SCAN_TIMEOUT_MESSAGE =
  "The website took too long to load or could not be scanned. Please try again later or use another website.";
const AI_REQUEST_TIMEOUT = 20000;
const GEMINI_MODEL = "gemini-2.5-flash";
const HUGGINGFACE_MODEL =
  process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static("public"));

const scanRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many accessibility scans. Please try again in a few minutes.",
  },
});

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Accessibility Testing API is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ✅ Support BOTH GET and POST
app.post("/api/test", scanRateLimiter, testAccessibility);
app.get("/api/test", scanRateLimiter, testAccessibility);

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
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid URL format (e.g., https://example.com)",
      });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        error: "URL must start with http:// or https://",
      });
    }

    console.log(`🔍 Testing accessibility for: ${targetUrl}`);

    // ✅ Run real Pa11y accessibility scan
    const issues = await runPa11yScan(targetUrl);

    console.log(`✅ Found ${issues.length} accessibility issues`);

    // ✅ Add severity to each Pa11y issue before generating AI suggestions
    const normalizedIssues = issues.map((rawIssue) => {
      const issue = normalizePa11yIssue(rawIssue);
      const type = issue?.type?.toLowerCase?.() || "unknown";

      issue.severity =
        type === "error"
          ? "Critical"
          : type === "warning"
          ? "Moderate"
          : "Minor";

      return issue;
    });

    const enhancedIssues = await addAISuggestions(normalizedIssues);

    // ✅ Success response
    return res.status(200).json({
      success: true,
      url: targetUrl,
      issues: enhancedIssues,
    });
  } catch (err) {
    const errMessage = String(err?.message || "");

    console.error("❌ Error:", errMessage);

    // ✅ More specific error responses
    let statusCode = 500;
    let errorMessage = "Failed to analyze website";

    const errorInfo = getScanErrorResponse(err);

    if (errorInfo) {
      statusCode = errorInfo.statusCode;
      errorMessage = errorInfo.errorMessage;
    } else if (errMessage.includes("timeout")) {
      statusCode = 504;
      errorMessage = SCAN_TIMEOUT_MESSAGE;
    } else if (
      errMessage.includes("ERR_INVALID_URL") ||
      errMessage.includes("ENOTFOUND") ||
      errMessage.includes("getaddrinfo")
    ) {
      statusCode = 400;
      errorMessage = "Website not found or unreachable. Check the URL and try again.";
    } else if (errMessage.includes("ECONNREFUSED")) {
      statusCode = 400;
      errorMessage = "Cannot connect to website. Make sure it's online.";
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      details: process.env.NODE_ENV === "development" ? errMessage : undefined,
    });
  }
}

async function runPa11yScan(targetUrl) {
  console.log(`🔍 Scan start: ${targetUrl}`);

  try {
    const issues = await runSinglePa11yScan(targetUrl);

    console.log(`✅ Scan success: ${targetUrl}`);
    return issues;
  } catch (err) {
    if (!isScanTimeoutError(err)) {
      console.error(`❌ Scan failure: ${targetUrl} - ${getSafeErrorMessage(err)}`);
      throw err;
    }

    console.warn(`⏱️ Scan timeout: ${targetUrl} - ${getSafeErrorMessage(err)}`);
    console.log(`🔁 Retrying scan once: ${targetUrl}`);

    try {
      const issues = await runSinglePa11yScan(targetUrl);

      console.log(`✅ Scan success after retry: ${targetUrl}`);
      return issues;
    } catch (retryErr) {
      console.error(
        `❌ Scan failure after retry: ${targetUrl} - ${getSafeErrorMessage(retryErr)}`
      );
      throw retryErr;
    }
  }
}

async function runSinglePa11yScan(targetUrl) {
  const executablePath = puppeteer.executablePath();

  const results = await pa11y(targetUrl, {
    standard: "WCAG2AA",
    timeout: SCAN_TIMEOUT,
    wait: SCAN_RENDER_WAIT,
    chromeLaunchConfig: {
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  return Array.isArray(results?.issues) ? results.issues : [];
}

function normalizePa11yIssue(issue = {}) {
  return {
    type: normalizeIssueType(issue.type),
    message: issue.message || "Accessibility issue found",
    code: issue.code || "N/A",
    selector: issue.selector || "",
    context: issue.context || "",
  };
}

function normalizeIssueType(type = "") {
  const normalizedType = String(type).toLowerCase();

  if (["error", "warning", "notice"].includes(normalizedType)) {
    return normalizedType;
  }

  return "notice";
}

function getScanErrorResponse(err) {
  const message = String(err?.message || "").toLowerCase();

  if (isScanTimeoutError(err)) {
    return {
      statusCode: 504,
      errorMessage: SCAN_TIMEOUT_MESSAGE,
    };
  }

  if (
    message.includes("err_name_not_resolved") ||
    message.includes("enotfound") ||
    message.includes("getaddrinfo") ||
    message.includes("err_connection_refused") ||
    message.includes("econnrefused") ||
    message.includes("err_connection_timed_out")
  ) {
    return {
      statusCode: 400,
      errorMessage: "Website not found or unreachable. Check the URL and try again.",
    };
  }

  if (
    message.includes("err_cert") ||
    message.includes("certificate") ||
    message.includes("ssl")
  ) {
    return {
      statusCode: 400,
      errorMessage: "Website SSL certificate could not be verified.",
    };
  }

  if (
    message.includes("failed to launch") ||
    message.includes("could not find chrome") ||
    message.includes("could not find chromium") ||
    message.includes("browser process")
  ) {
    return {
      statusCode: 500,
      errorMessage: "Accessibility scanner failed to start. Please try again later.",
    };
  }

  if (message.includes("pa11y")) {
    return {
      statusCode: 500,
      errorMessage: "Accessibility scan failed. Please try again later.",
    };
  }

  return null;
}

function isScanTimeoutError(err) {
  const message = String(err?.message || "").toLowerCase();

  return (
    err?.name === "TimeoutError" ||
    err?.name === "AbortError" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("navigation timeout") ||
    message.includes("err_timed_out") ||
    message.includes("err_connection_timed_out")
  );
}

async function addAISuggestions(issues = []) {
  if (!issues.length) {
    return [];
  }

  console.log(`Generating AI suggestions for ${issues.length} issues...`);

  try {
    const geminiSuggestions = await getGeminiSuggestions(issues);

    console.log("Using Google Gemini");
    return attachSuggestions(issues, geminiSuggestions);
  } catch (err) {
    console.warn("Gemini batch suggestion failed:", getSafeErrorMessage(err));
  }

  try {
    const huggingFaceSuggestions = await getHuggingFaceSuggestions(issues);

    console.log("Using Hugging Face fallback.");
    return attachSuggestions(issues, huggingFaceSuggestions);
  } catch (err) {
    console.warn("Hugging Face batch suggestion failed:", getSafeErrorMessage(err));
  }

  console.log("Using local fallback suggestions.");
  return issues.map((issue) => ({
    ...issue,
    aiSuggestion: getLocalSuggestion(issue),
  }));
}

function getLocalSuggestion(issue) {
  return (
    getSuggestion(issue) ||
    "Review WCAG 2.1 Level AA guidelines to fix this accessibility issue."
  );
}

async function getGeminiSuggestions(issues) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: createBatchSuggestionPrompt(issues),
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
        maxOutputTokens: Math.min(Math.max(issues.length * 90, 600), 4000),
      },
    }),
    AI_REQUEST_TIMEOUT
  );

  const rawResponse = response;
  const extractedText = getGeminiText(rawResponse);
  let cleanedJSON = "";
  let suggestions;

  try {
    cleanedJSON = cleanJSONText(extractedText);
    suggestions = parseAISuggestions(cleanedJSON);
  } catch (err) {
    console.warn("Raw Gemini SDK response:", truncateText(formatDebugValue(rawResponse), 2000));
    console.warn("Extracted Gemini text:", truncateText(formatDebugValue(extractedText), 2000));
    console.warn("Cleaned Gemini JSON:", truncateText(formatDebugValue(cleanedJSON), 2000));
    console.warn("Gemini JSON parse error:", getSafeErrorMessage(err));
    throw err;
  }

  if (!suggestions.size) {
    throw new Error("Gemini returned no usable suggestions");
  }

  return suggestions;
}

function getGeminiText(response) {
  const directText =
    typeof response?.text === "function" ? response.text() : response?.text;

  if (typeof directText === "string") {
    return directText;
  }

  const parts = response?.candidates?.[0]?.content?.parts;

  if (Array.isArray(parts)) {
    return parts
      .map((part) => extractTextValue(part))
      .filter(Boolean)
      .join("\n");
  }

  return extractTextValue(response) || "";
}

async function getHuggingFaceSuggestions(issues) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    throw new Error("Hugging Face API key is not configured");
  }

  const response = await fetchWithTimeout(
    `https://api-inference.huggingface.co/models/${HUGGINGFACE_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: createBatchSuggestionPrompt(issues),
        parameters: {
          max_new_tokens: Math.min(Math.max(issues.length * 90, 600), 3000),
          return_full_text: false,
          temperature: 0.2,
        },
        options: {
          wait_for_model: true,
        },
      }),
    },
    AI_REQUEST_TIMEOUT
  );

  if (!response.ok) {
    throw new Error(`Hugging Face request failed with status ${response.status}`);
  }

  const data = await response.json();
  const suggestions = parseAISuggestions(extractHuggingFaceText(data));

  if (!suggestions.size) {
    throw new Error("Hugging Face returned no usable suggestions");
  }

  return suggestions;
}

function createBatchSuggestionPrompt(issues) {
  const promptIssues = issues.map((issue, issueIndex) => ({
    issueIndex,
    message: issue.message || "Accessibility issue found",
    code: issue.code || "N/A",
    severity: issue.severity || "Minor",
  }));

  return `Senior Accessibility Engineer. For each Pa11y WCAG issue, write one concise remediation suggestion in 40-50 words max. Return only valid JSON.

Example format:
[
  {
    "issueIndex": 0,
    "suggestion": "..."
  },
  {
    "issueIndex": 1,
    "suggestion": "..."
  }
]

Issues:
${JSON.stringify(promptIssues, null, 2)}`;
}

function parseAISuggestions(text) {
  const parsed = JSON.parse(cleanJSONText(text));

  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not a JSON array");
  }

  return parsed.reduce((suggestions, item) => {
    const issueIndex = Number(item?.issueIndex);
    const suggestion = normalizeSuggestionText(item?.suggestion);

    if (Number.isInteger(issueIndex) && suggestion) {
      suggestions.set(issueIndex, suggestion);
    }

    return suggestions;
  }, new Map());
}

function cleanJSONText(text) {
  if (typeof text !== "string") {
    throw new Error("AI response text was not a string");
  }

  const cleanedText = text.trim();

  if (!cleanedText) {
    throw new Error("AI returned an empty response");
  }

  const fencedMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = cleanedText.indexOf("[");
  const endIndex = cleanedText.lastIndexOf("]");

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("AI response did not contain a JSON array");
  }

  return cleanedText.slice(startIndex, endIndex + 1);
}

function attachSuggestions(issues, suggestions) {
  return issues.map((issue, issueIndex) => {
    const suggestion = suggestions.get(issueIndex);

    return {
      ...issue,
      aiSuggestion:
        typeof suggestion === "string" && suggestion
          ? suggestion
          : getLocalSuggestion(issue),
    };
  });
}

function extractHuggingFaceText(data) {
  if (Array.isArray(data)) {
    return data[0]?.generated_text || data[0]?.summary_text || data[0]?.text;
  }

  return data?.generated_text || data?.summary_text || data?.text;
}

function cleanAISuggestion(text) {
  return String(text || "")
    .replace(/```/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSuggestionText(value) {
  if (typeof value === "string") {
    return cleanAISuggestion(value);
  }

  if (!value) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return cleanAISuggestion(value);
  }

  if (Array.isArray(value)) {
    return cleanAISuggestion(value.map(normalizeSuggestionText).filter(Boolean).join(" "));
  }

  if (typeof value === "object") {
    const directText = extractTextValue(value);

    if (directText) {
      return cleanAISuggestion(directText);
    }

    return cleanAISuggestion(
      Object.values(value)
        .map(normalizeSuggestionText)
        .filter(Boolean)
        .join(" ")
    );
  }

  return "";
}

function extractTextValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const textKeys = ["text", "content", "generated_text", "summary_text", "message"];

  for (const key of textKeys) {
    if (typeof value[key] === "string") {
      return value[key];
    }

    if (value[key] && typeof value[key] === "object") {
      const nestedText = extractTextValue(value[key]);

      if (nestedText) {
        return nestedText;
      }
    }
  }

  if (Array.isArray(value.parts)) {
    return value.parts
      .map((part) => extractTextValue(part))
      .filter(Boolean)
      .join("\n");
  }

  if (Array.isArray(value.candidates)) {
    return value.candidates
      .map((candidate) => extractTextValue(candidate))
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function formatDebugValue(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(text = "", maxLength = 500) {
  const value = String(text);

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout(promise, timeoutMs = AI_REQUEST_TIMEOUT) {
  let timeout;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const err = new Error("request timed out");
          err.name = "AbortError";
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function getSafeErrorMessage(err) {
  if (err?.name === "AbortError") {
    return "request timed out";
  }

  return String(err?.message || "unknown error");
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
  console.log(`🤖 AI Provider: Google Gemini -> Hugging Face -> Local Fallback`);
  console.log(`📊 Mode: Real Pa11y Accessibility Scans`);
});