# Entorno de pruebas — Vacaciones (ContiTest)

Guía para levantar una copia de la app en el mismo servidor IIS, aislada de
producción. Se hace **una sola vez**; después cada despliegue son dos comandos.

## Mapa de puertos del servidor

Convención: **5xxx = producción, 6xxx = pruebas**, conservando los últimos tres
dígitos. Así el puerto dice solo de qué ambiente es.

| App | Front | Back | Base de datos |
|---|---|---|---|
| Vacaciones — **producción** | 5173 | 5050 | `FreeTime` |
| Vacaciones — **pruebas** | **6173** | **6050** | **`FreeTime_Test`** |
| Mantenimiento — producción | 5174 | 5110 | (la suya) |
| Fugas — producción | 5175 | 5200 | (la suya) |

Rama de pruebas: **`fix/punchlist-batch-1`**. Producción sigue en `main`.

### Sitios y carpetas en IIS

| Sitio | Puerto | Carpeta física | Application pool |
|---|---|---|---|
| `vacaciones-test-backend` | 6050 | `C:\inetpub\vacaciones-test-backend` | `vacaciones-test-backend` (No Managed Code) |
| `vacaciones-test-frontend` | 6173 | `C:\inetpub\vacaciones-test-frontend` | `vacaciones-test-frontend` |

> El backend ya acepta CORS desde cualquier puerto de `slas052a` y de
> `localhost`, así que no hay que tocar `Program.cs` para esto.

---

## Paso 1 — La base de datos de pruebas

En SQL Server Management Studio, sobre la misma instancia que usa producción
(`ALEX\SQLEXPRESS`, según `appsettings.json`):

1. Clic derecho en `FreeTime` → **Tasks → Back Up…** → guarda el `.bak`.
2. Clic derecho en **Databases** → **Restore Database…**
   - Source: **Device** → el `.bak` que acabas de generar.
   - Destination → **Database:** escribe `FreeTime_Test`.
   - En **Files**, cambia el nombre físico de los archivos (`FreeTime_Test.mdf`,
     `FreeTime_Test_log.ldf`) para que no choquen con los de producción.
3. Listo. **En esta base sí puedes correr SQL** — es la que te faltaba para
   probar parches sin tocar la productiva.

Cada vez que quieras refrescarla con datos reales, repites el restore
sobreescribiendo `FreeTime_Test` (Options → *Overwrite the existing database*).

> El restore consume I/O del disco que comparte con producción. No corrompe
> nada, pero puede poner lenta la app productiva mientras dura: hazlo temprano
> o al final del día.

---

## Paso 2 — Backend de pruebas (puerto 6050)

La configuración ya está en el repo: **`appsettings.Test.json`**. Trae tres
diferencias importantes contra producción:

- Apunta a `FreeTime_Test`.
- `"BackgroundServices": { "Habilitados": false }` — no corre las
  sincronizaciones de SAP ni las rotaciones agendadas. Sin esto tendrías dos
  instancias haciendo el mismo trabajo pesado en la misma máquina.
- `"ModoSimulacro": true` en SMTP — los correos se escriben en el log en vez de
  mandarse. **Es lo que evita que cada prueba le llegue por correo a un jefe
  real.** Búscalos en el log como `[SIMULACRO] Correo NO enviado`.

### Publicar

```powershell
cd C:\ruta\ContiTest
git checkout fix/punchlist-batch-1
git pull

dotnet publish .\FreeTimeApp\tiempo-libre.app -c Release -o C:\inetpub\vacaciones-test-backend
```

### Crear el sitio en IIS

```powershell
Import-Module WebAdministration

New-WebAppPool -Name "vacaciones-test-backend"
# "" = No Managed Code, obligatorio para ASP.NET Core
Set-ItemProperty IIS:\AppPools\vacaciones-test-backend -Name managedRuntimeVersion -Value ""

New-Website -Name "vacaciones-test-backend" `
    -PhysicalPath "C:\inetpub\vacaciones-test-backend" `
    -ApplicationPool "vacaciones-test-backend" `
    -Port 6050

Stop-Website -Name "vacaciones-test-backend"
```

Y **antes de arrancarlo**, la variable de entorno que selecciona la
configuración de pruebas:

```powershell
Add-WebConfigurationProperty `
  -pspath "MACHINE/WEBROOT/APPHOST/vacaciones-test-backend" `
  -filter "system.webServer/aspNetCore/environmentVariables" `
  -name "." `
  -value @{ name='ASPNETCORE_ENVIRONMENT'; value='Test' }

