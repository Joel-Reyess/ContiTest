<#
.SYNOPSIS
    Copia al servidor los paquetes que dejo compilar-para-enviar.ps1, con
    respaldo previo y verificacion posterior. Se corre en TU MAQUINA.

.DESCRIPTION
    Cubre las tres formas en que ya se nos cayo un despliegue:

      1. El robocopy "funciono" pero no copio nada (ERROR 3: la carpeta origen
         no existia en la maquina donde se corrio). Aqui el origen se valida
         antes y el codigo de salida se revisa despues.
      2. El binario nuevo pidio columnas que la base no tenia
         (Invalid column name 'PatronBaseline'). Por eso se exige haber pasado
         VerificarEsquemaBD.sql: el script pregunta y no sigue sin confirmacion.
      3. El appsettings del servidor se sobrescribio con el del repo, que
         apunta a la base de desarrollo. Nunca se copian appsettings*.json.

    Deja un respaldo de la carpeta anterior al lado, con fecha, para poder
    volver atras copiandolo de regreso.

.PARAMETER Ambiente
    test (por omision) o prod.

.PARAMETER Servidor
    Nombre del servidor de IIS. Por omision slas052a.

.EXAMPLE
    .\deploy\enviar-al-servidor.ps1 -Ambiente test
    .\deploy\enviar-al-servidor.ps1 -Ambiente prod -RutaApi 'C:\inetpub\vacaciones-backend' -SitioApi 'vacaciones-backend'
