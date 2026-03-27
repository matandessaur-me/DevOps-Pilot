# GA4 & GTM Analytics Plugin for DevOps Pilot

A DevOps Pilot plugin that provides a dashboard for Google Analytics 4 and Google Tag Manager. Includes AI-powered tag audits, event tracking analysis, health scoring, and conversion monitoring.

## Features

- **Tag Inventory** -- Lists all GTM tags, triggers, and variables with status indicators
- **GA4 Event Tracking** -- Shows all tracked events with volume bars and category badges
- **Tag Health Score** -- AI-computed score based on dormant tags, unused variables, duplicates, and container size
- **Conversion Tracking** -- Displays configured conversion events with volume data
- **AI Actions** -- One-click audit commands: audit tags, find unused variables, suggest events, container health report
- **Summary Endpoint** -- Plain text overview for the AI assistant

## Setup

### 1. Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Tag Manager API v2
   - Google Analytics Admin API
   - Google Analytics Data API
4. Create a Service Account (IAM & Admin > Service Accounts)
5. Generate a JSON key for the service account
6. Grant the service account read access to your GTM container and GA4 property

### 2. Plugin Configuration

In DevOps Pilot, go to Settings > Plugins and configure:

- **Service Account JSON** -- paste the entire JSON key file content
- **GA4 Property ID** -- numeric ID from GA4 Admin > Property Settings
- **GTM Account ID** -- numeric account ID from GTM
- **GTM Container ID** -- numeric container ID from GTM

### 3. Install

Copy this folder into your DevOps Pilot `dashboard/plugins/` directory and restart the app.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | Check configuration status |
| POST | `/config` | Save configuration |
| GET | `/test` | Test API credentials |
| GET | `/summary` | Plain text overview (AI-friendly) |
| GET | `/gtm/tags` | List all GTM tags |
| GET | `/gtm/tags/:id` | Get tag detail |
| GET | `/gtm/triggers` | List all triggers |
| GET | `/gtm/variables` | List all variables |
| GET | `/ga4/properties` | GA4 property and data streams |
| GET | `/ga4/events` | Event counts (last 7 days default) |
| GET | `/ga4/conversions` | Conversion events and counts |
| GET | `/health` | Health score and findings |
| GET | `/audit` | Full audit data |

## File Structure

```
ga4-gtm/
  plugin.json           - Plugin manifest
  config.json           - Runtime configuration (user's API keys)
  config.template.json  - Empty config template
  routes.js             - Server-side API routes
  tab.html              - Dashboard UI (single-file HTML app)
  instructions.md       - AI assistant instructions
  README.md             - This file
```

## License

Internal DevOps Pilot plugin.
