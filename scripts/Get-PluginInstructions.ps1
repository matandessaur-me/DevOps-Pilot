param(
  [string]$Plugin
)

# Fetch AI instructions contributed by installed plugins.
# Usage:
#   ./scripts/Get-PluginInstructions.ps1                -> all installed plugins, concatenated
#   ./scripts/Get-PluginInstructions.ps1 -Plugin github -> just the github plugin's instructions.md

$base = 'http://127.0.0.1:3800'

if ($Plugin) {
  try {
    $r = Invoke-WebRequest -Uri "$base/plugins/$Plugin/instructions.md" -UseBasicParsing
    Write-Output $r.Content
  } catch {
    Write-Error "Plugin '$Plugin' not installed or has no instructions.md"
    exit 1
  }
} else {
  try {
    $r = Invoke-WebRequest -Uri "$base/api/plugins/instructions" -UseBasicParsing
    Write-Output $r.Content
  } catch {
    Write-Error "Failed to fetch plugin instructions: $($_.Exception.Message)"
    exit 1
  }
}
