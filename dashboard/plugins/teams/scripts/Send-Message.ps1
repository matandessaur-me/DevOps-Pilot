param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [Parameter(Mandatory=$true)]
    [string]$TeamId,
    [Parameter(Mandatory=$true)]
    [string]$ChannelId,
    [Parameter(Mandatory=$true)]
    [string]$Message,
    [string]$MessageId  # Optional: reply to a specific thread
)

$status = Invoke-RestMethod "$ApiBase/api/plugins/teams/auth/status"

if (-not $status.connected) {
    Write-Host "`n  Teams Bridge not connected. Sign in with Microsoft first.`n" -ForegroundColor Yellow
    return
}

$body = @{
    teamId = $TeamId
    channelId = $ChannelId
    text = $Message
}

if ($MessageId) {
    $body.messageId = $MessageId
}

$jsonBody = $body | ConvertTo-Json -Compress

try {
    $result = Invoke-RestMethod "$ApiBase/api/plugins/teams/messages/send" -Method POST -ContentType 'application/json' -Body $jsonBody

    if ($result.ok) {
        $action = if ($MessageId) { "Reply sent" } else { "Message sent" }
        Write-Host "`n  $action successfully!" -ForegroundColor Green
        if ($result.message) {
            Write-Host "  From: $($result.message.from.displayName)" -ForegroundColor DarkGray
            Write-Host "  Time: $($result.message.relativeTime)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "`n  Failed to send message: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "`n  Error: $_" -ForegroundColor Red
}

Write-Host ""
