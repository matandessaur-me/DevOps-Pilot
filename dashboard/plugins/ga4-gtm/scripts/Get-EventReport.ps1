param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/ga4-gtm"

try {
    $events = Invoke-RestMethod "$pluginBase/ga4/events"
    if (-not $events) { $events = @() }
} catch {
    Write-Host "`n  GA4/GTM plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === GA4 Event Report ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($events.Count -eq 0) {
    Write-Host "`n  No events found.`n" -ForegroundColor Yellow
    return
}

# Group by category
$auto = @($events | Where-Object { $_.category -eq 'auto' -or $_.category -eq 'automatically_collected' })
$recommended = @($events | Where-Object { $_.category -eq 'recommended' })
$custom = @($events | Where-Object { $_.category -eq 'custom' -or ($_.category -ne 'auto' -and $_.category -ne 'automatically_collected' -and $_.category -ne 'recommended') })

function Show-EventGroup($label, $color, $group) {
    if ($group.Count -eq 0) { return }
    Write-Host "`n  $label ($($group.Count))" -ForegroundColor $color
    $sorted = $group | Sort-Object -Property { if ($_.count -ne $null) { $_.count } else { 0 } } -Descending
    foreach ($e in $sorted) {
        $count = if ($e.count -ne $null) { $e.count.ToString("N0") } else { "--" }
        $name = $e.name
        Write-Host ("    {0,-40} {1,10}" -f $name, $count) -ForegroundColor DarkGray
    }
}

Show-EventGroup "Automatically Collected" "Blue" $auto
Show-EventGroup "Recommended" "Green" $recommended
Show-EventGroup "Custom" "Magenta" $custom

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Total events: $($events.Count)" -ForegroundColor White
Write-Host ""
