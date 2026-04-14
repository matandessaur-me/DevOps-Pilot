---
name: Explain This Codebase
description: Quick orientation: what this repo does, how it is organized, where to start reading
icon: book-open
intent: deep-code
mode: edit
inputs: []
---

You are helping a new contributor understand the codebase rooted at `{{ context.activeRepoPath }}`.

Steps:

1. Read the top-level structure: list directories and the most important files (READMEs, package manifests, entry points, configs).
2. Read the README and any docs/ folder.
3. Open the package manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `pom.xml`, `go.mod`, `*.csproj`, etc.) and identify the language, framework, key dependencies, scripts, and entry points.
4. Open 2-3 of the entry-point or main source files; do NOT read the whole codebase.
5. Identify the build / test / run commands.

Produce a single short brief with these sections:

- **What it is** (one paragraph: purpose and audience)
- **Stack** (language, framework, key dependencies in 5-7 bullets)
- **Layout** (top-level directories with a one-line role for each)
- **Where to start reading** (3 specific files a new contributor should open first, with one sentence on why)
- **How to run it locally** (the actual commands)
- **Open questions** (anything the README doesn't answer that you'd want to know)

Print the brief to the terminal. If it's longer than ~60 lines, also save to `notes/` via `node scripts/save-note.js "Codebase brief: {{ context.activeRepo }}" --file .ai-workspace/codebase-brief.md`.

Plain ASCII only. Be concrete: name actual files, not "the main module".
