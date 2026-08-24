param(
    [string]$Port = "COM3",
    [switch]$ConfirmFlash
)

$ErrorActionPreference = "Stop"
$firmware = Join-Path $PSScriptRoot "firmware\esp32-radar-complete.bin"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$expectedSha256 = "AEB033C6436D7760E4FECC98C8C23F93CADD4DB1601669113B37E9F504D09459"

if (-not $ConfirmFlash) {
    throw "Flashing replaces the current ESP32 firmware. Re-run with -ConfirmFlash when intended."
}

if (-not (Test-Path -LiteralPath $firmware)) {
    throw "Prebuilt firmware not found: $firmware"
}

$actualSha256 = (Get-FileHash -LiteralPath $firmware -Algorithm SHA256).Hash
if ($actualSha256 -ne $expectedSha256) {
    throw "Firmware checksum mismatch. Expected $expectedSha256, got $actualSha256"
}

& $python -m esptool --chip esp32 --port $Port --baud 115200 write-flash 0x0 $firmware
if ($LASTEXITCODE -ne 0) {
    throw "Firmware flash failed"
}
