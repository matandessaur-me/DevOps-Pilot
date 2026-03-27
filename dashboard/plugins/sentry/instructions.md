## Sentry Error Tracker Plugin -- AI Instructions

You have access to a Sentry error tracking plugin via the DevOps Pilot API. This lets you monitor application errors, view stack traces, analyze error trends, and create Azure DevOps work items from Sentry issues.

**All routes are at** `http://127.0.0.1:3800/api/plugins/sentry/`

### IMPORTANT: Start with the Summary

**Always use the summary endpoint first** -- it returns pre-formatted plain text:

```bash
# Get a full overview of all projects, top issues, and error trends
curl -s http://127.0.0.1:3800/api/plugins/sentry/summary
```

### Pre-Made Scripts

These scripts run instantly and provide formatted output. The AI should run them instead of using curl.

| Script | Description |
|--------|-------------|
| `Get-ErrorSummary.ps1` | Overview of all projects and top issues |
| `Get-TopIssues.ps1` | Top issues by frequency (optional -Project "slug") |
| `Get-IssueDetail.ps1 -IssueId "123"` | Full issue detail with stack trace |
| `New-BugFromIssue.ps1 -IssueId "123"` | Create ADO bug from Sentry issue |

Run from bash:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/sentry/scripts/Get-ErrorSummary.ps1"
# With parameters:
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/sentry/scripts/Get-IssueDetail.ps1 -IssueId '123'"
```

### Configuration

```bash
# Check if Sentry is configured
curl -s http://127.0.0.1:3800/api/plugins/sentry/config

# Save credentials (only needed once)
curl -s -X POST http://127.0.0.1:3800/api/plugins/sentry/config \
  -H "Content-Type: application/json" \
  -d '{"authToken":"sntrys_xxx","organization":"my-org","defaultProject":"my-project"}'

# Test connection
curl -s http://127.0.0.1:3800/api/plugins/sentry/test
```

### Projects

```bash
# List all Sentry projects in the organization
curl -s http://127.0.0.1:3800/api/plugins/sentry/projects
```

### Issues

```bash
# List unresolved issues for a project (sorted by frequency)
curl -s "http://127.0.0.1:3800/api/plugins/sentry/issues?project=my-project&query=is:unresolved&sort=freq"

# Search issues
curl -s "http://127.0.0.1:3800/api/plugins/sentry/issues?project=my-project&query=TypeError"

# Get full issue detail with stack trace
curl -s http://127.0.0.1:3800/api/plugins/sentry/issues/123456789

# Get events for an issue
curl -s http://127.0.0.1:3800/api/plugins/sentry/issues/123456789/events
```

### Issue Actions

```bash
# Resolve an issue
curl -s -X POST http://127.0.0.1:3800/api/plugins/sentry/issues/123456789/resolve

# Ignore an issue
curl -s -X POST http://127.0.0.1:3800/api/plugins/sentry/issues/123456789/ignore

# Create an Azure DevOps Bug from a Sentry issue
curl -s -X POST http://127.0.0.1:3800/api/plugins/sentry/issues/123456789/create-workitem \
  -H "Content-Type: application/json" \
  -d '{"priority": 2}'
```

The create-workitem endpoint automatically:
- Sets the title to "[Sentry] <error title>"
- Populates the description with error details, stack trace, and a link to Sentry
- Creates a Bug-type work item with the "sentry" tag

### Error Stats

```bash
# Get error counts over the last 24 hours (hourly resolution)
curl -s "http://127.0.0.1:3800/api/plugins/sentry/stats?project=my-project&stat=received&resolution=1h&range=24h"

# Get error counts over the last 7 days (daily resolution)
curl -s "http://127.0.0.1:3800/api/plugins/sentry/stats?project=my-project&stat=received&resolution=1d&range=7d"

# Get error counts over the last 30 days
curl -s "http://127.0.0.1:3800/api/plugins/sentry/stats?project=my-project&stat=received&resolution=1d&range=30d"
```

Stats response is an array of `[timestamp, count]` pairs.

### Common Workflows

**1. Error Triage**: Fetch the summary, review top unresolved issues, get detail on the worst offenders, create ADO bugs for the ones that need fixing.

**2. Regression Detection**: List issues sorted by date, look for newly appearing errors, check if they correlate with recent deployments.

**3. Error Analysis**: Get issue detail with stack trace, analyze the root cause, suggest a fix, then create a work item for the team.

**4. Bulk Bug Creation**: List top unresolved issues, create ADO bugs for each one. Always ask the user for confirmation before creating work items.

**5. Status Report**: Use the summary endpoint to get a quick overview, include error trend data in standup summaries or sprint reports.

### Important Notes

- The `project` parameter uses the project slug (URL-safe name from Sentry)
- Issue IDs are numeric strings from Sentry
- The `query` parameter supports Sentry search syntax (e.g., `is:unresolved`, `TypeError`, `level:error`)
- Sort options: `freq` (frequency), `date` (last seen), `new` (first seen), `priority`
- Creating work items calls the DevOps Pilot API internally -- the work item appears in Azure DevOps
- Always ask the user for permission before resolving, ignoring, or creating work items from issues

### Opening in the Dashboard

After working with Sentry issues, offer to open the Sentry tab:

```bash
# Open the Sentry tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"sentry"}'
```