#>
[CmdletBinding()]
param(
    [ValidateSet("test", "prod")]
    [string]$Ambiente = "test",

    [string]$Servidor = "slas052a",

    # Rutas FISICAS en el servidor (tal como se ven desde el propio servidor).
    # Las de produccion no estan documentadas: sacalas con
    #   Get-Website | Select-Object Name, physicalPath, state
    [string]$RutaApi,
    [string]$RutaWeb,
    [string]$SitioApi,
    [string]$SitioWeb,

    [switch]$SoloBackend,
    [switch]$SoloFrontend,

    # Salta el Stop/Start remoto (si no hay WinRM, los haces a mano).
    [switch]$SinIIS,

    # No preguntar por el esquema. Solo si YA lo verificaste.
    [switch]$EsquemaVerificado
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot

# ── Valores por omision por ambiente ─────────────────────────────────────────
if ($Ambiente -eq "test") {
    if (-not $RutaApi)  { $RutaApi  = "C:\inetpub\vacaciones-test-backend" }
    if (-not $RutaWeb)  { $RutaWeb  = "C:\inetpub\vacaciones-test-frontend" }
    if (-not $SitioApi) { $SitioApi = "vacaciones-test-backend" }
    if (-not $SitioWeb) { $SitioWeb = "vacaciones-test-frontend" }
    $puertoApi  = 6050
    $baseEsperada = "FreeTime_Test"
    $entornoEsperado = "Test"
} else {
    if (-not $RutaApi -or -not $RutaWeb -or -not $SitioApi) {
        throw @"
Para prod hay que decir a que sitio va. En el SERVIDOR corre:
    Get-Website | Select-Object Name, physicalPath, state
    Get-WebBinding | Select-Object protocol, bindingInformation
y vuelve a llamar con -RutaApi / -RutaWeb / -SitioApi / -SitioWeb.
"@
    }
    $puertoApi  = 5050
    $baseEsperada = "FreeTime"
    $entornoEsperado = "Production"
}

# Ruta UNC: es la que se usa para copiar desde aqui.
$uncApi = "\\$Servidor\" + ($RutaApi -replace '^([A-Za-z]):', '$1$$')
$uncWeb = "\\$Servidor\" + ($RutaWeb -replace '^([A-Za-z]):', '$1$$')

$origenApi = Join-Path $repo "envio\$Ambiente\backend"
$origenWeb = Join-Path $repo "envio\$Ambiente\frontend"
$sello     = Get-Date -Format "yyyyMMdd-HHmm"

Write-Host "Ambiente:  $Ambiente" -ForegroundColor Cyan
Write-Host "Servidor:  $Servidor"
Write-Host "Backend:   $origenApi  ->  $uncApi"
Write-Host "Frontend:  $origenWeb  ->  $uncWeb"
Write-Host ""

# ── 1. El esquema va ANTES que el binario ────────────────────────────────────
if (-not $EsquemaVerificado) {
    Write-Host "Antes de mover binarios: ¿ya corriste VerificarEsquemaBD.sql en $baseEsperada" -ForegroundColor Yellow
    Write-Host "y salieron TODOS los renglones en 'ok'?" -ForegroundColor Yellow
    Write-Host "Si falta alguno, el backend nuevo truena con Invalid column name / Invalid object name." -ForegroundColor Yellow
    $r = Read-Host "Escribe SI para continuar"
    if ($r -ne "SI") { throw "Cancelado: corre primero VerificarEsquemaBD.sql." }
    Write-Host ""
}

# ── 2. Validar que los paquetes existen y traen algo ─────────────────────────
function Assert-Paquete($ruta, $que) {
    if (-not (Test-Path $ruta)) {
        throw "No existe $ruta. Corre primero: .\deploy\compilar-para-enviar.ps1 -Ambiente $Ambiente"
    }
    $n = (Get-ChildItem $ruta -Recurse -File | Measure-Object).Count
    if ($n -eq 0) { throw "$ruta esta vacia; el paquete de $que no se genero bien." }
    Write-Host "Paquete de $que ok ($n archivos)." -ForegroundColor Green
}

if (-not $SoloFrontend) { Assert-Paquete $origenApi "backend" }
if (-not $SoloBackend)  { Assert-Paquete $origenWeb "frontend" }

# El bundle del frontend tiene que apuntar al backend de ESTE ambiente.
if (-not $SoloBackend) {
    Push-Location (Join-Path $repo "continental-frontend")
    try {
        node scripts/verificar-build.mjs $Ambiente $origenWeb
        if ($LASTEXITCODE -ne 0) { throw "El paquete del frontend apunta al ambiente equivocado. NO se envia." }
    } finally { Pop-Location }
}
Write-Host ""

# ── 3. Alcanzar el servidor ──────────────────────────────────────────────────
if (-not (Test-Path "\\$Servidor\c$")) {
    throw "No se ve \\$Servidor\c$ desde aqui. Revisa red/permisos, o copia por RDP."
}

function Invocar-EnServidor([scriptblock]$bloque, [object[]]$args) {
    if ($SinIIS) { return $null }
    try { return Invoke-Command -ComputerName $Servidor -ScriptBlock $bloque -ArgumentList $args -ErrorAction Stop }
    catch {
        Write-Host "No se pudo ejecutar remoto en $Servidor ($($_.Exception.Message))." -ForegroundColor Yellow
        Write-Host "Hazlo a mano en el servidor y vuelve a correr con -SinIIS." -ForegroundColor Yellow
        throw
    }
}

# ── 4. Respaldo de lo que hay ────────────────────────────────────────────────
function Respaldar($unc, $etiqueta) {
    if (-not (Test-Path $unc)) { Write-Host "$etiqueta: destino nuevo, no hay que respaldar."; return }
    $destino = "$unc.bak-$sello"
    Write-Host "Respaldando $etiqueta -> $destino"
    robocopy $unc $destino /E /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "No se pudo respaldar $etiqueta (robocopy $LASTEXITCODE). Se aborta." }
}

# ── 5. Backend ───────────────────────────────────────────────────────────────
if (-not $SoloFrontend) {
    Write-Host "== Backend ==" -ForegroundColor Cyan
    Respaldar $uncApi "backend"

    if (-not $SinIIS) {
        Write-Host "Deteniendo sitio $SitioApi..."
        Invocar-EnServidor { param($s) Import-Module WebAdministration; Stop-Website -Name $s } @($SitioApi) | Out-Null
        Start-Sleep -Seconds 3
    } else {
        Write-Host "Recuerda: el sitio $SitioApi debe estar DETENIDO o los DLL estaran bloqueados." -ForegroundColor Yellow
    }

    # /MIR deja el destino identico. Se excluyen los appsettings porque el del
    # repo apunta a la base de desarrollo: copiarlos deja al servidor sin
    # cadena de conexion valida.
    robocopy $origenApi $uncApi /MIR /XF appsettings.json appsettings.Test.json appsettings.Development.json appsettings.Production.json /NFL /NDL /NJH /NJS /R:2 /W:2
    $codigo = $LASTEXITCODE
    if ($codigo -ge 8) { throw "robocopy del backend fallo con codigo $codigo. NO se arranco el sitio; el respaldo sigue en $uncApi.bak-$sello" }
    Write-Host "Backend copiado (robocopy $codigo)." -ForegroundColor Green

    if (-not (Test-Path (Join-Path $uncApi "web.config"))) {
        Write-Host "OJO: no hay web.config en $uncApi; IIS no va a saber arrancar el modulo de ASP.NET Core." -ForegroundColor Red
    }
    $cfg = Join-Path $uncApi "appsettings.json"
    if (-not (Test-Path $cfg)) {
        Write-Host "ALTO: $uncApi no tiene appsettings.json propio." -ForegroundColor Red
        Write-Host "Se excluyo del copiado a proposito. Colocalo a mano con la cadena de conexion de $baseEsperada antes de arrancar." -ForegroundColor Red
    }

    if (-not $SinIIS) {
        Write-Host "Arrancando sitio $SitioApi..."
        Invocar-EnServidor { param($s) Import-Module WebAdministration; Start-Website -Name $s } @($SitioApi) | Out-Null
    }
    Write-Host ""
}

