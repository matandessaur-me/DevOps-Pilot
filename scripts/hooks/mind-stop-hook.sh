#!/bin/bash
# Mind Stop hook -- CLI-agnostic.
#
# Reads a Stop-style JSON event from stdin and POSTs the latest user/assistant
# pair from the session transcript to /api/mind/save-result. Works for any
# CLI that ships Stop hooks with the de-facto event shape:
#
#   { "session_id": "...", "stop_hook_active": false|true, "transcript_path": "..." }
#
# Symphonee supports six CLIs (Claude Code, Codex, Gemini, Grok, Qwen, GitHub
# Copilot). Each ships its own hook config format -- this script is the
# common save-back action; the per-CLI hook config tells THAT CLI to call it.
#
# Per-CLI install (only the wrappers differ; this script body is shared):
#
#   Claude Code -- ~/.claude/settings.json or .claude/settings.local.json:
#     {
#       "hooks": {
#         "Stop": [{ "matcher": "*", "hooks": [{ "type": "command",
#           "command": "/abs/path/to/scripts/hooks/mind-stop-hook.sh",
#           "timeout": 30 }] }]
#       }
#     }
#
#   Codex CLI -- ~/.codex/hooks.json:
#     { "Stop": [{ "type": "command",
#       "command": "/abs/path/to/scripts/hooks/mind-stop-hook.sh",
#       "timeout": 30 }] }
#
#   Qwen Code -- ~/.qwen/hooks.json: same shape as Codex.
#
#   Grok / Gemini / Copilot -- check that CLI's docs for hook syntax;
#   the script body is identical, only the config wrapper differs.
#
# === Behaviour ===
#
# - Counts user messages in the transcript jsonl.
# - Every SAVE_INTERVAL user messages, POSTs the latest user message + the
#   newest assistant text after it to Mind as a save-result.
# - Idempotent: state file under ~/.symphonee/mind-hook-state/<session>.last
#   tracks the last save point; the same exchange never gets re-saved.
# - Non-blocking: returns {} so the AI continues, save fires in the
#   background. Set MIND_HOOK_VERBOSE=1 to block + show a checkpoint message.
# - Honest about CLI: SAVED_BY env var (claude|codex|qwen|grok|gemini|copilot)
#   tells the script which name to record. Defaults to "unknown" if unset.

set -e

SAVE_INTERVAL="${MIND_HOOK_INTERVAL:-10}"
SAVED_BY="${MIND_HOOK_CLI:-unknown}"
MIND_URL="${MIND_HOOK_URL:-http://127.0.0.1:3800}"
STATE_DIR="$HOME/.symphonee/mind-hook-state"
mkdir -p "$STATE_DIR"

PYTHON_BIN="${MIND_HOOK_PYTHON:-$(command -v python3 2>/dev/null || command -v python || echo python3)}"

INPUT=$(cat)

read_field() {
  local key="$1"
  echo "$INPUT" | "$PYTHON_BIN" -c "
import sys, json, re
try: data = json.load(sys.stdin)
except Exception: data = {}
v = data.get('$key', '')
print(re.sub(r'[^a-zA-Z0-9_/.\\-~:]', '', str(v)))
" 2>/dev/null
}

read_bool() {
  local key="$1"
  echo "$INPUT" | "$PYTHON_BIN" -c "
import sys, json
try: data = json.load(sys.stdin)
except Exception: data = {}
v = data.get('$key', False)
print('true' if v is True or str(v).lower() in ('true','1','yes') else 'false')
" 2>/dev/null
}

SESSION_ID=$(read_field session_id)
SESSION_ID="${SESSION_ID:-unknown}"
STOP_HOOK_ACTIVE=$(read_bool stop_hook_active)
TRANSCRIPT_PATH=$(read_field transcript_path)
TRANSCRIPT_PATH="${TRANSCRIPT_PATH/#\~/$HOME}"

# Infinite-loop guard: if the AI is already in a save cycle, let it stop.
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo "{}"
  exit 0
