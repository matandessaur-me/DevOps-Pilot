param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$pluginBase = "$ApiBase/api/plugins/env-manager"

try {
    $data = Invoke-RestMethod "$pluginBase/cross-repo"
} catch {
    Write-Host "`n  Environment Manager plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Cross-Repo Environment Analysis ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

# Shared variables
if ($data.sharedVariables -and $data.sharedVariables.Count -gt 0) {
    Write-Host "`n  Shared Variables ($($data.sharedVariables.Count))" -ForegroundColor White
    foreach ($v in $data.sharedVariables) {
        $name = if ($v.name) { $v.name } else { $v.key }
        $repos = if ($v.repos) { ($v.repos -join ", ") } elseif ($v.usedIn) { ($v.usedIn -join ", ") } else { "" }
        $consistent = if ($v.consistent -eq $true) { "consistent" } elseif ($v.consistent -eq $false) { "MISMATCH" } else { "" }
        $consColor = if ($v.consistent -eq $false) { "Red" } elseif ($v.consistent -eq $true) { "Green" } else { "DarkGray" }

        Write-Host "    $name" -ForegroundColor White -NoNewline
        if ($consistent) {
            Write-Host " ($consistent)" -ForegroundColor $consColor -NoNewline
        }
        Write-Host ""
        if ($repos) {
            Write-Host "      Used in: $repos" -ForegroundColor DarkGray
        }
    }
}

# Secrets summary
if ($data.secrets -or $data.secretsSummary) {
    $secrets = if ($data.secretsSummary) { $data.secretsSummary } else { $data.secrets }
    Write-Host "`n  Secrets Summary" -ForegroundColor White

    if ($secrets -is [array]) {
        foreach ($s in $secrets) {
            $repo = if ($s.repo) { $s.repo } else { $s.name }
            $count = if ($s.count -ne $null) { $s.count } else { 0 }
            $color = if ($count -gt 0) { "Yellow" } else { "Green" }
            Write-Host "    $repo -- $count detected" -ForegroundColor $color
        }
    } elseif ($secrets.totalDetected -ne $null) {
        $color = if ($secrets.totalDetected -gt 0) { "Yellow" } else { "Green" }
        Write-Host "    Total secrets detected: $($secrets.totalDetected)" -ForegroundColor $color
    } else {
        Write-Host "    $($secrets | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
    }
}

# Orphaned variables
if ($data.orphaned -and $data.orphaned.Count -gt 0) {
    Write-Host "`n  Orphaned Variables ($($data.orphaned.Count))" -ForegroundColor Yellow
    foreach ($o in $data.orphaned) {
        $name = if ($o.name) { $o.name } else { $o.key }
        $repo = if ($o.repo) { " in $($o.repo)" } else { "" }
        Write-Host "    $name$repo" -ForegroundColor DarkGray
    }
}

Write-Host ""
