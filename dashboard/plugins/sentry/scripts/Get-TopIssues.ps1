param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$Project = ""
)

$pluginBase = "$ApiBase/api/plugins/sentry"

$url = "$pluginBase/issues?sort=freq"
if ($Project) {
    $encodedProject = [System.Uri]::EscapeDataString($Project)
    $url += "&project=$encodedProject"
}

try {
    $issues = Invoke-RestMethod $url
    if (-not $issues) { $issues = @() }
} catch {
    Write-Host "`n  Sentry plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

$title = if ($Project) { "Top Issues -- $Project" } else { "Top Issues" }
Write-Host "`n  === Sentry $title ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($issues.Count -eq 0) {
    Write-Host "`n  No issues found.`n" -ForegroundColor Green
    return
}

Write-Host ""
Write-Host ("    {0,-6} {1,8} {2,8} {3,-45}" -f "ID", "Events", "Users", "Title") -ForegroundColor White
Write-Host ("    {0,-6} {1,8} {2,8} {3,-45}" -f "------", "------", "-----", "-----") -ForegroundColor DarkGray

foreach ($issue in $issues) {
    $id = if ($issue.shortId) { $issue.shortId } elseif ($issue.id) { $issue.id } else { "--" }
    $events = if ($issue.count -ne $null) { $issue.count.ToString("N0") } elseif ($issue.events -ne $null) { $issue.events.ToString("N0") } else { "--" }
    $users = if ($issue.userCount -ne $null) { $issue.userCount.ToString("N0") } else { "--" }
    $issueTitle = if ($issue.title) { $issue.title } else { "(untitled)" }
    if ($issueTitle.Length -gt 43) { $issueTitle = $issueTitle.Substring(0, 43) + ".." }

    $level = if ($issue.level) { $issue.level } else { "error" }
    $levelColor = switch ($level.ToLower()) {
        "fatal"   { "Red" }
        "error"   { "Red" }
        "warning" { "Yellow" }
        "info"    { "DarkGray" }
        default   { "White" }
    }

    Write-Host ("    {0,-6} {1,8} {2,8} " -f $id, $events, $users) -ForegroundColor DarkGray -NoNewline
    Write-Host ("{0,-45}" -f $issueTitle) -ForegroundColor $levelColor

    if ($issue.culprit) {
        $culprit = $issue.culprit
        if ($culprit.Length -gt 60) { $culprit = $culprit.Substring(0, 60) + ".." }
        Write-Host "                              $culprit" -ForegroundColor DarkGray
    }
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Showing top $($issues.Count) issues by frequency" -ForegroundColor White
Write-Host ""