Start-Website -Name "vacaciones-test-backend"
```

Sin esa variable **el backend de pruebas se conecta a la base de producción**,
porque cargaría `appsettings.json` en vez de `appsettings.Test.json`. Es el paso
que no hay que saltarse.

Queda escrita en `applicationHost.config`, no en la carpeta publicada, así que
sobrevive a cada republicación.

Verifica con el health check, **no con swagger**: `Program.cs` monta Swagger solo
cuando `IsDevelopment()`, así que en pruebas esa ruta da 404 — y ese 404 no es
falla, es la app contestando.

```powershell
Invoke-RestMethod http://localhost:6050/api/Health/status | ConvertTo-Json -Depth 5
```

Es `[AllowAnonymous]` y responde las dos cosas que importan:

- `environment` debe decir **`Test`**. Si dice `Production`, la variable de arriba
  no quedó y el backend está pegándole a `FreeTime`.
- `services.database.connected` debe ser **`true`**. Si es `false`, trae el error
  de conexión en `error`.

Ojo: IIS no arranca el proceso hasta la primera petición HTTP. `Start-Website`
solo pone a IIS a escuchar, así que hasta que no llames al endpoint no existe ni
la carpeta `Logs`.

> Requisito del servidor: **ASP.NET Core Hosting Bundle** para .NET 9. Compruébalo
> con `dotnet --list-runtimes | Select-String "AspNetCore"`. Si ya corre el
> backend de producción en IIS, ya está — y ojo, instalarlo reinicia IIS
> completo, así que sería fuera de horario.

---

## Paso 3 — Frontend de pruebas (puerto 6173)

El archivo **`.env.test`** ya apunta al backend 6050, y `package.json` tiene el
script `build:test`.

```powershell
cd C:\ruta\ContiTest\continental-frontend
git checkout fix/punchlist-batch-1
git pull

npm ci
npm run build:test
```

Eso deja el sitio compilado en `continental-frontend\build`. El script termina
con `✔ Build TEST correcto: API en puerto 6050`; si el bundle trae 5050 (o no
trae 6050) **aborta** y no deja build, para que no se pueda subir un front
cruzado por accidente.

Antes de subirlo, confirma que apunta al backend correcto:

```powershell
Select-String -Path .\build\assets\*.js -Pattern "slas052a:\d+" |
    ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
```

Debe salir **solo** `slas052a:6050`. Si aparece `5050`, el build tomó
`.env.production` y ese front le estaría pegando a la base productiva.

### Crear el sitio en IIS

1. Copia el contenido de `build\` a `C:\inetpub\vacaciones-test-frontend`
2. Copia `deploy\iis\frontend-web.config` a
   `C:\inetpub\vacaciones-test-frontend\web.config`

   **No es opcional.** La app usa `BrowserRouter`: sin la regla de reescritura,
   entrar directo a `/admin/reportes` o recargar la página da 404 de IIS.
   Requiere el módulo [URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite).
3. El sitio:

```powershell
New-WebAppPool -Name "vacaciones-test-frontend"

New-Website -Name "vacaciones-test-frontend" `
    -PhysicalPath "C:\inetpub\vacaciones-test-frontend" `
    -ApplicationPool "vacaciones-test-frontend" `
    -Port 6173
```

**El link de pruebas queda en `http://slas052a:6173`.**

---

## Paso 4 — Firewall

Si el servidor tiene el firewall de Windows activo, abre los dos puertos nuevos:

```powershell
New-NetFirewallRule -DisplayName "Vacaciones Test Front 6173" -Direction Inbound -LocalPort 6173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Vacaciones Test API 6050"   -Direction Inbound -LocalPort 6050 -Protocol TCP -Action Allow
```

---

## Despliegue de cada cambio (ya montado todo)

Desde la carpeta del repo en el servidor:

```powershell
.\deploy\deploy-test.ps1
```

O a mano:

```powershell
git checkout fix/punchlist-batch-1
git pull

# Backend — detener el sitio primero: IIS bloquea los DLL mientras corre
Stop-Website -Name "vacaciones-test-backend"
dotnet publish .\FreeTimeApp\tiempo-libre.app -c Release -o C:\inetpub\vacaciones-test-backend
Start-Website -Name "vacaciones-test-backend"

# Frontend
cd continental-frontend
npm run build:test
robocopy .\build C:\inetpub\vacaciones-test-frontend /MIR /XF web.config
```

> `/XF web.config` evita que el `/MIR` borre el web.config del SPA.

---

## Checklist anti-cruce (compilando en tu máquina)

El cruce de agosto 2026 fue este: el "sitio de pruebas" se compiló con
`npm run build` (modo producción) o en una copia del repo sin `.env.test`, así
que el bundle tomó el fallback `http://localhost:5050` de `src/config/env.ts`
— que es la API **productiva** — y además no traía el distintivo TEST. Al
activar la programación anual "en pruebas" se activó en producción.

El flujo real es: **se compila en la máquina del desarrollador y se envían los
archivos al servidor**; en slas052a no se compila nada. Por eso los comandos
van en dos bloques: lo que corres en tu equipo y lo que corres en el servidor.

### En TU máquina

```powershell
cd C:\ruta\ContiTest
git checkout fix/punchlist-batch-1
git pull
git log --oneline -1                  # confirma el commit que vas a mandar

.\deploy\compilar-para-enviar.ps1                 # pruebas
# .\deploy\compilar-para-enviar.ps1 -Ambiente prod  # producción (desde main)
# agrega -Zip si prefieres mandar dos .zip
```

