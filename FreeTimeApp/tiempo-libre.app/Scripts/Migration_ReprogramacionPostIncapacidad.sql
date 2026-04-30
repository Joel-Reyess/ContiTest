-- =============================================================================
-- Migración: SolicitudesReprogramacionPostIncapacidad (Punto 7 PDF)
-- Crea la tabla para solicitudes de reprogramación de una vacación futura
-- no canjeada hacia un día post-incapacidad/permiso. Mismo patrón que
-- SolicitudesFestivosTrabajados; va a aprobación del jefe de área.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SolicitudesReprogramacionPostIncapacidad')
BEGIN
    CREATE TABLE [dbo].[SolicitudesReprogramacionPostIncapacidad] (
        [Id]                    INT             IDENTITY(1,1) PRIMARY KEY,
        [EmpleadoId]            INT             NOT NULL,
        [Nomina]                INT             NOT NULL,
        [PermisoIncapacidadId]  INT             NOT NULL,
        [VacacionOriginalId]    INT             NOT NULL,
        [FechaOriginal]         DATE            NOT NULL,
        [FechaNueva]            DATE            NOT NULL,
        [Motivo]                NVARCHAR(500)   NOT NULL,
        [EstadoSolicitud]       NVARCHAR(20)    NOT NULL DEFAULT 'Pendiente',
        [FechaSolicitud]        DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [SolicitadoPorId]       INT             NOT NULL,
        [JefeAreaId]            INT             NULL,
        [FechaRespuesta]        DATETIME2       NULL,
        [AprobadoPorId]         INT             NULL,
        [MotivoRechazo]         NVARCHAR(500)   NULL,

        CONSTRAINT FK_SRPI_Empleado FOREIGN KEY ([EmpleadoId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,
        CONSTRAINT FK_SRPI_Permiso FOREIGN KEY ([PermisoIncapacidadId])
            REFERENCES [dbo].[PermisosEIncapacidadesSAP] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT FK_SRPI_VacOriginal FOREIGN KEY ([VacacionOriginalId])
            REFERENCES [dbo].[VacacionesProgramadas] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT FK_SRPI_SolicitadoPor FOREIGN KEY ([SolicitadoPorId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,
        CONSTRAINT FK_SRPI_JefeArea FOREIGN KEY ([JefeAreaId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,
        CONSTRAINT FK_SRPI_AprobadoPor FOREIGN KEY ([AprobadoPorId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION
    );

    CREATE INDEX IX_SRPI_EmpleadoEstado ON [dbo].[SolicitudesReprogramacionPostIncapacidad] ([EmpleadoId], [EstadoSolicitud]);
    CREATE INDEX IX_SRPI_JefeArea       ON [dbo].[SolicitudesReprogramacionPostIncapacidad] ([JefeAreaId]);

    PRINT 'Tabla SolicitudesReprogramacionPostIncapacidad creada.';
END
ELSE
BEGIN
    PRINT 'La tabla SolicitudesReprogramacionPostIncapacidad ya existe.';
END
