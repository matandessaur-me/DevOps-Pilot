param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/env-manager"

Write-Host "`n  === Environment Scan ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host "`n  Scanning all repositories for environment variables..." -ForegroundColor White

try {
    $result = Invoke-RestMethod "$pluginBase/scan-all" -Method POST -ContentType "application/json" -Body "{}"
} catch {
    Write-Host "  Scan failed: $($_.Exception.Message)`n" -ForegroundColor Red
    return
}

if ($result.status -eq 'complete' -or $result.status -eq 'success') {
    Write-Host "  Scan complete!" -ForegroundColor Green
} elseif ($result.status -eq 'running' -or $result.status -eq 'in_progress') {
    Write-Host "  Scan started in background." -ForegroundColor Yellow
} else {
    Write-Host "  Scan status: $($result.status)" -ForegroundColor White
}

if ($result.repos -and $result.repos.Count -gt 0) {
    Write-Host "`n  Results:" -ForegroundColor White
    foreach ($r in $result.repos) {
        $name = $r.name
        $vars = if ($r.variableCount -ne $null) { $r.variableCount } elseif ($r.envCount -ne $null) { $r.envCount } else { 0 }
        $secrets = if ($r.secretCount -ne $null) { $r.secretCount } else { 0 }
        $secretLabel = if ($secrets -gt 0) { ", $secrets secrets" } else { "" }
        $color = if ($secrets -gt 0) { "Yellow" } else { "Green" }

        Write-Host "    $name -- $vars variables$secretLabel" -ForegroundColor $color
    }
}

if ($result.scannedCount -ne $null) {
    Write-Host "`n  Scanned: $($result.scannedCount) repos" -ForegroundColor DarkGray
}

if ($result.summary) {
    Write-Host "`n  $($result.summary)" -ForegroundColor DarkGray
}

Write-Host ""
