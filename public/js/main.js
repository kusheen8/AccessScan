// ⭐ GLOBAL STORAGE FOR ALL ISSUES (VERY IMPORTANT)
let ALL_ISSUES = [];

// ⭐ Improved Accessibility Score (REALISTIC)
const calculateScore = (issues = []) => {
  if (!issues.length) return 100;

  let penalty = 0;

  issues.forEach(issue => {
    const type = issue.type?.toLowerCase();

    if (type === "error") penalty += 6;       // Critical
    else if (type === "warning") penalty += 2; // Moderate
    else if (type === "notice") penalty += 0.2; // Minor (VERY LOW IMPACT)
  });

  let score = Math.round(100 - penalty);

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
};

// ⭐ Handle accessibility form submission
const testAccesability = async (e) => {
  e.preventDefault();
  const url = document.querySelector("#url").value.trim();

  if (!url) {
    alert("Please enter a valid URL.");
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`/api/test?url=${encodeURIComponent(url)}`);

    if (!response.ok)
      throw new Error("Something went wrong while analyzing the site.");

    const { issues } = await response.json();

    ALL_ISSUES = issues; // ⭐ SAVE FULL DATA FOR PDF
    addIssuesToDOM(issues);

  } catch (error) {
    console.error(error);
    alert(error.message || "Failed to fetch data");
  } finally {
    setLoading(false);
  }
};

// ⭐ Add issues with AI suggestions to the DOM
const addIssuesToDOM = (issues = []) => {
  const issuesOutput = document.querySelector("#issues");
  issuesOutput.innerHTML = "";

  if (!issues.length) {
    issuesOutput.innerHTML = `
      <div class="alert alert-success text-center">
        ✅ No accessibility issues found!
      </div>`;
    return;
  }

  // Count issues
  const counts = { error: 0, warning: 0, notice: 0 };

  // ⭐ Sort Critical → Moderate → Minor
  const order = { error: 1, warning: 2, notice: 3 };
  issues.sort((a, b) => (order[a.type] || 4) - (order[b.type] || 4));

  issues.forEach((issue) => {
    const type = issue.type?.toLowerCase();
    if (counts.hasOwnProperty(type)) counts[type]++;
  });

  // ⭐ CALCULATE SCORE
  const score = calculateScore(issues);

  // ⭐ Summary Section WITH SCORE (UI ONLY)
  const summary = `
    <div class="alert alert-info mb-3">
      <h5 class="fw-bold text-primary mb-2">Accessibility Score: ${score}%</h5>
      <strong>Found ${issues.length} issue(s):</strong> 
      <span class="badge bg-danger ms-2">Critical: ${counts.error}</span>
      <span class="badge bg-warning text-dark ms-2">Moderate: ${counts.warning}</span>
      <span class="badge bg-success ms-2">Minor: ${counts.notice}</span>
    </div>`;
  issuesOutput.innerHTML += summary;

  // ⭐ Convert pa11y type → severity
  const getSeverity = (type = "") => {
    type = type.toLowerCase();

    if (type === "error" || type === "violation") return "Critical";
    if (type === "warning" || type === "recommendation") return "Moderate";
    if (type === "notice" || type === "manual") return "Minor";

    return "Minor";
  };

  // Render cards
  issues.forEach((issue) => {
    const severity = getSeverity(issue.type);

    let severityClass = "";
    let displayName = "";

    switch (severity) {
      case "Critical":
        severityClass = "card-critical";
        displayName = "Critical";
        break;
      case "Moderate":
        severityClass = "card-moderate";
        displayName = "Moderate";
        break;
      case "Minor":
        severityClass = "card-minor";
        displayName = "Minor";
        break;
      default:
        severityClass = "border-secondary";
        displayName = "Unknown";
    }

    const output = `
      <div class="card ${severityClass}">
        <div class="card-body">
          <h5>${escapeHTML(issue.message)}</h5>
          <p class="issue-context">${escapeHTML(issue.context)}</p>

          <p class="small mb-2">
            <strong>CODE:</strong> ${escapeHTML(issue.code)}<br>
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
              ${escapeHTML(issue.aiSuggestion)}
            </div>`
              : `
            <div class="mt-3 p-3 bg-light border rounded text-muted">
              (No AI suggestion available)
            </div>`
          }

          <span class="badge badge-severity mt-2">${displayName}</span>
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
  document.querySelector(".loader").style.display = isLoading
    ? "block"
    : "none";
};

// ⭐ Form submit listener
document.querySelector("#form").addEventListener("submit", testAccesability);

// ⭐⭐⭐ DOWNLOAD REPORT AS PDF (UNCHANGED)
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("downloadPdf");
  if (!btn) return;

  btn.addEventListener("click", () => {

    if (!ALL_ISSUES.length) {
      alert("No report available to download.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    let y = 10;

    doc.setFontSize(16);
    doc.text("AccessScan Accessibility Report", 10, y);
    y += 10;

    ALL_ISSUES.forEach((issue, i) => {

      const text = `
${i + 1}. ${issue.message}
Selector: ${issue.selector || "N/A"}
Code: ${issue.code || "N/A"}
Fix: ${issue.aiSuggestion || "Review WCAG guidelines."}
`;

      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, 10, y);
      y += lines.length * 6;

      if (y > 270) {
        doc.addPage();
        y = 10;
      }
    });

    doc.save("accessibility-report.pdf");
  });
});