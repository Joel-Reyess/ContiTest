-- =============================================================================
-- Migración: agregar columna Estado a ReglasTurno.
-- 'Activa' = patrón definido y grupos asignables.
-- 'PendienteConfiguracion' = auto-descubierta desde RolesEmpleadosSAP; el
-- SuperUsuario aún debe capturar el patrón y asignarla a un área antes de que
-- el sync coloque a los empleados en un grupo con esta regla.
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = 'Estado' AND Object_ID = Object_ID('dbo.ReglasTurno')
)
BEGIN
    ALTER TABLE [dbo].[ReglasTurno]
        ADD [Estado] NVARCHAR(30) NOT NULL DEFAULT 'Activa';

    PRINT 'Columna Estado agregada a ReglasTurno con default Activa.';
END
ELSE
BEGIN
    PRINT 'La columna Estado ya existe en ReglasTurno.';
END
