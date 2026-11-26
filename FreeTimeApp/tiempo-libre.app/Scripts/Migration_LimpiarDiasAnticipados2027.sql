-- =============================================================================
-- LIMPIEZA: quitar los días de 2027 que aparecieron como "programados por el
-- empleado" ANTES de que abriera la captura (26-nov-2026, productivo).
--
-- VERSIÓN LISTA PARA APLICAR (@Aplicar = 1): al correrla BORRA. Correr UNA vez,
-- conectado a la base de PRODUCTIVO. Es la misma lógica de
-- LimpiarDiasAnticipados.sql (raíz del repo), que trae @Aplicar = 0 para ver
-- antes qué se quitaría. Volver a correrla no hace daño: ya no encuentra nada.
-- Al final debe decir "APLICADO: N días borrados (respaldo en dbo.Respaldo_...)".
-- Este script:
--   * Con @Aplicar = 0 NO cambia nada: muestra qué quitaría y deshace.
--   * Con @Aplicar = 1: respalda las filas en una tabla nueva
--     dbo.Respaldo_VacacionesAnticipadas_<fecha_hora>, las borra y regresa a
--     "Asignado" el turno de captura de quien se quedó sin días capturados (para
--     que pueda capturar en su turno).
--   * Nunca toca los días por la empresa de la asignación automática. Los días
--     por la empresa que un jefe / superusuario capturó A MANO (origen
--     EMPRESA_MANUAL) solo se quitan con @QuitarEmpresaManual = 1.
--   * Solo toca días activos: lo cancelado ya no cuenta en ningún lado (desde
--     el 26-nov tampoco sale en el Excel "Vacaciones Programadas por Área").
--   * No borra un día que tenga una solicitud ligada (reprogramación, festivo,
--     edición de día empresa, etc.): esos se listan aparte para revisarlos.
-- Orígenes (los mismos del diagnóstico): OPERADOR, MANUAL, EMPRESA_MANUAL, SAP_ALTA, SAP_MOVIDA,
-- SAP_RETENIDA, FESTIVO, REPROGRAMACION, VAC_LABORADA, OTRO.
--
-- OJO: si estos días ya se subieron a SAP con el "Reporte SAP Vacaciones
-- Anuales", también hay que quitarlos en SAP; si no, la sincronización del
-- Excel de permisos los vuelve a dar de alta (origen SAP_ALTA).
-- =============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Anio INT = 2027;
-- Solo días capturados antes de esto (la captura de los operadores abre el 27-nov).
DECLARE @InicioCaptura DATETIME = '2026-11-27 00:00';
-- Qué orígenes se quitan (1 = sí). Ver el diagnóstico antes de cambiarlos.
DECLARE @QuitarOperador BIT = 1;   -- capturados por el operador en su pantalla
DECLARE @QuitarManual BIT = 1;     -- capturados por jefe / superusuario / ingeniero
DECLARE @QuitarEmpresaManual BIT = 0; -- días por la empresa capturados a mano por jefe / superusuario
DECLARE @QuitarSap BIT = 0;        -- SAP_ALTA, SAP_MOVIDA, SAP_RETENIDA
DECLARE @QuitarFestivo BIT = 0;    -- intercambios de festivo trabajado (suelen ser legítimos)
DECLARE @QuitarOtros BIT = 0;      -- REPROGRAMACION, VAC_LABORADA, OTRO
-- Opcional: solo estas nóminas, separadas por coma ('' = todas).
DECLARE @SoloNominas NVARCHAR(MAX) = N'';
-- 0 = solo mostrar (no cambia nada). 1 = respaldar y borrar.
DECLARE @Aplicar BIT = 1;

IF OBJECT_ID('tempdb..#Candidatos') IS NOT NULL DROP TABLE #Candidatos;

