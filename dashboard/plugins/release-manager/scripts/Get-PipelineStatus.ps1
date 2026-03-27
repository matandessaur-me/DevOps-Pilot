param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/release-manager"

try {
    $pipelines = Invoke-RestMethod "$pluginBase/pipelines"
    if (-not $pipelines) { $pipelines = @() }
} catch {
    Write-Host "`n  Release Manager plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Pipeline Status ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($pipelines.Count -eq 0) {
    Write-Host "`n  No pipelines found.`n" -ForegroundColor Yellow
    return
}

Write-Host ""
Write-Host ("    {0,-30} {1,-12} {2,-20} {3,10}" -f "Pipeline", "Status", "Last Run", "Success %") -ForegroundColor White
Write-Host ("    {0,-30} {1,-12} {2,-20} {3,10}" -f "--------", "------", "--------", "---------") -ForegroundColor DarkGray

foreach ($p in $pipelines) {
    $name = $p.name
    if ($name.Length -gt 28) { $name = $name.Substring(0, 28) + ".." }

    $status = if ($p.latestStatus) { $p.latestStatus } elseif ($p.status) { $p.status } else { "--" }
    $statusColor = switch ($status.ToLower()) {
        "succeeded"  { "Green" }
        "completed"  { "Green" }
        "success"    { "Green" }
        "failed"     { "Red" }
        "failure"    { "Red" }
        "running"    { "Yellow" }
        "in_progress" { "Yellow" }
        "queued"     { "DarkGray" }
        "cancelled"  { "DarkGray" }
        "canceled"   { "DarkGray" }
        default      { "White" }
    }

    $lastRun = if ($p.lastRunDate) {
        try { ([datetime]$p.lastRunDate).ToString("MMM dd, HH:mm") } catch { $p.lastRunDate }
    } elseif ($p.lastRun) {
        try { ([datetime]$p.lastRun).ToString("MMM dd, HH:mm") } catch { $p.lastRun }
    } else { "--" }

    $rate = if ($p.successRate -ne $null) { "$($p.successRate)%" } else { "--" }
    $rateColor = if ($p.successRate -ne $null) {
        if ($p.successRate -ge 90) { "Green" } elseif ($p.successRate -ge 70) { "Yellow" } else { "Red" }
    } else { "DarkGray" }

    Write-Host ("    {0,-30} " -f $name) -ForegroundColor White -NoNewline
    Write-Host ("{0,-12} " -f $status) -ForegroundColor $statusColor -NoNewline
    Write-Host ("{0,-20} " -f $lastRun) -ForegroundColor DarkGray -NoNewline
    Write-Host ("{0,10}" -f $rate) -ForegroundColor $rateColor
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Total: $($pipelines.Count) pipelines" -ForegroundColor White
Write-Host ""
