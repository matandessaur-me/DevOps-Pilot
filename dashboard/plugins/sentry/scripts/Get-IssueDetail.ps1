param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$IssueId = ""
)

if (-not $IssueId) {
    Write-Host "`n  Usage: Get-IssueDetail.ps1 -IssueId '123456'" -ForegroundColor Yellow
    Write-Host "  Run Get-TopIssues.ps1 first to see issue IDs.`n" -ForegroundColor DarkGray
    return
}

$pluginBase = "$ApiBase/api/plugins/sentry"
$encodedId = [System.Uri]::EscapeDataString($IssueId)

try {
    $issue = Invoke-RestMethod "$pluginBase/issues/$encodedId"
} catch {
    Write-Host "`n  Could not fetch issue '$IssueId'.`n" -ForegroundColor Yellow
    return
}

$issueTitle = if ($issue.title) { $issue.title } else { "(untitled)" }
Write-Host "`n  === Sentry Issue -- $issueTitle ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

# Basic info
$level = if ($issue.level) { $issue.level } else { "error" }
$levelColor = switch ($level.ToLower()) {
    "fatal"   { "Red" }
    "error"   { "Red" }
    "warning" { "Yellow" }
    "info"    { "DarkGray" }
    default   { "White" }
}

Write-Host "`n  Level:      " -ForegroundColor White -NoNewline
Write-Host "$level" -ForegroundColor $levelColor

if ($issue.shortId) {
    Write-Host "  Short ID:   $($issue.shortId)" -ForegroundColor White
}
if ($issue.project -and $issue.project.slug) {
    Write-Host "  Project:    $($issue.project.slug)" -ForegroundColor White
}

$events = if ($issue.count -ne $null) { $issue.count.ToString("N0") } else { "--" }
$users = if ($issue.userCount -ne $null) { $issue.userCount.ToString("N0") } else { "--" }
Write-Host "  Events:     $events" -ForegroundColor White
Write-Host "  Users:      $users" -ForegroundColor White

if ($issue.firstSeen) {
    $first = try { ([datetime]$issue.firstSeen).ToString("MMM dd, yyyy HH:mm") } catch { $issue.firstSeen }
    Write-Host "  First Seen: $first" -ForegroundColor White
}
if ($issue.lastSeen) {
    $last = try { ([datetime]$issue.lastSeen).ToString("MMM dd, yyyy HH:mm") } catch { $issue.lastSeen }
    Write-Host "  Last Seen:  $last" -ForegroundColor White
}
if ($issue.culprit) {
    Write-Host "  Culprit:    $($issue.culprit)" -ForegroundColor White
}
if ($issue.status) {
    Write-Host "  Status:     $($issue.status)" -ForegroundColor White
}

# Tags
if ($issue.tags -and $issue.tags.Count -gt 0) {
    Write-Host "`n  Tags:" -ForegroundColor White
    foreach ($tag in $issue.tags | Select-Object -First 10) {
        $tagName = if ($tag.key) { $tag.key } else { $tag.name }
        $topValue = if ($tag.topValues -and $tag.topValues.Count -gt 0) { $tag.topValues[0].value } elseif ($tag.value) { $tag.value } else { "" }
        Write-Host "    $tagName`: $topValue" -ForegroundColor DarkGray
    }
}

# Stack trace
if ($issue.stackTrace -or $issue.latestEvent) {
    Write-Host "`n  Stack Trace:" -ForegroundColor White

    $trace = $null
    if ($issue.stackTrace) {
        $trace = $issue.stackTrace
    } elseif ($issue.latestEvent -and $issue.latestEvent.entries) {
        $exEntry = $issue.latestEvent.entries | Where-Object { $_.type -eq 'exception' } | Select-Object -First 1
        if ($exEntry -and $exEntry.data -and $exEntry.data.values) {
            $exc = $exEntry.data.values | Select-Object -First 1
            if ($exc.stacktrace -and $exc.stacktrace.frames) {
                $trace = $exc.stacktrace.frames | Select-Object -Last 10
            }
            if ($exc.type -and $exc.value) {
                Write-Host "    $($exc.type): $($exc.value)" -ForegroundColor Red
            }
        }
    }

    if ($trace -is [string]) {
        $trace -split "`n" | Select-Object -First 20 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor DarkGray
        }
    } elseif ($trace -is [array]) {
        foreach ($frame in $trace) {
            $file = if ($frame.filename) { $frame.filename } elseif ($frame.absPath) { $frame.absPath } else { "" }
            $line = if ($frame.lineNo -ne $null) { ":$($frame.lineNo)" } else { "" }
            $func = if ($frame.function) { " in $($frame.function)" } else { "" }
            Write-Host "    $file$line$func" -ForegroundColor DarkGray
        }
    }
}

if ($issue.permalink) {
    Write-Host "`n  Link: $($issue.permalink)" -ForegroundColor DarkGray
}

Write-Host ""
