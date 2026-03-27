param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$status = Invoke-RestMethod "$ApiBase/api/plugins/teams/auth/status"

if (-not $status.connected) {
    Write-Host "`n  Teams Bridge not connected. Sign in with Microsoft first.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Teams & Channels ===" -ForegroundColor Cyan
Write-Host ""

$teams = Invoke-RestMethod "$ApiBase/api/plugins/teams/teams"
if (-not $teams) { $teams = @() }

foreach ($team in $teams) {
    Write-Host "  $($team.displayName)" -ForegroundColor White
    if ($team.description) {
        Write-Host "    $($team.description)" -ForegroundColor DarkGray
    }
    Write-Host "    ID: $($team.id)" -ForegroundColor DarkGray

    try {
        $channels = Invoke-RestMethod "$ApiBase/api/plugins/teams/teams/$($team.id)/channels"
        if (-not $channels) { $channels = @() }
    } catch { $channels = @() }

    foreach ($ch in $channels) {
        $typeLabel = if ($ch.membershipType -ne 'standard') { " ($($ch.membershipType))" } else { "" }
        Write-Host "    # $($ch.displayName)$typeLabel" -ForegroundColor Cyan -NoNewline
        Write-Host "  ID: $($ch.id)" -ForegroundColor DarkGray
    }
    Write-Host ""
}
