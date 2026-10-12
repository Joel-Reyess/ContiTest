# Regla: Excel de SAP vs. la app — "manda lo más reciente"

_Versión para validar con el cliente — octubre 2026._

## 1. Por qué hace falta

El acuerdo es que **el Excel de SAP manda**. Pero el Excel solo puede traer lo que
existía en SAP cuando RH lo exportó. Lo que se cambia en la app **después** de esa
carga (una reprogramación aprobada, un día de empresa movido por el superusuario,
una captura) el Excel todavía no lo conoce.

Con "solo manda el Excel" pasaba esto (32813149, octubre 2026):

- El superusuario movió su día de empresa del **12/10 al 20/09**.
- El **rol semanal** no ponía la V el 20/09, porque el Excel no la traía.
- El **calendario del empleado** seguía poniendo la V el 12/10, porque el Excel sí la traía.

Cada pantalla mostraba una parte distinta y ninguna mostraba lo correcto.

## 2. La regla

> **Para cada empleado y cada día, manda el dato más reciente.**
>
> - Si la app cambió ese día **después** de que llegó el Excel → manda la app.
> - Si el Excel llegó **después** del cambio en la app → manda el Excel.

Qué cuenta como "cambio de la app", con el momento que se toma:

| Movimiento en la app | Momento |
|---|---|
| Reprogramación de vacaciones aprobada por el jefe | Fecha de aprobación |
| Edición de días empresa | Fecha en que se guardó |
| Reprogramación de día empresa (superusuario) | Fecha de aprobación del jefe |
| Vacación capturada (operador en su bloque, jefe o superusuario) | Fecha de captura |
| Vacación cancelada | Fecha de cancelación |
| Permiso capturado por jefe / solicitud de delegado aprobada | Fecha de captura / aprobación |
| Festivo trabajado aprobado | Fecha de aprobación |

"Cuándo llegó el Excel" es la fecha de la carga en que entró cada fila.

## 3. Casos

| Situación | Qué se ve |
|---|---|
| El superusuario mueve un día de empresa del 12/10 al 20/09 **después** de la última carga | V el **20/09**; el 12/10 **sin** V |
| Igual, pero RH carga un Excel **después** del cambio y ese Excel no trae el 20/09 | Manda el Excel: el 20/09 **sin** V hasta que SAP lo traiga |
| El jefe aprueba una reprogramación 18/09 → 27/09 hoy; el Excel de ayer aún trae el 18/09 | V el **27/09**; el 18/09 **sin** V |
| SAP trae un día con **0 días** | No se cuenta como vacación (SAP dice que no consume) |
| SAP trae una vacación que en la app no existe y la app no tocó ese día | Manda el Excel: se ve la V |
| Fechas **posteriores** a la última carga del Excel | Se ve lo programado en la app (el Excel aún no habla de esas fechas) |

## 4. Pantallas que cubre

| Pantalla | ¿Usa la regla? |
|---|---|
| Rol semanal (pantalla y "Excel por semana / año completo") | **Sí** |
| Calendario del empleado: Mis vacaciones, Solicitar vacaciones, detalle del empleado en Plantilla (jefe, ingeniero, superusuario) | **Sí** |
| Listas "Vacaciones asignadas / seleccionadas" del empleado | No: muestran lo que tiene la app |
| Dashboard de programación anual, reportes y dashboard de tiempo extra/ausencias | No: cuentan lo que tiene la app |

**Pendiente de decidir:** si las listas, el dashboard y los reportes también deben
seguir esta regla.

## 5. Lo que la regla NO hace

- **No borra ni cambia datos.** Solo decide qué se muestra. SAP y la base quedan igual.
- **No corrige SAP.** Si en SAP hay un día que no corresponde, RH lo tiene que dejar
  en 0 días; la siguiente carga lo refleja.
- **No pone tope por antigüedad** a lo que trae el Excel (eso es otra decisión
  pendiente: la sincronización sigue dando de alta lo que trae el Excel).

**Límite conocido:** si una fila del Excel llega **igual** en cargas posteriores
(sin ningún cambio), la app conserva la fecha de su primera carga. Si la app movió
ese día después, la app sigue mandando hasta que SAP **cambie** esa fila (por
ejemplo, a 0 días).

## 6. Guion de prueba en TEST

Antes de probar: confirmar que TEST tiene la versión nueva (menú del usuario →
"Versión …" y `api/Health/status` → `build`), y que el periodo está abierto.

1. **Día de empresa movido (13149 o cualquier operador).**
   Superusuario → Vacaciones → Edición días empresa: mover un día de empresa a otra
   fecha. Revisar:
   - Rol semanal de la semana de la fecha nueva: **V**.
   - Rol semanal de la semana de la fecha original: **sin V**.
   - Calendario del empleado (Plantilla → empleado): igual que el rol.
2. **Reprogramación aprobada.**
   Delegado solicita mover un día; el jefe la aprueba. Revisar lo mismo que en 1.
3. **El Excel manda cuando es más nuevo.**
   Cargar un Excel después del paso 1 que **no** traiga la fecha nueva. Revisar que
   el rol de esa fecha ya **no** muestre la V (manda el Excel).

Si algún caso no da lo esperado: enviar nómina, fecha, pantalla y la versión que
muestra el menú.
