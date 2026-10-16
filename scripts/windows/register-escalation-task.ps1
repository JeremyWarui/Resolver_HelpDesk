<#
.SYNOPSIS
    Registers the Windows scheduled task that runs Resolver's escalation check.

.DESCRIPTION
    Every -IntervalMinutes, Task Scheduler runs
        <venv>\Scripts\python.exe manage.py process_auto_escalations --scheduled
    from the backend folder, so tickets climb from technician to HOS to HOD on
    time. Each run is recorded, and the admin's SLA Rules page shows the last
    one and turns red when the runs stop.

    Run it once, in an elevated PowerShell, as an account that can read
    backend\.env. Running it again replaces the task. -Unregister removes it.

.EXAMPLE
    .\register-escalation-task.ps1 -RunAs 'KSG\resolver-svc'

.EXAMPLE
    .\register-escalation-task.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    # The repository root, with backend\ and venv\ inside it.
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    # Match ESCALATION_INTERVAL_MINUTES in the backend's settings.
    [ValidateRange(1, 1440)]
    [int]$IntervalMinutes = 15,
    [string]$TaskName = 'Resolver escalation check',
    # The account the task runs as. The current user when left out.
    [string]$RunAs = "$env:USERDOMAIN\$env:USERNAME",
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

if ($Unregister) {
    if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister scheduled task')) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed '$TaskName'."
    }
    return
}

$python = Join-Path $ProjectRoot 'venv\Scripts\python.exe'
$backend = Join-Path $ProjectRoot 'backend'
foreach ($required in @($python, (Join-Path $backend 'manage.py'))) {
    if (-not (Test-Path $required)) { throw "Not found: $required. Pass -ProjectRoot." }
}

$action = New-ScheduledTaskAction -Execute $python -Argument 'manage.py process_auto_escalations --scheduled' -WorkingDirectory $backend
# Starts a minute from now and repeats for as long as the task exists.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
# A run still going when the next is due keeps going, and that next start is
# skipped. One still going after four intervals is stopped: the backend reads a
# run that old as stopped too, and the SLA Rules page says it did not finish.
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes ($IntervalMinutes * 4)) -StartWhenAvailable

if ($PSCmdlet.ShouldProcess($TaskName, "Register every $IntervalMinutes minutes as $RunAs")) {
    $credential = Get-Credential -UserName $RunAs -Message "Password for $RunAs, so the task runs while nobody is signed in"
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -User $credential.UserName -Password $credential.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null
    Write-Host "Registered '$TaskName': every $IntervalMinutes minutes, as $RunAs."
    Write-Host "Check it: Get-ScheduledTaskInfo -TaskName '$TaskName'"
}
