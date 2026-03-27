# Slack Bridge -- DevOps Pilot Plugin

Read Slack channels, reply to threads, and post messages without leaving DevOps Pilot.

## Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app (From scratch)
2. Navigate to **OAuth & Permissions**
3. Add the following **Bot Token Scopes**:
   - `channels:history` -- Read messages in public channels
   - `channels:read` -- List public channels
   - `chat:write` -- Send messages
   - `groups:history` -- Read messages in private channels
   - `groups:read` -- List private channels
   - `im:history` -- Read direct messages
   - `im:read` -- List direct messages
   - `mpim:history` -- Read group DMs
   - `mpim:read` -- List group DMs
   - `users:read` -- List workspace members
   - `reactions:write` -- Add emoji reactions
4. Optionally add `search:read` scope if using a **User Token** (xoxp-) for message search
5. Click **Install to Workspace** and authorize
6. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
7. In DevOps Pilot, go to **Settings > Plugins > Slack Bridge** and paste the token

## Features

- Browse and search channels (public, private, DMs)
- Read channel message history
- View and reply in threads
- Send messages to any channel
- AI-powered actions: post standups, share PR status, summarize channels, draft messages
- AB# work item references detected and clickable
- Slack markdown rendering (bold, italic, code, links)

## API Endpoints

All routes are under `/api/plugins/slack/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Check configuration |
| POST | `/config` | Save bot token |
| GET | `/test` | Validate connection |
| GET | `/summary` | Plain text workspace overview |
| GET | `/channels` | List all channels |
| GET | `/channels/:id` | Channel details |
| GET | `/channels/:id/messages` | Channel history (query: limit) |
| GET | `/channels/:id/thread/:ts` | Thread replies |
| POST | `/messages/send` | Send message (body: channel, text, threadTs?) |
| POST | `/messages/react` | Add reaction (body: channel, timestamp, name) |
| GET | `/messages/search` | Search messages (query: query) |
| GET | `/users` | List workspace members |
| GET | `/users/:id` | User details |

## PowerShell Scripts

| Script | Description |
|--------|-------------|
| `Get-Channels.ps1` | List channels with member counts |
| `Get-RecentMessages.ps1 -Channel "name"` | Recent messages in a channel |
| `Send-Message.ps1 -Channel "name" -Message "text"` | Send a message |
| `Get-SlackSummary.ps1` | Workspace overview |
