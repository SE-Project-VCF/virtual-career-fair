#!/usr/bin/env bash
# Usage: ./generate-github-report <SprintNumber> <GitHubUsername> <StartDate> <EndDate> [Name]
# Example: ./generate-github-report 2 austinmoser 2026-02-03 2026-02-17 AustinMoser
set -e

SPRINT="${1:?Usage: ./generate-github-report <SprintNumber> <GitHubUsername> <StartDate> <EndDate> [Name]}"
GH_USER="${2:?Missing GitHub username}"
START="${3:?Missing start date (YYYY-MM-DD)}"
END="${4:?Missing end date (YYYY-MM-DD)}"
NAME="${5:-$GH_USER}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPORT="Sprint-${SPRINT}-GitHub-Report_${NAME}.md"

# Fetch merged PRs via gh CLI
echo "Fetching merged PRs for @${GH_USER} from ${START} to ${END}..."
PR_JSON=$(gh pr list \
  --repo SE-Project-VCF/virtual-career-fair \
  --state merged \
  --author "$GH_USER" \
  --search "merged:${START}..${END}" \
  --json number,title,url,mergedAt,reviews \
  --limit 100)

# Build PR table rows from JSON
PR_ROWS=$(PR_JSON="$PR_JSON" GH_USER="$GH_USER" node -e "
const prs = JSON.parse(process.env.PR_JSON);
const user = process.env.GH_USER;
if (!prs.length) { console.log('| _(none)_ | \u2014 | \u2014 | \u2014 | \u2014 |'); process.exit(); }
prs.forEach(pr => {
  const reviewers = pr.reviews && pr.reviews.length
    ? [...new Set(pr.reviews.map(r => '@' + r.author.login))].join(', ')
    : '\u2014';
  const date = pr.mergedAt ? pr.mergedAt.split('T')[0] : '\u2014';
  console.log('| ' + pr.title + ' | ' + pr.url + ' | @' + user + ' | ' + reviewers + ' | ' + date + ' |');
});
")

PR_COUNT=$(PR_JSON="$PR_JSON" node -e "console.log(JSON.parse(process.env.PR_JSON).length)")

# Count commits in date range by author
echo "Counting commits..."
COMMIT_COUNT=$(git -C "$ROOT" log \
  --oneline \
  --author="$GH_USER" \
  --after="${START}" \
  --before="${END} 23:59:59" \
  | wc -l | tr -d ' ')

FIRST_COMMIT=$(git -C "$ROOT" log \
  --oneline \
  --author="$GH_USER" \
  --after="${START}" \
  --before="${END} 23:59:59" \
  --format="%as" | tail -1)

LAST_COMMIT=$(git -C "$ROOT" log \
  --oneline \
  --author="$GH_USER" \
  --after="${START}" \
  --before="${END} 23:59:59" \
  --format="%as" | head -1)

REPO_URL=$(gh repo view SE-Project-VCF/virtual-career-fair --json url -q .url)
DATE=$(date '+%Y-%m-%d')

cat > "$ROOT/$REPORT" <<EOF
# Sprint ${SPRINT} GitHub Report

Generated: ${DATE}

---

## Repository

${REPO_URL}

---

## Merged Pull Requests

| PR Title | Link | Author | Reviewers | Merge Date |
|----------|------|--------|-----------|------------|
${PR_ROWS}

**Total merged PRs:** ${PR_COUNT}

---

## Commit Activity

- **Total commits:** ${COMMIT_COUNT}
- **Date range:** ${FIRST_COMMIT} – ${LAST_COMMIT}

---

_Sprint window: ${START} to ${END}_
EOF

echo "Done → $REPORT"
