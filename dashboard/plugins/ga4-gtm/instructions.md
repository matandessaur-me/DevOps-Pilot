## GA4 & GTM Analytics Plugin -- AI Instructions

You have access to a Google Analytics 4 and Google Tag Manager plugin via the DevOps Pilot API. This lets you audit GTM tags, analyze GA4 events, and get health scores for your tracking setup.

**All routes are at** `http://127.0.0.1:3800/api/plugins/ga4-gtm/`

### IMPORTANT: Start with the Summary

**Always use the summary endpoint first** -- it returns pre-formatted plain text that is easy to read:

```bash
# Get a full overview of GTM container and GA4 property
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/summary
```

The summary returns tag counts, health score, findings, GA4 events, and conversion data in plain text. Use this to understand the setup before doing targeted queries.

### Pre-Made Scripts

These scripts run instantly and provide formatted output. The AI should run them instead of using curl.

| Script | Description |
|--------|-------------|
| `Get-ContainerSummary.ps1` | Full GTM container and GA4 property overview |
| `Get-TagAudit.ps1` | Health score, dormant tags, unused variables, findings |
| `Get-EventReport.ps1` | GA4 events grouped by category with counts |
| `Get-ConversionReport.ps1` | Conversion events with volumes |

Run from bash:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/ga4-gtm/scripts/Get-ContainerSummary.ps1"
# With parameters:
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/ga4-gtm/scripts/Get-TagAudit.ps1"
```

### Setup

The plugin uses Google OAuth2 (user consent flow). Users sign in with their Google account through the browser.

1. Create an OAuth 2.0 Client ID in Google Cloud Console (APIs & Services > Credentials)
2. Add `http://127.0.0.1:3800/api/plugins/ga4-gtm/auth/callback` as an authorized redirect URI
3. In DevOps Pilot Settings > Plugins, enter the Client ID, Client Secret, GA4 Property ID, and GTM Account/Container IDs
4. Click "Sign in with Google" in the Analytics tab

### Configuration & Auth

```bash
# Check if the plugin is configured and connected
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/config

# Check auth status (connected, email)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/auth/status

# Start OAuth flow (returns auth URL to open in browser)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/auth/start

# Disconnect Google account
curl -s -X POST http://127.0.0.1:3800/api/plugins/ga4-gtm/auth/disconnect

# Test connection (validates tokens and returns container/property names)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/test
```

### GTM Tag Operations

```bash
# List all GTM tags (includes status, triggers, type)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/tags

# Get a specific tag by ID (full detail with parameters)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/tags/TAG_ID

# Create a new tag (POST with GTM tag JSON body)
curl -s -X POST http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/tags \
  -H "Content-Type: application/json" \
  -d '{"name":"My Tag","type":"gaawc","parameter":[{"type":"template","key":"eventName","value":"my_event"}],"firingTriggerId":["TRIGGER_ID"]}'

# List all triggers
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/triggers

# List all variables
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/variables
```

Tag statuses:
- **Active** -- has firing triggers and is not paused
- **Paused** -- manually paused by a user
- **Dormant** -- has no firing triggers (will never fire)

### GA4 Analytics

```bash
# Get GA4 property info and data streams
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/ga4/properties

# Get event counts (default: last 7 days)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/ga4/events

# Get event counts for a custom time range
curl -s "http://127.0.0.1:3800/api/plugins/ga4-gtm/ga4/events?days=30"

# Get conversion events (definitions + counts from last 30 days)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/ga4/conversions
```

Event categories:
- **Auto-collected** -- page_view, scroll, click, session_start, first_visit, etc.
- **Recommended** -- GA4 recommended events like purchase, add_to_cart, sign_up, generate_lead
- **Custom** -- any event not in the auto-collected or recommended lists

### Health & Audit

```bash
# Get health score with findings (JSON)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/health

# Get full audit data (tags, triggers, variables, health, events, recommendations)
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/audit
```

The health endpoint returns:
- `score` -- 0-100 health score
- `findings` -- array of issues with severity (ok/info/warning/error)
- `unusedVariables` -- variables not referenced by any tag or trigger
- `dormantTags` -- tags with no firing triggers
- `missingEvents` -- recommended GA4 events not being tracked

The audit endpoint returns everything from health plus full tag/trigger/variable details and top events.

### Common Workflows

**1. Full Tag Audit**: Fetch `/audit`, analyze tag health, identify dormant tags, unused variables, and duplicate names. Save findings as a note.

**2. Event Coverage Analysis**: Fetch `/ga4/events`, compare against recommended events from `/health` (missingEvents), recommend which events to add and why.

**3. Conversion Optimization**: Fetch `/ga4/conversions`, analyze which conversion events have low volume, suggest improvements to tracking.

**4. Container Cleanup**: Fetch `/health`, list all unused variables and dormant tags, recommend which to remove.

**5. Tracking Health Check**: Fetch `/summary` for a quick plain-text overview, then dive into specific areas that need attention.

### Opening in the Dashboard

After analyzing data, offer to open the plugin tab:

```bash
# Open the Analytics dashboard tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"ga4-gtm"}'
```

### GTM Write Operations (Create Tags, Triggers, Variables)

The plugin supports creating GTM tags, triggers, and variables, and publishing changes.

```bash
# Create a trigger
curl -s -X POST http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/triggers \
  -H "Content-Type: application/json" \
  -d '{"name":"Click - Outbound links","type":"linkClick","filter":[{"type":"contains","parameter":[{"type":"template","key":"arg0","value":"{{Click URL}}"},{"type":"template","key":"arg1","value":"bathfitter.com"}],"negate":true}]}'

# Create a variable
curl -s -X POST http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/variables \
  -H "Content-Type: application/json" \
  -d '{"name":"My Variable","type":"v","parameter":[{"type":"template","key":"name","value":"dataLayer.myVar"}]}'

# List workspaces
curl -s http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/workspaces

# Publish the current workspace (makes all changes live)
curl -s -X POST http://127.0.0.1:3800/api/plugins/ga4-gtm/gtm/publish
```

**IMPORTANT:** Always ask the user before creating tags or publishing. Creating a tag adds it to the workspace; publishing makes it live on the website.

**GTM tag types:** `gaawc` (GA4 Event), `gaawe` (GA4 Config), `html` (Custom HTML), `img` (Custom Image), `awct` (Google Ads Conversion), `gclidw` (Google Ads Remarketing), `sp` (Google Ads Conversion Linker)

### Important Notes

- The plugin can read AND write to GTM (create tags, triggers, variables, publish)
- The plugin uses Google OAuth2 for authentication -- users sign in with their Google account
- Access tokens are cached for up to 1 hour
- GA4 event data comes from the Data API (runReport) and may have a 24-48 hour delay
- The health score is computed locally based on tag/trigger/variable relationships and event coverage
- Container size is estimated (not exact) based on tag/trigger/variable counts
