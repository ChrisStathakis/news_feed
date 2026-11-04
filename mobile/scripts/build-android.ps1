# build-android.ps1 — τοπικό APK χωρίς Expo account/token.
#
# Χρησιμοποιεί JDK 17 + Android SDK. Αν το SDK δεν υπάρχει, εγκατέστησέ το
# από το Android Studio (SDK Manager) και ξανατρέξε.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1
#
# Σημείωση: το APK υπογράφεται με το debug keystore του template. Για Play Store
# χρειάζεται δικό σου release keystore.

param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "android"

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path $sdk)) {
    throw "Android SDK not found. Set ANDROID_HOME or install it from Android Studio."
}

# ---------------------------------------------------------------- JDK 17
$jdk = Join-Path $env:LOCALAPPDATA "hmerisia-tools\jdk17"
if (-not (Test-Path (Join-Path $jdk "bin\java.exe"))) {
    Write-Host "JDK 17 not found — downloading to $jdk" -ForegroundColor Cyan
    $zip = Join-Path $env:TEMP "hmerisia-jdk17.zip"
    Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile $zip
    $tools = Split-Path -Parent $jdk
    New-Item -ItemType Directory -Force $tools | Out-Null
    Expand-Archive -Path $zip -DestinationPath $tools -Force
    $inner = Get-ChildItem $tools -Directory | Where-Object Name -like "jdk-17*" | Select-Object -First 1
    if ($inner) { Rename-Item $inner.FullName $jdk -Force }
}
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;" + $env:PATH

# ------------------------------------------------------- ninja long paths
# Το ninja 1.10.2 του CMake 3.22 αποτυγχάνει σε Windows paths >260 χαρακτήρων.
# Το 1.13+ το διαχειρίζεται, οπότε το αντικαθιστούμε μία φορά.
$ninja = Join-Path $sdk "cmake\3.22.1\bin\ninja.exe"
if (Test-Path $ninja) {
    $version = (& $ninja --version) -as [version]
    if ($version -lt [version]"1.11.0") {
        Write-Host "Updating ninja $version -> latest (long path support)" -ForegroundColor Cyan
        $zip = Join-Path $env:TEMP "hmerisia-ninja.zip"
        Invoke-WebRequest -Uri "https://github.com/ninja-build/ninja/releases/latest/download/ninja-win.zip" -OutFile $zip
        Copy-Item $ninja "$ninja.bak" -Force
        $tmp = Join-Path $env:TEMP "hmerisia-ninja"
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Expand-Archive $zip -DestinationPath $tmp -Force
        Copy-Item (Join-Path $tmp "ninja.exe") $ninja -Force
    }
}

# ---------------------------------------------------------------- prebuild
if (-not (Test-Path (Join-Path $android "gradlew.bat"))) {
    Write-Host "Generating android/ with expo prebuild" -ForegroundColor Cyan
    Push-Location $root
    try { npx.cmd expo prebuild -p android --no-install }
    finally { Pop-Location }
}

# ---------------------------------------------------------------- gradle
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = (Join-Path $sdk "platform-tools") + ";" + $env:PATH

Push-Location $android
try {
    $gradleArgs = @("assembleRelease", "--no-daemon")
    if ($Clean) { $gradleArgs = @("clean") + $gradleArgs }
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$apk = Join-Path $android "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) { throw "APK not found at $apk" }

$meta = Get-Content (Join-Path $root "app.json") -Raw | ConvertFrom-Json
$version = $meta.expo.version
$outDir = Join-Path $root "dist"
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir "Hmerisia-$version.apk"
Copy-Item $apk $out -Force

$size = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host ""
Write-Host "APK: $out ($size MB)" -ForegroundColor Green
Write-Host "Install: adb install -r `"$out`"" -ForegroundColor Green
