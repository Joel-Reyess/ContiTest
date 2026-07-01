-- =============================================================================
-- Migración: SolicitudesVacacionLaborada
-- Nueva tabla para registrar cuando un empleado sindicalizado se presentó a
-- trabajar en un día que tenía programado como vacación. El delegado sindical
-- crea la solicitud desde su vista; requiere aprobación del jefe de área.
-- Al aprobar: se cancela la VacacionesProgramadas original y se crea una nueva
-- en la FechaNueva con TipoVacacion = 'VacacionLaborada'.
-- Regla anti-duplicado (#69): no se permite otra solicitud pendiente o aprobada
-- que apunte a la misma FechaOriginal ni una vacación activa en FechaNueva.
-- =============================================================================

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

    PRINT 'Tabla SolicitudesVacacionLaborada creada.';
END
ELSE
BEGIN
    PRINT 'La tabla SolicitudesVacacionLaborada ya existe.';
END
