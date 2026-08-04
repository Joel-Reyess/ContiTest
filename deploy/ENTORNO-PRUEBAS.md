# Entorno de pruebas — Vacaciones (ContiTest)

Guía para levantar una copia de la app en el mismo servidor IIS, aislada de
producción. Se hace **una sola vez**; después cada despliegue son dos comandos.

## Mapa de puertos del servidor

| App | Front | Back | Base de datos |
|---|---|---|---|
| Vacaciones — **producción** | 5173 | 5050 | `FreeTime` |
| Vacaciones — **pruebas** | **5175** | **5060** | **`FreeTime_Test`** |
| Mantenimiento — producción | 5174 | 5110 | (la suya) |

Rama de pruebas: **`fix/punchlist-batch-1`**. Producción sigue en `main`.

> El backend ya acepta CORS desde cualquier puerto de `slas052a` y de
> `localhost`, así que no hay que tocar `Program.cs` para esto.

---

## Paso 1 — La base de datos de pruebas

En SQL Server Management Studio, sobre `ALEX\SQLEXPRESS`:

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

---

## Paso 2 — Backend de pruebas (puerto 5060)

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
cd C:\ruta\ContiTest\FreeTimeApp\tiempo-libre.app
git checkout fix/punchlist-batch-1
git pull

dotnet publish -c Release -o C:\inetpub\vacaciones-test\api
```

### Crear el sitio en IIS

1. **Application Pools** → *Add Application Pool*
   - Nombre: `VacacionesTestApi`
   - .NET CLR version: **No Managed Code** (obligatorio para ASP.NET Core)
2. **Sites** → *Add Website*
   - Site name: `Vacaciones-Test-Api`
   - Application pool: `VacacionesTestApi`
   - Physical path: `C:\inetpub\vacaciones-test\api`
   - Binding: `http`, puerto **5060**, host name vacío
3. Selecciona el sitio → **Configuration Editor** →
   `system.webServer/aspNetCore` → `environmentVariables` → agrega:
   - `ASPNETCORE_ENVIRONMENT` = `Test`

   Sin esta variable **el backend de pruebas se conecta a la base de
   producción**, porque cargaría `appsettings.json` en vez de
   `appsettings.Test.json`. Es el paso que no hay que saltarse.

4. Verifica: `http://slas052a:5060/swagger` debe abrir.

> Requisito del servidor: **ASP.NET Core Hosting Bundle** instalado. Si ya corre
> el backend de producción en IIS, ya está.

---

## Paso 3 — Frontend de pruebas (puerto 5175)

El archivo **`.env.test`** ya apunta al backend 5060, y `package.json` tiene el
script `build:test`.

```powershell
cd C:\ruta\ContiTest\continental-frontend
git checkout fix/punchlist-batch-1
git pull

npm ci
npm run build:test
```

Eso deja el sitio compilado en `continental-frontend\build`.

### Crear el sitio en IIS

1. Copia el contenido de `build\` a `C:\inetpub\vacaciones-test\web`
2. Copia `deploy\iis\frontend-web.config` a
   `C:\inetpub\vacaciones-test\web\web.config`

   **No es opcional.** La app usa `BrowserRouter`: sin la regla de reescritura,
   entrar directo a `/admin/reportes` o recargar la página da 404 de IIS.
   Requiere el módulo [URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite).
3. **Sites** → *Add Website*
   - Site name: `Vacaciones-Test-Web`
   - Application pool: puede ser el `DefaultAppPool` (es puro estático)
   - Physical path: `C:\inetpub\vacaciones-test\web`
   - Binding: `http`, puerto **5175**

**El link de pruebas queda en `http://slas052a:5175`.**

---

## Paso 4 — Firewall

Si el servidor tiene el firewall de Windows activo, abre los dos puertos nuevos:

```powershell
New-NetFirewallRule -DisplayName "Vacaciones Test Web 5175" -Direction Inbound -LocalPort 5175 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Vacaciones Test API 5060" -Direction Inbound -LocalPort 5060 -Protocol TCP -Action Allow
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

# Backend
dotnet publish .\FreeTimeApp\tiempo-libre.app -c Release -o C:\inetpub\vacaciones-test\api

# Frontend
cd continental-frontend
npm run build:test
robocopy .\build C:\inetpub\vacaciones-test\web /MIR /XF web.config
```

> `/XF web.config` evita que el `/MIR` borre el web.config del SPA.

Si `dotnet publish` falla porque el sitio tiene los DLL en uso, detén el sitio
`Vacaciones-Test-Api` en IIS, publica y vuelve a arrancarlo.

---

## Cómo saber que estás en pruebas y no en producción

Tres señales, en orden de confianza:

1. La URL dice **5175**.
2. El backend de esa pestaña responde en **5060** (pestaña Network del navegador).
3. En el log del backend, al arrancar, aparece
   `EmailService en MODO SIMULACRO`.

Si el 3 no aparece, `ASPNETCORE_ENVIRONMENT=Test` no quedó puesto y **estás
escribiendo en la base de producción**. Para ahí y revisa el paso 2.3.

---

## Flujo de ramas

```
fix/punchlist-batch-1   →  se prueba en 5175 / 5060  →  FreeTime_Test
        │
        └── cuando pasa la validación: merge a main
                                        │
                                        └→ 5173 / 5050 → FreeTime
```

Las dos ramas están hoy en el mismo commit (`33dcaaf`).
