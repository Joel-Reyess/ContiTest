-- =============================================================================
-- DIAGNÓSTICO: "en el reporte de Excel y en las constancias ya salen días de
-- 2027 como si los empleados los hubieran programado, y la captura empieza
-- mañana; hasta salen días festivos" (26-nov-2026, productivo).
--
-- SOLO LECTURA: son SELECT. No modifica nada, se puede correr en productivo.
-- Manda el resultado de TODOS los bloques (aunque alguno salga vacío).
--
-- La constancia y los reportes toman todos los días ACTIVOS del año en
-- VacacionesProgramadas, de cualquier tipo. Este script dice de dónde salió
-- cada día que no es de la empresa (columna Origen):
--   EMPRESA        asignación automática (días por la empresa): es lo normal.
--   EMPRESA_MANUAL días por la empresa que un jefe / superusuario capturó a mano
--                  (el modal de asignación manual trae "Automática" por omisión).
--   OPERADOR       el operador los capturó en su pantalla de programación anual.
--   MANUAL         los capturó un jefe / superusuario / ingeniero por él
--                  (asignación manual; ésta NO revisa festivos).
--   SAP_ALTA       los dio de alta la sincronización con SAP (fila 1100 del
--                  Excel de permisos que la app no tenía).
--   SAP_MOVIDA     la sincronización con SAP movió un día de la app a la fecha
--                  del Excel.
--   SAP_RETENIDA   un día de SAP retenido que el superusuario aceptó.
--   FESTIVO        intercambio de festivo trabajado aprobado (puede ser legítimo).
--   REPROGRAMACION / VAC_LABORADA / OTRO  solicitudes aprobadas y demás.
-- =============================================================================

SET NOCOUNT ON;
DECLARE @Anio INT = 2027;
-- Cuándo arranca la captura de los operadores (lo de antes es "anticipado").
DECLARE @InicioCaptura DATETIME = '2026-11-27';

IF OBJECT_ID('tempdb..#Dias') IS NOT NULL DROP TABLE #Dias;

SELECT v.Id, v.EmpleadoId, u.Nomina, u.FullName, a.NombreGeneral AS Area, g.Rol AS Grupo, u.GrupoId,
       v.FechaVacacion, DATENAME(WEEKDAY, v.FechaVacacion) AS DiaSemana,
       v.TipoVacacion, v.OrigenAsignacion, v.PeriodoProgramacion,
       v.CreatedAt, v.CreatedBy, cb.FullName AS CapturadoPor, v.Observaciones,
       CASE
           WHEN v.TipoVacacion = 'Automatica' AND (v.OrigenAsignacion = 'Manual' OR v.CreatedBy IS NOT NULL) THEN 'EMPRESA_MANUAL'
           WHEN v.TipoVacacion = 'Automatica' THEN 'EMPRESA'
           WHEN v.Observaciones LIKE 'Alta por sincroniza%SAP retenida%' THEN 'SAP_RETENIDA'
           WHEN v.Observaciones LIKE 'Alta por sincroniza%SAP%' THEN 'SAP_ALTA'
           WHEN v.Observaciones LIKE 'Reprogramada por sincroniza%SAP%' THEN 'SAP_MOVIDA'
           WHEN v.TipoVacacion = 'FestivoTrabajado' THEN 'FESTIVO'
           WHEN v.TipoVacacion = 'VacacionLaborada' THEN 'VAC_LABORADA'
           WHEN v.TipoVacacion = 'Reprogramacion' OR v.PeriodoProgramacion = 'Reprogramacion' THEN 'REPROGRAMACION'
           WHEN v.CreatedBy IS NOT NULL THEN 'MANUAL'
           WHEN v.TipoVacacion = 'Anual' AND v.PeriodoProgramacion = 'ProgramacionAnual' THEN 'OPERADOR'
           ELSE 'OTRO'
       END AS Origen,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.DiasInhabiles d WHERE d.Fecha = v.FechaVacacion) THEN 1 ELSE 0 END AS EsFestivo,
       (SELECT TOP 1 d.Detalles FROM dbo.DiasInhabiles d WHERE d.Fecha = v.FechaVacacion) AS Festivo
INTO #Dias
FROM dbo.VacacionesProgramadas v
JOIN dbo.Users u ON u.Id = v.EmpleadoId
LEFT JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
LEFT JOIN dbo.Areas a ON a.AreaId = u.AreaId
LEFT JOIN dbo.Users cb ON cb.Id = v.CreatedBy
WHERE v.EstadoVacacion = 'Activa'
  AND v.FechaVacacion >= DATEFROMPARTS(@Anio, 1, 1)
  AND v.FechaVacacion <= DATEFROMPARTS(@Anio, 12, 31);

PRINT '=== (0) ¿Ya se aplicó la limpieza? (tablas de respaldo que deja LimpiarDiasAnticipados.sql con @Aplicar = 1) ===';
SELECT t.name AS TablaRespaldo, t.create_date AS CreadaEl, SUM(p.rows) AS DiasRespaldados
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name LIKE 'Respaldo[_]VacacionesAnticipadas[_]%'
GROUP BY t.name, t.create_date
ORDER BY t.create_date;

