# Runs inside a new tab: starts Claude Code for one workstream, or for the tower when Name is CONTROL-TOWER.
param(
  [Parameter(Mandatory)] [string] $Name,
  [switch] $NoRemote,
  [string] $Resume
)
$root = $PSScriptRoot
# A tab opened from inside another Claude session inherits that session's environment: NO_COLOR (no colours)
# and its session/messaging ids, which would make the new session look like a child of the old one.
foreach ($v in 'NO_COLOR', 'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_ENTRYPOINT') {
  Remove-Item "env:$v" -ErrorAction SilentlyContinue
}
$task = Join-Path $root "tasks\$Name.md"
$display = $Name -replace '-', ' '
$claudeArgs = @('-n', $display)
if (-not $NoRemote) { $claudeArgs += @('--remote-control', $display) }

$startDir = $root
if ($Resume) {
  # A session resumes only from the folder it was started in. Find its transcript and read that folder.
  $transcript = Get-ChildItem (Join-Path $HOME '.claude\projects') -Filter "$Resume.jsonl" -Recurse -Depth 1 -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $transcript) { throw "No session $Resume under $HOME\.claude\projects." }
  $cwdLine = Select-String -Path $transcript.FullName -Pattern '"cwd":"([^"]+)"' | Select-Object -First 1
  if ($cwdLine) { $startDir = $cwdLine.Matches[0].Groups[1].Value -replace '\\\\', '\' }
  $claudeArgs += @('--resume', $Resume)
}

if ($Name -eq 'CONTROL-TOWER') {
  $env:CLAUDE_TOWER = '1'
  # The sidebar mod lives here, not in a session's dev-mods folder, so every tower start loads it.
  $claudeArgs += @('--plugin-dir', (Join-Path $root 'mods\tower-sidebar'))
  if (-not $Resume) { $claudeArgs += "Read $task and follow it. Then give me today's picture from STATUS.md in a few lines." }
} else {
  $env:CLAUDE_WORKSTREAM = $Name
  $claudeArgs += @('--append-system-prompt-file', (Join-Path $root 'workstream-rules.md'))
  if (-not $Resume) { $claudeArgs += "Read your task file at $task and start." }
}
# Start in the control-tower folder: Claude Code never saves trust for the home folder.
# .claude\settings.json here points memory at the home memory folder.
# A resumed session starts where it was first opened, which may be the home folder.
Set-Location $startDir
claude @claudeArgs
