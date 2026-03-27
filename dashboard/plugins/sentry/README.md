# Sentry Error Tracker -- DevOps Pilot Plugin

Monitor application errors via the Sentry API. View issues, stack traces, error trends, and create Azure DevOps work items directly from Sentry errors.

## Features

- **Error Dashboard** -- Overview of all Sentry projects with unresolved issue counts and error rates
- **Issue List** -- Unresolved issues sorted by frequency, last seen, or affected users
- **Issue Detail** -- Full stack trace with syntax highlighting, tags, event counts
- **Error Trends** -- Bar chart showing error volume over 24h, 7d, or 30d
- **Link to Work Items** -- Create Azure DevOps bugs from Sentry issues (auto-populates title, description, stack trace)
- **Resolve/Ignore** -- Mark issues as resolved or ignored directly from the plugin
- **AI Actions** -- Analyze top errors, find regressions, suggest fixes, bulk-create bugs

## Setup

1. Copy this folder to `dashboard/plugins/sentry/` in your DevOps Pilot installation
2. Open DevOps Pilot and go to **Settings > Plugins**
3. Configure:
   - **Auth Token** -- Sentry auth token (Settings > Auth Tokens in Sentry, needs `project:read`, `issue:read`, `issue:write` scopes)
   - **Organization** -- Your Sentry organization slug (from your Sentry URL, e.g. `my-org`)
   - **Default Project** -- Optional default project slug
4. The Sentry tab will appear in the center panel

## Sentry Auth Token

1. Go to https://sentry.io/settings/account/api/auth-tokens/
2. Click "Create New Token"
3. Select scopes: `project:read`, `event:read`, `issue:read`, `issue:write`
4. Copy the token (starts with `sntrys_`)

## API Routes

All routes are prefixed with `/api/plugins/sentry/`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/config` | Check configuration status |
| POST | `/config` | Save configuration |
| GET | `/test` | Test Sentry connection |
| GET | `/summary` | Plain text overview of all projects and top issues |
| GET | `/projects` | List Sentry projects |
| GET | `/issues?project=&query=&sort=` | List issues |
| GET | `/issues/:id` | Issue detail with stack trace |
| GET | `/issues/:id/events` | Event list for an issue |
| POST | `/issues/:id/resolve` | Mark issue as resolved |
| POST | `/issues/:id/ignore` | Mark issue as ignored |
| POST | `/issues/:id/create-workitem` | Create ADO Bug from issue |
| GET | `/stats?project=&stat=&resolution=&range=` | Error stats over time |

## Requirements

- Sentry account with API access
- DevOps Pilot v1.0.0 or later
- Azure DevOps connection (for work item creation)
