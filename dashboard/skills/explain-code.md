---
name: explain-code
description: Walk through a file or selection and explain it in plain English, calling out non-obvious bits and risks.
---

# Explain code

When invoked, read the file or selection the user shared and produce a short, section-by-section walkthrough. Call out:
- The entrypoint / public API surface.
- Anything non-obvious: implicit contracts, side effects, error handling gaps.
- Pre-existing bugs or risks you notice (don't fix, just flag).

Keep it under 300 words. Use the user's terminology, not yours.
