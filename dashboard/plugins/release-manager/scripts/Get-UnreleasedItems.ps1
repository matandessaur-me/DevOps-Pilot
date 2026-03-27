param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [int]$PipelineId = 0
)

$pluginBase = "$ApiBase/api/plugins/release-manager"

$url = "$pluginBase/unreleased"
if ($PipelineId -gt 0) {
    $url += "?pipelineId=$PipelineId"
}

try {
    $items = Invoke-RestMethod $url
    if (-not $items) { $items = @() }
} catch {
    Write-Host "`n  Release Manager plugin not configured or unavailable.`n" -ForegroundColor Yellow
    return
}

$title = if ($PipelineId -gt 0) { "Unreleased Items -- Pipeline $PipelineId" } else { "Unreleased Items" }
Write-Host "`n  === $title ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($items.Count -eq 0) {
    Write-Host "`n  No unreleased items found. Everything has been shipped!`n" -ForegroundColor Green
    return
}

Write-Host "`n  Resolved work items not yet in a release:`n" -ForegroundColor White

# Group by type if available
$grouped = $items | Group-Object -Property { if ($_.type) { $_.type } else { "Item" } }

foreach ($group in $grouped) {
    $typeColor = switch ($group.Name.ToLower()) {
        "bug"          { "Red" }
        "user story"   { "Green" }
        "task"         { "Yellow" }
        "feature"      { "Magenta" }
        default        { "White" }
    }

    Write-Host "  $($group.Name) ($($group.Count))" -ForegroundColor $typeColor

    foreach ($item in $group.Group) {
        $id = if ($item.id) { "AB#$($item.id)" } else { "" }
        $title = if ($item.title) { $item.title } else { "(untitled)" }
        if ($title.Length -gt 55) { $title = $title.Substring(0, 55) + ".." }
        $resolvedDate = if ($item.resolvedDate) {
            try { ([datetime]$item.resolvedDate).ToString("MMM dd") } catch { "" }
        } else { "" }

        Write-Host "    $id " -ForegroundColor DarkGray -NoNewline
        Write-Host "$title" -ForegroundColor White -NoNewline
        if ($resolvedDate) {
            Write-Host "  (resolved $resolvedDate)" -ForegroundColor DarkGray
        } else {
            Write-Host ""
        }
    }
    Write-Host ""
}

Write-Host "  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Total: $($items.Count) unreleased items" -ForegroundColor White
Write-Host ""
