-- =============================================================================
-- QUITAR UN DÍA DE VACACIÓN DE UN EMPLEADO (26-nov-2026, productivo)
--
-- Pedido del cliente: quitar el 02/03/2027 de la nómina 32009613 (Martínez
-- Martínez Rubén David). Ese día es un intercambio del festivo trabajado del
-- 02/02/2026 (solicitud 16, aprobada el 16/04/2026).
--
-- Qué hace (correr conectado a la base de PRODUCTIVO; con @Aplicar = 1 BORRA):
--   * Respalda la fila en dbo.Respaldo_QuitarDiaVacacion_<fecha_hora>.
--   * Borra el día de VacacionesProgramadas.
--   * Si es un intercambio de festivo: la solicitud queda "Rechazada" y sin
--     día, y el festivo vuelve a estar disponible para pedirlo de nuevo.
--   * Si el día tiene otra solicitud ligada (reprogramación, etc.) NO borra
--     nada y lo dice.
-- Al final debe decir "APLICADO: ...". Correrlo dos veces no hace daño: la
-- segunda dice que ya no hay nada que quitar.
-- =============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Nomina INT = 32009613;
DECLARE @Fecha DATE = '2027-03-02';
-- 0 = solo mostrar (no cambia nada). 1 = respaldar y borrar.
DECLARE @Aplicar BIT = 1;

IF OBJECT_ID('tempdb..#Dia') IS NOT NULL DROP TABLE #Dia;

SELECT v.Id, v.EmpleadoId, u.Nomina, u.FullName, v.FechaVacacion, v.TipoVacacion,
       v.EstadoVacacion, v.CreatedAt, v.CreatedBy, v.Observaciones,
       CAST(NULL AS NVARCHAR(200)) AS LigadaA
INTO #Dia
FROM dbo.VacacionesProgramadas v
JOIN dbo.Users u ON u.Id = v.EmpleadoId
WHERE u.Nomina = @Nomina
  AND v.FechaVacacion = @Fecha
  AND v.EstadoVacacion = 'Activa';

-- ¿Otra solicitud ligada al día? (la del intercambio de festivo se atiende abajo)
DECLARE @Refs TABLE (Esquema SYSNAME, Tabla SYSNAME, Columna SYSNAME);
INSERT @Refs
SELECT SCHEMA_NAME(t.schema_id), t.name, c.name
FROM sys.foreign_key_columns fkc
JOIN sys.tables t ON t.object_id = fkc.parent_object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
WHERE fkc.referenced_object_id = OBJECT_ID('dbo.VacacionesProgramadas')
  AND NOT (t.name = 'SolicitudesFestivosTrabajados' AND c.name = 'VacacionCreadaId');
INSERT @Refs
SELECT 'dbo', x.Tabla, 'VacacionOriginalId'
FROM (VALUES ('SolicitudesReprogramacion'), ('SolicitudesEdicionDiasEmpresa'),
             ('SolicitudesReprogramacionPostIncapacidad'), ('SolicitudesVacacionLaborada'),
             ('SolicitudesReprogramacionDiaEmpresa')) x(Tabla)
WHERE NOT EXISTS (SELECT 1 FROM @Refs r WHERE r.Tabla = x.Tabla AND r.Columna = 'VacacionOriginalId');

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'UPDATE d SET LigadaA = ''' + Tabla + N'.' + Columna + N''' FROM #Dia d '
             + N'WHERE d.LigadaA IS NULL AND EXISTS (SELECT 1 FROM ' + QUOTENAME(Esquema) + N'.' + QUOTENAME(Tabla)
             + N' x WHERE x.' + QUOTENAME(Columna) + N' = d.Id);' + NCHAR(10)
FROM @Refs
WHERE COL_LENGTH(QUOTENAME(Esquema) + N'.' + QUOTENAME(Tabla), Columna) IS NOT NULL;
IF @sql <> N'' EXEC sp_executesql @sql;

PRINT '=== Día encontrado ===';
SELECT * FROM #Dia;

PRINT '=== Solicitud de intercambio de festivo ligada (si la hay) ===';
SELECT s.Id, s.FestivoOriginal, s.FechaNuevaSolicitada, s.EstadoSolicitud, s.VacacionCreadaId
FROM dbo.SolicitudesFestivosTrabajados s
JOIN #Dia d ON d.Id = s.VacacionCreadaId;

DECLARE @Encontrados INT = (SELECT COUNT(*) FROM #Dia);
DECLARE @Ligados INT = (SELECT COUNT(*) FROM #Dia WHERE LigadaA IS NOT NULL);
DECLARE @LigadaA NVARCHAR(200) = (SELECT TOP 1 LigadaA FROM #Dia WHERE LigadaA IS NOT NULL);

IF @Encontrados = 0
BEGIN
    PRINT CONCAT('No hay nada que quitar: la nómina ', @Nomina, ' no tiene un día activo el ', CONVERT(VARCHAR(10), @Fecha, 103), '.');
END
ELSE IF @Ligados > 0
BEGIN
    PRINT CONCAT('NO SE BORRÓ NADA: el día tiene una solicitud ligada (', @LigadaA, '). Mándame este resultado.');
END
ELSE
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Respaldo SYSNAME = N'Respaldo_QuitarDiaVacacion_' + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss');
        IF @Aplicar = 1
        BEGIN
            SET @sql = N'SELECT v.* INTO dbo.' + QUOTENAME(@Respaldo) + N' FROM dbo.VacacionesProgramadas v WHERE v.Id IN (SELECT Id FROM #Dia);';
            EXEC sp_executesql @sql;
        END

        -- El intercambio de festivo queda "Rechazado" y sin día: se puede volver a pedir.
        UPDATE s
        SET s.EstadoSolicitud = 'Rechazada', s.VacacionCreadaId = NULL,
            s.MotivoRechazo = LEFT(ISNULL(s.MotivoRechazo + ' | ', '')
                + 'Cancelada a pedido de RH: se quitó el día ' + CONVERT(VARCHAR(10), @Fecha, 103)
                + ' (' + CONVERT(VARCHAR(16), GETDATE(), 120) + '). El festivo se puede volver a solicitar.', 500)
        FROM dbo.SolicitudesFestivosTrabajados s
        JOIN #Dia d ON d.Id = s.VacacionCreadaId;
        DECLARE @Solicitudes INT = @@ROWCOUNT;

        DELETE v FROM dbo.VacacionesProgramadas v JOIN #Dia d ON d.Id = v.Id;
        DECLARE @Borrados INT = @@ROWCOUNT;

        IF @Aplicar = 1
        BEGIN
            COMMIT TRANSACTION;
            PRINT CONCAT('APLICADO: ', @Borrados, ' día(s) borrado(s) (respaldo en dbo.', @Respaldo, '); ',
                         @Solicitudes, ' solicitud(es) de festivo reabierta(s).');
        END
        ELSE
        BEGIN
            ROLLBACK TRANSACTION;
            PRINT CONCAT('SOLO VISTA PREVIA (no se cambió nada): se borrarían ', @Borrados, ' día(s) y se reabrirían ',
                         @Solicitudes, ' solicitud(es) de festivo. Para aplicarlo pon @Aplicar = 1.');
        END
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT CONCAT('ERROR, no se cambió nada: ', ERROR_MESSAGE());
        THROW;
    END CATCH
END

DROP TABLE #Dia;
