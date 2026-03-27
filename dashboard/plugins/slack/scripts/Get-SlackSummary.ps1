param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$summary = Invoke-RestMethod "$ApiBase/api/plugins/slack/summary" -ContentType "text/plain"
Write-Host ""
Write-Host $summary
Write-Host ""
