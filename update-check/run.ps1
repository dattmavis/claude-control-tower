# Every-other-day check for Claude Code changes worth adopting. Run by Windows Task Scheduler.
# Read-only: Claude can search, fetch and read; this script saves its answer to updates\<date>.md.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent
$updates = Join-Path $root 'updates'
New-Item -ItemType Directory -Force $updates | Out-Null
$lastFile = Join-Path $updates 'last-run.txt'
$today = Get-Date -Format 'yyyy-MM-dd'
$since = if (Test-Path $lastFile) { (Get-Content $lastFile -Raw).Trim() } else { (Get-Date).AddDays(-14).ToString('yyyy-MM-dd') }
$weekly = if ((Get-Date).DayOfWeek -in 'Monday', 'Tuesday') {
  '"## Now built in": list any part of the current setup that a built-in Claude Code feature now covers, as a candidate to delete. Omit the section if there are none.'
} else { 'Skip any "Now built in" section today.' }

$prompt = (Get-Content (Join-Path $PSScriptRoot 'prompt.md') -Raw).Replace('{{SINCE}}', $since).Replace('{{TODAY}}', $today).Replace('{{WEEKLY}}', $weekly)
$out = Join-Path $updates "$today.md"
$log = Join-Path $updates 'run.log'

Set-Location $root
$result = $prompt | claude -p --allowedTools 'WebSearch,WebFetch,Read' --add-dir "$env:USERPROFILE\.claude" 2>> $log
if ($LASTEXITCODE -eq 0 -and $result) {
  $result | Set-Content $out -Encoding utf8
  Set-Content $lastFile $today -Encoding utf8
  "$(Get-Date -Format s) ok $out" | Add-Content $log
} else {
  "$(Get-Date -Format s) failed exit $LASTEXITCODE" | Add-Content $log
}

