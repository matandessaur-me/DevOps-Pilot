param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [Parameter(Mandatory=$true)]
    [string]$TeamId,
    [Parameter(Mandatory=$true)]
    [string]$ChannelId,
    [int]$Count = 20
)

$status = Invoke-RestMethod "$ApiBase/api/plugins/teams/auth/status"

if (-not $status.connected) {
    Write-Host "`n  Teams Bridge not connected. Sign in with Microsoft first.`n" -ForegroundColor Yellow
    return
}

$messages = Invoke-RestMethod "$ApiBase/api/plugins/teams/channels/$TeamId/$ChannelId/messages?top=$Count"
if (-not $messages) { $messages = @() }

Write-Host "`n  === Recent Messages ($($messages.Count)) ===" -ForegroundColor Cyan
Write-Host ""

# Sort oldest first for reading order
$sorted = $messages | Sort-Object { [DateTime]$_.createdAt }

foreach ($msg in $sorted) {
    $name = $msg.from.displayName
    $time = $msg.relativeTime
    $text = $msg.text

    Write-Host "  [$time] " -ForegroundColor DarkGray -NoNewline
    Write-Host "$name" -ForegroundColor White -NoNewline
    Write-Host ": $text" -ForegroundColor Gray
}

Write-Host ""
