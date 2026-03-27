# Environment Manager -- DevOps Pilot Plugin

Manage .env files across all configured repos. Scans for environment variables, compares across environments (dev/staging/prod), detects leaked secrets in code, provides templates.

## Features

- **Env File Dashboard** -- All repos with their env files, variable counts, and status
- **Variable Inventory** -- All env vars across a repo with presence/absence per env file
- **Environment Diff** -- Compare .env.development vs .env.production side by side
- **Secret Detection** -- Find hardcoded secrets in source code and env files
- **Template Generator** -- Generate .env.example from existing env files (secrets stripped)
- **Missing Variable Detection** -- Find vars used in code but not defined in any .env file
- **Gitignore Check** -- Verify that sensitive env files are in .gitignore

## Installation

Copy or symlink this folder into `dashboard/plugins/` in your DevOps Pilot installation:

```
dashboard/plugins/env-manager/
```

Restart DevOps Pilot. The plugin will appear as a new tab.

## Configuration

Settings are available in DevOps Pilot Settings > Plugins > Environment Manager:

- **Secret Patterns** -- Comma-separated key patterns to flag as potential secrets (default: PASSWORD,SECRET,TOKEN,KEY,API_KEY,PRIVATE,CREDENTIAL)
- **Scan Extensions** -- File extensions to scan for env var usage (default: .js,.ts,.jsx,.tsx,.cs,.py)

## How It Works

The plugin uses `getConfig().Repos` from the DevOps Pilot API to discover configured repos and their local paths. For each repo it:

1. Scans the root directory for .env files (.env, .env.local, .env.development, .env.staging, .env.production, .env.example, .env.template, and any other .env.* files)
2. Parses KEY=VALUE pairs from each env file
3. Scans source code (recursively, skipping node_modules/dist/build) for references to `process.env.XXX` and `import.meta.env.XXX`
4. Checks .gitignore to verify sensitive files are excluded from version control
5. Detects potential secrets by pattern matching on key names

## API Routes

All routes are prefixed with `/api/plugins/env-manager/`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/config` | Get plugin config |
| POST | `/config` | Update plugin config |
| GET | `/summary` | Plain text overview of all repos |
| GET | `/repos` | List repos with env file counts |
| POST | `/repos/:name/scan` | Scan a specific repo |
| GET | `/repos/:name/files` | List env files in a repo |
| GET | `/repos/:name/variables` | Variable inventory with presence per file |
| GET | `/repos/:name/diff?file1=X&file2=Y` | Compare two env files |
| GET | `/repos/:name/secrets` | Detect secrets in env and source files |
| GET | `/repos/:name/missing` | Variables used in code but not in env files |
| POST | `/repos/:name/template` | Generate .env.example content |
| GET | `/repos/:name/gitignore-check` | Check gitignore status for env files |
| POST | `/scan-all` | Scan all repos at once |
