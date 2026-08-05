<#
.SYNOPSIS
    Despliega la rama de pruebas al entorno de pruebas de IIS.

.DESCRIPTION
    Publica el backend en el puerto 6050 y el frontend en el 6173, contra la
    base FreeTime_Test. NO toca producción (5173 / 5050 / FreeTime).

    Convención de puertos del servidor: 5xxx = producción, 6xxx = pruebas.
    Ocupados: 5050/5173 vacaciones, 5110/5174 mantenimiento, 5200/5175 fugas.

    Ver deploy\ENTORNO-PRUEBAS.md para el montaje inicial (sitios de IIS,
    variable ASPNETCORE_ENVIRONMENT, base de datos).

.EXAMPLE
    .\deploy\deploy-test.ps1
    .\deploy\deploy-test.ps1 -SoloFrontend
#>
[CmdletBinding()]
param(
    [string]$Rama     = "fix/punchlist-batch-1",
    [string]$RutaApi  = "C:\inetpub\vacaciones-test-backend",
    [string]$RutaWeb  = "C:\inetpub\vacaciones-test-frontend",
    [string]$SitioApi = "vacaciones-test-backend",
    [switch]$SoloBackend,
    [switch]$SoloFrontend,
    # Por omisión hace git pull de la rama de pruebas. Úsalo si quieres
    # desplegar exactamente lo que tienes en el working tree.
    [switch]$SinPull
)

$ErrorActionPreference = "Stop"

$repo    = Split-Path -Parent $PSScriptRoot
$rutaApi = $RutaApi
$rutaWeb = $RutaWeb

Write-Host "Repo:     $repo"
Write-Host "Backend:  $rutaApi"
Write-Host "Frontend: $rutaWeb"
Write-Host ""

if (-not $SinPull) {
    Write-Host "== Actualizando $Rama ==" -ForegroundColor Cyan
    git -C $repo checkout $Rama
    git -C $repo pull
}

$commit = (git -C $repo rev-parse --short HEAD).Trim()
Write-Host "Desplegando commit $commit" -ForegroundColor Cyan
Write-Host ""

# ── Backend ──────────────────────────────────────────────────────────────────
if (-not $SoloFrontend) {
    Write-Host "== Backend -> $rutaApi ==" -ForegroundColor Cyan

    # IIS mantiene los DLL bloqueados mientras el sitio corre.
    $iisDisponible = Get-Module -ListAvailable -Name WebAdministration
    if ($iisDisponible) {
        Import-Module WebAdministration
        if (Test-Path "IIS:\Sites\$SitioApi") {
            Write-Host "Deteniendo sitio $SitioApi..."
            Stop-Website -Name $SitioApi
        }
    }

    try {
        dotnet publish (Join-Path $repo "FreeTimeApp\tiempo-libre.app") `
            -c Release -o $rutaApi
        if ($LASTEXITCODE -ne 0) { throw "dotnet publish devolvio $LASTEXITCODE" }
    }
    finally {
        if ($iisDisponible -and (Test-Path "IIS:\Sites\$SitioApi")) {
            Write-Host "Arrancando sitio $SitioApi..."
            Start-Website -Name $SitioApi
        }
    }

    Write-Host "Backend listo." -ForegroundColor Green
    Write-Host ""
}

# ── Frontend ─────────────────────────────────────────────────────────────────
if (-not $SoloBackend) {
    Write-Host "== Frontend -> $rutaWeb ==" -ForegroundColor Cyan
    $front = Join-Path $repo "continental-frontend"

    Push-Location $front
    try {
        # build:test usa .env.test, que apunta al backend 6050.
        npm run build:test
        if ($LASTEXITCODE -ne 0) { throw "npm run build:test devolvio $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $rutaWeb)) { New-Item -ItemType Directory -Path $rutaWeb | Out-Null }

    # /MIR deja el destino idéntico al origen (borra assets viejos con hash),
    # pero se excluye web.config para no borrar el del SPA.
    robocopy (Join-Path $front "build") $rutaWeb /MIR /XF web.config /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw "robocopy fallo con codigo $LASTEXITCODE" }

    $webConfig = Join-Path $rutaWeb "web.config"
    if (-not (Test-Path $webConfig)) {
        Write-Host "Copiando web.config del SPA (no existia)..." -ForegroundColor Yellow
        Copy-Item (Join-Path $PSScriptRoot "iis\frontend-web.config") $webConfig
    }

    Write-Host "Frontend listo." -ForegroundColor Green
    Write-Host ""
}

Write-Host "Despliegue de pruebas terminado ($commit)." -ForegroundColor Green
Write-Host "  Front: http://slas052a:6173"
Write-Host "  API:   http://slas052a:6050/swagger"
Write-Host ""
Write-Host "Verifica en el log del backend que aparezca 'MODO SIMULACRO'." -ForegroundColor Yellow
Write-Host "Si no aparece, ASPNETCORE_ENVIRONMENT=Test no esta puesto y estarias" -ForegroundColor Yellow
Write-Host "escribiendo en la base de PRODUCCION." -ForegroundColor Yellow
