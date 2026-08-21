<#
.SYNOPSIS
    Compila en TU MAQUINA los paquetes listos para enviar al servidor.

.DESCRIPTION
    Para el flujo "compilo local y mando los archivos al servidor" (no se
    compila en slas052a). Deja todo en .\envio\<ambiente>\ :

        envio\test\backend    -> va a C:\inetpub\vacaciones-test-backend
        envio\test\frontend   -> va a C:\inetpub\vacaciones-test-frontend
        envio\prod\backend    -> va a la carpeta del backend productivo
        envio\prod\frontend   -> va a la carpeta del frontend productivo

    El frontend se compila con el modo correcto (.env.test / .env.production) y
    se VERIFICA que el bundle apunte al backend de ese ambiente: si trae el
    puerto del otro, el script aborta. Ese es exactamente el cruce que paso en
    agosto 2026 (un front "de pruebas" pegandole al backend 5050 productivo).

    El backend publicado es el mismo binario en ambos ambientes; lo que decide
    a que base se conecta es ASPNETCORE_ENVIRONMENT en el IIS del servidor, no
    esta carpeta. Por eso se publica una vez por ambiente pero NO hay que tocar
    appsettings al enviarlo.

.PARAMETER Ambiente
    test (por omision) o prod.

.PARAMETER Zip
    Ademas de las carpetas, deja envio\<ambiente>-backend.zip y
    envio\<ambiente>-frontend.zip para mandarlos por copiado/RDP.

.EXAMPLE
    .\deploy\compilar-para-enviar.ps1
    .\deploy\compilar-para-enviar.ps1 -Ambiente prod -Zip
    .\deploy\compilar-para-enviar.ps1 -SoloFrontend
#>
[CmdletBinding()]
param(
    [ValidateSet("test", "prod")]
    [string]$Ambiente = "test",
    [switch]$SoloBackend,
    [switch]$SoloFrontend,
    [switch]$Zip
)

$ErrorActionPreference = "Stop"

$repo   = Split-Path -Parent $PSScriptRoot
$front  = Join-Path $repo "continental-frontend"
$salida = Join-Path $repo "envio\$Ambiente"
$outApi = Join-Path $salida "backend"
$outWeb = Join-Path $salida "frontend"

$rama   = (git -C $repo rev-parse --abbrev-ref HEAD).Trim()
$commit = (git -C $repo rev-parse --short HEAD).Trim()

Write-Host "Ambiente: $Ambiente" -ForegroundColor Cyan
Write-Host "Rama:     $rama ($commit)"
Write-Host "Salida:   $salida"
Write-Host ""

if ($Ambiente -eq "prod" -and $rama -ne "main") {
    Write-Host "OJO: vas a compilar PRODUCCION desde la rama '$rama', no desde main." -ForegroundColor Yellow
    $r = Read-Host "Escribe SI para continuar"
    if ($r -ne "SI") { throw "Cancelado." }
}

# Aviso de cambios sin commitear: lo que envias no seria lo que esta en git.
$sucio = git -C $repo status --porcelain
if ($sucio) {
    Write-Host "Aviso: hay cambios sin commitear; se compilaran tal cual estan en disco." -ForegroundColor Yellow
}

# ── Backend ──────────────────────────────────────────────────────────────────
if (-not $SoloFrontend) {
    Write-Host "== Backend -> $outApi ==" -ForegroundColor Cyan
    if (Test-Path $outApi) { Remove-Item $outApi -Recurse -Force }
    dotnet publish (Join-Path $repo "FreeTimeApp\tiempo-libre.app") -c Release -o $outApi
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish devolvio $LASTEXITCODE" }
    Write-Host "Backend listo." -ForegroundColor Green
    Write-Host ""
}

# ── Frontend ─────────────────────────────────────────────────────────────────
if (-not $SoloBackend) {
    Write-Host "== Frontend -> $outWeb ==" -ForegroundColor Cyan

    $envFile = if ($Ambiente -eq "test") { ".env.test" } else { ".env.production" }
    if (-not (Test-Path (Join-Path $front $envFile))) {
        throw "Falta $envFile en $front. Sin ese archivo el build cae al fallback localhost:5050 (base PRODUCTIVA)."
    }

    Push-Location $front
    try {
        if ($Ambiente -eq "test") { npm run build:test } else { npm run build }
        if ($LASTEXITCODE -ne 0) { throw "el build del frontend devolvio $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }

    if (Test-Path $outWeb) { Remove-Item $outWeb -Recurse -Force }
    New-Item -ItemType Directory -Path $outWeb | Out-Null
    Copy-Item (Join-Path $front "build\*") $outWeb -Recurse -Force

    # El SPA usa BrowserRouter: sin esta regla, entrar directo a /admin/... da 404 de IIS.
    Copy-Item (Join-Path $PSScriptRoot "iis\frontend-web.config") (Join-Path $outWeb "web.config") -Force

    # Segunda verificacion, ya sobre lo que se va a enviar (no sobre .\build).
    Push-Location $front
    try {
        node scripts/verificar-build.mjs $Ambiente $outWeb
        if ($LASTEXITCODE -ne 0) { throw "el paquete del frontend apunta al ambiente equivocado; NO lo envies." }
    }
    finally {
        Pop-Location
    }
    Write-Host "Frontend listo." -ForegroundColor Green
    Write-Host ""
}

if ($Zip) {
    if ((-not $SoloFrontend) -and (Test-Path $outApi)) {
        $z = Join-Path $repo "envio\$Ambiente-backend.zip"
        if (Test-Path $z) { Remove-Item $z -Force }
        Compress-Archive -Path (Join-Path $outApi "*") -DestinationPath $z
        Write-Host "ZIP backend:  $z"
    }
    if ((-not $SoloBackend) -and (Test-Path $outWeb)) {
        $z = Join-Path $repo "envio\$Ambiente-frontend.zip"
        if (Test-Path $z) { Remove-Item $z -Force }
        Compress-Archive -Path (Join-Path $outWeb "*") -DestinationPath $z
        Write-Host "ZIP frontend: $z"
    }
    Write-Host ""
}

Write-Host "Paquetes de $Ambiente listos ($commit)." -ForegroundColor Green
Write-Host ""
Write-Host "En el SERVIDOR, antes de copiar el backend (IIS bloquea los DLL):" -ForegroundColor Yellow
if ($Ambiente -eq "test") {
    Write-Host '  Stop-Website -Name "vacaciones-test-backend"'
    Write-Host '  ... copiar envio\test\backend  -> C:\inetpub\vacaciones-test-backend'
    Write-Host '  ... copiar envio\test\frontend -> C:\inetpub\vacaciones-test-frontend'
    Write-Host '  Start-Website -Name "vacaciones-test-backend"'
    Write-Host '  Invoke-RestMethod http://localhost:6050/api/Health/status | Select-Object environment, status'
    Write-Host '     -> environment DEBE decir Test. Si dice Production, esta escribiendo en la base productiva.'
} else {
    Write-Host '  Stop-Website -Name "<sitio del backend productivo>"'
    Write-Host '  ... copiar envio\prod\backend  -> carpeta del backend productivo'
    Write-Host '  ... copiar envio\prod\frontend -> carpeta del frontend productivo'
    Write-Host '  Start-Website -Name "<sitio del backend productivo>"'
}
