---
name: Find TODOs
description: Scan the active repo for TODO, FIXME, HACK, XXX comments and triage them by severity
icon: list-checks
intent: quick-summary
mode: edit
inputs:
  - name: pattern
    type: text
    default: "TODO|FIXME|HACK|XXX"
    required: false
    description: Regex alternation for the tags to search
---

You are auditing outstanding inline action items in `{{ context.activeRepoPath }}`.

Steps:

1. From the active repo path, run ripgrep (prefer it; fall back to `git grep` if `rg` isn't on PATH):
   ```
   rg -n --no-heading -e "\b({{ inputs.pattern }})\b" --glob "!node_modules" --glob "!dist" --glob "!build" --glob "!.git"
   ```

2. For each hit, capture the tag, the file:line, and enough surrounding context (same or next line) to understand what is being deferred.

3. Classify each item into one bucket:
   - **Blocker**: will cause a bug or regression if left. Includes TODOs next to auth, persistence, payment, security-sensitive code, or inside obvious broken paths.
   - **Tech debt**: code smells, duplication, refactors the author flagged but didn't do.
   - **Feature gap**: "implement X later", "support Y", incomplete feature branches.
   - **Docs / trivial**: comments, minor polish.

4. Print a report:
   - **Total count** per tag.
   - **Blockers** first, one bullet per entry with `file:line -- quoted excerpt -- tag`.
   - **Tech debt** next, same format.
   - **Feature gaps** next.
   - **Docs / trivial** summarised by count only (list at the end if useful).
   - **Verdict**: one sentence. Is this codebase's TODO density healthy, or does it need a cleanup pass?

5. Do NOT modify or delete anything. If the user asks to save the report as a note, use `node scripts/save-note.js "TODOs Audit" "<content>"`.

Plain ASCII only. Cite file:line for every concrete call-out. Do not invent items that ripgrep didn't return.
