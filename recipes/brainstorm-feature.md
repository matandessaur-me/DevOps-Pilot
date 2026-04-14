---
name: Brainstorm a Feature
description: Take a one-line idea and produce user stories, edge cases, technical considerations, and an implementation plan
icon: lightbulb
intent: plan-and-implement
mode: edit
inputs:
  - name: idea
    type: string
    required: true
---

The user wants help thinking through a new feature.

**The idea:** {{ inputs.idea }}

You do NOT have to read the codebase first. This is a planning conversation. Optionally peek at `{{ context.activeRepoPath }}` if specific tech matters.

Produce a structured brainstorm with these sections:

1. **One-paragraph restatement** — your understanding of what the user wants, in your own words. End with a question if anything is ambiguous.

2. **User stories** — 3 to 6 short stories in the form "As X, I want Y so that Z." Cover the primary path AND at least one secondary user.

3. **Edge cases** — at least 5 specific scenarios that would break a naive implementation. For each, one line.

4. **Technical considerations** — what the implementation will likely touch (data model, API surface, UI, auth, perf hot spots, migrations). Be honest if you don't know enough about the codebase.

5. **Suggested implementation order** — a numbered list of 4-8 concrete steps, smallest viable slice first. Each step should be 1-3 days of work.

6. **What could go wrong** — the 3 most likely ways this feature ships and disappoints. Be candid.

7. **Open questions for the user** — 3 to 5 things you'd want answered before you start coding.

Print the brainstorm directly to the terminal. Don't save unless the user asks.

Plain ASCII only. Push back if the idea is vague or contradictory; don't paper over it.
