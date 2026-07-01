# AccessScan

AccessScan is a full-stack web accessibility analyzer that helps users review a website URL, identify common accessibility issues, and generate clear remediation guidance.

Live demo: [https://accessscan-1.onrender.com/]

## Overview

The application provides a simple interface for submitting a website URL and viewing an accessibility report. Results are grouped by severity so users can quickly understand which issues need immediate attention and what steps can help resolve them.

## Features

- Analyze a website URL through a clean web interface.
- Display accessibility issues with severity labels.
- Categorize findings as Critical, Moderate, or Minor.
- Provide practical fix suggestions for reported issues.
- Generate a structured report view for review and documentation.
- Expose a lightweight `/health` endpoint for uptime monitoring.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Runtime: Node.js
- Deployment: Render

## Project Structure

```text
AccessScan/
├── index.js
├── package.json
├── package-lock.json
├── public/
├── screenshots/
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

```bash
git clone https://github.com/kusheen8/AccessScan.git
cd AccessScan
npm install
```

### Run Locally

```bash
npm start
```

The server starts on port `5000` by default unless a different `PORT` value is provided.

## API Endpoints

### Health Check

```http
GET /health
```

Returns a lightweight server status response for uptime monitoring.

### Accessibility Test

```http
GET /api/test?url=<website-url>
POST /api/test
```

Analyzes the submitted URL and returns accessibility issues with severity and suggested fixes.

## Screenshots

### Home Page

![Home Page](screenshots/homepage.png)

### Accessibility Report

![Accessibility Report](screenshots/report.png)

### Fix Suggestions

![Fix Suggestions](screenshots/aifix.png)

## Author

Kusheen Dhar  
Full Stack Developer
