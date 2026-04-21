---
name: safe-refactor
description: Propose a refactor plan for the selected code with explicit invariants to preserve, before touching anything.
---

# Safe refactor

Before making edits:
1. List invariants the current code preserves.
2. Propose the refactor as an ordered list of small steps.
3. Identify what you'd run (tests, lint, build) between each step.

Do not start editing until the user approves the plan.
