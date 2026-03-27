param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$Repo = ""
)

if (-not $Repo) {
    Write-Host "`n  Usage: Get-Outdated.ps1 -Repo 'repo-name'" -ForegroundColor Yellow
    Write-Host "  Run Get-DependencyReport.ps1 first to see available repos.`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/dependency-inspector"
$encodedRepo = [System.Uri]::EscapeDataString($Repo)

try {
    $outdated = Invoke-RestMethod "$pluginBase/repos/$encodedRepo/outdated"
    if (-not $outdated) { $outdated = @() }
} catch {
    Write-Host "`n  Could not fetch outdated packages for '$Repo'.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Outdated Packages -- $Repo ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($outdated.Count -eq 0) {
    Write-Host "`n  All packages are up to date!`n" -ForegroundColor Green
    return
}

# Group by update type
$major = @($outdated | Where-Object { $_.updateType -eq 'major' })
$minor = @($outdated | Where-Object { $_.updateType -eq 'minor' })
$patch = @($outdated | Where-Object { $_.updateType -eq 'patch' })
$unknown = @($outdated | Where-Object { $_.updateType -ne 'major' -and $_.updateType -ne 'minor' -and $_.updateType -ne 'patch' })

Write-Host "`n  Summary: $($major.Count) major, $($minor.Count) minor, $($patch.Count) patch" -ForegroundColor White

function Show-OutdatedGroup($label, $color, $group) {
    if ($group.Count -eq 0) { return }
    Write-Host "`n  $label Updates ($($group.Count))" -ForegroundColor $color
    Write-Host ("    {0,-30} {1,-15} {2,-15}" -f "Package", "Current", "Latest") -ForegroundColor White
    Write-Host ("    {0,-30} {1,-15} {2,-15}" -f "-------", "-------", "------") -ForegroundColor DarkGray
    foreach ($p in $group) {
        $name = $p.name
        if ($name.Length -gt 28) { $name = $name.Substring(0, 28) + ".." }
        $current = if ($p.current) { $p.current } else { "--" }
        $latest = if ($p.latest) { $p.latest } else { "--" }
        Write-Host ("    {0,-30} {1,-15} {2,-15}" -f $name, $current, $latest) -ForegroundColor DarkGray
    }
}

Show-OutdatedGroup "Major" "Red" $major
Show-OutdatedGroup "Minor" "Yellow" $minor
Show-OutdatedGroup "Patch" "Green" $patch
if ($unknown.Count -gt 0) {
    Show-OutdatedGroup "Other" "DarkGray" $unknown
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Total outdated: $($outdated.Count)" -ForegroundColor White
Write-Host ""
