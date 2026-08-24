param(
    [string]$Port = "COM3",
    [int]$Baud = 115200
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$appDir = Join-Path $PSScriptRoot ".build\console_test"
$sourceAppDir = Join-Path $PSScriptRoot "esp-csi\examples\esp-radar\console_test"

if (-not (Get-Command idf.py -ErrorAction SilentlyContinue)) {
    throw "idf.py was not found. Run this script from an initialized ESP-IDF PowerShell."
}
$env:IDF_CCACHE_ENABLE = "0"

if (-not (Test-Path -LiteralPath $sourceAppDir)) {
    throw "ESP-CSI source is missing: $sourceAppDir"
}

if (-not (Test-Path -LiteralPath $appDir)) {
    New-Item -ItemType Directory -Path $appDir | Out-Null
}

foreach ($name in @("CMakeLists.txt", "partitions.csv", "sdkconfig.defaults")) {
    Copy-Item -LiteralPath (Join-Path $sourceAppDir $name) -Destination (Join-Path $appDir $name) -Force
}

foreach ($name in @("components", "main")) {
    $sourceDir = Join-Path $sourceAppDir $name
    $destinationDir = Join-Path $appDir $name
    if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir | Out-Null
    }
    Get-ChildItem -LiteralPath $sourceDir -Force | Copy-Item -Destination $destinationDir -Recurse -Force
}

Push-Location $appDir
try {
    & idf.py set-target esp32
    if ($LASTEXITCODE -ne 0) { throw "idf.py set-target failed" }

    & idf.py build
    if ($LASTEXITCODE -ne 0) { throw "idf.py build failed" }

    & idf.py -p $Port -b $Baud flash
    if ($LASTEXITCODE -ne 0) { throw "idf.py flash failed" }
}
finally {
    Pop-Location
}