PRINT '=== (0b) TODO lo del año en la tabla, también lo cancelado (lo que traía el Excel "Vacaciones Programadas por Área") ===';
-- Hasta el 26-nov ese Excel no filtraba por estado: salían también las canceladas
-- (al borrar bloques, reprogramaciones, sincronización con SAP).
SELECT v.EstadoVacacion, v.TipoVacacion, v.OrigenAsignacion,
       CASE WHEN v.CreatedBy IS NULL THEN 'No' ELSE 'Sí' END AS CapturadoPorUsuario,
       COUNT(*) AS Dias, COUNT(DISTINCT v.EmpleadoId) AS Empleados,
       MIN(v.CreatedAt) AS PrimeroCapturado, MAX(v.CreatedAt) AS UltimoCapturado,
       MAX(v.Observaciones) AS EjemploObservacion
FROM dbo.VacacionesProgramadas v
WHERE v.FechaVacacion >= DATEFROMPARTS(@Anio, 1, 1)
  AND v.FechaVacacion <= DATEFROMPARTS(@Anio, 12, 31)
GROUP BY v.EstadoVacacion, v.TipoVacacion, v.OrigenAsignacion, CASE WHEN v.CreatedBy IS NULL THEN 'No' ELSE 'Sí' END
ORDER BY v.EstadoVacacion, Dias DESC;

PRINT '=== (1) Configuración vigente (periodo y años) ===';
SELECT TOP 1 Id, PeriodoActual, AnioVigente, AnioProgramacionAnual, CreatedAt, UpdatedAt
FROM dbo.ConfiguracionVacaciones
ORDER BY CreatedAt DESC, Id DESC;

PRINT '=== (2) Días activos del año por origen (lo de EMPRESA es normal) ===';
SELECT Origen, TipoVacacion, PeriodoProgramacion,
       COUNT(*) AS Dias, COUNT(DISTINCT EmpleadoId) AS Empleados,
       SUM(EsFestivo) AS EnFestivo,
       MIN(CreatedAt) AS PrimeroCapturado, MAX(CreatedAt) AS UltimoCapturado
FROM #Dias
GROUP BY Origen, TipoVacacion, PeriodoProgramacion
ORDER BY CASE WHEN Origen = 'EMPRESA' THEN 1 ELSE 0 END, Dias DESC;

PRINT '=== (3) Días que no son de la empresa, por día en que se capturaron y quién ===';
SELECT CAST(CreatedAt AS DATE) AS CapturadoEl, Origen, ISNULL(CapturadoPor, '(el operador / el sistema)') AS CapturadoPor,
       COUNT(*) AS Dias, COUNT(DISTINCT EmpleadoId) AS Empleados, SUM(EsFestivo) AS EnFestivo
FROM #Dias
WHERE Origen <> 'EMPRESA'
GROUP BY CAST(CreatedAt AS DATE), Origen, CapturadoPor
ORDER BY CapturadoEl, Origen;

PRINT '=== (4) Por área y grupo: ¿el grupo ya tenía bloques (turnos de captura) del año? ===';
-- Sin bloques del año, el candado de turno deja capturar en cualquier momento.
SELECT d.Area, d.Grupo, d.Origen, COUNT(*) AS Dias, COUNT(DISTINCT d.EmpleadoId) AS Empleados,
       (SELECT COUNT(*) FROM dbo.BloquesReservacion b WHERE b.GrupoId = d.GrupoId AND b.AnioGeneracion = @Anio) AS BloquesDelGrupo,
       (SELECT MIN(b.FechaHoraInicio) FROM dbo.BloquesReservacion b WHERE b.GrupoId = d.GrupoId AND b.AnioGeneracion = @Anio) AS PrimerBloqueInicia,
       (SELECT MIN(b.FechaGeneracion) FROM dbo.BloquesReservacion b WHERE b.GrupoId = d.GrupoId AND b.AnioGeneracion = @Anio) AS BloquesGeneradosEl
FROM #Dias d
WHERE d.Origen <> 'EMPRESA'
GROUP BY d.Area, d.Grupo, d.GrupoId, d.Origen
ORDER BY d.Area, d.Grupo, d.Origen;

PRINT '=== (5) Detalle de cada día que no es de la empresa (máx. 3000 filas) ===';
SELECT TOP 3000 Id, Nomina, FullName, Area, Grupo, FechaVacacion, DiaSemana, Origen, TipoVacacion,
       OrigenAsignacion, PeriodoProgramacion, EsFestivo, Festivo, CreatedAt, CapturadoPor, Observaciones,
       CASE WHEN CreatedAt < @InicioCaptura THEN 'Antes de abrir la captura' ELSE '' END AS Anticipado
FROM #Dias
WHERE Origen <> 'EMPRESA'
ORDER BY Area, Grupo, Nomina, FechaVacacion;

PRINT '=== (6) ¿SAP ya trae vacaciones (1100) de ese año en el Excel de permisos? ===';
SELECT COUNT(*) AS FilasSap1100, COUNT(DISTINCT p.Nomina) AS Empleados,
       MIN(p.Desde) AS PrimeraFecha, MAX(p.Hasta) AS UltimaFecha
FROM dbo.PermisosEIncapacidadesSAP p
WHERE p.ClAbPre = 1100
  AND p.Desde <= DATEFROMPARTS(@Anio, 12, 31) AND p.Hasta >= DATEFROMPARTS(@Anio, 1, 1);

PRINT '=== (7) Turnos de captura ya marcados como "Reservado" (ya capturó) en el año ===';
SELECT ab.Estado, COUNT(*) AS Asignaciones, MIN(ab.FechaCompletado) AS Primera, MAX(ab.FechaCompletado) AS Ultima
FROM dbo.AsignacionesBloque ab
JOIN dbo.BloquesReservacion b ON b.Id = ab.BloqueId
WHERE b.AnioGeneracion = @Anio
GROUP BY ab.Estado;

DROP TABLE #Dias;
