---
name: Review My Changes
description: Pre-flight code review of your uncommitted changes before you push them
icon: search-check
intent: deep-code
mode: edit
inputs:
  - name: includeStaged
    type: boolean
    default: true
    required: false
---

You are doing a pre-flight code review of the user's uncommitted changes in `{{ context.activeRepoPath }}`.

Steps:

1. From the active repo path, see what changed:
   - `git status --short`
   - `git diff` for unstaged changes
   - {{#if inputs.includeStaged}}`git diff --staged` for staged changes{{/if}}
   - `git log -1 --stat` for context on the last commit (so you don't repeat its mistakes)

2. For each meaningful change, judge:
   - **Correctness**: any obvious bugs, off-by-one errors, missing null checks at boundaries, or contradictions with surrounding code?
   - **Clarity**: are names accurate? Are there comments explaining the WHAT instead of the WHY (smell)?
   - **Scope creep**: anything in the diff that doesn't belong to the apparent task? Stray formatting, leftover console.log, unrelated refactors?
   - **Risks**: touches auth, migrations, payment, public APIs, critical paths? Calls out for anything you'd want a second pair of eyes on.
   - **Tests**: does the change need a test that isn't in the diff?

3. Produce a review with these sections:
   - **Summary** (one paragraph: what's about to land, in your words)
   - **Issues to fix before pushing** (bullet list, each with `file:line` if you can pinpoint it)
   - **Suggestions** (nice-to-haves, not blockers)
   - **Risks** (anything worth flagging to a reviewer)
   - **Verdict** (one of: ship it, fix issues first, needs more thought)

4. Print the review to the terminal. Do NOT commit or push automatically. Tell the user the next concrete action.

Plain ASCII only. Be specific: cite file paths, function names, line numbers. No vague advice.
