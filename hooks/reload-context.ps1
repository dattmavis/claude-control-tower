# SessionStart hook (startup, resume, compact, clear, fork). Resume and fork are there so a reopened or forked session picks up
# task-file changes made since it last ran (the tower adds "Current ask" sections that way). Whatever this prints is added to the session's context.
# The tower gets STATUS.md back; a workstream gets its task file back. Every other session gets nothing.
$root = Split-Path $PSScriptRoot -Parent
if ($env:CLAUDE_TOWER -eq '1') {
  Write-Output "Control tower: current STATUS.md follows. Your instructions are in $root\tasks\CONTROL-TOWER.md."
  Get-Content (Join-Path $root 'STATUS.md') -Raw
} elseif ($env:CLAUDE_WORKSTREAM) {
  $task = Join-Path $root "tasks\$($env:CLAUDE_WORKSTREAM).md"
  if (Test-Path $task) {
    Write-Output "Workstream $($env:CLAUDE_WORKSTREAM): your task file follows. Re-read your notes file before carrying on."
    Get-Content $task -Raw
  }
}
exit 0
