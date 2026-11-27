-- =============================================================================
-- LIMPIEZA: días de 2027 capturados FUERA DE TURNO (27-nov-2026, productivo)
--
-- Desde el 27-nov la captura ya está abierta: lo que un operador capturó EN SU
-- TURNO es legítimo y NO se toca. Ojo: en el Excel la captura normal del
-- operador también sale con "Origen Asignación = Manual"; eso no la hace mala.
--
-- Se quita (con respaldo) solo lo que se capturó ANTES de tiempo:
--   * OPERADOR (lo capturó en su pantalla): antes de que empezara su primer
--     bloque de 2027, o su grupo no tiene bloques de 2027.
--   * MANUAL (Anual capturado por jefe / superusuario / ingeniero): antes de que
--     empezara el primer bloque de 2027 de su grupo, o el grupo no tiene bloques.
-- No toca días por la empresa, intercambios de festivo, SAP ni reprogramaciones.
-- No borra un día con una solicitud ligada (se lista aparte).
-- A quien se queda sin días capturados le regresa el turno a "Asignado".
--
-- Correr conectado a la base de PRODUCTIVO. Con @Aplicar = 1 BORRA y deja
-- respaldo en dbo.Respaldo_FueraDeTurno_<fecha_hora>. Al final debe decir
-- "APLICADO: ...". Volver a correrlo no hace daño.
-- Las horas: la captura del operador se guarda en UTC (México = UTC-6); la del
-- jefe y los bloques, en hora de México.
-- =============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Anio INT = 2027;
DECLARE @HorasUTC INT = -6;        -- hora de México respecto a UTC
-- Opcional: solo estas nóminas, separadas por coma ('' = todas).
DECLARE @SoloNominas NVARCHAR(MAX) = N'';
-- 0 = solo mostrar (no cambia nada). 1 = respaldar y borrar.
DECLARE @Aplicar BIT = 1;

IF OBJECT_ID('tempdb..#Capturas') IS NOT NULL DROP TABLE #Capturas;

-- Todo lo Anual activo de 2027 con su hora de captura (en hora de México) y
-- cuándo podía capturarse.
SELECT v.Id, v.EmpleadoId, u.Nomina, u.FullName, a.NombreGeneral AS Area, g.Rol AS Grupo, u.GrupoId,
       v.FechaVacacion, v.CreatedAt, v.CreatedBy, cb.FullName AS CapturadoPor,
       CASE WHEN v.CreatedBy IS NULL THEN 'OPERADOR' ELSE 'MANUAL' END AS Origen,
       CASE WHEN v.CreatedBy IS NULL THEN DATEADD(HOUR, @HorasUTC, v.CreatedAt) ELSE v.CreatedAt END AS CapturadoHoraMexico,
       (SELECT MIN(b.FechaHoraInicio) FROM dbo.BloquesReservacion b
         WHERE b.GrupoId = u.GrupoId AND b.AnioGeneracion = @Anio AND b.Estado <> 'Cancelado') AS AbreGrupo,
       (SELECT MIN(b.FechaHoraInicio) FROM dbo.AsignacionesBloque ab
          JOIN dbo.BloquesReservacion b ON b.Id = ab.BloqueId
         WHERE ab.EmpleadoId = v.EmpleadoId AND b.AnioGeneracion = @Anio AND b.Estado <> 'Cancelado') AS AbreSuTurno,
       CAST(NULL AS DATETIME2) AS PodiaDesde,
       CAST(NULL AS NVARCHAR(200)) AS LigadaA
INTO #Capturas
FROM dbo.VacacionesProgramadas v
JOIN dbo.Users u ON u.Id = v.EmpleadoId
LEFT JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
LEFT JOIN dbo.Areas a ON a.AreaId = u.AreaId
LEFT JOIN dbo.Users cb ON cb.Id = v.CreatedBy
WHERE v.EstadoVacacion = 'Activa'
  AND v.TipoVacacion = 'Anual'
  AND (v.CreatedBy IS NOT NULL OR v.PeriodoProgramacion = 'ProgramacionAnual')
  AND v.FechaVacacion >= DATEFROMPARTS(@Anio, 1, 1)
  AND v.FechaVacacion <= DATEFROMPARTS(@Anio, 12, 31)
  AND (@SoloNominas = N'' OR N',' + REPLACE(@SoloNominas, N' ', N'') + N',' LIKE N'%,' + CAST(u.Nomina AS NVARCHAR(20)) + N',%');

-- Operador: desde su propio turno (o el primero del grupo si no tiene uno).
-- Jefe / superusuario: desde que abre el grupo.
UPDATE #Capturas
SET PodiaDesde = CASE WHEN Origen = 'OPERADOR' THEN COALESCE(AbreSuTurno, AbreGrupo) ELSE AbreGrupo END;

-- Días con una solicitud ligada: no se borran (quedan para revisarlos a mano).
DECLARE @Refs TABLE (Esquema SYSNAME, Tabla SYSNAME, Columna SYSNAME);
INSERT @Refs VALUES
    ('dbo', 'SolicitudesReprogramacion', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesEdicionDiasEmpresa', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesReprogramacionPostIncapacidad', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesVacacionLaborada', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesReprogramacionDiaEmpresa', 'VacacionOriginalId'),
    ('dbo', 'SolicitudesFestivosTrabajados', 'VacacionCreadaId');
