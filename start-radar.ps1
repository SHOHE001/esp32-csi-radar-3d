param(
    [string]$Port = "COM3"
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$qtPlugins = Join-Path $projectRoot ".venv\Lib\site-packages\PyQt5\Qt5\plugins"
$qtPlatformPlugins = Join-Path $qtPlugins "platforms"
$toolDir = Join-Path $projectRoot "esp-csi\examples\esp-radar\console_test\tools"
$tool = Join-Path $toolDir "esp_csi_tool.py"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Radar UI environment is missing: $python"
}

if (-not (Test-Path -LiteralPath $tool)) {
    throw "ESP-CSI radar UI is missing: $tool"
}

if (-not (Test-Path -LiteralPath (Join-Path $qtPlatformPlugins "qwindows.dll"))) {
    throw "Qt Windows platform plugin is missing: $qtPlatformPlugins"
}

$availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
if ($Port -notin $availablePorts) {
    throw "Serial port $Port is not available. Available ports: $($availablePorts -join ', ')"
}

Push-Location $toolDir
try {
    $env:QT_PLUGIN_PATH = $qtPlugins
    $env:QT_QPA_PLATFORM_PLUGIN_PATH = $qtPlatformPlugins
    & $python $tool -p $Port
    if ($LASTEXITCODE -ne 0) {
        throw "Radar UI exited with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
