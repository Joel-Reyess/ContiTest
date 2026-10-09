-- =============================================================================
-- Migración: ampliar los motivos de SolicitudesReprogramacionDiaEmpresa
--
-- La tabla se creó con CK_SRDE_MotivoValido, que solo acepta los 4 motivos
-- originales (Incapacidad, PermisoDefuncion, Paternidad, Maternidad). El
-- 19/08/2026 (a17a9cf) la app amplió el catálogo a todas las nomenclaturas SAP
-- más "Otro", pero la restricción de la base no se actualizó: desde entonces,
-- guardar con cualquier otro motivo falla con "An error occurred while saving
-- the entity changes" (oct-2026, superusuario en producción con "Otro").
--
-- Esta migración reemplaza la restricción por la lista completa, la misma de
-- MotivosReprogramacionDiaEmpresa.Validos. No toca datos. Se puede correr más
-- de una vez.
-- =============================================================================

IF OBJECT_ID('dbo.SolicitudesReprogramacionDiaEmpresa') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_SRDE_MotivoValido'
                 AND parent_object_id = OBJECT_ID('dbo.SolicitudesReprogramacionDiaEmpresa'))
        ALTER TABLE [dbo].[SolicitudesReprogramacionDiaEmpresa] DROP CONSTRAINT [CK_SRDE_MotivoValido];

    ALTER TABLE [dbo].[SolicitudesReprogramacionDiaEmpresa] WITH CHECK
        ADD CONSTRAINT [CK_SRDE_MotivoValido] CHECK ([MotivoTipo] IN (
            'Incapacidad','PermisoDefuncion','Paternidad','Maternidad',
            'PermisoConGoce','PermisoSinGoce','PermisoSinGoceSueldo',
            'AccidenteTrabajo','RiesgoTrabajo','Suspension','Vacacion','Otro'));

    PRINT 'CK_SRDE_MotivoValido actualizada con los 12 motivos.';
END
ELSE
BEGIN
    PRINT 'La tabla SolicitudesReprogramacionDiaEmpresa no existe: corre primero Migration_ReprogramacionDiaEmpresa.sql.';
END
