# AccessScan

AccessScan is a full-stack web accessibility analyzer that scans real websites, identifies WCAG accessibility issues, and provides AI-assisted remediation guidance.

Live AWS deployment: [http://13.202.183.229/]

## Overview

AccessScan lets users submit a website URL and receive an accessibility report with issue severity, WCAG-related details, practical fix suggestions, and a downloadable PDF report. The backend performs real accessibility scans using Pa11y and enhances the results with AI-generated remediation guidance.

## Features

- Real website accessibility scanning with Pa11y.
- WCAG 2.1 AA issue detection.
- Severity grouping for Critical, Moderate, and Minor issues.
- AI remediation suggestions using Google Gemini, with Hugging Face and local fallback support.
- PDF report generation from the scan results.
- Accessibility score calculation.
- `/health` endpoint for uptime checks.
- AWS live deployment.
- Integrated GitHub Actions deployment workflow.

## Live Deployment

The project is deployed on AWS and available at:

[http://13.202.183.229/](http://13.202.183.229/)

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Accessibility Scanner: Pa11y, Puppeteer
- AI Suggestions: Google Gemini, Hugging Face fallback, local fallback
- Deployment: AWS
- Workflow: GitHub Actions

## Project Structure

```text
AccessScan/
├── .github/workflows/
├── index.js
├── package.json
├── package-lock.json
├── public/
├── puppeteer.config.cjs
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

### Environment Variables

Create a `.env` file and add the required keys:

```env
GEMINI_API_KEY=your_google_gemini_api_key
HUGGINGFACE_API_KEY=your_huggingface_api_key
PORT=5000
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

## Deployment Workflow

The repository includes an integrated GitHub Actions workflow for deployment automation. The workflow is configured under `.github/workflows/` and supports the AWS deployment process for the live application.

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
