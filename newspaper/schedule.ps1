<#
.SYNOPSIS
    Εγκαθιστά την ημερήσια αυτόματη έκδοση της «Ημερήσιας» στα Windows.

.DESCRIPTION
    Δημιουργεί (ή αφαιρεί) την προγραμματισμένη εργασία HmerisiaDaily,
    η οποία τρέχει `python run.py --today` από τον φάκελο newspaper.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File newspaper\schedule.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File newspaper\schedule.ps1 -At 06:30 -RunNow

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File newspaper\schedule.ps1 -Remove
#>
param(
    [string]$TaskName = "HmerisiaDaily",
    [string]$At = "",
    [string]$SettingsPath = "",
    [string]$Exe = "",
    [string]$DataDir = "",
    [switch]$Remove,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"

# Τα μηνύματα είναι στα ελληνικά· χρειάζεται UTF-8 κονσόλα για σωστή εμφάνιση.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runPy = Join-Path $scriptDir "run.py"
if (-not $SettingsPath) {
    $SettingsPath = Join-Path (Split-Path -Parent $scriptDir) "settings.json"
}
$settingsPath = $SettingsPath

$enabled = $true
if (-not $At -and (Test-Path $settingsPath)) {
    try {
        $cfg = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.schedule) {
            if ($cfg.schedule.at) { $At = [string]$cfg.schedule.at }
            if ($null -ne $cfg.schedule.enabled) { $enabled = [bool]$cfg.schedule.enabled }
        }
    }
    catch {
        Write-Host "Προσοχή: δεν διαβάστηκε το settings.json ($($_.Exception.Message))" -ForegroundColor Yellow
    }
}

if (-not $At) { $At = "07:00" }

if ($At -notmatch '^([01]\d|2[0-3]):[0-5]\d$') {
    throw "Μη έγκυρη ώρα '$At'. Χρησιμοποίησε HH:mm (π.χ. 07:00)."
}

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Αφαιρέθηκε η εργασία '$TaskName'." -ForegroundColor Yellow
    }
    else {
        Write-Host "Δεν υπάρχει εργασία '$TaskName'." -ForegroundColor DarkGray
    }
    return
}

if (-not $enabled) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Αυτόματη έκδοση απενεργοποιήθηκε (αφαιρέθηκε η '$TaskName')." -ForegroundColor Yellow
    }
    else {
        Write-Host "Αυτόματη έκδοση ανενεργή." -ForegroundColor DarkGray
    }
    return
}

if ($Exe) {
    if (-not (Test-Path $Exe)) {
        throw "Δεν βρέθηκε το εκτελέσιμο '$Exe' — δεν έγινε εγκατάσταση εργασίας."
    }
    # Frozen build: wrapper .cmd ώστε να περάσει το HMERISIA_DATA στο exe.
    if (-not $DataDir) { $DataDir = Split-Path -Parent $Exe }
    $wrapper = Join-Path $DataDir "run-daily.cmd"
    $lines = @(
        "@echo off",
        "set `"HMERISIA_DATA=$DataDir`"",
        "`"$Exe`" --today"
    )
    Set-Content -Path $wrapper -Value $lines -Encoding ASCII

    $action = New-ScheduledTaskAction `
        -Execute $wrapper `
        -WorkingDirectory $DataDir
}
else {
    if (-not (Test-Path $runPy)) {
        throw "Δεν βρέθηκε το run.py: $runPy"
    }
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $python) {
        throw "Το python δεν είναι στο PATH και δεν δόθηκε -Exe."
    }

    # Το -Wait δεν χρειάζεται· το Task Scheduler καταγράφει τον κωδικό εξόδου.
    $action = New-ScheduledTaskAction `
        -Execute $python `
        -Argument "`"$runPy`" --today" `
        -WorkingDirectory $scriptDir
}

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

try {
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Force `
        -Description "Η Ημερήσια — αυτόματη παραγωγή καθημερινού φύλλου (HTML)." | Out-Null
}
catch {
    # Fallback για περιβάλλοντα όπου το principal αποτυγχάνει.
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Force `
        -Description "Η Ημερήσια — αυτόματη παραγωγή καθημερινού φύλλου (HTML)." | Out-Null
}

Write-Host ""
Write-Host "Εγκαταστάθηκε η εργασία '$TaskName'." -ForegroundColor Green
Write-Host "  Ώρα:      κάθε μέρα στις $At"
if ($wrapper) {
    Write-Host "  Πακέτο:   $Exe"
    Write-Host "  Εντολή:   $wrapper"
    Write-Host "  Δεδομένα: $DataDir"
}
else {
    Write-Host "  Εντολή:   $python `"$runPy`" --today"
    Write-Host "  Φάκελος:  $scriptDir"
}
Write-Host "  Έξοδος:   output\<ημερομηνία>\efimerida-<ημερομηνία>.html"
Write-Host ""
Write-Host "Έλεγχος:   Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo"
Write-Host "Αφαίρεση:  powershell -File newspaper\schedule.ps1 -Remove"
Write-Host ""

if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Ξεκίνησε δοκιμαστική εκτέλεση." -ForegroundColor Cyan
}
