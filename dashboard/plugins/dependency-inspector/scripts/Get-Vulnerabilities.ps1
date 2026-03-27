param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$Repo = ""
)

if (-not $Repo) {
    Write-Host "`n  Usage: Get-Vulnerabilities.ps1 -Repo 'repo-name'" -ForegroundColor Yellow
    Write-Host "  Run Get-DependencyReport.ps1 first to see available repos.`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/dependency-inspector"
$encodedRepo = [System.Uri]::EscapeDataString($Repo)

try {
    $vulns = Invoke-RestMethod "$pluginBase/repos/$encodedRepo/vulnerabilities"
    if (-not $vulns) { $vulns = @() }
} catch {
    Write-Host "`n  Could not fetch vulnerabilities for '$Repo'.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Vulnerabilities -- $Repo ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($vulns.Count -eq 0) {
    Write-Host "`n  No vulnerabilities found. All clear!`n" -ForegroundColor Green
    return
}

# Group by severity
$critical = @($vulns | Where-Object { $_.severity -eq 'critical' })
$high = @($vulns | Where-Object { $_.severity -eq 'high' })
$moderate = @($vulns | Where-Object { $_.severity -eq 'moderate' -or $_.severity -eq 'medium' })
$low = @($vulns | Where-Object { $_.severity -eq 'low' })

Write-Host "`n  Summary: $($critical.Count) critical, $($high.Count) high, $($moderate.Count) moderate, $($low.Count) low" -ForegroundColor White

function Show-VulnGroup($label, $color, $group) {
    if ($group.Count -eq 0) { return }
    Write-Host "`n  $label ($($group.Count))" -ForegroundColor $color
    foreach ($v in $group) {
        $pkg = if ($v.package) { $v.package } else { $v.name }
        $ver = if ($v.version) { " @ $($v.version)" } else { "" }
        $fix = if ($v.fixAvailable -or $v.fixVersion) {
            $fixVer = if ($v.fixVersion) { $v.fixVersion } else { "available" }
            " -- fix: $fixVer"
        } else { "" }

        Write-Host "    $pkg$ver" -ForegroundColor White -NoNewline
        Write-Host "$fix" -ForegroundColor Green

        if ($v.title) {
            Write-Host "      $($v.title)" -ForegroundColor DarkGray
        }
        if ($v.cve) {
            Write-Host "      $($v.cve)" -ForegroundColor DarkGray
        }
    }
}

Show-VulnGroup "CRITICAL" "Red" $critical
Show-VulnGroup "HIGH" "Red" $high
Show-VulnGroup "MODERATE" "Yellow" $moderate
Show-VulnGroup "LOW" "DarkGray" $low

Write-Host ""
