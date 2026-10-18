<#
.SYNOPSIS
    Registers the Windows scheduled task that runs Resolver's escalation check.

.DESCRIPTION
    Every ESCALATION_INTERVAL_MINUTES (backend\.env, 15 when unset), Task
    Scheduler runs
        <venv>\Scripts\python.exe manage.py process_auto_escalations --scheduled
    from the backend folder, so tickets climb from technician to HOS to HOD on
    time. Each run is recorded, and the admin's SLA Rules page shows the last
    one and turns red when the runs stop.

    The interval is read from the backend's settings when the task is
    registered, so the task and the SLA Rules page agree. After changing it,
    run this script again.

    Run it once, in an elevated PowerShell, as an account that can read
    backend\.env. Running it again replaces the task. -Unregister removes it.
    The virtual environment is venv\ or .venv\ (uv's default) in the
    repository root, or .venv\ in backend\.

.EXAMPLE
    .\register-escalation-task.ps1 -RunAs 'KSG\resolver-svc'

.EXAMPLE
    .\register-escalation-task.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    # The repository root, with backend\ inside it.
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
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

$backend = Join-Path $ProjectRoot 'backend'
if (-not (Test-Path (Join-Path $backend 'manage.py'))) { throw "Not found: $backend\manage.py. Pass -ProjectRoot." }
$candidates = @('venv', '.venv', 'backend\.venv') | ForEach-Object { Join-Path $ProjectRoot "$_\Scripts\python.exe" }
$python = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $python) { throw "No virtual environment found. Looked for:`n  $($candidates -join "`n  ")" }

Push-Location $backend
try {
    $reported = & $python manage.py shell -c 'from django.conf import settings; print(settings.ESCALATION_INTERVAL_MINUTES)' | Select-Object -Last 1
    if ($LASTEXITCODE -ne 0) { throw "Could not read ESCALATION_INTERVAL_MINUTES from the backend's settings." }
} finally {
    Pop-Location
}
$IntervalMinutes = 0
if (-not [int]::TryParse(("$reported").Trim(), [ref]$IntervalMinutes) -or $IntervalMinutes -lt 1 -or $IntervalMinutes -gt 1440) {
    throw "ESCALATION_INTERVAL_MINUTES must be a whole number from 1 to 1440, not '$reported'."
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
