# Every-other-day check for Claude Code changes worth adopting. Run by Windows Task Scheduler.
# Read-only: Claude can search, fetch and read; this script saves its answer to updates\<date>.md.
# Progress is tracked by Claude Code version (updates\last-version.txt), not by date, so every
# release since the last check gets read in full.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent
$updates = Join-Path $root 'updates'
New-Item -ItemType Directory -Force $updates | Out-Null
$lastFile = Join-Path $updates 'last-run.txt'
$versionFile = Join-Path $updates 'last-version.txt'
$today = Get-Date -Format 'yyyy-MM-dd'
$installed = ((claude --version) -split ' ')[0]
$lastVersion = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { $installed }
$weekly = if ((Get-Date).DayOfWeek -in 'Monday', 'Tuesday') {
  '"## Now built in": list any part of the current setup that a built-in Claude Code feature now covers, as a candidate to delete. Omit the section if there are none.'
} else { 'Skip any "Now built in" section today.' }

$prompt = (Get-Content (Join-Path $PSScriptRoot 'prompt.md') -Raw).
  Replace('{{LAST_VERSION}}', $lastVersion).Replace('{{INSTALLED}}', $installed).
  Replace('{{TODAY}}', $today).Replace('{{WEEKLY}}', $weekly)
$out = Join-Path $updates "$today.md"
$log = Join-Path $updates 'run.log'

Set-Location $root
$result = $prompt | claude -p --allowedTools 'WebSearch,WebFetch,Read' --add-dir "$env:USERPROFILE\.claude" 2>> $log
if ($LASTEXITCODE -eq 0 -and $result) {
  $text = $result -join "`n"
  $m = [regex]::Match($text, 'LAST-VERSION:\s*(\d+\.\d+\.\d+)\s*$')
  if ($m.Success) {
    Set-Content $versionFile $m.Groups[1].Value -Encoding utf8
    $text = $text.Substring(0, $m.Index).TrimEnd()
  }
  $text | Set-Content $out -Encoding utf8
  Set-Content $lastFile $today -Encoding utf8
  "$(Get-Date -Format s) ok $out (reviewed after $lastVersion, now $(if ($m.Success) { $m.Groups[1].Value } else { 'unchanged: no LAST-VERSION line' }))" | Add-Content $log
} else {
  "$(Get-Date -Format s) failed exit $LASTEXITCODE" | Add-Content $log
}
