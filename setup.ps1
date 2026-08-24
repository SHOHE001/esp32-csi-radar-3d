param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$upstreamDir = Join-Path $projectRoot "esp-csi"
$patchFile = Join-Path $projectRoot "patches\esp-csi-radar-windows.patch"
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $upstreamDir)) {
    git clone https://github.com/espressif/esp-csi.git $upstreamDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to clone Espressif ESP-CSI."
    }
    git -C $upstreamDir checkout 8633d67
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to check out the supported ESP-CSI revision."
    }
}

Push-Location $upstreamDir
try {
    git apply --check $patchFile 2>$null
    if ($LASTEXITCODE -eq 0) {
        git apply $patchFile
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to apply the ESP-CSI patch."
        }
    }
    else {
        git apply --reverse --check $patchFile 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "ESP-CSI patch does not apply cleanly. Use the upstream revision documented in README.md."
        }
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    & $Python -m venv (Join-Path $projectRoot ".venv")
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $projectRoot "requirements.txt")

Write-Host "Setup complete. Build/flash the ESP32 firmware, then run start-radar-3d.cmd."
