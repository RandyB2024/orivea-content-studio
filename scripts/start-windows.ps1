$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot "data\logs"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Set-Location -LiteralPath $projectRoot

$logFile = Join-Path $logDirectory ("content-studio-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
& npm.cmd run start:prod *>> $logFile
exit $LASTEXITCODE
