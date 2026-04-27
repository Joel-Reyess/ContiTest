-- =====================================================================
-- Migración: Sistema de Edición de Días Asignados por Empresa
-- Ejecutar en la base de datos FreeTime (SQL Server)
-- =====================================================================

-- Tabla de configuración (una fila activa, la más reciente controla el estado)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ConfiguracionEdicionDiasEmpresa')
BEGIN
    CREATE TABLE [dbo].[ConfiguracionEdicionDiasEmpresa] (
        [Id]                  INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
        [Habilitado]          BIT            NOT NULL DEFAULT 0,
        [FechaInicioPeriodo]  DATE           NOT NULL,
        [FechaFinPeriodo]     DATE           NOT NULL,
        [Descripcion]         NVARCHAR(300)  NULL,
        [CreadoPorId]         INT            NULL,
        [CreatedAt]           DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt]           DATETIME2      NULL,
        CONSTRAINT [FK_ConfigEdicionDiasEmpresa_CreadoPor]
            FOREIGN KEY ([CreadoPorId]) REFERENCES [dbo].[Users]([Id])
    );
    PRINT 'Tabla ConfiguracionEdicionDiasEmpresa creada.';
END
ELSE
    PRINT 'Tabla ConfiguracionEdicionDiasEmpresa ya existe.';

-- Tabla de solicitudes de edición
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SolicitudesEdicionDiasEmpresa')
BEGIN
    CREATE TABLE [dbo].[SolicitudesEdicionDiasEmpresa] (
        [Id]                      INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
        [EmpleadoId]              INT            NOT NULL,
        [VacacionOriginalId]      INT            NOT NULL,
        [FechaOriginal]           DATE           NOT NULL,
        [FechaNueva]              DATE           NOT NULL,
        [EstadoSolicitud]         NVARCHAR(20)   NOT NULL DEFAULT 'Pendiente',
        [MotivoRechazo]           NVARCHAR(500)  NULL,
        [JefeAreaId]              INT            NULL,
        [SolicitadoPorId]         INT            NULL,
        [FechaSolicitud]          DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        [FechaRespuesta]          DATETIME2      NULL,
        [ObservacionesEmpleado]   NVARCHAR(500)  NULL,
        [ObservacionesJefe]       NVARCHAR(500)  NULL,
        [CreatedAt]               DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt]               DATETIME2      NULL,
        CONSTRAINT [FK_SolicEdicionDias_Empleado]
            FOREIGN KEY ([EmpleadoId]) REFERENCES [dbo].[Users]([Id]),
        CONSTRAINT [FK_SolicEdicionDias_VacacionOriginal]
            FOREIGN KEY ([VacacionOriginalId]) REFERENCES [dbo].[VacacionesProgramadas]([Id]),
        CONSTRAINT [FK_SolicEdicionDias_JefeArea]
            FOREIGN KEY ([JefeAreaId]) REFERENCES [dbo].[Users]([Id]),
        CONSTRAINT [FK_SolicEdicionDias_SolicitadoPor]
            FOREIGN KEY ([SolicitadoPorId]) REFERENCES [dbo].[Users]([Id])
    );
    PRINT 'Tabla SolicitudesEdicionDiasEmpresa creada.';
END
ELSE
    PRINT 'Tabla SolicitudesEdicionDiasEmpresa ya existe.';
