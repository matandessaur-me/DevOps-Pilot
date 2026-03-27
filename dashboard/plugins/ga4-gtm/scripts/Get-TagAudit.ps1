param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/ga4-gtm"

try {
    $health = Invoke-RestMethod "$pluginBase/health"
} catch {
    Write-Host "`n  GA4/GTM plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === GA4/GTM Tag Audit ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

# Health score
$score = if ($health.score -ne $null) { $health.score } else { "--" }
$scoreColor = if ($health.score -ge 80) { "Green" } elseif ($health.score -ge 50) { "Yellow" } else { "Red" }
Write-Host "`n  Health Score: $score / 100" -ForegroundColor $scoreColor

if ($health.findings -and $health.findings.Count -gt 0) {
    Write-Host "`n  Findings:" -ForegroundColor White
    foreach ($f in $health.findings) {
        $sevColor = switch ($f.severity) {
            "critical" { "Red" }
            "warning"  { "Yellow" }
            "info"     { "DarkGray" }
            default    { "White" }
        }
        $sev = if ($f.severity) { $f.severity.ToUpper() } else { "INFO" }
        Write-Host "    [$sev] $($f.message)" -ForegroundColor $sevColor
    }
}

# Tags
try {
    $tags = Invoke-RestMethod "$pluginBase/gtm/tags"
    if (-not $tags) { $tags = @() }
} catch { $tags = @() }

if ($tags.Count -gt 0) {
    $dormant = @($tags | Where-Object { $_.status -eq 'dormant' -or $_.dormant -eq $true })
    $paused = @($tags | Where-Object { $_.status -eq 'paused' -or $_.paused -eq $true })

    Write-Host "`n  Tags: $($tags.Count) total" -ForegroundColor White
    if ($dormant.Count -gt 0) {
        Write-Host "  Dormant: $($dormant.Count)" -ForegroundColor Yellow
        foreach ($t in $dormant) {
            Write-Host "    - $($t.name)" -ForegroundColor DarkGray
        }
    }
    if ($paused.Count -gt 0) {
        Write-Host "  Paused: $($paused.Count)" -ForegroundColor Yellow
        foreach ($t in $paused) {
            Write-Host "    - $($t.name)" -ForegroundColor DarkGray
        }
    }
}

# Unused variables
if ($health.unusedVariables -and $health.unusedVariables.Count -gt 0) {
    Write-Host "`n  Unused Variables: $($health.unusedVariables.Count)" -ForegroundColor Yellow
    foreach ($v in $health.unusedVariables) {
        Write-Host "    - $v" -ForegroundColor DarkGray
    }
}

Write-Host ""
