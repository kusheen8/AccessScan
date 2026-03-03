// ⭐ GLOBAL STORAGE FOR ALL ISSUES (VERY IMPORTANT)
let ALL_ISSUES = [];
let CURRENT_URL = "";

// ⭐ Improved Accessibility Score (REALISTIC)
const calculateScore = (issues = []) => {
  if (!issues.length) return 100;

  let penalty = 0;

  issues.forEach((issue) => {
    const type = issue.type?.toLowerCase() || "notice";

    if (type === "error") penalty += 6; // Critical
    else if (type === "warning") penalty += 2; // Moderate
    else if (type === "notice") penalty += 0.2; // Minor (VERY LOW IMPACT)
  });

  let score = Math.round(100 - penalty);

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
};

// ⭐ Handle accessibility form submission
const testAccessibility = async (e) => {
  e.preventDefault();
  const url = document.querySelector("#url")?.value?.trim();

  if (!url) {
    alert("Please enter a valid URL.");
    return;
  }

  // ✅ Validate URL format before sending
  try {
    new URL(url);
  } catch {
    alert("Invalid URL format. Use https://example.com");
    return;
  }

  setLoading(true);
  CURRENT_URL = url;

  try {
    // ✅ Try POST first, fallback to GET
    let response;

    try {
      // Try POST (recommended)
      response = await fetch("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
    } catch (postError) {
      console.warn("POST failed, trying GET...", postError);
      // Fallback to GET
      response = await fetch(`/api/test?url=${encodeURIComponent(url)}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP ${response.status}: Failed to analyze website`
      );
    }

    const data = await response.json();

    // ✅ Check success flag
    if (!data.success) {
      throw new Error(data.error || "Failed to analyze website");
    }

    // ✅ Handle case where issues might be empty
    const issues = Array.isArray(data.issues) ? data.issues : [];

    ALL_ISSUES = issues; // ⭐ SAVE FULL DATA FOR PDF
    addIssuesToDOM(issues);
  } catch (error) {
    console.error("❌ Error:", error);
    alert(error.message || "Failed to analyze website");
  } finally {
    setLoading(false);
  }
};

// ⭐ Add issues with AI suggestions to the DOM
// ✅ Using your existing CSS classes
const addIssuesToDOM = (issues = []) => {
  const issuesOutput = document.querySelector("#issues");

  if (!issuesOutput) {
    console.error("❌ #issues element not found in DOM");
    return;
  }

  issuesOutput.innerHTML = "";

  if (!issues.length) {
    issuesOutput.innerHTML = `
      <div class="alert alert-success text-center">
        ✅ No accessibility issues found! Your website is fully accessible.
      </div>`;
    return;
  }

  // ✅ Count issues with correct type names
  const counts = { error: 0, warning: 0, notice: 0 };

  // ⭐ Sort Critical → Moderate → Minor
  const order = { error: 1, warning: 2, notice: 3 };
  const sortedIssues = [...issues].sort(
    (a, b) => (order[a.type] || 4) - (order[b.type] || 4)
  );

  sortedIssues.forEach((issue) => {
    const type = issue.type?.toLowerCase() || "notice";
    if (counts.hasOwnProperty(type)) counts[type]++;
  });

  // ⭐ CALCULATE SCORE
  const score = calculateScore(sortedIssues);

  // ⭐ Summary Section WITH SCORE (prominent display)
  const summary = `
    <div class="score-summary mb-4">
      <div class="score-display">
        <div class="score-circle">
          <span class="score-value">${score}</span>
          <span class="score-percent">%</span>
        </div>
        <div class="score-info">
          <h5 class="mb-1">Accessibility Score</h5>
        </div>
      </div>
      <div class="issues-summary">
        <p><strong>Found ${issues.length} issue(s)</strong></p>
        <div class="badges-container">
          <span class="badge bg-danger">🔴 Critical: ${counts.error}</span>
          <span class="badge bg-warning text-dark">🟠 Moderate: ${counts.warning}</span>
          <span class="badge bg-success">🟡 Minor: ${counts.notice}</span>
        </div>
      </div>
    </div>`;

  issuesOutput.innerHTML += summary;

  // ⭐ Convert pa11y type → severity (using your CSS classes)
  const getSeverity = (type = "") => {
    type = (type || "").toLowerCase();

    if (type === "error" || type === "violation") return "Critical";
    if (type === "warning" || type === "recommendation") return "Moderate";
    if (type === "notice" || type === "manual") return "Minor";

    return "Minor";
  };

  // Render cards using your existing CSS classes
  sortedIssues.forEach((issue, index) => {
    const severity = getSeverity(issue.type);

    let cardClass = "";
    let displayName = "";

    switch (severity) {
      case "Critical":
        cardClass = "card-critical";
        displayName = "🔴 CRITICAL";
        break;
      case "Moderate":
        cardClass = "card-moderate";
        displayName = "🟠 MODERATE";
        break;
      case "Minor":
        cardClass = "card-minor";
        displayName = "🟡 MINOR";
        break;
      default:
        cardClass = "card-minor";
        displayName = "ℹ️ INFO";
    }

    const output = `
      <div class="card ${cardClass}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h5>${escapeHTML(issue.message || "Unknown issue")}</h5>
            <span class="badge badge-severity">${displayName}</span>
          </div>
          
          ${
            issue.context
              ? `<p class="issue-context">${escapeHTML(issue.context)}</p>`
              : ""
          }

          <p class="small mb-2">
            <strong>CODE:</strong> ${escapeHTML(issue.code || "N/A")}<br>
            ${
              issue.selector
                ? `<strong>SELECTOR:</strong> ${escapeHTML(issue.selector)}<br>`
                : ""
            }
          </p>

          ${
            issue.aiSuggestion
              ? `
            <div class="mt-3 p-3 bg-light border rounded">
              <strong>💡 AI Suggestion:</strong><br>
              <small>${escapeHTML(issue.aiSuggestion)}</small>
            </div>`
              : `
            <div class="mt-3 p-3 bg-light border rounded text-muted">
              <small>(No AI suggestion available. Review WCAG guidelines)</small>
            </div>`
          }
        </div>
      </div>`;

    issuesOutput.innerHTML += output;
  });
};

// ⭐ Escape HTML (XSS safe)
const escapeHTML = (str = "") => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// ⭐ Loader toggle
const setLoading = (isLoading = true) => {
  const loader = document.querySelector(".loader");
  if (loader) {
    loader.style.display = isLoading ? "block" : "none";
  }

  const submitBtn = document.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = isLoading;
  }
};

