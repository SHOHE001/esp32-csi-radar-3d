param(
    [string]$Port = "COM3",
    [int]$ViewerPort = 8765
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$server = Join-Path $projectRoot "radar3d\server.py"
$radarLauncher = Join-Path $projectRoot "start-radar.ps1"
$hotspotLauncher = Join-Path $projectRoot "ensure-mobile-hotspot.ps1"
$viewerUrl = "http://127.0.0.1:$ViewerPort/"
$healthUrl = "http://127.0.0.1:$ViewerPort/health"
$serverLog = Join-Path $projectRoot "radar3d\server.log"
$serverErrorLog = Join-Path $projectRoot "radar3d\server-error.log"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Python environment is missing: $python"
}
if (-not (Test-Path -LiteralPath $server)) {
    throw "3D viewer server is missing: $server"
}

if (Test-Path -LiteralPath $hotspotLauncher) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hotspotLauncher -Start | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Mobile hotspot could not be started."
    }
}

function Test-ViewerRunning {
    try {
        $result = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        return $result.ok -eq $true
    }
    catch {
        return $false
    }
}

function Test-SerialAvailable([string]$SerialPort) {
    $serial = $null
    try {
        $serial = [System.IO.Ports.SerialPort]::new($SerialPort, 2000000)
        $serial.Open()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $serial) {
            if ($serial.IsOpen) { $serial.Close() }
            $serial.Dispose()
        }
    }
}

if (-not (Test-ViewerRunning)) {
    Start-Process -FilePath $python `
        -ArgumentList @($server, "--port", $ViewerPort) `
        -WorkingDirectory (Join-Path $projectRoot "radar3d") `
        -WindowStyle Hidden `
        -RedirectStandardOutput $serverLog `
        -RedirectStandardError $serverErrorLog

    $ready = $false
    foreach ($attempt in 1..30) {
        Start-Sleep -Milliseconds 150
        if (Test-ViewerRunning) { $ready = $true; break }
    }
    if (-not $ready) {
        throw "3D viewer did not start. Check: $serverErrorLog"
    }
}

if (Test-SerialAvailable $Port) {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $radarLauncher, "-Port", $Port) `
        -WindowStyle Hidden
}

Start-Process $viewerUrl
