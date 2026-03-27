## Environment Manager Plugin -- AI Instructions

You have access to an Environment Manager plugin via the DevOps Pilot API. This lets you scan repos for .env files, compare environments, detect secrets, find missing variables, and generate templates.

**All routes are at** `http://127.0.0.1:3800/api/plugins/env-manager/`

### Start with the Summary

```bash
# Get a plain-text overview of all repos and their env files
curl -s http://127.0.0.1:3800/api/plugins/env-manager/summary
```

The summary endpoint returns **plain text**, not JSON. Use it to get a quick overview before doing specific queries.

### Pre-Made Scripts

These scripts run instantly and provide formatted output. The AI should run them instead of using curl.

| Script | Description |
|--------|-------------|
| `Get-EnvSummary.ps1` | Full overview of all repos and env files |
| `Get-CrossRepoAnalysis.ps1` | Shared variables and secrets across repos |
| `Start-EnvScan.ps1` | Scan all repos for env files |
| `Get-Secrets.ps1 -Repo "name"` | Detected secrets in a specific repo |

Run from bash:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/env-manager/scripts/Get-EnvSummary.ps1"
# With parameters:
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/env-manager/scripts/Get-Secrets.ps1 -Repo 'My Website'"
```

### Scanning

```bash
# Scan all repos at once
curl -s -X POST http://127.0.0.1:3800/api/plugins/env-manager/scan-all

# Scan a specific repo
curl -s -X POST http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/scan
```

Scanning reads .env files from disk, parses variables, checks .gitignore, and scans source code for env var references. Results are cached in memory until the next scan.

### Listing Repos

```bash
# List all repos with env file counts and scan status
curl -s http://127.0.0.1:3800/api/plugins/env-manager/repos
```

### Env Files in a Repo

```bash
# List env files found in a repo
curl -s http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/files
```

### Variable Inventory

```bash
# All variables across all env files in a repo, with presence/absence per file
curl -s http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/variables
```

Secret values are masked by default (first 2 chars + asterisks). The response includes `rawValue` for each entry if you need the full value.

### Environment Diff

```bash
# Compare two env files side by side
curl -s "http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/diff?file1=.env.development&file2=.env.production"
```

Returns an array of diffs with status: `same`, `different`, `only-left`, `only-right`.

### Secret Detection

```bash
# Detect secrets in env files and leaked secrets in source code
curl -s http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/secrets
```

Returns `envSecrets` (secret-pattern keys found in env files with values) and `leakedSecrets` (hardcoded secret-like strings found in source code).

### Missing Variables

```bash
# Variables used in code (process.env.XXX) but not defined in any .env file
curl -s http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/missing
```

### Generate .env.example Template

```bash
# Generate a template with keys from all env files, secret values stripped
curl -s -X POST http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/template
```

Returns the template content as a string. Secret values are removed, non-secret values are kept as defaults.

### Gitignore Check

```bash
# Check if env files are properly gitignored
curl -s http://127.0.0.1:3800/api/plugins/env-manager/repos/My%20Website/gitignore-check
```

Returns status for each env file: whether it is gitignored, whether it should be, and whether it is OK.

### Configuration

```bash
# Get current config (secret patterns, scan extensions)
curl -s http://127.0.0.1:3800/api/plugins/env-manager/config

# Update config
curl -s -X POST http://127.0.0.1:3800/api/plugins/env-manager/config \
  -H "Content-Type: application/json" \
  -d '{"secretPatterns":"PASSWORD,SECRET,TOKEN,KEY,API_KEY,PRIVATE,CREDENTIAL","scanExtensions":".js,.ts,.jsx,.tsx,.cs,.py"}'
```

### Opening in the Dashboard

```bash
# Open the Environment Manager tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"env-manager"}'
```

### Cross-Repo Analysis

```bash
# Get cross-repo variable analysis (shared vars, secrets summary)
curl -s http://127.0.0.1:3800/api/plugins/env-manager/cross-repo
```

Returns:
- `shared` -- variables used in 2+ repos, with match status (same value or different)
- `secretsSummary` -- secrets across repos with gitignore status

The plugin auto-scans all repos on first load and shows cross-repo analysis automatically. No manual input needed.

### Common Workflows

**1. Quick audit**: Run `scan-all`, then check the summary for any warnings (ungitignored env files, missing variables, detected secrets).

**2. Environment comparison**: Use the diff endpoint to compare .env.development vs .env.production and identify missing or different values.

**3. Onboarding new developer**: Generate a template with the template endpoint, then share the .env.example file.

**4. Security check**: Run the secrets endpoint to find hardcoded secrets in source code and verify all .env files with real values are gitignored.

**5. Missing variable hunt**: Use the missing endpoint to find variables referenced in code but not defined in any .env file -- these will cause runtime errors.
