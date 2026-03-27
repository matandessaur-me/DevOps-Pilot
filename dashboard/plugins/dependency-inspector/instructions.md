## Dependency Inspector Plugin -- AI Instructions

You have access to a Dependency Inspector plugin via the DevOps Pilot API. This scans all configured repos for npm/NuGet dependency health -- vulnerabilities, outdated packages, license issues, and health scores.

**All routes are at** `http://127.0.0.1:3800/api/plugins/dependency-inspector/`

### IMPORTANT: Start with the Summary

**Always use the summary endpoint first** -- it returns pre-formatted plain text:

```bash
# Get a full overview of all repos (health, packages, vulns, outdated)
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/summary
```

If repos have not been scanned yet, run a full scan first:

```bash
# Scan all configured repos (reads package.json, queries npm registry)
curl -s -X POST http://127.0.0.1:3800/api/plugins/dependency-inspector/scan-all
```

### Pre-Made Scripts

These scripts run instantly and provide formatted output. The AI should run them instead of using curl.

| Script | Description |
|--------|-------------|
| `Get-DependencyReport.ps1` | All repos with health scores and package counts |
| `Get-Vulnerabilities.ps1 -Repo "name"` | Vulnerabilities for a specific repo |
| `Get-Outdated.ps1 -Repo "name"` | Outdated packages grouped by severity |
| `Start-ScanAll.ps1` | Scan all repos and show results |

Run from bash:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/dependency-inspector/scripts/Get-DependencyReport.ps1"
# With parameters:
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/dependency-inspector/scripts/Get-Vulnerabilities.ps1 -Repo 'My Website'"
```

### Scanning

Scanning reads `package.json`, `package-lock.json`, and `.csproj` files from disk, then queries the npm registry for latest versions and the npm audit API for known vulnerabilities.

```bash
# Scan all repos at once
curl -s -X POST http://127.0.0.1:3800/api/plugins/dependency-inspector/scan-all

# Scan a specific repo (use the configured repo name, URL-encoded)
curl -s -X POST http://127.0.0.1:3800/api/plugins/dependency-inspector/repos/My%20Website/scan
```

### Repo Overview

```bash
# List all repos with health scores and counts (uses cached scan data)
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/repos
```

### Per-Repo Details

```bash
# List all packages in a repo (name, installed version, latest version, license, update type)
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/repos/My%20Website/packages

# List only outdated packages
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/repos/My%20Website/outdated

# List known vulnerabilities
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/repos/My%20Website/vulnerabilities

# List package licenses (flags non-whitelisted licenses)
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/repos/My%20Website/licenses

# Get computed health score breakdown
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/repos/My%20Website/health
```

### Cross-Repo Analysis

```bash
# Find packages used at different versions across repos
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/duplicates
```

### Configuration

```bash
# Get current config
curl -s http://127.0.0.1:3800/api/plugins/dependency-inspector/config

# Update config (custom registry, license whitelist)
curl -s -X POST http://127.0.0.1:3800/api/plugins/dependency-inspector/config \
  -H "Content-Type: application/json" \
  -d '{"npmRegistryUrl":"https://registry.npmjs.org","licenseWhitelist":"MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD"}'
```

### Common Workflows

**1. Full Audit**: Scan all repos, then fetch the summary. Report health scores, list critical vulnerabilities, flag non-compliant licenses.

**2. Find Vulnerabilities**: Scan a repo, then GET its `/vulnerabilities` endpoint. For each vulnerability, show the severity, affected package, and recommended fix.

**3. Generate Update Plan**: Scan a repo, GET `/outdated`, sort by update type (major first). For each outdated package, show the installed vs latest version and what type of update it is (major/minor/patch). Save as a note.

**4. License Check**: Scan a repo, GET `/licenses`, filter to non-allowed licenses. Report which packages have copyleft or unknown licenses.

**5. Duplicate Detection**: After scanning multiple repos, GET `/duplicates` to find version conflicts. Recommend which version to standardize on.

### Health Score

The health score (0-100) is computed based on:
- **Vulnerabilities**: -15 per critical, -10 per high, -5 per moderate, -2 per low
- **Outdated packages**: Up to -20 based on outdated percentage, plus -2 per major outdated package
- **License issues**: -3 per non-whitelisted license
- **Deprecated packages**: -5 per deprecated package

Score ranges: 80-100 (good/green), 50-79 (warning/yellow), 0-49 (critical/red)

### Opening in the Dashboard

After scanning or analyzing dependencies, offer to open the Dependencies tab:

```bash
# Open the Dependencies tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"dependency-inspector"}'
```

### Important Notes

- Repos must be scanned before per-repo endpoints return data
- Scan results are cached in memory for 5 minutes
- npm registry queries are cached for 10 minutes
- The plugin reads files from disk -- the repo must exist at the configured path
- NuGet packages are detected from `.csproj` files (PackageReference elements)
- Vulnerability data comes from the npm audit bulk advisory API
- License data is read from local `node_modules/` first, then falls back to the npm registry
