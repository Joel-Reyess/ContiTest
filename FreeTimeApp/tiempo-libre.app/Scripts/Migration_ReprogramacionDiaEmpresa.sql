-- =============================================================================
-- Migración: SolicitudesReprogramacionDiaEmpresa (Punto 9 PDF)
-- Solo SuperUsuario solicita; motivo de catálogo cerrado (Incapacidad,
-- PermisoDefuncion, Paternidad, Maternidad); va a aprobación del jefe de
-- área. Al aprobar, la VacacionProgramada se mueve a la fecha nueva con
-- TipoVacacion = 'DiaEmpresaReprogramado' (que el rol semanal mapea a "C").
-- Es un flujo paralelo a SolicitudesEdicionDiasEmpresa (auto-aprobada).
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SolicitudesReprogramacionDiaEmpresa')
BEGIN
    CREATE TABLE [dbo].[SolicitudesReprogramacionDiaEmpresa] (
        [Id]                  INT             IDENTITY(1,1) PRIMARY KEY,
        [EmpleadoId]          INT             NOT NULL,
        [VacacionOriginalId]  INT             NOT NULL,
        [FechaOriginal]       DATE            NOT NULL,
        [FechaNueva]          DATE            NOT NULL,
        [MotivoTipo]          NVARCHAR(40)    NOT NULL,
        [Justificacion]       NVARCHAR(500)   NULL,
        [EstadoSolicitud]     NVARCHAR(20)    NOT NULL DEFAULT 'Pendiente',
        [JefeAreaId]          INT             NULL,
        [SolicitadoPorId]     INT             NOT NULL,
        [AprobadoPorId]       INT             NULL,
        [FechaSolicitud]      DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [FechaRespuesta]      DATETIME2       NULL,
        [MotivoRechazo]       NVARCHAR(500)   NULL,
        [CreatedAt]           DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt]           DATETIME2       NULL,

        CONSTRAINT FK_SRDE_Empleado FOREIGN KEY ([EmpleadoId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,
        CONSTRAINT FK_SRDE_VacOriginal FOREIGN KEY ([VacacionOriginalId])
            REFERENCES [dbo].[VacacionesProgramadas] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT FK_SRDE_JefeArea FOREIGN KEY ([JefeAreaId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,
        CONSTRAINT FK_SRDE_SolicitadoPor FOREIGN KEY ([SolicitadoPorId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,
        CONSTRAINT FK_SRDE_AprobadoPor FOREIGN KEY ([AprobadoPorId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION,

        CONSTRAINT CK_SRDE_MotivoValido CHECK
            ([MotivoTipo] IN ('Incapacidad','PermisoDefuncion','Paternidad','Maternidad'))
    );

    CREATE INDEX IX_SRDE_EmpleadoEstado ON [dbo].[SolicitudesReprogramacionDiaEmpresa] ([EmpleadoId], [EstadoSolicitud]);
    CREATE INDEX IX_SRDE_JefeArea       ON [dbo].[SolicitudesReprogramacionDiaEmpresa] ([JefeAreaId]);

    PRINT 'Tabla SolicitudesReprogramacionDiaEmpresa creada.';
END
ELSE
BEGIN
    PRINT 'La tabla SolicitudesReprogramacionDiaEmpresa ya existe.';
END
