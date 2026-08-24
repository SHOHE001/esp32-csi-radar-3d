param(
    [string]$Port = "COM3",
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
$backup = Join-Path $PSScriptRoot "backup\esp32-before-radar-4mb.bin"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$expectedSha256 = "A261E2700320881C574AECCE02C6658B24D2CBEF0F2C6215A9274E6B40900E97"

if (-not $ConfirmRestore) {
    throw "Restoring erases the radar firmware. Re-run with -ConfirmRestore when restoration is intended."
}

if (-not (Test-Path -LiteralPath $backup)) {
    throw "Backup not found: $backup"
}

$actualSha256 = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
if ($actualSha256 -ne $expectedSha256) {
    throw "Backup checksum mismatch. Expected $expectedSha256, got $actualSha256"
}

& $python -m esptool --port $Port --baud 115200 write-flash 0x0 $backup
if ($LASTEXITCODE -ne 0) {
    throw "Backup restore failed"
}
