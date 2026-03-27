param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [int]$PipelineId = 0,
    [int]$FromRunId = 0,
    [int]$ToRunId = 0
)

if ($PipelineId -eq 0) {
    Write-Host "`n  Usage: New-ReleaseNotes.ps1 -PipelineId 123 -FromRunId 10 -ToRunId 15" -ForegroundColor Yellow
    Write-Host "  -FromRunId and -ToRunId are optional (defaults to latest range).`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/release-manager"

$body = @{ pipelineId = $PipelineId }
if ($FromRunId -gt 0) { $body.fromRunId = $FromRunId }
if ($ToRunId -gt 0) { $body.toRunId = $ToRunId }
$json = $body | ConvertTo-Json -Compress

Write-Host "`n  === Generate Release Notes ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host "`n  Generating release notes for pipeline $PipelineId..." -ForegroundColor White

try {
    $result = Invoke-RestMethod "$pluginBase/generate-notes" -Method POST -ContentType "application/json" -Body $json
} catch {
    Write-Host "  Failed to generate release notes: $($_.Exception.Message)`n" -ForegroundColor Red
    return
}

if ($result.markdown) {
    Write-Host "`n  Release notes generated:`n" -ForegroundColor Green
    $result.markdown -split "`n" | ForEach-Object {
        Write-Host "  $_" -ForegroundColor White
    }
} elseif ($result.notes) {
    Write-Host "`n  Release notes generated:`n" -ForegroundColor Green
    $result.notes -split "`n" | ForEach-Object {
        Write-Host "  $_" -ForegroundColor White
    }
} elseif ($result.content) {
    Write-Host "`n" -ForegroundColor Green
    $result.content -split "`n" | ForEach-Object {
        Write-Host "  $_" -ForegroundColor White
    }
} else {
    Write-Host "`n  Release notes:" -ForegroundColor Green
    $result | ConvertTo-Json -Depth 5 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
}

Write-Host ""
