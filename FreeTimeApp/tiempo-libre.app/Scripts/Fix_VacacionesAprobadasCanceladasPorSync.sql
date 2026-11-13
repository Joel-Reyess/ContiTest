-- =============================================================================
-- Corrección (nov-2026): vacaciones aprobadas en la app que la sincronización
-- con SAP canceló porque el Excel las trajo en 0 días.
--
-- Caso 32813144 (TORRES ROJAS JOSE LUIS): le aprobaron en la app 07/11 -> 12/11,
-- 09/11 -> 13/11 y 10/11 -> 17/11. El Excel trajo el 12/11 y el 17/11 con
-- "Días = 0" y la sincronización los canceló (o los "movió" a otro día del
-- Excel), así que el calendario dejó de mostrarlos aunque estaban autorizados.
-- El backend corregido ya no lo hace; este script regresa los que ya pasaron.
--
-- Qué reactiva: una vacación Cancelada por la sincronización (Observaciones
-- "Cancelada por sincronización SAP..." o "Reprogramada por sincronización
-- SAP: el Excel reporta...") en un día que la app puso por una solicitud
-- APROBADA (reprogramación, festivo trabajado, vacación laborada,
-- post-incapacidad, edición o reprogramación de día empresa), siempre que ese
-- día el empleado no tenga ya otra vacación activa. Si el mismo día se canceló
-- más de una vez, se reactiva solo la más reciente.
--
-- Paso 1 solo muestra. Paso 2 reactiva (dentro de una transacción). Se puede
-- correr más de una vez: lo que ya está activo no se vuelve a tocar.
-- =============================================================================

SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#Aprobadas') IS NOT NULL DROP TABLE #Aprobadas;
CREATE TABLE #Aprobadas (EmpleadoId INT NOT NULL, Fecha DATE NOT NULL, Origen NVARCHAR(40) NOT NULL);

INSERT INTO #Aprobadas SELECT EmpleadoId, FechaNuevaSolicitada, 'Reprogramación'
FROM dbo.SolicitudesReprogramacion WHERE EstadoSolicitud = 'Aprobada';

IF OBJECT_ID('dbo.SolicitudesFestivosTrabajados') IS NOT NULL
    EXEC('INSERT INTO #Aprobadas SELECT EmpleadoId, FechaNuevaSolicitada, ''Festivo trabajado'' FROM dbo.SolicitudesFestivosTrabajados WHERE EstadoSolicitud = ''Aprobada''');
IF OBJECT_ID('dbo.SolicitudesVacacionLaborada') IS NOT NULL
    EXEC('INSERT INTO #Aprobadas SELECT EmpleadoId, FechaNueva, ''Vacación laborada'' FROM dbo.SolicitudesVacacionLaborada WHERE EstadoSolicitud = ''Aprobada''');
IF OBJECT_ID('dbo.SolicitudesReprogramacionPostIncapacidad') IS NOT NULL
    EXEC('INSERT INTO #Aprobadas SELECT EmpleadoId, FechaNueva, ''Post-incapacidad'' FROM dbo.SolicitudesReprogramacionPostIncapacidad WHERE EstadoSolicitud = ''Aprobada''');
IF OBJECT_ID('dbo.SolicitudesEdicionDiasEmpresa') IS NOT NULL
    EXEC('INSERT INTO #Aprobadas SELECT EmpleadoId, FechaNueva, ''Edición día empresa'' FROM dbo.SolicitudesEdicionDiasEmpresa WHERE EstadoSolicitud = ''Aprobada''');
IF OBJECT_ID('dbo.SolicitudesReprogramacionDiaEmpresa') IS NOT NULL
    EXEC('INSERT INTO #Aprobadas SELECT EmpleadoId, FechaNueva, ''Reprogramación día empresa'' FROM dbo.SolicitudesReprogramacionDiaEmpresa WHERE EstadoSolicitud = ''Aprobada''');

IF OBJECT_ID('tempdb..#Reactivar') IS NOT NULL DROP TABLE #Reactivar;
;WITH Candidatas AS (
    SELECT v.Id, v.EmpleadoId, v.FechaVacacion, v.Observaciones, v.UpdatedAt,
           ROW_NUMBER() OVER (PARTITION BY v.EmpleadoId, v.FechaVacacion
                              ORDER BY v.UpdatedAt DESC, v.Id DESC) AS n
    FROM dbo.VacacionesProgramadas v
    WHERE v.EstadoVacacion = 'Cancelada'
      AND (v.Observaciones LIKE 'Cancelada por sincronizaci%n SAP%'
           OR v.Observaciones LIKE 'Reprogramada por sincronizaci%n SAP: el Excel reporta%')
      AND EXISTS (SELECT 1 FROM #Aprobadas a
                  WHERE a.EmpleadoId = v.EmpleadoId AND a.Fecha = v.FechaVacacion)
      AND NOT EXISTS (SELECT 1 FROM dbo.VacacionesProgramadas o
                      WHERE o.EmpleadoId = v.EmpleadoId AND o.FechaVacacion = v.FechaVacacion
                        AND o.EstadoVacacion = 'Activa')
)
SELECT Id, EmpleadoId, FechaVacacion, Observaciones, UpdatedAt
INTO #Reactivar
FROM Candidatas WHERE n = 1;

-- Paso 1: qué se va a reactivar
SELECT u.Nomina, u.FullName AS Nombre, r.FechaVacacion, r.Observaciones AS ComoQuedo, r.UpdatedAt AS CanceladaEl
FROM #Reactivar r
JOIN dbo.Users u ON u.Id = r.EmpleadoId
ORDER BY u.Nomina, r.FechaVacacion;

-- Paso 2: reactivar
BEGIN TRANSACTION;

UPDATE v
SET v.EstadoVacacion = 'Activa',
    v.UpdatedAt = GETDATE(),
    v.Observaciones = LEFT(CONCAT('Reactivada (nov-2026): aprobada en la app; la sincronización SAP la había cancelado por venir en 0 días. Antes: ',
                                  v.Observaciones), 500)
FROM dbo.VacacionesProgramadas v
JOIN #Reactivar r ON r.Id = v.Id;

PRINT CONCAT(@@ROWCOUNT, ' vacación(es) reactivada(s).');

COMMIT TRANSACTION;

DROP TABLE #Reactivar;
DROP TABLE #Aprobadas;
