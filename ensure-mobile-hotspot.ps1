param(
    [switch]$Start,
    [switch]$Restart,
    [switch]$SetPassphrase
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
$null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
$null = [Windows.Networking.NetworkOperators.TetheringWiFiBand, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
$null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]

function Wait-WinRtOperation {
    param(
        [Parameter(Mandatory)]$Operation,
        [Parameter(Mandatory)][Type]$ResultType
    )

    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq "AsTask" -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}

function Wait-WinRtAction {
    param(
        [Parameter(Mandatory)]$Operation
    )

    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq "AsTask" -and
            -not $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1
    $task = $asTask.Invoke($null, @($Operation))
    $task.Wait()
}

$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($null -eq $profile) {
    throw "Internet connection profile was not found."
}

$manager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
$configuration = $manager.GetCurrentAccessPointConfiguration()
$needsConfiguration = $false

if ($configuration.Band -ne [Windows.Networking.NetworkOperators.TetheringWiFiBand]::TwoPointFourGigahertz) {
    $configuration.Band = [Windows.Networking.NetworkOperators.TetheringWiFiBand]::TwoPointFourGigahertz
    $needsConfiguration = $true
}

if ($SetPassphrase) {
    $securePassphrase = Read-Host "Mobile hotspot passphrase" -AsSecureString
    $passphrasePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassphrase)
    try {
        $plainPassphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passphrasePointer)
        if ($configuration.Passphrase -cne $plainPassphrase) {
            $configuration.Passphrase = $plainPassphrase
            $needsConfiguration = $true
        }
    }
    finally {
        $plainPassphrase = $null
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passphrasePointer)
    }
}

if ($needsConfiguration) {
    Wait-WinRtAction $manager.ConfigureAccessPointAsync($configuration)
}

if ($Restart -and $manager.TetheringOperationalState.ToString() -eq "On") {
    $stopResult = Wait-WinRtOperation $manager.StopTetheringAsync() ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
    if ($stopResult.Status.ToString() -ne "Success") {
        throw "Failed to restart mobile hotspot while stopping: $($stopResult.Status) $($stopResult.AdditionalErrorMessage)"
    }
    Start-Sleep -Seconds 1
}

if (($Start -or $Restart) -and $manager.TetheringOperationalState.ToString() -ne "On") {
    $startResult = Wait-WinRtOperation $manager.StartTetheringAsync() ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
    if ($startResult.Status.ToString() -ne "Success") {
        throw "Failed to start mobile hotspot: $($startResult.Status) $($startResult.AdditionalErrorMessage)"
    }
}

$configuration = $manager.GetCurrentAccessPointConfiguration()
[pscustomobject]@{
    Profile = $profile.ProfileName
    State = $manager.TetheringOperationalState.ToString()
    Clients = $manager.ClientCount
    Band = $configuration.Band.ToString()
    SSID = $configuration.Ssid
}
