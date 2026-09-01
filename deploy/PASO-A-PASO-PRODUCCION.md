# Pasar una versión a producción sin tumbarla

Producción es `slas052a`, frontend en el **5173** y backend en el **5050**, contra
la base **`FreeTime`** de la instancia `SLAS056A\SLAS056A`. Pruebas es lo mismo
en 6173 / 6050 contra `FreeTime_Test`. Convención del servidor: **5xxx = producción,
6xxx = pruebas**.

El binario del backend es **el mismo** en los dos ambientes. Lo que decide a qué
base se conecta es `ASPNETCORE_ENVIRONMENT` en el IIS del servidor y el
`appsettings` que hay en la carpeta — no algo que se compile.

---

## Las tres formas en que ya se nos cayó

Vale la pena tenerlas presentes, porque el orden de los pasos de abajo sale de ellas.

**1. El robocopy que no copió nada.** El 28 de agosto salió
`ERROR 3 (0x00000003) Accessing Source Directory C:\publish\test-backend\`: el
comando se corrió *en el servidor*, donde esa carpeta no existe. Robocopy no
truena de forma escandalosa, así que pareció que había desplegado. El sitio de
pruebas siguió sirviendo el binario del 12 de agosto durante semanas.
→ Fíjate siempre en el resumen de robocopy: **códigos 0–7 está bien, 8 o más es
falla**. Y en cuántos archivos copió.

**2. El binario nuevo contra una base vieja.** `Invalid column name 'PatronBaseline'`.
La migración nunca se había corrido en `FreeTime_TEST`. La app arranca sin
problema y truena cuando alguien abre la pantalla que usa esa tabla, así que se
ve como un bug de la pantalla, no como un despliegue incompleto.
→ **El esquema va antes que el binario.** Siempre.

**3c. El `web.config` del publish encima del del servidor.** Es la que tumbó
pruebas el 1 de septiembre. `ASPNETCORE_ENVIRONMENT` estaba declarado en el
`web.config` del sitio; el que genera `dotnet publish` no trae esa sección, así
que al copiar el backend la variable desapareció. El sitio siguió arrancando
—`/api/Health/ping` respondía— pero como Production: no cargó
`appsettings.Test.json` y se quedó con el `appsettings.json` del repo,
`ALEX\SQLEXPRESS`. El health check lo decía (`environment: Production`,
`database: FreeTime`, `connected: false`), pero en el navegador se veía como un
error de CORS, porque la conexión cortada no lleva encabezados.
→ Excluye `web.config` del copiado del backend, **y** declara la variable en el
grupo de aplicaciones, que vive en `applicationHost.config` y no lo alcanza
ningún copiado:

```powershell
Import-Module WebAdministration
Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter "system.applicationHost/applicationPools/add[@name='<pool>']/environmentVariables" `
  -Name '.' -Value @{name='ASPNETCORE_ENVIRONMENT'; value='Test'}
Restart-WebAppPool -Name '<pool>'
```

Y la lección general: **el health check es la comprobación, no un trámite.**
Ese `environment: Production` estuvo ahí desde el primer intento.

**3b. El `appsettings.Test.json` que se borró con `/MIR`.** Variante de la
anterior, y la que tumbó pruebas el 1 de septiembre. El archivo está en
`.gitignore` (el repo es público y ahí van credenciales), así que **no viene en
el paquete**; `robocopy /MIR` borra del destino todo lo que no esté en el
origen, y se lo llevó. El sitio arrancó igual, con `environment: Test`
correcto, pero cargando solo `appsettings.json` — el del repo — y por eso el
health check reportaba `database: FreeTime`, `connected: false`: es la cadena
de desarrollo, `ALEX\SQLEXPRESS`. En el navegador se veía como un error de
CORS, porque la respuesta de error de IIS no pasa por el middleware que agrega
los encabezados.
→ Excluye siempre `appsettings*.json` del copiado, **y** deja la cadena de
conexión en una variable de entorno del sitio, que ningún copiado puede borrar:

```powershell
Import-Module WebAdministration
Add-WebConfigurationProperty -PSPath 'IIS:\Sites\<sitio>' `
  -Filter 'system.webServer/aspNetCore/environmentVariables' -Name '.' `
  -Value @{name='ConnectionStrings__DefaultConnection'; value='Server=...;Database=...;User Id=...;Password=...;TrustServerCertificate=True'}
```

Los dos guiones bajos son cómo .NET representa `ConnectionStrings:DefaultConnection`,
y las variables de entorno **ganan** sobre el appsettings.

**3. El `appsettings.json` del repo encima del del servidor.** El del repo apunta a
`ALEX\SQLEXPRESS` (la máquina de desarrollo). Si se copia sobre producción, el
backend queda sin base. `dotnet publish -o <carpeta del servidor>` y un robocopy
sin exclusiones hacen exactamente eso.
→ **Nunca copies `appsettings*.json` al servidor.**

---

## Antes de empezar: tres cosas que hay que averiguar

No están documentadas y sin ellas el despliegue de producción es a ciegas.

**a) Cómo se llaman los sitios y dónde viven.** En el servidor:

```powershell
Get-Website | Select-Object Name, physicalPath, state
Get-WebBinding | Select-Object protocol, bindingInformation
```

Anota el nombre y la ruta física del sitio que escucha en 5050 y del que escucha
en 5173. Los de pruebas ya se saben (`vacaciones-test-backend` /
`C:\inetpub\vacaciones-test-backend` y su equivalente de frontend).

