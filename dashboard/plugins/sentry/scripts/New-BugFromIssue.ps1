param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$IssueId = ""
)

if (-not $IssueId) {
    Write-Host "`n  Usage: New-BugFromIssue.ps1 -IssueId '123456'" -ForegroundColor Yellow
    Write-Host "  Run Get-TopIssues.ps1 first to see issue IDs.`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/sentry"
$encodedId = [System.Uri]::EscapeDataString($IssueId)

Write-Host "`n  === Create ADO Bug from Sentry Issue ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host "`n  Creating work item from Sentry issue $IssueId..." -ForegroundColor White

try {
    $result = Invoke-RestMethod "$pluginBase/issues/$encodedId/create-workitem" -Method POST -ContentType "application/json" -Body "{}"
} catch {
    Write-Host "  Failed to create work item: $($_.Exception.Message)`n" -ForegroundColor Red
    return
}

if ($result.workItemId -or $result.id) {
    $wiId = if ($result.workItemId) { $result.workItemId } else { $result.id }
    Write-Host "  Bug created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Work Item:  AB#$wiId" -ForegroundColor White

    if ($result.title) {
        Write-Host "  Title:      $($result.title)" -ForegroundColor White
    }
    if ($result.url) {
        Write-Host "  URL:        $($result.url)" -ForegroundColor DarkGray
    }

    Write-Host "`n  The Sentry issue has been linked to the ADO work item." -ForegroundColor DarkGray
} elseif ($result.error) {
    Write-Host "  Error: $($result.error)" -ForegroundColor Red
} else {
    Write-Host "  Response:" -ForegroundColor White
    $result | ConvertTo-Json -Depth 3 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
}

Write-Host ""
