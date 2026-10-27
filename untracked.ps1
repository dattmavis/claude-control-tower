# Lists Claude sessions used in the last few days that have no STATUS.md row and no archived task file.
# The tower sidebar runs it every few minutes and shows the result under "Not tracked". No model involved.
# Prints a JSON array of { name, lastUsed } (lastUsed in ISO UTC), newest first.
param([int] $Days = 3)
$root = $PSScriptRoot
$key = { param($s) ($s.Trim() -replace '[\s-]+', ' ').ToUpperInvariant() }

$known = @{ 'CONTROL TOWER' = $true }
foreach ($line in Get-Content (Join-Path $root 'STATUS.md') -Encoding UTF8) {
  $cells = $line.Split('|')
  if ($cells.Count -ge 4 -and $line.TrimStart().StartsWith('|')) {
    $session = $cells[2].Trim()
    if ($session -and $session -notmatch '^(none|Session|-+)(\s|$)') { $known[(& $key $session)] = $true }
  }
}
foreach ($f in Get-ChildItem (Join-Path $root 'archive\finished-workstreams') -Filter '*.md' -ErrorAction SilentlyContinue) {
  $known[(& $key $f.BaseName)] = $true
}
# Sessions you said to ignore, one tab name per line.
$ignore = Join-Path $root 'untracked-ignore.txt'
if (Test-Path $ignore) {
  foreach ($line in Get-Content $ignore -Encoding UTF8) { if ($line.Trim() -and -not $line.StartsWith('#')) { $known[(& $key $line)] = $true } }
}

$since = (Get-Date).AddDays(-$Days)
$seen = @{}
$rows = foreach ($f in Get-ChildItem (Join-Path $HOME '.claude\projects') -Filter '*.jsonl' -Recurse -Depth 1 -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $since } | Sort-Object LastWriteTime -Descending) {
  $last = Select-String -Path $f.FullName -Pattern '"customTitle":"([^"]+)"' | Select-Object -Last 1
  if (-not $last) { continue }
  $name = $last.Matches[0].Groups[1].Value
  $k = & $key $name
  if ($known.ContainsKey($k) -or $seen.ContainsKey($k)) { continue }
  $seen[$k] = $true
  [pscustomobject]@{ name = $name; lastUsed = $f.LastWriteTimeUtc.ToString('o') }
}
ConvertTo-Json -InputObject @($rows) -Compress
