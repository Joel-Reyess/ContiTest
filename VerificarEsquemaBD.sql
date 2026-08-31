-- Solo lectura. Lista qué tablas y columnas que el backend de fix/punchlist-batch-1
-- espera EXISTEN en la base a la que estás conectado. Cualquier renglón con
-- 'FALTA' truena en la app con "Invalid column name ..." / "Invalid object name ...".
-- Correr en FreeTime_Test (y, solo para consultar, en FreeTime).
-- 1) A QUÉ base estás conectado. Compáralo contra lo que reporta el health check
--    del backend (api/Health/status -> services.database.server / .database).
--    Si no coinciden, el 'ok' de abajo es de otra base y por eso la app sigue
--    tronando con "Invalid column name".
SELECT @@SERVERNAME AS Instancia, DB_NAME() AS BaseDeDatos;

SELECT Objeto, Script,
       CASE WHEN Existe = 1 THEN 'ok' ELSE '*** FALTA ***' END AS Estado
FROM (VALUES
  ('Tabla ReglasTurno',                          'Scripts/Migration_ReglasTurno.sql',                 IIF(OBJECT_ID('dbo.ReglasTurno') IS NOT NULL,1,0)),
  ('ReglasTurno.Estado',                         'Scripts/Migration_Consolidado_Pendientes.sql (1)',  IIF(COL_LENGTH('dbo.ReglasTurno','Estado') IS NOT NULL,1,0)),
  ('Tabla RotacionesReglaProgramadas',           'Scripts/Migration_Consolidado_Pendientes.sql (2)',  IIF(OBJECT_ID('dbo.RotacionesReglaProgramadas') IS NOT NULL,1,0)),
  ('RotacionesReglaProgramadas.PatronBaseline',  'Scripts/Migration_Consolidado_Pendientes.sql (2)',  IIF(COL_LENGTH('dbo.RotacionesReglaProgramadas','PatronBaseline') IS NOT NULL,1,0)),
  ('Tabla AreaJefes',                            'Scripts/Migration_Consolidado_Pendientes.sql (3)',  IIF(OBJECT_ID('dbo.AreaJefes') IS NOT NULL,1,0)),
  ('Tabla SolicitudesVacacionLaborada',          'Scripts/Migration_Consolidado_Pendientes.sql (4)',  IIF(OBJECT_ID('dbo.SolicitudesVacacionLaborada') IS NOT NULL,1,0)),
  ('Tabla AreaAsignaciones',                     'Scripts/Migration_AreaAsignaciones.sql',            IIF(OBJECT_ID('dbo.AreaAsignaciones') IS NOT NULL,1,0)),
  ('Roles Gerente BT / RH',                      'Scripts/Migration_RolesGerenteBTRH.sql',            IIF(EXISTS(SELECT 1 FROM dbo.Roles WHERE Name IN ('Gerente BT','RH')),1,0)),
  ('Tabla ConfiguracionEdicionDiasEmpresa',      'Scripts/Migration_EdicionDiasEmpresa.sql',          IIF(OBJECT_ID('dbo.ConfiguracionEdicionDiasEmpresa') IS NOT NULL,1,0)),
  ('Tabla SolicitudesEdicionDiasEmpresa',        'Scripts/Migration_EdicionDiasEmpresa.sql',          IIF(OBJECT_ID('dbo.SolicitudesEdicionDiasEmpresa') IS NOT NULL,1,0)),
  ('Tabla SolicitudesReprogramacionDiaEmpresa',  'Scripts/Migration_ReprogramacionDiaEmpresa.sql',    IIF(OBJECT_ID('dbo.SolicitudesReprogramacionDiaEmpresa') IS NOT NULL,1,0)),
  ('Tabla SolicitudesReprogramacionPostIncapacidad','Scripts/Migration_ReprogramacionPostIncapacidad.sql', IIF(OBJECT_ID('dbo.SolicitudesReprogramacionPostIncapacidad') IS NOT NULL,1,0)),
  ('PermisosEIncapacidadesSAP.ProtegidoPorExtension','Scripts/Migration_ProtecccionExtensionPermiso.sql', IIF(COL_LENGTH('dbo.PermisosEIncapacidadesSAP','ProtegidoPorExtension') IS NOT NULL,1,0)),
  ('PermisosEIncapacidadesSAP.PermisoOriginalId','Scripts/Migration_ProtecccionExtensionPermiso.sql', IIF(COL_LENGTH('dbo.PermisosEIncapacidadesSAP','PermisoOriginalId') IS NOT NULL,1,0)),
  ('Tabla SuplentePeriodos',                     'CreateSuplentePeriodosTable.sql',                   IIF(OBJECT_ID('dbo.SuplentePeriodos') IS NOT NULL,1,0)),
  ('ConfiguracionVacaciones.AnioProgramacionAnual','AddAnioProgramacionAnual.sql',                    IIF(COL_LENGTH('dbo.ConfiguracionVacaciones','AnioProgramacionAnual') IS NOT NULL,1,0)),
  ('Permutas.FechaDestino',                      'AddFechaDestinoPermutas.sql',                       IIF(COL_LENGTH('dbo.Permutas','FechaDestino') IS NOT NULL,1,0)),
  ('VacacionesProgramadas.CapturadoConRebase',   'AddRebasePorcentajeVacaciones.sql',                 IIF(COL_LENGTH('dbo.VacacionesProgramadas','CapturadoConRebase') IS NOT NULL,1,0)),
  ('VacacionesProgramadas.PorcentajeAlCapturar', 'AddRebasePorcentajeVacaciones.sql',                 IIF(COL_LENGTH('dbo.VacacionesProgramadas','PorcentajeAlCapturar') IS NOT NULL,1,0))
) AS v(Objeto, Script, Existe)
ORDER BY Estado DESC, Objeto;