**b) De dónde saca producción su cadena de conexión.** Puede ser un
`appsettings.json` editado a mano en la carpeta del sitio, o una variable de
entorno del IIS. Compruébalo:

```powershell
Get-Content 'C:\<ruta del backend productivo>\appsettings.json'
Get-WebConfigurationProperty -PSPath 'IIS:\Sites\<sitio>' `
  -Filter 'system.webServer/aspNetCore/environmentVariables' -Name '.'
```

Si es un archivo, **respáldalo aparte** antes de nada. Es el que no se debe pisar.

**c) Qué le falta a la base de producción.** Conéctate a `FreeTime` en
`SLAS056A\SLAS056A` y corre `VerificarEsquemaBD.sql` — es de **solo lectura**, no
modifica nada. Cada renglón que salga `*** FALTA ***` te dice qué script correr.

---

## El orden

### 1. Fusionar a `main`

Producción sale de `main`, y hoy `main` está más de veinte commits atrás: le
falta, entre otras cosas, el arreglo del botón "Aprobar" que escaló Genaro
Palacios. Mientras eso no se fusione, no hay nada que mandar.

```powershell
git checkout main
git pull
git merge fix/punchlist-batch-1
git push
```

### 2. Esquema primero

Con lo que salió del `VerificarEsquemaBD.sql` del paso (c), corre en `FreeTime`
los scripts que falten. Todos son idempotentes: si la columna ya existe, avisan y
no hacen nada.

Vs. lo que ya está en `main`, esta entrega agrega **un solo** script:
`AddRebasePorcentajeVacaciones.sql` (`VacacionesProgramadas.CapturadoConRebase`
y `.PorcentajeAlCapturar`). Pero producción puede arrastrar migraciones más
viejas sin aplicar — eso es lo que contesta el verificador.

Respalda la base antes, y vuelve a correr `VerificarEsquemaBD.sql` después: **no
sigas hasta que todo diga `ok`**.

### 3. Compilar los paquetes en tu máquina

```powershell
.\deploy\compilar-para-enviar.ps1 -Ambiente prod
```

Deja `envio\prod\backend` y `envio\prod\frontend`. El frontend se compila con
`.env.production` (API en 5050) y el script **aborta** si el bundle trae el
puerto de pruebas. Ese cruce ya pasó: un front "de pruebas" pegándole al backend
productivo.

Como el binario es el mismo para los dos ambientes, si quieres puedes mandar a
producción exactamente lo que ya validaste en pruebas; lo que **no** se reusa es
el frontend, porque el puerto del API va horneado en el bundle.

### 4. Enviarlo

```powershell
.\deploy\enviar-al-servidor.ps1 -Ambiente prod `
    -RutaApi 'C:\<ruta del backend productivo>' `
    -RutaWeb 'C:\<ruta del frontend productivo>' `
    -SitioApi '<sitio del backend>' -SitioWeb '<sitio del frontend>'
```

El script, en este orden: pregunta si ya verificaste el esquema, comprueba que
los paquetes existan y no estén vacíos, verifica el bundle, **respalda las
carpetas del servidor** con fecha, detiene el sitio, copia excluyendo
`appsettings*.json`, revisa el código de robocopy, arranca el sitio y consulta el
health check.

Si no hay WinRM contra el servidor, agrégale `-SinIIS` y haz tú el
`Stop-Website` / `Start-Website` allá. **IIS mantiene los DLL bloqueados
mientras el sitio corre**: si no lo detienes, el copiado falla a medias y queda
una mezcla de binarios viejos y nuevos, que es peor que no haber desplegado.

### 5. Comprobar que quedó bien

```powershell
Invoke-RestMethod http://slas052a:5050/api/Health/status |
    Select-Object environment, @{n='db';e={$_.services.database.database}}
```

Tiene que decir `environment = Production` y `db = FreeTime`.

`status: "healthy"` **no comprueba nada**: es una cadena fija del controlador,
sale igual aunque la base esté caída. Lo que sirve es `environment`,
`services.database.database` y `services.database.connected`.

Y en el frontend, sobre lo ya desplegado:

```powershell
node continental-frontend\scripts\verificar-build.mjs prod \\slas052a\c$\<ruta del frontend>
```

Debe salir solo el puerto 5050.

### 6. Si algo salió mal

Cada corrida deja `<carpeta>.bak-<fecha>-<hora>` al lado. Para volver atrás:

```powershell
Stop-Website -Name '<sitio>'
robocopy '\\slas052a\c$\<ruta>.bak-20260901-1830' '\\slas052a\c$\<ruta>' /MIR
Start-Website -Name '<sitio>'
```

Ojo: el respaldo es de **archivos**, no de la base. Si ya corriste las
migraciones, volver el binario no las deshace — por eso conviene que los scripts
solo agreguen columnas y no quiten nada, como es el caso de éstos.

Borra los `.bak-*` cuando confirmes que el ambiente quedó bien; si no, se van
juntando en `C:\inetpub`.

---

## Resumen para pegar en un ticket

```
1. VerificarEsquemaBD.sql en FreeTime          -> todo 'ok'
2. merge fix/punchlist-batch-1 -> main
3. .\deploy\compilar-para-enviar.ps1 -Ambiente prod
4. .\deploy\enviar-al-servidor.ps1  -Ambiente prod -RutaApi ... -SitioApi ...
5. health status -> environment Production, db FreeTime
6. verificar-build.mjs prod sobre la carpeta del servidor -> solo 5050
```
