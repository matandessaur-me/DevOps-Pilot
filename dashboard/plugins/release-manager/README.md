# Release Manager -- DevOps Pilot Plugin

Track Azure DevOps build/release pipelines, generate release notes from work items and commits, and monitor pipeline health.

## Features

- **Pipeline Dashboard** -- View all ADO pipelines with latest run status, duration, and success rate
- **Run History** -- Browse run history for any pipeline with status, branch, commit, and trigger info
- **Run Detail** -- Inspect stages, associated commits, and linked work items for any run
- **Release Notes Generator** -- Select two pipeline runs and generate markdown release notes from work items and commits between them
- **Pipeline Health** -- Success rate, average duration, and failure trends over recent builds
- **Unreleased Items** -- See resolved work items that have not yet been deployed
- **Changelog** -- Generate a changelog from work items in a sprint or date range
- **AI Actions** -- Natural language commands for generating notes, checking health, and finding failures

## Requirements

- DevOps Pilot with Azure DevOps configured (org, project, PAT)
- ADO PAT must have **Build (read)** and **Work Items (read)** permissions

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultPipelineId` | Pipeline ID to show by default | (none) |
| `conventionalCommits` | Parse conventional commit prefixes | `true` |

## Installation

Copy this folder into `dashboard/plugins/` in your DevOps Pilot installation, or use the plugin registry.

## API Routes

All routes are prefixed with `/api/plugins/release-manager/`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/config` | Get plugin config |
| POST | `/config` | Save plugin config |
| GET | `/test` | Validate ADO connection |
| GET | `/summary` | Plain text pipeline overview |
| GET | `/pipelines` | List pipelines with latest run |
| GET | `/pipelines/:id/runs` | Run history for a pipeline |
| GET | `/pipelines/:id/runs/:runId` | Run detail with stages and changes |
| GET | `/pipelines/:id/health` | Health stats and trends |
| GET | `/builds/:buildId/changes` | Commits associated with a build |
| GET | `/builds/:buildId/workitems` | Work items associated with a build |
| POST | `/generate-notes` | Generate release notes between runs |
| GET | `/unreleased` | Resolved items since last successful run |
| POST | `/changelog` | Changelog from iteration or date range |
