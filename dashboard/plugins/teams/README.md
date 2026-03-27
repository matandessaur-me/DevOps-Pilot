# Teams Bridge -- DevOps Pilot Plugin

Read Microsoft Teams channels, reply to threads, and post messages without leaving DevOps Pilot.

## Features

- Browse joined teams and channels in a sidebar
- View channel messages with real-time refresh
- Reply to threads inline
- Send new messages to channels
- Read and reply in 1:1 and group chats
- AI actions: summarize channels, post standups, share PR status, draft messages
- AB# work item references auto-detected and linked
- OAuth2 delegated auth (user consent) with Microsoft Graph API

## Setup

1. Register an Azure AD app at portal.azure.com > App registrations
2. Set redirect URI: `http://127.0.0.1:3800/api/plugins/teams/auth/callback` (Web)
3. Add delegated API permissions:
   - User.Read
   - Team.ReadBasic.All
   - Channel.ReadBasic.All
   - ChannelMessage.Read.All
   - ChannelMessage.Send
   - Chat.ReadWrite
   - ChatMessage.Send
4. Create a client secret
5. In DevOps Pilot Settings > Plugins > Teams Bridge, enter the Client ID and Secret
6. Click "Sign in with Microsoft" in the Teams tab

## Installation

Copy the plugin folder to your DevOps Pilot plugins directory:

```
dashboard/plugins/teams/
```

Or symlink it:

```bash
mklink /D "path\to\DevOps-Pilot\dashboard\plugins\teams" "path\to\devops-pilot-plugin-teams"
```

## Scripts

| Script | Description |
|--------|-------------|
| `Get-TeamsSummary.ps1` | Overview of teams, channels, and chats |
| `Get-Channels.ps1` | List all teams and channels with IDs |
| `Get-RecentMessages.ps1` | Fetch messages from a channel |
| `Send-Message.ps1` | Send a message or thread reply |

## API Endpoints

All routes are prefixed with `/api/plugins/teams/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/start` | Start OAuth2 flow |
| GET | `/auth/callback` | OAuth2 redirect handler |
| GET | `/auth/status` | Connection status |
| POST | `/auth/disconnect` | Disconnect account |
| GET | `/config` | Plugin config |
| POST | `/config` | Update config |
| GET | `/test` | Test connection |
| GET | `/summary` | Plain text overview |
| GET | `/teams` | List joined teams |
| GET | `/teams/:teamId/channels` | List channels |
| GET | `/channels/:teamId/:channelId/messages` | Channel messages |
| GET | `/channels/:teamId/:channelId/messages/:id/replies` | Thread replies |
| POST | `/messages/send` | Send message or reply |
| GET | `/chats` | List chats |
| GET | `/chats/:chatId/messages` | Chat messages |
| POST | `/chats/:chatId/send` | Send chat message |
| GET | `/users` | List team members |
