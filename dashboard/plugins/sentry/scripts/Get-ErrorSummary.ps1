param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/sentry"

try {
    $summary = Invoke-RestMethod "$pluginBase/summary" -ContentType "text/plain"
} catch {
    Write-Host "`n  Sentry plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Sentry Error Summary ===" -ForegroundColor Cyan
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
