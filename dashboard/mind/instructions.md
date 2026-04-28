# Mind - Symphonee's shared knowledge graph

You (whichever CLI you are: Claude Code, Codex, Gemini, Copilot, Grok, Qwen)
are connected to a single, shared knowledge graph called **Mind**. It is not
your private memory and it is not Claude Code's brain. It belongs to
Symphonee. Every CLI the orchestrator dispatches reads from and writes to
the same graph.

The graph contains the user's notes, the team's curated learnings, the
shell's instruction docs, every plugin's metadata, every recipe, the active
repo's code and docs, the conversation outcomes that previous CLI sessions
saved back, **and the user-level skills/agents/plugins each CLI ships with**
(Claude Code agents, Codex skills, Qwen skills, Claude marketplace plugins).
Provenance is on every node: who taught the brain that fact and from what
source.

Cross-CLI procedure sharing: even though only Claude can fire its `Agent`
tool and only Codex can load its own SKILL.md at runtime, the *procedure*
inside any sibling CLI's skill body is readable knowledge for everyone. If
you ask the brain "how do I scaffold a WPP project?" and the answer cites
a Claude agent body, you (whatever CLI you are) can execute the same
workflow manually. Filter for these via the `cli_<provider>` and
`skillkind_<agent|skill|plugin>` tags returned in query results.

## When to query the graph

**Before answering any question** about:

- "What did we decide about X?" / "Why is X this way?"
- The active codebase, its architecture, who-calls-what, where-defined.
- Past learnings (mistakes, gotchas, resolved bugs, CLI quirks).
- Notes the user has taken, including in past sessions.
- Which plugin / recipe / script handles a given task.

If the brain has a relevant sub-graph, **use it as ground truth instead of
guessing or re-reading the raw files**. Cite node IDs in your answer.

```
POST http://127.0.0.1:3800/api/mind/query
Content-Type: application/json

{ "question": "<the user's question>", "budget": 2000 }
```

You get back `{ nodes, edges, seedIds, answer: { suggestion, summary, note } }`.
The `nodes` and `edges` are the BFS sub-graph the brain considers most
relevant. Solid edges are EXTRACTED (explicit in source). Dashed are
INFERRED (defensible deduction). Dotted-red are AMBIGUOUS (uncertain - prefer
EXTRACTED when in doubt).

Seeds are picked by BM25 over node label + tags + description, with a
god-node prior. Pass `"asOf": "<ISO-date>"` to ask "what was true at that
moment?" — edges with `validFrom`/`validTo` are filtered to the half-open
interval `[validFrom, validTo)`. Timeless edges (no validity fields) always
return. Use `asOf` for historical-state questions; otherwise omit it.

For session start / wake-up context (identity + god nodes + recent
conversations, ~600 tokens), call `GET /api/mind/wakeup?budget=600`. The
bootstrap response also embeds this under `mind.wakeup`.

## After you answer: save the result

Whatever you figured out, save it back so the next CLI - or you in the next
session - inherits your work.

```
POST http://127.0.0.1:3800/api/mind/save-result
{
  "question": "<the question>",
  "answer": "<the answer you gave the user>",
  "citedNodeIds": ["<id1>", "<id2>"],
  "createdBy": "<your CLI name: claude | codex | gemini | copilot | grok | qwen>"
}
```

This adds your answer as a new `conversation` node with `derived_from` edges
to the nodes you cited. The brain literally gets smarter every time it is
used.

## When to refresh the brain

If the answer surprises you ("the graph says X but the file says Y") the
graph may be stale. Trigger an incremental update:

```
POST http://127.0.0.1:3800/api/mind/update
```

Don't do this on every task - the graph self-updates when the user runs a
build. Only refresh when you have a strong signal it is wrong.

## When to add a node manually

Most additions happen through `save-result`. For artefacts the brain doesn't
know about (a Slack message, a Figma URL, a one-off observation), use:

```
POST http://127.0.0.1:3800/api/mind/add
{ "url": "...", "label": "...", "kind": "concept", "createdBy": "<your cli>" }
```

URLs go through SSRF guards (http/https only, no loopback or metadata).

## What you must not do

- **Do not invent node IDs.** Only cite IDs that came back from a query.
- **Do not save answers you are unsure about** without marking them as such.
  The confidence taxonomy exists for a reason. If you're guessing, your
  edges should be `INFERRED` or `AMBIGUOUS`, not `EXTRACTED`.
- **Do not dispatch a sub-task to another CLI without first checking the
  brain.** You may rediscover something a previous CLI already saved.
- **Do not delete nodes without asking the user.** `DELETE /api/mind/node`
  exists for purging hallucinations, but the user authorizes removals.

## Identity

There is one brain per **space** (the user's `activeSpace`). The bootstrap
payload always tells you the current space and how many nodes the brain
contains. If `mind.enabled = false`, the brain is empty for this space -
suggest a build but don't insist.

When the bootstrap arrives with `mind.wakeup` populated, you already have
the L0 (active repo identity + CLAUDE.md preamble) and L1 (god nodes +
newest cross-CLI conversations) tiers in hand. Use them as the starting
context for the session before making any query. The `/api/mind/query`
endpoint serves L2/L3 — go there for specific questions.

## Node kinds

`note`, `code`, `doc`, `paper`, `image`, `workitem`, `recipe`,
`conversation` (saved-back AI answers), `plugin`, `concept`, `tag`,
`drawer` (verbatim user/assistant turn — never paraphrase a drawer).

The `cli-drawers` build source produces drawers from supported CLI session
logs: Claude Code, Codex, Qwen, Grok, Copilot.
Each drawer has deterministic ID `drawer_<cli>_<sessionId>_<msgIdx>` and
a `derived_from` edge to its parent session node.

## Saving back: grounding check

`POST /api/mind/save-result` now audits cited node IDs against the answer
text. Citations whose label or id never appears in the answer are tagged
`ungrounded`, and their `derived_from` edges land at `INFERRED` + 0.5
confidence instead of `EXTRACTED` + 1.0. The save still succeeds — the
brain doesn't lose data — but consumers see the warning. Pass
`"strict": true` to reject saves with zero grounded citations.

## Multi-CLI save-back hook

When you (any CLI: Claude Code, Codex, Qwen, Grok, Gemini, Copilot) run
**outside** the orchestrator, install `scripts/hooks/mind-stop-hook.sh`
in your CLI's Stop hook config to checkpoint conversations into Mind
every N messages. The script body is identical across CLIs; only the
config wrapper differs. See INSTRUCTIONS.base.md "Per-CLI save-back
hook" for per-CLI install snippets.

You and every other CLI in this system share this brain. Treat it that way.
