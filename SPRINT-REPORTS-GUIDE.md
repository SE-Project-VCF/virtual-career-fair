# Sprint Reports Guide

How to generate and submit the two sprint reports required each sprint.

---

## Prerequisites

- **Node.js** installed
- **gh CLI** installed and authenticated
  ```bash
  # Install gh (macOS arm64)
  curl -fL https://github.com/cli/cli/releases/download/v2.86.0/gh_2.86.0_macOS_arm64.zip -o /tmp/gh.zip
  unzip -q /tmp/gh.zip -d /tmp/gh_install
  sudo mv /tmp/gh_install/gh_2.86.0_macOS_arm64/bin/gh /usr/local/bin/gh

  # Authenticate
  gh auth login
  ```

---

## 1. GitHub Activity Report

**Output file:** `Sprint-X-GitHub-Report_<Name>.md`

**Script:** `generate-github-report.sh`

### Command

```bash
./generate-github-report.sh <SprintNumber> <GitHubUsername> <StartDate> <EndDate> <Name>
```

### Example (Sprint 1, Feb 3–Feb 17)

```bash
./generate-github-report.sh 1 austinmoser 2026-02-03 2026-02-17 AustinMoser
```

### What it generates

- Repository URL
- Table of all PRs merged during the sprint (title, link, author, reviewers, merge date)
- Total commit count and date range for the sprint window

### Verify manually

Cross-check merged PRs on GitHub with this search filter:

```
is:pr is:merged author:austinmoser merged:2026-02-03..2026-02-17
```

---

## 2. Code Coverage Report

**Output file:** `Sprint-X-Code-Coverage-Report.md`

**Script:** `generate-code-coverage-report`

### Command

```bash
./generate-code-coverage-report <SprintNumber>
```

### Example (Sprint 1)

```bash
./generate-code-coverage-report 1
```

### What it generates

- Backend coverage metrics (lines, branches, functions, statements)
- Frontend coverage metrics
- Coverage trend table (fill in previous sprint manually)
- 3 lowest-covered files

### Note

This script runs all tests and collects live coverage — it may take a minute.

---

## Submitting Reports

Both reports must be submitted via a merged PR to `main`.

1. Create a branch and add the generated `.md` file(s)
2. Open a PR to `main`
3. Get it reviewed and merged
4. Submit the GitHub URL to the file on `main`

Example file URL format:
```
https://github.com/SE-Project-VCF/virtual-career-fair/blob/main/Sprint-1-GitHub-Report_AustinMoser.md
```
