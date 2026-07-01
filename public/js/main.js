// Handle accessibility form submission
const testAccesability = async (e) => {
  e.preventDefault();
  const url = document.querySelector('#url').value.trim();

  if (!url) {
    alert('Please enter a valid URL.');
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`/api/test?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Something went wrong while analyzing the site.');

    const { issues } = await response.json();
    addIssuesToDOM(issues);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Failed to fetch data');
  } finally {
    setLoading(false);
  }
};

// Add issues with AI suggestions to the DOM
const addIssuesToDOM = (issues = []) => {
  const issuesOutput = document.querySelector('#issues');
  issuesOutput.innerHTML = '';

  if (!issues.length) {
    issuesOutput.innerHTML = `
      <div class="alert alert-success text-center">
        ✅ No accessibility issues found!
      </div>`;
    return;
  }

  // Count issues for summary display
  const counts = { error: 0, warning: 0, notice: 0 };
  issues.forEach(issue => {
    const type = issue.type?.toLowerCase();
    if (counts.hasOwnProperty(type)) counts[type]++;
  });

  // Build summary section
  const summary = `
    <div class="alert alert-info mb-3">
      <strong>Found ${issues.length} issue(s):</strong> 
      <span class="badge bg-danger ms-2">Critical: ${counts.error}</span>
      <span class="badge bg-warning text-dark ms-2">Moderate: ${counts.warning}</span>
      <span class="badge bg-success ms-2">Minor: ${counts.notice}</span>
    </div>`;
  issuesOutput.innerHTML += summary;

  // Map Pa11y issue types to display severity
const severityMap = {
  'error': 'Critical',
  'warning': 'Moderate',
  'notice': 'Minor',
  'violation': 'Critical',
  'recommendation': 'Moderate',
  'manual': 'Minor'
};

issues.forEach((issue) => {
  const severity = severityMap[issue.type?.toLowerCase()] || 'Unknown';
  let severityClass = '', displayName = '';

  switch (severity) {
    case 'Critical':
      severityClass = 'card-critical';
      displayName = 'Critical';
      break;
    case 'Moderate':
      severityClass = 'card-moderate';
      displayName = 'Moderate';
      break;
    case 'Minor':
      severityClass = 'card-minor';
      displayName = 'Minor';
      break;
    default:
      severityClass = 'border-secondary';
      displayName = 'Unknown';
  }
    const output = `
      <div class="card ${severityClass}">
        <div class="card-body">
          <h5>${escapeHTML(issue.message)}</h5>
          <p class="issue-context">${escapeHTML(issue.context)}</p>

          <p class="small mb-2">
            <strong>CODE:</strong> ${escapeHTML(issue.code)}<br>
            ${issue.selector ? `<strong>SELECTOR:</strong> ${escapeHTML(issue.selector)}<br>` : ''}
          </p>

          ${issue.aiSuggestion ? `
            <div class="mt-3 p-3 bg-light border rounded">
              <strong>💡 AI Suggestion:</strong><br>
              ${escapeHTML(issue.aiSuggestion)}
            </div>
          ` : `
            <div class="mt-3 p-3 bg-light border rounded text-muted">
              (No AI suggestion available)
            </div>
          `}

          <span class="badge badge-severity mt-2">${displayName}</span>
        </div>
      </div>`;
    issuesOutput.innerHTML += output;
  });
};

// Escape HTML to prevent potential XSS
const escapeHTML = (str = '') => {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Display/hide loader
const setLoading = (isLoading = true) => {
  document.querySelector('.loader').style.display = isLoading ? 'block' : 'none';
};

// Listen to form submit
document.querySelector('#form').addEventListener('submit', testAccesability);
