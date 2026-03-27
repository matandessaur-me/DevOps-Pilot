## Slack Bridge Plugin -- AI Instructions

You have access to a Slack integration plugin via the DevOps Pilot API. This lets you read channels, reply to threads, and post messages from the terminal.

**All routes are at** `http://127.0.0.1:3800/api/plugins/slack/`

### IMPORTANT: Start with the Summary

**Always use the summary endpoint first** -- it returns pre-formatted plain text:

```bash
# Get workspace overview (team name, channel list, counts)
curl -s http://127.0.0.1:3800/api/plugins/slack/summary
```

### IMPORTANT: Ask Permission Before Sending

**You MUST ask the user for permission before sending any message to Slack.** This includes:
- Posting messages to channels
- Replying in threads
- Adding reactions

Read operations (listing channels, reading messages, searching) do NOT require permission.

### Configuration

```bash
# Check if Slack is configured
curl -s http://127.0.0.1:3800/api/plugins/slack/config

# Test connection
curl -s http://127.0.0.1:3800/api/plugins/slack/test
```

### Channels

```bash
# List all channels (public, private, DMs)
curl -s http://127.0.0.1:3800/api/plugins/slack/channels

# Get channel details
curl -s http://127.0.0.1:3800/api/plugins/slack/channels/CHANNEL_ID
```

### Messages

```bash
# Read recent messages in a channel (default 30, max 100)
curl -s "http://127.0.0.1:3800/api/plugins/slack/channels/CHANNEL_ID/messages?limit=30"

# Read thread replies
curl -s http://127.0.0.1:3800/api/plugins/slack/channels/CHANNEL_ID/thread/THREAD_TS

# Send a message (REQUIRES USER PERMISSION)
curl -s -X POST http://127.0.0.1:3800/api/plugins/slack/messages/send \
  -H "Content-Type: application/json" \
  -d '{"channel":"CHANNEL_ID","text":"Hello from DevOps Pilot"}'

# Reply in a thread (REQUIRES USER PERMISSION)
curl -s -X POST http://127.0.0.1:3800/api/plugins/slack/messages/send \
  -H "Content-Type: application/json" \
  -d '{"channel":"CHANNEL_ID","text":"Thread reply","threadTs":"1234567890.123456"}'

# Add a reaction (REQUIRES USER PERMISSION)
curl -s -X POST http://127.0.0.1:3800/api/plugins/slack/messages/react \
  -H "Content-Type: application/json" \
  -d '{"channel":"CHANNEL_ID","timestamp":"1234567890.123456","name":"thumbsup"}'

# Search messages (requires xoxp- user token with search:read scope)
curl -s "http://127.0.0.1:3800/api/plugins/slack/messages/search?query=deployment"
```

### Users

```bash
# List workspace members
curl -s http://127.0.0.1:3800/api/plugins/slack/users

# Get user details
curl -s http://127.0.0.1:3800/api/plugins/slack/users/USER_ID
```

### Pre-Made Scripts

These scripts run instantly and provide formatted output. Always prefer these over raw curl calls.

| Script | Description | Example (bash) |
|--------|-------------|----------------|
| `Get-Channels.ps1` | List channels with member counts | `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/slack/scripts/Get-Channels.ps1"` |
| `Get-RecentMessages.ps1` | Recent messages in a channel | `powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/slack/scripts/Get-RecentMessages.ps1 -Channel 'general'"` |
| `Send-Message.ps1` | Send a message to a channel | `powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/slack/scripts/Send-Message.ps1 -Channel 'general' -Message 'Hello'"` |
| `Get-SlackSummary.ps1` | Workspace overview | `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/slack/scripts/Get-SlackSummary.ps1"` |

### Common Workflows

**1. Post Standup Summary to Slack**: Gather ADO work items with `Get-SprintStatus.ps1`, draft a standup summary, then ask the user if they want to post it to a specific Slack channel. Use the `/messages/send` endpoint to post.

**2. Share PR Status**: Fetch open PRs from `/api/github/pulls`, summarize them, ask permission, then post to a channel.

**3. Summarize a Channel**: Fetch recent messages from a channel, analyze the discussion, and present key points to the user.

**4. Search for Context**: Before starting work on a task, search Slack for related discussions using the search endpoint (requires user token).

### Opening in the Dashboard

After working with Slack, offer to open the Slack tab:

```bash
# Open the Slack tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"slack"}'
```

### Important Notes

- Bot tokens (xoxb-) can read channels and post messages but CANNOT search. Search requires a user token (xoxp-) with the search:read scope.
- Channel and user lists are cached (60s for channels, 5min for users). Data may be slightly stale.
- The bot can only access channels it has been invited to. If a channel is missing, the user needs to invite the bot.
- Message timestamps (ts) are used as unique identifiers in Slack. They look like "1234567890.123456".
- Thread replies use the parent message's ts as `threadTs`.
- AB# references in messages are detected and can be linked to Azure DevOps work items.
