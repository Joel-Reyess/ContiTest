-- =============================================================================
-- Migración CONSOLIDADA — pendientes de aplicar en productivo (2026-07-14).
-- Todas las migraciones son idempotentes: se pueden re-correr sin efectos.
--
-- Orden de aplicación (importante por FK):
--   1. Migration_ReglasTurnoEstado          — columna Estado en ReglasTurno
--   2. Migration_RotacionesReglaProgramadas — tabla + columna PatronBaseline
--   3. Migration_AreaJefes                  — tabla + data migration inicial
--   4. Migration_SolicitudesVacacionLaborada — tabla nueva
--
-- Uso: pégalo en SSMS conectado a la BD productiva y F5. Al terminar deja
-- ver la sección "RESUMEN FINAL" con el estado de cada tabla/columna.
-- =============================================================================

PRINT '=====================================================';
PRINT '  Migración consolidada ContiTest — inicio';
PRINT '=====================================================';

-------------------------------------------------------------------------------
-- 1) ReglasTurno.Estado  (task #85 — panel de reglas pendientes)
-------------------------------------------------------------------------------
PRINT '';
PRINT '--- (1) ReglasTurno.Estado ---';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = 'Estado' AND Object_ID = Object_ID('dbo.ReglasTurno')
)
BEGIN
    ALTER TABLE [dbo].[ReglasTurno]
        ADD [Estado] NVARCHAR(30) NOT NULL DEFAULT 'Activa';
    PRINT '  ✔ Columna Estado agregada a ReglasTurno (default Activa).';
END
ELSE
BEGIN
    PRINT '  = La columna Estado ya existe en ReglasTurno.';
END

-------------------------------------------------------------------------------
-- 2) RotacionesReglaProgramadas  (tasks #82 + #84 — programación anual)
-------------------------------------------------------------------------------
PRINT '';
PRINT '--- (2) RotacionesReglaProgramadas ---';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RotacionesReglaProgramadas')
BEGIN
    CREATE TABLE [dbo].[RotacionesReglaProgramadas] (
        [Id]                 INT             IDENTITY(1,1) PRIMARY KEY,
        [CodigoRegla]        NVARCHAR(20)    NOT NULL,
        [FechaEjecucion]     DATE            NOT NULL,
        [DiasRotacion]       INT             NOT NULL DEFAULT 7,
        [Estado]             NVARCHAR(20)    NOT NULL DEFAULT 'Pendiente',
        [CreatedByUserId]    INT             NOT NULL,
        [CreatedAt]          DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [FechaEjecutadaReal] DATETIME2       NULL,
        [MensajeError]       NVARCHAR(500)   NULL,
        [Notas]              NVARCHAR(500)   NULL,

        CONSTRAINT FK_RRP_Regla FOREIGN KEY ([CodigoRegla])
            REFERENCES [dbo].[ReglasTurno] ([Codigo])  ON DELETE NO ACTION,
        CONSTRAINT FK_RRP_CreatedBy FOREIGN KEY ([CreatedByUserId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION
    );

    CREATE INDEX IX_RRP_EstadoFecha ON [dbo].[RotacionesReglaProgramadas] ([Estado], [FechaEjecucion]);
    CREATE INDEX IX_RRP_ReglaFecha  ON [dbo].[RotacionesReglaProgramadas] ([CodigoRegla], [FechaEjecucion]);

    PRINT '  ✔ Tabla RotacionesReglaProgramadas creada.';
END
ELSE
BEGIN
    PRINT '  = La tabla RotacionesReglaProgramadas ya existe.';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
     WHERE Name = 'PatronBaseline' AND Object_ID = Object_ID('RotacionesReglaProgramadas')
)
BEGIN
    ALTER TABLE [dbo].[RotacionesReglaProgramadas]
    ADD [PatronBaseline] NVARCHAR(MAX) NULL;
    PRINT '  ✔ Columna PatronBaseline agregada.';
END
ELSE
BEGIN
    PRINT '  = Columna PatronBaseline ya existe.';
END

-------------------------------------------------------------------------------
-- 3) AreaJefes  (task #83 — multi-jefes por área)
-------------------------------------------------------------------------------
PRINT '';
PRINT '--- (3) AreaJefes ---';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AreaJefes')
BEGIN
    CREATE TABLE [dbo].[AreaJefes] (
        [AreaId]    INT       NOT NULL,
        [UserId]    INT       NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT PK_AreaJefes PRIMARY KEY ([AreaId], [UserId]),
        CONSTRAINT FK_AreaJefes_Area FOREIGN KEY ([AreaId])
            REFERENCES [dbo].[Areas] ([AreaId])  ON DELETE CASCADE,
        CONSTRAINT FK_AreaJefes_User FOREIGN KEY ([UserId])
            REFERENCES [dbo].[Users] ([Id])      ON DELETE NO ACTION
    );

    CREATE INDEX IX_AreaJefes_User ON [dbo].[AreaJefes] ([UserId]);

    PRINT '  ✔ Tabla AreaJefes creada.';
END
ELSE
BEGIN
    PRINT '  = La tabla AreaJefes ya existe.';
END

-- Seed idempotente con jefes vigentes en Areas.
INSERT INTO [dbo].[AreaJefes] ([AreaId], [UserId], [CreatedAt])
SELECT a.[AreaId], a.[JefeId], GETUTCDATE()
FROM [dbo].[Areas] a
WHERE a.[JefeId] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[AreaJefes] aj
      WHERE aj.[AreaId] = a.[AreaId] AND aj.[UserId] = a.[JefeId]
  );

INSERT INTO [dbo].[AreaJefes] ([AreaId], [UserId], [CreatedAt])
SELECT a.[AreaId], a.[JefeSuplenteId], GETUTCDATE()
FROM [dbo].[Areas] a
WHERE a.[JefeSuplenteId] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[AreaJefes] aj
      WHERE aj.[AreaId] = a.[AreaId] AND aj.[UserId] = a.[JefeSuplenteId]
  );

