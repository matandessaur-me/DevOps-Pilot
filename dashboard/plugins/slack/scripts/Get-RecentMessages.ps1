param(
    [Parameter(Mandatory=$true)]
    [string]$Channel,
    [int]$Limit = 15,
    [string]$ApiBase = "http://127.0.0.1:3800"
)

# Resolve channel name to ID
$channels = Invoke-RestMethod "$ApiBase/api/plugins/slack/channels"
$ch = $channels | Where-Object { $_.name -eq $Channel -or $_.id -eq $Channel } | Select-Object -First 1

if (-not $ch) {
    Write-Host "`n  Channel '$Channel' not found.`n" -ForegroundColor Red
    Write-Host "  Available channels:" -ForegroundColor DarkGray
    $channels | Where-Object { -not $_.isIm } | Sort-Object name | ForEach-Object { Write-Host "    # $($_.name)" -ForegroundColor DarkGray }
    return
}

$messages = Invoke-RestMethod "$ApiBase/api/plugins/slack/channels/$($ch.id)/messages?limit=$Limit"

if (-not $messages -or $messages.Count -eq 0) {
    Write-Host "`n  No messages in #$($ch.name).`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === #$($ch.name) -- Recent Messages ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host ""

# Messages come newest-first, reverse for chronological display
$sorted = $messages | Sort-Object ts

foreach ($msg in $sorted) {
    if ($msg.subtype -and $msg.subtype -ne 'bot_message') { continue }

    $time = [DateTimeOffset]::FromUnixTimeSeconds([Math]::Floor([double]$msg.ts)).LocalDateTime.ToString("HH:mm")
    $threadInfo = if ($msg.replyCount -gt 0) { " [$($msg.replyCount) replies]" } else { "" }

    Write-Host "  $time " -ForegroundColor DarkGray -NoNewline
    Write-Host "$($msg.userName)" -ForegroundColor Cyan -NoNewline
    Write-Host "$threadInfo" -ForegroundColor Yellow
    Write-Host "    $($msg.text)" -ForegroundColor White
    Write-Host ""
}

Write-Host "  -- $($messages.Count) messages shown --`n" -ForegroundColor DarkGray
