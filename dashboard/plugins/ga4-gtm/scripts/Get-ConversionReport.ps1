param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/ga4-gtm"

try {
    $conversions = Invoke-RestMethod "$pluginBase/ga4/conversions"
    if (-not $conversions) { $conversions = @() }
} catch {
    Write-Host "`n  GA4/GTM plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === GA4 Conversion Report ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($conversions.Count -eq 0) {
    Write-Host "`n  No conversion events found.`n" -ForegroundColor Yellow
    return
}

Write-Host ""
Write-Host ("    {0,-35} {1,12} {2,12}" -f "Event", "Count", "Value") -ForegroundColor White
Write-Host ("    {0,-35} {1,12} {2,12}" -f "-----", "-----", "-----") -ForegroundColor DarkGray

$sorted = $conversions | Sort-Object -Property { if ($_.count -ne $null) { $_.count } else { 0 } } -Descending
$totalCount = 0
$totalValue = 0

foreach ($c in $sorted) {
    $count = if ($c.count -ne $null) { $c.count } else { 0 }
    $value = if ($c.value -ne $null) { $c.value } else { 0 }
    $totalCount += $count
    $totalValue += $value

    $countStr = $count.ToString("N0")
    $valueStr = if ($value -gt 0) { "$" + $value.ToString("N2") } else { "--" }
    $name = $c.name
    if (-not $name) { $name = $c.eventName }

    Write-Host ("    {0,-35} {1,12} {2,12}" -f $name, $countStr, $valueStr) -ForegroundColor DarkGray
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
$totalValueStr = if ($totalValue -gt 0) { "$" + $totalValue.ToString("N2") } else { "--" }
Write-Host "  Total: $($conversions.Count) conversions | $($totalCount.ToString('N0')) events | $totalValueStr" -ForegroundColor White
Write-Host ""
