$ErrorActionPreference = 'SilentlyContinue'

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$workspacePattern = [regex]::Escape($workspace)

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -in @('electron.exe', 'node.exe')) -and
    ($_.CommandLine -match $workspacePattern -or $_.CommandLine -match 'electron-vite')
  }

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
}

Write-Output "Stopped DevTools processes in $workspace"
