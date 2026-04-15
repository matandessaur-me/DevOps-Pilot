---
name: What Changed Recently
description: Summarise recent git activity in the active repo -- who touched what, hot files, risk areas
icon: history
intent: quick-summary
mode: edit
inputs:
  - name: days
    type: text
    default: "7"
    required: false
    description: Number of days to look back
---

You are summarising recent git activity in `{{ context.activeRepoPath }}`.

Steps:

1. From the active repo path, run:
   - `git log --since="{{ inputs.days }} days ago" --pretty=format:"%h|%an|%ad|%s" --date=short --no-merges` to list commits.
   - `git log --since="{{ inputs.days }} days ago" --shortstat --no-merges --pretty=format:"---COMMIT---%n%h %an %ad %s" --date=short` to capture file-change counts.
   - `git log --since="{{ inputs.days }} days ago" --name-only --no-merges --pretty=format:""` to collect touched files. Count repeated paths yourself and rank the top 15.

   Do NOT use `git diff` in the terminal. Use `Show-Diff.ps1 -Repo '<name>'` if the user wants to inspect changes visually.

2. Produce a report with these sections:
   - **Window**: "Last {{ inputs.days }} days" and the commit count.
   - **Top contributors**: authors ranked by commit count and by lines changed. Two or three names max.
   - **Hot files**: five to ten paths touched most often. Flag anything in `src/` cores, config, or auth-adjacent code as elevated risk.
   - **Theme of the work**: one paragraph inferred from commit messages. Refactor? Feature work? Bug triage? Dependency bumps?
   - **Risks and watch-outs**: anything in the diff that merits a second look -- migrations, schema changes, new dependencies, large single-author areas.
   - **Suggested next steps**: one or two concrete actions (e.g. "ask reviewer X about the auth refactor", "run the full test suite before merging feature branch Y").

3. Print the report to the terminal. Do NOT commit, push, or modify anything. If the user asks to save it as a note, use `node scripts/save-note.js "Activity {{ inputs.days }}d" "<content>"`.

Plain ASCII only. Be concrete: cite commit SHAs, file paths, author names. No vague summaries.
