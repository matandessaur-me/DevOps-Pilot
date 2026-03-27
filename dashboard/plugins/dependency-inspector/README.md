# Dependency Inspector -- DevOps Pilot Plugin

Scans all configured repos for npm and NuGet dependency health. Shows vulnerabilities, outdated packages, license issues, and computes a health score per repo.

## Features

- **Multi-Repo Dashboard** -- Overview of all repos with health scores (0-100)
- **Package Inventory** -- Full list of dependencies across all repos with versions
- **Vulnerability Scanner** -- Checks packages against npm audit advisory API
- **Outdated Detection** -- Compares installed versions against latest (major/minor/patch)
- **License Compliance** -- Flags non-whitelisted or unknown licenses
- **Duplicate Detection** -- Finds the same package at different versions across repos
- **AI Actions** -- Full Audit, Find Vulnerabilities, Generate Update Plan, License Check

## How It Works

1. Reads the list of repos from DevOps Pilot's main config (Settings > Repos)
2. For each repo, reads `package.json` and `package-lock.json` from disk
3. Parses `.csproj` files for NuGet PackageReference elements
4. Queries the npm registry API for latest versions and license info
5. Calls the npm audit bulk advisory API for known vulnerabilities
6. Computes a health score based on vulnerabilities, outdated %, and license issues

## Installation

Copy this folder into `dashboard/plugins/` in your DevOps Pilot installation:

```
dashboard/plugins/dependency-inspector/
  plugin.json
  config.json
  config.template.json
  routes.js
  instructions.md
  tab.html
  README.md
```

Restart DevOps Pilot. The plugin will appear as a "Dependencies" tab.

## Configuration

In DevOps Pilot Settings > Plugins, you can configure:

- **npm Registry URL** -- Custom registry (defaults to https://registry.npmjs.org)
- **Allowed Licenses** -- Comma-separated list of approved licenses (defaults to MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD)

## Health Score

The health score (0-100) is computed per repo:

- **Vulnerabilities**: -15 per critical, -10 per high, -5 per moderate, -2 per low
- **Outdated packages**: Up to -20 based on outdated percentage, -2 per major outdated
- **License issues**: -3 per non-whitelisted license
- **Deprecated packages**: -5 per deprecated package

Ranges: 80-100 (green/good), 50-79 (yellow/warning), 0-49 (red/critical)

## API Routes

All routes are under `/api/plugins/dependency-inspector/`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/summary` | Plain text overview of all repos |
| GET | `/repos` | List repos with health scores |
| POST | `/scan-all` | Scan all repos |
| POST | `/repos/:name/scan` | Scan a specific repo |
| GET | `/repos/:name/packages` | List all packages |
| GET | `/repos/:name/outdated` | List outdated packages |
| GET | `/repos/:name/vulnerabilities` | List vulnerabilities |
| GET | `/repos/:name/licenses` | List package licenses |
| GET | `/repos/:name/health` | Health score breakdown |
| GET | `/duplicates` | Cross-repo duplicate packages |
| GET | `/config` | Plugin config |
| POST | `/config` | Update plugin config |
