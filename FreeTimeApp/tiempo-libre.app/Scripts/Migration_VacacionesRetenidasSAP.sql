-- =============================================================================
-- Migración: VacacionesRetenidasSAP (oct-2026)
--
-- Días de vacación que trae el Excel de SAP y que la sincronización NO da de
-- alta porque dejarían al empleado con más días de común acuerdo de los que le
-- tocan por antigüedad. El superusuario los acepta o los descarta desde
-- Vacaciones -> "Días de más por antigüedad".
--
-- CORRER ANTES de publicar el backend que la usa. Si el backend se publica sin
-- esta tabla, la sincronización sigue funcionando como antes (da de alta sin
-- tope) y lo deja en el log, y las pantallas no truenan; pero no retiene nada.
-- Se puede correr más de una vez.
-- =============================================================================

IF OBJECT_ID('dbo.VacacionesRetenidasSAP') IS NULL
BEGIN
    CREATE TABLE [dbo].[VacacionesRetenidasSAP] (
        [Id]                INT            IDENTITY(1,1) PRIMARY KEY,
        [EmpleadoId]        INT            NOT NULL,
        [Nomina]            INT            NOT NULL,
        [Fecha]             DATE           NOT NULL,
        [Antiguedad]        INT            NOT NULL,
        [Corresponden]      INT            NOT NULL,
        [YaTenia]           INT            NOT NULL,
        [Estado]            NVARCHAR(20)   NOT NULL DEFAULT 'Pendiente',
        [FechaCargaExcel]   DATETIME2      NOT NULL DEFAULT GETDATE(),
        [ResueltoPorId]     INT            NULL,
        [FechaResolucion]   DATETIME2      NULL,
        [Nota]              NVARCHAR(500)  NULL,
        [VacacionCreadaId]  INT            NULL,

        CONSTRAINT FK_VRS_Empleado   FOREIGN KEY ([EmpleadoId])    REFERENCES [dbo].[Users] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT FK_VRS_ResueltoPor FOREIGN KEY ([ResueltoPorId]) REFERENCES [dbo].[Users] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT CK_VRS_Estado CHECK ([Estado] IN ('Pendiente','Aceptada','Descartada'))
    );

    CREATE INDEX IX_VRS_EmpleadoFecha ON [dbo].[VacacionesRetenidasSAP] ([EmpleadoId], [Fecha]);
    CREATE INDEX IX_VRS_Estado        ON [dbo].[VacacionesRetenidasSAP] ([Estado]);

    PRINT 'Tabla VacacionesRetenidasSAP creada.';
END
ELSE
BEGIN
    PRINT 'La tabla VacacionesRetenidasSAP ya existe.';
END
