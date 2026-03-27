param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/dependency-inspector"

Write-Host "`n  === Dependency Scan ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host "`n  Scanning all repositories..." -ForegroundColor White

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
        $vulns = if ($r.vulnerabilityCount -ne $null) { $r.vulnerabilityCount } else { 0 }
        $outdated = if ($r.outdatedCount -ne $null) { $r.outdatedCount } else { 0 }
        $statusIcon = if ($vulns -eq 0) { "OK" } else { "!!" }
        $statusColor = if ($vulns -eq 0) { "Green" } else { "Red" }

        Write-Host "    [$statusIcon] $name -- $vulns vulns, $outdated outdated" -ForegroundColor $statusColor
    }
}

if ($result.summary) {
    Write-Host "`n  $($result.summary)" -ForegroundColor DarkGray
}

if ($result.scannedCount -ne $null) {
    Write-Host "`n  Scanned: $($result.scannedCount) repos" -ForegroundColor DarkGray
}

Write-Host ""
