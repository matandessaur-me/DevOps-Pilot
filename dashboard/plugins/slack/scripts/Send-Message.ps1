param(
    [Parameter(Mandatory=$true)]
    [string]$Channel,
    [Parameter(Mandatory=$true)]
    [string]$Message,
    [string]$ThreadTs = "",
    [string]$ApiBase = "http://127.0.0.1:3800"
)

# Resolve channel name to ID
$channels = Invoke-RestMethod "$ApiBase/api/plugins/slack/channels"
$ch = $channels | Where-Object { $_.name -eq $Channel -or $_.id -eq $Channel } | Select-Object -First 1

if (-not $ch) {
    Write-Host "`n  Channel '$Channel' not found.`n" -ForegroundColor Red
    return
}

$body = @{
    channel = $ch.id
    text = $Message
}
if ($ThreadTs) { $body.threadTs = $ThreadTs }

$result = Invoke-RestMethod -Uri "$ApiBase/api/plugins/slack/messages/send" `
    -Method POST `
    -ContentType "application/json" `
    -Body ($body | ConvertTo-Json)

if ($result.ok) {
    $target = if ($ThreadTs) { "thread in #$($ch.name)" } else { "#$($ch.name)" }
    Write-Host "`n  Message sent to $target" -ForegroundColor Green
} else {
    Write-Host "`n  Failed to send: $($result.error)" -ForegroundColor Red
}
