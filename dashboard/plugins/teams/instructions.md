## Teams Bridge Plugin -- AI Instructions

You have access to a Microsoft Teams integration plugin via the DevOps Pilot API. This lets you read channels, reply to threads, and post messages -- all without leaving DevOps Pilot.

**All routes are at** `http://127.0.0.1:3800/api/plugins/teams/`

### IMPORTANT: Start with the Summary

**Always use the summary endpoint first** -- it returns pre-formatted plain text:

```bash
# Get a full overview of the user's teams, channels, and chats
curl -s http://127.0.0.1:3800/api/plugins/teams/summary
```

### IMPORTANT: Ask Before Sending

**You MUST ask the user for permission before sending any message to Teams.** Never auto-post. Always show the draft and wait for confirmation.

### Pre-Made Scripts

These scripts run instantly and provide formatted output. **Always prefer these over raw curl calls.**

| Script | Description | Example (from bash) |
|--------|-------------|---------------------|
| `Get-TeamsSummary.ps1` | Full overview -- teams, channels, chats | `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/teams/scripts/Get-TeamsSummary.ps1"` |
| `Get-Channels.ps1` | List all teams and channels with IDs | `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/teams/scripts/Get-Channels.ps1"` |
| `Get-RecentMessages.ps1` | Fetch recent messages from a channel | `powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/teams/scripts/Get-RecentMessages.ps1 -TeamId 'TEAM_ID' -ChannelId 'CHANNEL_ID'"` |
| `Send-Message.ps1` | Send a message to a channel | `powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/teams/scripts/Send-Message.ps1 -TeamId 'TEAM_ID' -ChannelId 'CHANNEL_ID' -Message 'Hello from DevOps Pilot'"` |

### Setup Instructions

The plugin uses OAuth2 delegated flow with Microsoft Graph API. To set up:

1. Go to **Azure Portal** > App registrations > New registration
2. Set redirect URI to `http://127.0.0.1:3800/api/plugins/teams/auth/callback` (type: Web)
3. Under **API permissions**, add delegated permissions: User.Read, Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Read.All, ChannelMessage.Send, Chat.ReadWrite, ChatMessage.Send
4. Under **Certificates & secrets**, create a new client secret
5. Copy the Application (Client) ID and the client secret value
6. In DevOps Pilot, go to **Settings > Plugins > Teams Bridge** and paste both values
7. Click **Sign in with Microsoft** in the Teams tab

### Configuration

```bash
# Check connection status
curl -s http://127.0.0.1:3800/api/plugins/teams/auth/status

# Test connection
curl -s http://127.0.0.1:3800/api/plugins/teams/test
```

### Teams & Channels

```bash
# List joined teams
curl -s http://127.0.0.1:3800/api/plugins/teams/teams

# List channels in a team
curl -s http://127.0.0.1:3800/api/plugins/teams/teams/TEAM_ID/channels
```

### Messages

```bash
# Get channel messages (default: 30)
curl -s "http://127.0.0.1:3800/api/plugins/teams/channels/TEAM_ID/CHANNEL_ID/messages?top=30"

# Get thread replies
curl -s http://127.0.0.1:3800/api/plugins/teams/channels/TEAM_ID/CHANNEL_ID/messages/MESSAGE_ID/replies

# Send a message to a channel (REQUIRES USER PERMISSION)
curl -s -X POST http://127.0.0.1:3800/api/plugins/teams/messages/send \
  -H "Content-Type: application/json" \
  -d '{"teamId":"TEAM_ID","channelId":"CHANNEL_ID","text":"Hello from DevOps Pilot"}'

# Reply to a thread (REQUIRES USER PERMISSION)
curl -s -X POST http://127.0.0.1:3800/api/plugins/teams/messages/send \
  -H "Content-Type: application/json" \
  -d '{"teamId":"TEAM_ID","channelId":"CHANNEL_ID","messageId":"MESSAGE_ID","text":"Reply text"}'
```

### Chats (1:1 and Group)

```bash
# List chats
curl -s http://127.0.0.1:3800/api/plugins/teams/chats

# Get chat messages
curl -s "http://127.0.0.1:3800/api/plugins/teams/chats/CHAT_ID/messages?top=30"

# Send a chat message (REQUIRES USER PERMISSION)
curl -s -X POST http://127.0.0.1:3800/api/plugins/teams/chats/CHAT_ID/send \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello"}'
```

### Users

```bash
# List known team members (cached from team membership)
curl -s http://127.0.0.1:3800/api/plugins/teams/users
```

### Common Workflows

**1. Post Standup to Teams**: Run `Get-StandupSummary.ps1` to get the ADO standup, format it for Teams, ask the user to confirm, then post using `/messages/send`.

**2. Share PR Status**: Fetch open PRs from `/api/github/pulls`, format a summary, ask the user to confirm, then post to the selected channel.

**3. Summarize Channel**: Fetch recent messages using `Get-RecentMessages.ps1`, analyze key topics, decisions, and action items, and present a concise summary.

**4. Search for AB# References**: Fetch recent messages and look for AB#NNNNN patterns. Cross-reference with Azure DevOps work items for context.

**5. Draft and Send**: When the user asks to send a message, always draft it first, show the draft, wait for approval, then send.

### Navigation

After posting a message or working with Teams, offer to open the Teams tab:

```bash
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"teams"}'
```
