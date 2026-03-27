## Release Manager Plugin -- AI Instructions

You have access to a Release Manager plugin that tracks Azure DevOps build/release pipelines, generates release notes from resolved work items, and monitors pipeline health.

**All routes are at** `http://127.0.0.1:3800/api/plugins/release-manager/`

### Start with the Summary

```bash
# Get a plain-text overview of all pipelines with latest status and unreleased items
curl -s http://127.0.0.1:3800/api/plugins/release-manager/summary
```

### Pre-Made Scripts

These scripts run instantly and provide formatted output. The AI should run them instead of using curl.

| Script | Description |
|--------|-------------|
| `Get-PipelineStatus.ps1` | All pipelines with latest run status |
| `Get-PipelineHealth.ps1 -PipelineId 123` | Pipeline success rate and trends |
| `Get-UnreleasedItems.ps1` | Resolved work items not yet released (optional -PipelineId) |
| `New-ReleaseNotes.ps1 -PipelineId 123 -FromRunId 456 -ToRunId 789` | Generate release notes |

Run from bash:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/release-manager/scripts/Get-PipelineStatus.ps1"
# With parameters:
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/release-manager/scripts/Get-PipelineHealth.ps1 -PipelineId 123"
```

### Configuration

```bash
# Check if plugin is ready (validates ADO connection)
curl -s http://127.0.0.1:3800/api/plugins/release-manager/test

# Get plugin config
curl -s http://127.0.0.1:3800/api/plugins/release-manager/config

# Save plugin config
curl -s -X POST http://127.0.0.1:3800/api/plugins/release-manager/config \
  -H "Content-Type: application/json" \
  -d '{"defaultPipelineId":"42","conventionalCommits":"true"}'
```

### Pipelines

```bash
# List all pipelines with their latest run status
curl -s http://127.0.0.1:3800/api/plugins/release-manager/pipelines

# List runs for a specific pipeline (default 30, use $top to control)
curl -s "http://127.0.0.1:3800/api/plugins/release-manager/pipelines/42/runs?\$top=20"

# Get detailed info for a specific run (stages, changes, work items)
curl -s http://127.0.0.1:3800/api/plugins/release-manager/pipelines/42/runs/1234

# Get pipeline health stats (success rate, avg duration, trend)
curl -s http://127.0.0.1:3800/api/plugins/release-manager/pipelines/42/health
```

### Build Details

```bash
# Get commits associated with a build
curl -s http://127.0.0.1:3800/api/plugins/release-manager/builds/1234/changes

# Get work items associated with a build
curl -s http://127.0.0.1:3800/api/plugins/release-manager/builds/1234/workitems
```

### Release Notes

```bash
# Generate release notes between two pipeline runs
# Collects all work items and commits between fromRunId and toRunId
curl -s -X POST http://127.0.0.1:3800/api/plugins/release-manager/generate-notes \
  -H "Content-Type: application/json" \
  -d '{"pipelineId":"42","fromRunId":"100","toRunId":"128"}'
```

The response includes a `markdown` field with formatted release notes grouped by work item type (Features, Bugs, Tasks) and commits (optionally grouped by conventional commit type).

### Unreleased Work Items

```bash
# Get resolved work items since the last successful pipeline run
curl -s http://127.0.0.1:3800/api/plugins/release-manager/unreleased

# For a specific pipeline
curl -s "http://127.0.0.1:3800/api/plugins/release-manager/unreleased?pipelineId=42"
```

### Changelog

```bash
# Generate a changelog from resolved/closed work items in an iteration
curl -s -X POST http://127.0.0.1:3800/api/plugins/release-manager/changelog \
  -H "Content-Type: application/json" \
  -d '{"iterationPath":"MyProject\\Sprint 5"}'

# Or by date range
curl -s -X POST http://127.0.0.1:3800/api/plugins/release-manager/changelog \
  -H "Content-Type: application/json" \
  -d '{"fromDate":"2025-01-01","toDate":"2025-01-31"}'
```

### Common Workflows

**1. Pipeline status check**: Fetch `/pipelines` to see all pipelines and their latest run status. Use `/pipelines/{id}/health` for detailed health metrics.

**2. Generate release notes**: First list runs with `/pipelines/{id}/runs`, pick a "from" run and a "to" run, then POST to `/generate-notes`. Save the markdown as a DevOps Pilot note.

**3. Pre-release checklist**: Check `/unreleased` to see what resolved work items have not yet been deployed. Review and confirm before triggering a release.

**4. Sprint changelog**: POST to `/changelog` with the iteration path to generate a changelog of all completed work in a sprint.

**5. Failed build investigation**: Use `/pipelines/{id}/runs` to find failed runs, then `/pipelines/{id}/runs/{runId}` to see stages, associated changes, and work items.

### Opening in the Dashboard

```bash
# Open the Release Manager tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"release-manager"}'
```

### Important Notes

- This plugin uses the Azure DevOps Pipelines/Builds API -- NOT GitHub Releases
- GitHub is only used for code repos and PRs, not releases
- The ADO PAT must have Build (read) and Work Items (read) permissions
- Pipeline IDs correspond to ADO build definition IDs
- Conventional commit parsing groups commits by prefix (feat, fix, chore, etc.)
- The summary endpoint returns plain text, all other endpoints return JSON