fi

# Validate the transcript path: non-empty, .json/.jsonl, no traversal.
case "$TRANSCRIPT_PATH" in
  "" | */../* | *../*) echo "{}"; exit 0 ;;
  *.json|*.jsonl) ;;
  *) echo "{}"; exit 0 ;;
esac

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "{}"
  exit 0
fi

# Count user messages and grab the latest exchange.
EXCHANGE_DATA=$("$PYTHON_BIN" - "$TRANSCRIPT_PATH" <<'PYEOF'
import json, sys

count = 0
last_user = None
last_assistant_after_user = None

with open(sys.argv[1], encoding='utf-8', errors='replace') as f:
    for line in f:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        msg = entry.get('message') or entry.get('payload') or entry
        role = msg.get('role') if isinstance(msg, dict) else None
        if role is None:
            t = entry.get('type')
            if t in ('user', 'assistant'):
                role = t

        def text_of(m):
            if not isinstance(m, dict):
                return ''
            c = m.get('content')
            if isinstance(c, str):
                return c
            if isinstance(c, list):
                parts = []
                for b in c:
                    if isinstance(b, dict):
                        if b.get('type') == 'text' and b.get('text'):
                            parts.append(b['text'])
                return '\n'.join(parts)
            t = m.get('text') or m.get('display') or ''
            return t if isinstance(t, str) else ''

        if role == 'user':
            text = text_of(msg)
            if text and '<command-message>' not in text:
                count += 1
                last_user = text
                last_assistant_after_user = None
        elif role == 'assistant':
            text = text_of(msg)
            if text and last_user is not None:
                last_assistant_after_user = text

import json as _json
print(_json.dumps({
    'count': count,
    'user': last_user or '',
    'assistant': last_assistant_after_user or '',
}))
PYEOF
2>/dev/null)

if [ -z "$EXCHANGE_DATA" ]; then echo "{}"; exit 0; fi

EXCHANGE_COUNT=$(echo "$EXCHANGE_DATA" | "$PYTHON_BIN" -c "import sys,json;print(json.load(sys.stdin).get('count',0))")
[[ "$EXCHANGE_COUNT" =~ ^[0-9]+$ ]] || EXCHANGE_COUNT=0

LAST_SAVE_FILE="$STATE_DIR/${SESSION_ID}.last"
LAST_SAVE=0
if [ -f "$LAST_SAVE_FILE" ]; then
  RAW=$(cat "$LAST_SAVE_FILE")
  [[ "$RAW" =~ ^[0-9]+$ ]] && LAST_SAVE="$RAW"
fi

SINCE_LAST=$((EXCHANGE_COUNT - LAST_SAVE))

if [ "$SINCE_LAST" -ge "$SAVE_INTERVAL" ] && [ "$EXCHANGE_COUNT" -gt 0 ]; then
  echo "$EXCHANGE_COUNT" > "$LAST_SAVE_FILE"

  # Build the save-result body.
  PAYLOAD=$(echo "$EXCHANGE_DATA" | "$PYTHON_BIN" -c "
import sys, json
d = json.load(sys.stdin)
question = (d.get('user') or '')[:1500]
answer = (d.get('assistant') or '')[:4000]
created_by = '$SAVED_BY'
print(json.dumps({
    'question': question or '(stop-hook checkpoint)',
    'answer': answer or '(no assistant text yet)',
    'citedNodeIds': [],
    'createdBy': created_by,
}))
")

  # Fire and forget so we don't block the AI.
  (curl -sS -X POST "$MIND_URL/api/mind/save-result" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null 2>&1 &)

  if [ "$MIND_HOOK_VERBOSE" = "1" ] || [ "$MIND_HOOK_VERBOSE" = "true" ]; then
    cat <<EOF
{ "decision": "block", "reason": "Mind checkpoint saved at exchange $EXCHANGE_COUNT (CLI: $SAVED_BY). Continue." }
EOF
  else
    echo "{}"
  fi
else
  echo "{}"
fi