SELECT v.Id, v.EmpleadoId, u.Nomina, u.FullName, a.NombreGeneral AS Area, g.Rol AS Grupo,
       v.FechaVacacion, v.TipoVacacion, v.OrigenAsignacion, v.PeriodoProgramacion, v.CreatedAt, v.CreatedBy, v.Observaciones,
       CASE
           WHEN v.TipoVacacion = 'Automatica' THEN 'EMPRESA_MANUAL'
           WHEN v.Observaciones LIKE 'Alta por sincroniza%SAP retenida%' THEN 'SAP_RETENIDA'
           WHEN v.Observaciones LIKE 'Alta por sincroniza%SAP%' THEN 'SAP_ALTA'
           WHEN v.Observaciones LIKE 'Reprogramada por sincroniza%SAP%' THEN 'SAP_MOVIDA'
           WHEN v.TipoVacacion = 'FestivoTrabajado' THEN 'FESTIVO'
           WHEN v.TipoVacacion = 'VacacionLaborada' THEN 'VAC_LABORADA'
           WHEN v.TipoVacacion = 'Reprogramacion' OR v.PeriodoProgramacion = 'Reprogramacion' THEN 'REPROGRAMACION'
           WHEN v.CreatedBy IS NOT NULL THEN 'MANUAL'
           WHEN v.TipoVacacion = 'Anual' AND v.PeriodoProgramacion = 'ProgramacionAnual' THEN 'OPERADOR'
           ELSE 'OTRO'
       END AS Origen,
       CAST(NULL AS NVARCHAR(200)) AS LigadaA
INTO #Candidatos
FROM dbo.VacacionesProgramadas v
JOIN dbo.Users u ON u.Id = v.EmpleadoId
LEFT JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
LEFT JOIN dbo.Areas a ON a.AreaId = u.AreaId
WHERE v.EstadoVacacion = 'Activa'
  -- De la empresa, solo lo capturado a mano (lo de la asignación automática nunca).
  AND (v.TipoVacacion <> 'Automatica' OR v.OrigenAsignacion = 'Manual' OR v.CreatedBy IS NOT NULL)
  AND v.FechaVacacion >= DATEFROMPARTS(@Anio, 1, 1)
  AND v.FechaVacacion <= DATEFROMPARTS(@Anio, 12, 31)
  AND v.CreatedAt < @InicioCaptura
  AND (@SoloNominas = N'' OR N',' + REPLACE(@SoloNominas, N' ', N'') + N',' LIKE N'%,' + CAST(u.Nomina AS NVARCHAR(20)) + N',%');

-- Solo los orígenes elegidos.
DELETE FROM #Candidatos
WHERE NOT (
       (@QuitarOperador = 1 AND Origen = 'OPERADOR')
    OR (@QuitarManual = 1 AND Origen = 'MANUAL')
    OR (@QuitarEmpresaManual = 1 AND Origen = 'EMPRESA_MANUAL')
    OR (@QuitarSap = 1 AND Origen IN ('SAP_ALTA', 'SAP_MOVIDA', 'SAP_RETENIDA'))
    OR (@QuitarFestivo = 1 AND Origen = 'FESTIVO')
    OR (@QuitarOtros = 1 AND Origen IN ('REPROGRAMACION', 'VAC_LABORADA', 'OTRO')));