# ── 6. Frontend ──────────────────────────────────────────────────────────────
if (-not $SoloBackend) {
    Write-Host "== Frontend ==" -ForegroundColor Cyan
    Respaldar $uncWeb "frontend"

    # /XF web.config: el del SPA (reescritura de rutas) vive en el servidor.
    robocopy $origenWeb $uncWeb /MIR /XF web.config /NFL /NDL /NJH /NJS /R:2 /W:2
    $codigo = $LASTEXITCODE
    if ($codigo -ge 8) { throw "robocopy del frontend fallo con codigo $codigo. Respaldo en $uncWeb.bak-$sello" }
    Write-Host "Frontend copiado (robocopy $codigo)." -ForegroundColor Green

    if (-not (Test-Path (Join-Path $uncWeb "web.config"))) {
        Write-Host "Falta web.config del SPA; copiando el de deploy\iis..." -ForegroundColor Yellow
        Copy-Item (Join-Path $PSScriptRoot "iis\frontend-web.config") (Join-Path $uncWeb "web.config")
    }

    # Verificacion sobre lo YA desplegado, no sobre la carpeta local.
    Push-Location (Join-Path $repo "continental-frontend")
    try {
        node scripts/verificar-build.mjs $Ambiente $uncWeb
        if ($LASTEXITCODE -ne 0) { Write-Host "ALTO: lo que quedo en el servidor apunta al ambiente equivocado." -ForegroundColor Red }
    } finally { Pop-Location }
    Write-Host ""
}

# ── 7. Comprobar que quedo vivo y en la base correcta ────────────────────────
if (-not $SoloFrontend) {
    Write-Host "== Comprobacion ==" -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    try {
        $h = Invoke-RestMethod "http://$Servidor`:$puertoApi/api/Health/status" -TimeoutSec 60
        $srv  = $h.services.database.server
        $base = $h.services.database.database
        Write-Host "environment = $($h.environment)   (esperado $entornoEsperado)"
        Write-Host "database    = $base en $srv   (esperado $baseEsperada)"
        # 'status: healthy' es texto fijo del controlador: no prueba nada.
        if ($h.environment -ne $entornoEsperado) {
            Write-Host "ALTO: ASPNETCORE_ENVIRONMENT no es $entornoEsperado en ese sitio de IIS." -ForegroundColor Red
        }
        elseif ($base -ne $baseEsperada) {
            Write-Host "ALTO: el backend quedo pegado a '$base', no a $baseEsperada." -ForegroundColor Red
        }
        elseif (-not $h.services.database.connected) {
            Write-Host "ALTO: no conecta a la base. Revisa la cadena de conexion del appsettings del servidor." -ForegroundColor Red
        }
        else {
            Write-Host "OK: $Ambiente arriba, contra $base." -ForegroundColor Green
        }
    } catch {
        Write-Host "El health check no respondio: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Si no levanta, vuelve atras copiando el respaldo:" -ForegroundColor Yellow
        Write-Host "  robocopy $uncApi.bak-$sello $uncApi /MIR" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Respaldos de esta corrida: *.bak-$sello" -ForegroundColor Cyan
Write-Host "Borralos cuando confirmes que el ambiente quedo bien." -ForegroundColor Cyan