INSERT @Refs
SELECT SCHEMA_NAME(t.schema_id), t.name, c.name
FROM sys.foreign_key_columns fkc
JOIN sys.tables t ON t.object_id = fkc.parent_object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
WHERE fkc.referenced_object_id = OBJECT_ID('dbo.VacacionesProgramadas')
  AND NOT EXISTS (SELECT 1 FROM @Refs r WHERE r.Esquema = SCHEMA_NAME(t.schema_id) AND r.Tabla = t.name AND r.Columna = c.name);

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'UPDATE c SET LigadaA = ''' + Tabla + N'.' + Columna + N''' FROM #Capturas c '
             + N'WHERE c.LigadaA IS NULL AND EXISTS (SELECT 1 FROM ' + QUOTENAME(Esquema) + N'.' + QUOTENAME(Tabla)
             + N' x WHERE x.' + QUOTENAME(Columna) + N' = c.Id);' + NCHAR(10)
FROM @Refs
WHERE COL_LENGTH(QUOTENAME(Esquema) + N'.' + QUOTENAME(Tabla), Columna) IS NOT NULL;
IF @sql <> N'' EXEC sp_executesql @sql;

IF OBJECT_ID('tempdb..#Quitar') IS NOT NULL DROP TABLE #Quitar;
SELECT * INTO #Quitar
FROM #Capturas
WHERE LigadaA IS NULL
  AND (PodiaDesde IS NULL OR CapturadoHoraMexico < PodiaDesde);

PRINT '=== (1) Resumen: fuera de turno (se quitan) vs en su turno (legítimos, NO se tocan) ===';
SELECT CASE WHEN q.Id IS NOT NULL THEN '1. FUERA DE TURNO: se quita'
            WHEN c.LigadaA IS NOT NULL THEN '3. Tiene solicitud ligada: revisar a mano'
            ELSE '2. En su turno: legítimo, no se toca' END AS Resultado,
       c.Origen, COUNT(*) AS Dias, COUNT(DISTINCT c.EmpleadoId) AS Empleados,
       MIN(c.CapturadoHoraMexico) AS PrimeraCaptura, MAX(c.CapturadoHoraMexico) AS UltimaCaptura
FROM #Capturas c
LEFT JOIN #Quitar q ON q.Id = c.Id
GROUP BY CASE WHEN q.Id IS NOT NULL THEN '1. FUERA DE TURNO: se quita'
              WHEN c.LigadaA IS NOT NULL THEN '3. Tiene solicitud ligada: revisar a mano'
              ELSE '2. En su turno: legítimo, no se toca' END, c.Origen
ORDER BY 1, 2;

PRINT '=== (2) Detalle de lo que se quita (por empleado) ===';
SELECT Nomina, FullName, Area, Grupo, Origen, ISNULL(CapturadoPor, '(el operador)') AS CapturadoPor,
       COUNT(*) AS Dias, MIN(CapturadoHoraMexico) AS CapturadoEl, MIN(PodiaDesde) AS PodiaCapturarDesde,
       CASE WHEN MIN(PodiaDesde) IS NULL THEN 'Su grupo no tiene bloques de ' + CAST(@Anio AS VARCHAR(4)) ELSE 'Antes de su turno' END AS Motivo
FROM #Quitar
GROUP BY Nomina, FullName, Area, Grupo, Origen, CapturadoPor
ORDER BY Area, Grupo, Nomina;

PRINT '=== (3) Con solicitud ligada: no se tocan (revisar a mano) ===';
SELECT Id, Nomina, FullName, FechaVacacion, Origen, CapturadoHoraMexico, PodiaDesde, LigadaA
FROM #Capturas
WHERE LigadaA IS NOT NULL AND (PodiaDesde IS NULL OR CapturadoHoraMexico < PodiaDesde)
ORDER BY Nomina, FechaVacacion;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @HayQueBorrar BIT = CASE WHEN EXISTS (SELECT 1 FROM #Quitar) THEN 1 ELSE 0 END;
    DECLARE @Respaldo SYSNAME = N'Respaldo_FueraDeTurno_' + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss');
    IF @Aplicar = 1 AND @HayQueBorrar = 1
    BEGIN
        SET @sql = N'SELECT v.* INTO dbo.' + QUOTENAME(@Respaldo) + N' FROM dbo.VacacionesProgramadas v '
                 + N'WHERE v.Id IN (SELECT Id FROM #Quitar);';
        EXEC sp_executesql @sql;
    END

    DECLARE @Afectados TABLE (EmpleadoId INT PRIMARY KEY);
    INSERT @Afectados SELECT DISTINCT EmpleadoId FROM #Quitar;

    DELETE v FROM dbo.VacacionesProgramadas v JOIN #Quitar q ON q.Id = v.Id;
    DECLARE @Borrados INT = @@ROWCOUNT;

    -- Quien se quedó sin días capturados del año vuelve a tener su turno abierto.
    UPDATE ab
    SET ab.Estado = 'Asignado', ab.FechaCompletado = NULL,
        ab.Observaciones = LEFT(ISNULL(ab.Observaciones + ' | ', '')
            + 'Regresado a Asignado: se quitaron días capturados fuera de turno (' + CONVERT(VARCHAR(16), GETDATE(), 120) + ')', 500)
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
        PRINT CONCAT('APLICADO: ', @Borrados, ' días fuera de turno borrados (',
                     CASE WHEN @HayQueBorrar = 1 THEN 'respaldo en dbo.' + @Respaldo ELSE 'no había nada que quitar' END,
                     '); ', @Turnos, ' turnos de captura regresados a Asignado. Lo capturado en su turno no se tocó.');
    END
    ELSE
    BEGIN
        ROLLBACK TRANSACTION;
        PRINT CONCAT('SOLO VISTA PREVIA (no se cambió nada): se borrarían ', @Borrados, ' días y ',
                     @Turnos, ' turnos regresarían a Asignado. Para aplicarlo pon @Aplicar = 1.');
    END
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT CONCAT('ERROR, no se cambió nada: ', ERROR_MESSAGE());
    THROW;
END CATCH;

DROP TABLE #Quitar;
DROP TABLE #Capturas;
