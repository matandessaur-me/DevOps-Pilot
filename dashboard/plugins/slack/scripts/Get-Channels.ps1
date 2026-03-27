param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$channels = Invoke-RestMethod "$ApiBase/api/plugins/slack/channels"

if (-not $channels -or $channels.Count -eq 0) {
    Write-Host "`n  No channels found. Is the bot invited to any channels?`n" -ForegroundColor Yellow
    return
}

$public = $channels | Where-Object { -not $_.isPrivate -and -not $_.isIm -and -not $_.isMpim }
$private = $channels | Where-Object { $_.isPrivate -and -not $_.isIm -and -not $_.isMpim }
$dms = $channels | Where-Object { $_.isIm }

Write-Host "`n  === Slack Channels ===" -ForegroundColor Cyan

if ($public -and $public.Count -gt 0) {
    Write-Host "`n  Public Channels ($($public.Count))" -ForegroundColor Green
    Write-Host "  $('-' * 40)" -ForegroundColor DarkGray
    foreach ($ch in ($public | Sort-Object name)) {
        $members = if ($ch.numMembers) { " ($($ch.numMembers) members)" } else { "" }
        Write-Host "    # $($ch.name)$members" -ForegroundColor White
    }
}

if ($private -and $private.Count -gt 0) {
    Write-Host "`n  Private Channels ($($private.Count))" -ForegroundColor Yellow
    Write-Host "  $('-' * 40)" -ForegroundColor DarkGray
    foreach ($ch in ($private | Sort-Object name)) {
        $members = if ($ch.numMembers) { " ($($ch.numMembers) members)" } else { "" }
        Write-Host "    (private) $($ch.name)$members" -ForegroundColor White
    }
}

if ($dms -and $dms.Count -gt 0) {
    Write-Host "`n  Direct Messages ($($dms.Count))" -ForegroundColor Blue
    Write-Host "  $('-' * 40)" -ForegroundColor DarkGray
    foreach ($ch in ($dms | Sort-Object name)) {
        Write-Host "    @ $($ch.name)" -ForegroundColor White
    }
}

Write-Host "`n  Total: $($channels.Count) channels`n" -ForegroundColor DarkGray
