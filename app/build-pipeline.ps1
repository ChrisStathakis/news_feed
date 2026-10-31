# build-pipeline.ps1 — χτίζει το αυτόνομο Python pipeline με PyInstaller.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root
$newspaper = Join-Path $repo "newspaper"
$dist = Join-Path $repo "pipeline-dist"
$work = Join-Path $repo "build\pyinstaller"

Write-Host "PyInstaller build…" -ForegroundColor Cyan

Push-Location $newspaper
try {
    python -m PyInstaller hmerisia.spec --noconfirm --distpath $dist --workpath $work
    if ($LASTEXITCODE -ne 0) { throw "Το PyInstaller απέτυχε (κωδικός $LASTEXITCODE)." }
}
finally {
    Pop-Location
}

$exe = Join-Path $dist "hmerisia\hmerisia.exe"
if (-not (Test-Path $exe)) { throw "Δεν βρέθηκε το $exe" }

Write-Host "Έτοιμο: $exe" -ForegroundColor Green
Get-ChildItem (Join-Path $dist "hmerisia") | Select-Object Name, Length | Format-Table -AutoSize