Eso deja, listo para enviar:

```
envio\test\backend     ->  C:\inetpub\vacaciones-test-backend
envio\test\frontend    ->  C:\inetpub\vacaciones-test-frontend
```

El script compila el front con el `.env` que toca, le pone el `web.config` del
SPA y **verifica el paquete**: si el bundle trae el puerto del otro ambiente
aborta y no te deja un paquete cruzado. Lo mismo hacen ya `npm run build:test`
y `npm run build` por su cuenta.

> El **backend publicado es el mismo binario** para pruebas y producción. Lo
> que decide a qué base se conecta es `ASPNETCORE_ENVIRONMENT` en el IIS del
> servidor, no la carpeta que envías: no hay que editar ningún `appsettings`
> antes de mandarlo.

### En el SERVIDOR (RDP o PowerShell remoto)

IIS mantiene los DLL bloqueados, así que el sitio del backend se detiene antes
de copiar:

```powershell
Import-Module WebAdministration
Stop-Website -Name "vacaciones-test-backend"

#  ... aquí copias las dos carpetas que trajiste ...
#      envio\test\backend   -> C:\inetpub\vacaciones-test-backend
#      envio\test\frontend  -> C:\inetpub\vacaciones-test-frontend
#      (el frontend ya trae su web.config; si copias con /MIR usa /XF web.config)

Start-Website -Name "vacaciones-test-backend"

# La comprobación que NO hay que saltarse:
Invoke-RestMethod http://localhost:6050/api/Health/status | Select-Object environment, status
#   environment debe decir Test. Si dice Production, ese backend está
#   escribiendo en FreeTime (PRODUCCIÓN): ponle la variable y reinicia el pool.
```

Si el equipo tiene visibilidad de red al servidor, el envío se puede hacer en
un solo paso desde tu máquina con una ruta UNC (requiere permisos de admin en
el recurso):

```powershell
robocopy .\envio\test\backend  \\slas052a\c$\inetpub\vacaciones-test-backend  /MIR
robocopy .\envio\test\frontend \\slas052a\c$\inetpub\vacaciones-test-frontend /MIR /XF web.config
```

Aun así el `Stop-Website` / `Start-Website` y el health check se ejecutan **en
el servidor** (o con `Invoke-Command -ComputerName slas052a` si tienes WinRM).

### Para saber qué está desplegado ahora mismo

Sobre la carpeta del sitio, sin recompilar nada:

```powershell
node continental-frontend\scripts\verificar-build.mjs test \\slas052a\c$\inetpub\vacaciones-test-frontend
node continental-frontend\scripts\verificar-build.mjs prod \\slas052a\c$\inetpub\vacaciones-frontend
```

O a ojo, buscando el puerto en el bundle:

```powershell
Select-String -Path C:\inetpub\vacaciones-test-frontend\assets\*.js -Pattern "(slas052a|localhost):\d+" |
    ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
```

> Regla de oro: **un paquete por ambiente, nunca copiar el mismo a los dos
> sitios.** Por eso `envio\test\` y `envio\prod\` son carpetas separadas.

---

## Cómo saber que estás en pruebas y no en producción

Cuatro señales, en orden inverso de confianza (la última es la que manda):

1. En el navbar, junto a "Vacaciones", aparece el distintivo rojo **TEST**.
   Sale de `VITE_ES_PRUEBAS=true`, que solo trae `.env.test`.
2. La URL dice **6173**.
3. El backend de esa pestaña responde en **6050** (pestaña Network del navegador).
4. En el log del backend, al arrancar, aparece
   `EmailService en MODO SIMULACRO`.

Ojo con el orden: el distintivo del navbar dice qué `.env` usó el **build del
front**, no a qué base pega el **backend**. Son cosas independientes. La señal
que de verdad prueba que no estás tocando `FreeTime` es la 4.

Si la 4 no aparece, `ASPNETCORE_ENVIRONMENT=Test` no quedó puesto y **estás
escribiendo en la base de producción**. Para ahí y revisa el paso 2.

---

## Flujo de ramas

```
fix/punchlist-batch-1   →  se prueba en 6173 / 6050  →  FreeTime_Test
        │
        └── cuando pasa la validación: merge a main
                                        │
                                        └→ 5173 / 5050 → FreeTime
```

Al mergear a main se van también los archivos de este entorno
(`appsettings.Test.json`, `.env.test`, `deploy/`). No hacen daño en producción:
`appsettings.Test.json` solo se lee si `ASPNETCORE_ENVIRONMENT=Test`, y los dos
interruptores nuevos vienen con el comportamiento de siempre por omisión
(`BackgroundServices:Habilitados` = `true`, `SmtpSettings:ModoSimulacro` =
`false`). Lo que **sí** hay que cuidar es no dejar `.env.production` apuntando
a 6050 antes de un merge.
