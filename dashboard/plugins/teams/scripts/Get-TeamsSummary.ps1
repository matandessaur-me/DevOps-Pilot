param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$status = Invoke-RestMethod "$ApiBase/api/plugins/teams/auth/status"

if (-not $status.connected) {
    Write-Host "`n  Teams Bridge not connected. Sign in with Microsoft first.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Teams Bridge Summary ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host "  Signed in as: $($status.displayName) ($($status.email))" -ForegroundColor White
Write-Host ""

$teams = Invoke-RestMethod "$ApiBase/api/plugins/teams/teams"
if (-not $teams) { $teams = @() }

Write-Host "  Teams: $($teams.Count)" -ForegroundColor White
Write-Host ""

foreach ($team in $teams) {
    Write-Host "  $($team.displayName)" -ForegroundColor Cyan
    if ($team.description) {
        Write-Host "    $($team.description)" -ForegroundColor DarkGray
    }

    try {
        $channels = Invoke-RestMethod "$ApiBase/api/plugins/teams/teams/$($team.id)/channels"
        if (-not $channels) { $channels = @() }
    } catch { $channels = @() }

    foreach ($ch in $channels) {
        $typeLabel = if ($ch.membershipType -ne 'standard') { " ($($ch.membershipType))" } else { "" }
        Write-Host "    # $($ch.displayName)$typeLabel" -ForegroundColor DarkGray
    }
    Write-Host ""
}

$chats = Invoke-RestMethod "$ApiBase/api/plugins/teams/chats"
if ($chats -and $chats.Count -gt 0) {
    Write-Host "  Recent Chats: $($chats.Count)" -ForegroundColor White
    foreach ($chat in $chats | Select-Object -First 5) {
        $name = if ($chat.topic) { $chat.topic } else { "Chat" }
        $preview = if ($chat.lastPreview) { " -- $($chat.lastPreview)" } else { "" }
        Write-Host "    $name$preview" -ForegroundColor DarkGray
    }
    Write-Host ""
}

Write-Host ""
