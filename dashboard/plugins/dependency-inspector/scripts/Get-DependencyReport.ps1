param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/dependency-inspector"

try {
    $repos = Invoke-RestMethod "$pluginBase/repos"
    if (-not $repos) { $repos = @() }
} catch {
    Write-Host "`n  Dependency Inspector plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Dependency Report ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($repos.Count -eq 0) {
    Write-Host "`n  No repos scanned yet. Run Start-ScanAll.ps1 first.`n" -ForegroundColor Yellow
    return
}

Write-Host ""
Write-Host ("    {0,-30} {1,8} {2,8} {3,8} {4,10}" -f "Repository", "Health", "Pkgs", "Vulns", "Outdated") -ForegroundColor White
Write-Host ("    {0,-30} {1,8} {2,8} {3,8} {4,10}" -f "----------", "------", "----", "-----", "--------") -ForegroundColor DarkGray

$totalPkgs = 0
$totalVulns = 0

foreach ($r in $repos) {
    $name = $r.name
    if ($name.Length -gt 28) { $name = $name.Substring(0, 28) + ".." }

    $health = if ($r.healthScore -ne $null) { $r.healthScore } else { "--" }
    $pkgs = if ($r.packageCount -ne $null) { $r.packageCount } else { 0 }
    $vulns = if ($r.vulnerabilityCount -ne $null) { $r.vulnerabilityCount } else { 0 }
    $outdated = if ($r.outdatedCount -ne $null) { $r.outdatedCount } else { 0 }

    $totalPkgs += $pkgs
    $totalVulns += $vulns

    $healthColor = if ($health -is [int] -or $health -is [double]) {
        if ($health -ge 80) { "Green" } elseif ($health -ge 50) { "Yellow" } else { "Red" }
    } else { "DarkGray" }

    $vulnColor = if ($vulns -gt 0) { "Red" } else { "Green" }

    Write-Host ("    {0,-30} " -f $name) -ForegroundColor White -NoNewline
    Write-Host ("{0,8} " -f $health) -ForegroundColor $healthColor -NoNewline
    Write-Host ("{0,8} " -f $pkgs) -ForegroundColor DarkGray -NoNewline
    Write-Host ("{0,8} " -f $vulns) -ForegroundColor $vulnColor -NoNewline
    Write-Host ("{0,10}" -f $outdated) -ForegroundColor DarkGray
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Repos: $($repos.Count) | Packages: $totalPkgs | Vulnerabilities: $totalVulns" -ForegroundColor White
Write-Host ""