// ⭐ Form submit listener
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#form");
  if (form) {
    form.addEventListener("submit", testAccessibility);
  } else {
    console.error("❌ #form element not found in DOM");
  }
});

// ⭐⭐⭐ DOWNLOAD REPORT AS PDF
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("downloadPdf");
  if (!btn) {
    console.warn("⚠️ #downloadPdf button not found");
    return;
  }

  btn.addEventListener("click", () => {
    if (!ALL_ISSUES.length) {
      alert("No report available to download. Run an analysis first.");
      return;
    }

    // ✅ Check if jsPDF is loaded
    if (typeof window.jspdf === "undefined") {
      alert(
        "PDF library not loaded. Please refresh the page and try again."
      );
      console.error("jsPDF not available");
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      let y = 10;

      // ✅ Header
      doc.setFontSize(20);
      doc.setTextColor(102, 126, 234);
      doc.text("AccessScan Report", 10, y);
      doc.setTextColor(0, 0, 0);
      y += 12;

      // ✅ Website URL
      doc.setFontSize(10);
      doc.text(`Website: ${CURRENT_URL}`, 10, y);
      y += 6;

      // ✅ Generated Date
      doc.text(`Generated: ${new Date().toLocaleString()}`, 10, y);
      y += 10;

      // ✅ Accessibility Score (PROMINENT)
      const score = calculateScore(ALL_ISSUES);
      doc.setFontSize(16);
      doc.setTextColor(102, 126, 234);
      doc.text(`Accessibility Score: ${score}%`, 10, y);
      doc.setTextColor(0, 0, 0);
      y += 12;

      // ✅ Issues Count
      const counts = { error: 0, warning: 0, notice: 0 };
      ALL_ISSUES.forEach((issue) => {
        const type = issue.type?.toLowerCase() || "notice";
        if (counts.hasOwnProperty(type)) counts[type]++;
      });

      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text(`Total Issues Found: ${ALL_ISSUES.length}`, 10, y);
      doc.setFont(undefined, "normal");
      y += 6;

      doc.setFontSize(10);
      doc.text(
        `Critical: ${counts.error} | Moderate: ${counts.warning} | Minor: ${counts.notice}`,
        10,
        y
      );
      y += 10;

      // ✅ Separator
      doc.setDrawColor(200, 200, 200);
      doc.line(10, y, 200, y);
      y += 8;

      // ✅ Issues Detail Header
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Detailed Issues:", 10, y);
      doc.setFont(undefined, "normal");
      y += 8;

      doc.setFontSize(9);

      // ✅ Issues List
      ALL_ISSUES.forEach((issue, i) => {
        const type = issue.type?.toLowerCase() || "notice";
        const severity =
          type === "error"
            ? "CRITICAL"
            : type === "warning"
            ? "MODERATE"
            : "MINOR";

        const issueText = `${i + 1}. [${severity}] ${issue.message}`;
        const selectorText = `   Selector: ${issue.selector || "N/A"}`;
        const codeText = `   Code: ${issue.code || "N/A"}`;
        const fixText = `   Fix: ${issue.aiSuggestion || "Review WCAG guidelines."}`;

        const allText = `${issueText}\n${selectorText}\n${codeText}\n${fixText}`;
        const lines = doc.splitTextToSize(allText, 180);

        doc.text(lines, 10, y);
        y += lines.length * 4 + 2;

        // ✅ Add new page if needed
        if (y > 260) {
          doc.addPage();
          y = 10;
        }
      });

      // ✅ Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        "AccessScan - Website Accessibility Analyzer",
        10,
        doc.internal.pageSize.height - 5
      );

      doc.save("accessibility-report.pdf");
      alert("✅ Report downloaded successfully!");
    } catch (error) {
      console.error("❌ PDF generation error:", error);
      alert("Failed to generate PDF. Check console for details.");
    }
  });
});