# Opens a Claude Code session for one workstream, as a titled tab in the current Windows Terminal
# window (or in the background with -Background). The task must already be in tasks\<Name>.md.
# -Resume <sessionId> reopens an existing session in a tab instead; it needs no task file.
# -ResumeLatest reopens the newest session titled with this workstream's name (the sidebar's click).
param(
  [Parameter(Mandatory)] [string] $Name,
  [switch] $Background,
  [switch] $NoRemote,
  [string] $Resume,
  [switch] $ResumeLatest
)
$root = $PSScriptRoot
if ($ResumeLatest) {
  # Each session's transcript records its tab title as "customTitle". Newest transcript first.
  $titles = @($Name, ($Name -replace '-', ' ')) | Select-Object -Unique
  $files = Get-ChildItem (Join-Path $HOME '.claude\projects') -Filter '*.jsonl' -Recurse -Depth 1 -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  foreach ($f in $files) {
    $hit = $titles | Where-Object { Select-String -Path $f.FullName -Pattern ('"customTitle":"' + $_ + '"') -SimpleMatch -List -Quiet }
    if ($hit) { $Resume = $f.BaseName; break }
  }
  if (-not $Resume) { throw "No session titled $Name found to resume." }
}
$task = Join-Path $root "tasks\$Name.md"
if ($Resume -and $Background) { throw "-Resume opens a tab; it can't be combined with -Background." }
if (-not $Resume -and -not (Test-Path $task)) { throw "No task file at $task. Write it first." }

if ($Background) {
  foreach ($v in 'NO_COLOR', 'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_ENTRYPOINT') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
  $env:CLAUDE_WORKSTREAM = $Name
  $prompt = "Read your task file at $task and start."
  Push-Location $root
  try { claude --bg -n $Name --append-system-prompt-file (Join-Path $root 'workstream-rules.md') $prompt }
  finally { Pop-Location }
  return
}

$wtArgs = @('-w', '0', 'new-tab', '--title', $Name, '-d', $root,
  'powershell', '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', (Join-Path $root 'start-session.ps1'), '-Name', $Name)
if ($NoRemote) { $wtArgs += '-NoRemote' }
if ($Resume) { $wtArgs += @('-Resume', $Resume) }
# Start-Process joins an argument array with spaces and quotes nothing, so a title or path with a
# space splits and wt tries to run the second word (0x80070002). Quote each argument ourselves.
Start-Process wt -ArgumentList (($wtArgs | ForEach-Object { '"' + $_ + '"' }) -join ' ')