-- Días con una solicitud ligada: no se borran (quedan para revisarlos a mano).
DECLARE @Refs TABLE (Esquema SYSNAME, Tabla SYSNAME, Columna SYSNAME);
INSERT @Refs VALUES
    ('dbo', 'SolicitudesReprogramacion', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesEdicionDiasEmpresa', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesReprogramacionPostIncapacidad', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesVacacionLaborada', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesReprogramacionDiaEmpresa', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesFestivosTrabajados', 'VacacionCreadaId');
-- Más cualquier otra llave foránea que apunte a VacacionesProgramadas.
INSERT @Refs
SELECT SCHEMA_NAME(t.schema_id), t.name, c.name
FROM sys.foreign_key_columns fkc
JOIN sys.tables t ON t.object_id = fkc.parent_object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
WHERE fkc.referenced_object_id = OBJECT_ID('dbo.VacacionesProgramadas')
  AND NOT EXISTS (SELECT 1 FROM @Refs r WHERE r.Esquema = SCHEMA_NAME(t.schema_id) AND r.Tabla = t.name AND r.Columna = c.name);

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'UPDATE c SET LigadaA = ''' + Tabla + N'.' + Columna + N''' FROM #Candidatos c '
             + N'WHERE c.LigadaA IS NULL AND EXISTS (SELECT 1 FROM ' + QUOTENAME(Esquema) + N'.' + QUOTENAME(Tabla)
             + N' x WHERE x.' + QUOTENAME(Columna) + N' = c.Id);' + NCHAR(10)
FROM @Refs
WHERE COL_LENGTH(QUOTENAME(Esquema) + N'.' + QUOTENAME(Tabla), Columna) IS NOT NULL;
IF @sql <> N'' EXEC sp_executesql @sql;

PRINT '=== (1) Lo que se quitaría, por origen ===';
SELECT Origen, TipoVacacion, COUNT(*) AS Dias, COUNT(DISTINCT EmpleadoId) AS Empleados,
       SUM(CASE WHEN LigadaA IS NULL THEN 1 ELSE 0 END) AS SeQuitan,
       SUM(CASE WHEN LigadaA IS NULL THEN 0 ELSE 1 END) AS NoSeTocanPorSolicitud
FROM #Candidatos
GROUP BY Origen, TipoVacacion
ORDER BY Origen;

PRINT '=== (2) Detalle de lo que se quitaría ===';
SELECT Id, Nomina, FullName, Area, Grupo, FechaVacacion, Origen, TipoVacacion, OrigenAsignacion, CreatedAt, Observaciones
FROM #Candidatos
WHERE LigadaA IS NULL
ORDER BY Area, Grupo, Nomina, FechaVacacion;

PRINT '=== (3) No se tocan: tienen una solicitud ligada (revisar a mano) ===';
SELECT Id, Nomina, FullName, FechaVacacion, Origen, TipoVacacion, LigadaA
FROM #Candidatos
WHERE LigadaA IS NOT NULL
ORDER BY Nomina, FechaVacacion;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Respaldo SYSNAME = N'Respaldo_VacacionesAnticipadas_' + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss');
    IF @Aplicar = 1
    BEGIN
        SET @sql = N'SELECT v.* INTO dbo.' + QUOTENAME(@Respaldo) + N' FROM dbo.VacacionesProgramadas v '
                 + N'WHERE v.Id IN (SELECT Id FROM #Candidatos WHERE LigadaA IS NULL);';
        EXEC sp_executesql @sql;
    END

    DECLARE @Afectados TABLE (EmpleadoId INT PRIMARY KEY);
    INSERT @Afectados SELECT DISTINCT EmpleadoId FROM #Candidatos WHERE LigadaA IS NULL;

    DELETE v
    FROM dbo.VacacionesProgramadas v
    JOIN #Candidatos c ON c.Id = v.Id
    WHERE c.LigadaA IS NULL;
    DECLARE @Borrados INT = @@ROWCOUNT;

    -- Quien se quedó sin días capturados del año vuelve a tener su turno abierto.
    UPDATE ab
    SET ab.Estado = 'Asignado', ab.FechaCompletado = NULL,
        ab.Observaciones = LEFT(ISNULL(ab.Observaciones + ' | ', '')
            + 'Regresado a Asignado: se quitaron días capturados antes de abrir la captura (' + CONVERT(VARCHAR(16), GETDATE(), 120) + ')', 500)
    FROM dbo.AsignacionesBloque ab
    JOIN dbo.BloquesReservacion b ON b.Id = ab.BloqueId
    JOIN @Afectados af ON af.EmpleadoId = ab.EmpleadoId
    WHERE b.AnioGeneracion = @Anio
      AND ab.Estado = 'Reservado'
      AND NOT EXISTS (SELECT 1 FROM dbo.VacacionesProgramadas v
                      WHERE v.EmpleadoId = ab.EmpleadoId AND v.TipoVacacion = 'Anual' AND v.EstadoVacacion = 'Activa'
                        AND v.FechaVacacion >= DATEFROMPARTS(@Anio, 1, 1) AND v.FechaVacacion <= DATEFROMPARTS(@Anio, 12, 31));
    DECLARE @Turnos INT = @@ROWCOUNT;

    IF @Aplicar = 1
    BEGIN
        COMMIT TRANSACTION;
        PRINT CONCAT('APLICADO: ', @Borrados, ' días borrados (respaldo en dbo.', @Respaldo, '); ',
                     @Turnos, ' turnos de captura regresados a Asignado.');
    END
    ELSE
    BEGIN
        ROLLBACK TRANSACTION;
        PRINT CONCAT('SOLO VISTA PREVIA (no se cambió nada): se borrarían ', @Borrados, ' días y ',
                     @Turnos, ' turnos de captura regresarían a Asignado. Para aplicarlo pon @Aplicar = 1.');
    END
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT CONCAT('ERROR, no se cambió nada: ', ERROR_MESSAGE());
    THROW;
END CATCH;

DROP TABLE #Candidatos;
