param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/ga4-gtm"

try {
    $summary = Invoke-RestMethod "$pluginBase/summary" -ContentType "text/plain"
} catch {
    Write-Host "`n  GA4/GTM plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === GA4/GTM Container Summary ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host ""

if ($summary) {
    $summary -split "`n" | ForEach-Object {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  No summary data available." -ForegroundColor Yellow
}

Write-Host ""