DECLARE @nAJ INT = (SELECT COUNT(*) FROM [dbo].[AreaJefes]);
PRINT CONCAT('  = AreaJefes total rows: ', @nAJ);

-------------------------------------------------------------------------------
-- 4) SolicitudesVacacionLaborada  (task #71 — delegado → jefe de área)
-------------------------------------------------------------------------------
PRINT '';
PRINT '--- (4) SolicitudesVacacionLaborada ---';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SolicitudesVacacionLaborada')
BEGIN
    CREATE TABLE [dbo].[SolicitudesVacacionLaborada] (
        [Id]                    INT             IDENTITY(1,1) PRIMARY KEY,
        [EmpleadoId]            INT             NOT NULL,
        [Nomina]                INT             NOT NULL,
        [VacacionOriginalId]    INT             NOT NULL,
        [FechaOriginal]         DATE            NOT NULL,
        [FechaNueva]            DATE            NOT NULL,
        [Motivo]                NVARCHAR(500)   NULL,
        [EstadoSolicitud]       NVARCHAR(20)    NOT NULL DEFAULT 'Pendiente',
        [FechaSolicitud]        DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [SolicitadoPorId]       INT             NOT NULL,
        [JefeAreaId]            INT             NULL,
        [FechaRespuesta]        DATETIME2       NULL,
        [AprobadoPorId]         INT             NULL,
        [MotivoRechazo]         NVARCHAR(500)   NULL,
        [VacacionCanceladaId]   INT             NULL,
        [VacacionCreadaId]      INT             NULL,
        [CreatedAt]             DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt]             DATETIME2       NULL,

        CONSTRAINT FK_SVL_Empleado FOREIGN KEY ([EmpleadoId])
            REFERENCES [dbo].[Users] ([Id])                    ON DELETE NO ACTION,
        CONSTRAINT FK_SVL_VacOriginal FOREIGN KEY ([VacacionOriginalId])
            REFERENCES [dbo].[VacacionesProgramadas] ([Id])    ON DELETE NO ACTION,
        CONSTRAINT FK_SVL_SolicitadoPor FOREIGN KEY ([SolicitadoPorId])
            REFERENCES [dbo].[Users] ([Id])                    ON DELETE NO ACTION,
        CONSTRAINT FK_SVL_JefeArea FOREIGN KEY ([JefeAreaId])
            REFERENCES [dbo].[Users] ([Id])                    ON DELETE NO ACTION,
        CONSTRAINT FK_SVL_AprobadoPor FOREIGN KEY ([AprobadoPorId])
            REFERENCES [dbo].[Users] ([Id])                    ON DELETE NO ACTION
    );

    CREATE INDEX IX_SVL_EmpleadoEstado ON [dbo].[SolicitudesVacacionLaborada] ([EmpleadoId], [EstadoSolicitud]);
    CREATE INDEX IX_SVL_JefeArea       ON [dbo].[SolicitudesVacacionLaborada] ([JefeAreaId]);
    CREATE INDEX IX_SVL_FechaOriginal  ON [dbo].[SolicitudesVacacionLaborada] ([EmpleadoId], [FechaOriginal], [EstadoSolicitud]);

    PRINT '  ✔ Tabla SolicitudesVacacionLaborada creada.';
END
ELSE
BEGIN
    PRINT '  = La tabla SolicitudesVacacionLaborada ya existe.';
END

-------------------------------------------------------------------------------
-- RESUMEN FINAL
-------------------------------------------------------------------------------
PRINT '';
PRINT '=====================================================';
PRINT '  RESUMEN FINAL';
PRINT '=====================================================';

SELECT
    'ReglasTurno.Estado'                                       AS Objeto,
    CASE WHEN EXISTS (SELECT 1 FROM sys.columns
                      WHERE Name = 'Estado'
                        AND Object_ID = Object_ID('dbo.ReglasTurno'))
         THEN 'OK' ELSE 'FALTA' END                            AS Estado
UNION ALL
SELECT 'RotacionesReglaProgramadas (tabla)',
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RotacionesReglaProgramadas')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'RotacionesReglaProgramadas.PatronBaseline',
       CASE WHEN EXISTS (SELECT 1 FROM sys.columns
                         WHERE Name = 'PatronBaseline'
                           AND Object_ID = Object_ID('dbo.RotacionesReglaProgramadas'))
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'AreaJefes (tabla)',
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AreaJefes')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'SolicitudesVacacionLaborada (tabla)',
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SolicitudesVacacionLaborada')
            THEN 'OK' ELSE 'FALTA' END;

PRINT '';
PRINT '  Migración consolidada terminada.';
PRINT '=====================================================';
