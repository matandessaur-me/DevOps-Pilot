param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [int]$PipelineId = 0
)

if ($PipelineId -eq 0) {
    Write-Host "`n  Usage: Get-PipelineHealth.ps1 -PipelineId 123" -ForegroundColor Yellow
    Write-Host "  Run Get-PipelineStatus.ps1 first to see available pipelines.`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/release-manager"

try {
    $health = Invoke-RestMethod "$pluginBase/pipelines/$PipelineId/health"
} catch {
    Write-Host "`n  Could not fetch health data for pipeline $PipelineId.`n" -ForegroundColor Yellow
    return
}

$name = if ($health.name) { $health.name } else { "Pipeline $PipelineId" }

Write-Host "`n  === Pipeline Health -- $name ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

# Success rate
$rate = if ($health.successRate -ne $null) { $health.successRate } else { "--" }
$rateColor = if ($rate -is [int] -or $rate -is [double]) {
    if ($rate -ge 90) { "Green" } elseif ($rate -ge 70) { "Yellow" } else { "Red" }
} else { "DarkGray" }

Write-Host "`n  Success Rate:   " -ForegroundColor White -NoNewline
Write-Host "$rate%" -ForegroundColor $rateColor

# Avg duration
$duration = if ($health.avgDuration -ne $null) { "$($health.avgDuration)s" } elseif ($health.avgDurationMinutes -ne $null) { "$($health.avgDurationMinutes) min" } else { "--" }
Write-Host "  Avg Duration:   $duration" -ForegroundColor White

# Total runs
$totalRuns = if ($health.totalRuns -ne $null) { $health.totalRuns } else { "--" }
Write-Host "  Total Runs:     $totalRuns" -ForegroundColor White

# Failure count
$failures = if ($health.failureCount -ne $null) { $health.failureCount } else { "--" }
$failColor = if ($failures -is [int] -and $failures -gt 0) { "Red" } else { "Green" }
Write-Host "  Failures:       " -ForegroundColor White -NoNewline
Write-Host "$failures" -ForegroundColor $failColor

# Trends
if ($health.trend -or $health.recentRuns) {
    Write-Host "`n  Recent Runs:" -ForegroundColor White
    $runs = if ($health.recentRuns) { $health.recentRuns } else { $health.trend }
    foreach ($run in $runs) {
        $runStatus = if ($run.status) { $run.status } else { $run.result }
        $runColor = switch ($runStatus.ToLower()) {
            "succeeded" { "Green" }
            "success"   { "Green" }
            "failed"    { "Red" }
            "failure"   { "Red" }
            default     { "DarkGray" }
        }
        $runDate = if ($run.date) {
            try { ([datetime]$run.date).ToString("MMM dd, HH:mm") } catch { $run.date }
        } elseif ($run.finishedDate) {
            try { ([datetime]$run.finishedDate).ToString("MMM dd, HH:mm") } catch { $run.finishedDate }
        } else { "--" }

        $dur = if ($run.duration -ne $null) { "$($run.duration)s" } else { "" }

        Write-Host "    [$runStatus] $runDate $dur" -ForegroundColor $runColor
    }
}

Write-Host ""
