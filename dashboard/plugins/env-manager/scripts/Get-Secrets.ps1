param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$Repo = ""
)

if (-not $Repo) {
    Write-Host "`n  Usage: Get-Secrets.ps1 -Repo 'repo-name'" -ForegroundColor Yellow
    Write-Host "  Run Get-EnvSummary.ps1 first to see available repos.`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/env-manager"
$encodedRepo = [System.Uri]::EscapeDataString($Repo)

try {
    $secrets = Invoke-RestMethod "$pluginBase/repos/$encodedRepo/secrets"
    if (-not $secrets) { $secrets = @() }
} catch {
    Write-Host "`n  Could not fetch secrets for '$Repo'.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Detected Secrets -- $Repo ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($secrets.Count -eq 0) {
    Write-Host "`n  No secrets detected. All clear!`n" -ForegroundColor Green
    return
}

Write-Host "`n  Found $($secrets.Count) potential secret(s):`n" -ForegroundColor Yellow

foreach ($s in $secrets) {
    $type = if ($s.type) { $s.type } elseif ($s.kind) { $s.kind } else { "unknown" }
    $file = if ($s.file) { $s.file } elseif ($s.path) { $s.path } else { "" }
    $line = if ($s.line -ne $null) { ":$($s.line)" } else { "" }
    $key = if ($s.key) { $s.key } elseif ($s.name) { $s.name } else { "" }

    $sevColor = switch ($type.ToLower()) {
        "api_key"     { "Red" }
        "password"    { "Red" }
        "token"       { "Red" }
        "private_key" { "Red" }
        "secret"      { "Red" }
        default       { "Yellow" }
    }

    Write-Host "    [$type]" -ForegroundColor $sevColor -NoNewline
    if ($key) {
        Write-Host " $key" -ForegroundColor White -NoNewline
    }
    Write-Host ""
    if ($file) {
        Write-Host "      File: $file$line" -ForegroundColor DarkGray
    }
    if ($s.description) {
        Write-Host "      $($s.description)" -ForegroundColor DarkGray
    }
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Total: $($secrets.Count) potential secrets" -ForegroundColor White
Write-Host ""
