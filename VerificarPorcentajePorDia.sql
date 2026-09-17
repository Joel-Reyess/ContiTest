-- =====================================================================
-- ¿Algún día se pasa del porcentaje SUMANDO TODO? Solo lectura.
--
-- Reproduce la regla del candado (ValidadorPorcentajeService.EvaluarRegla):
--   * Grupos con menos de CEILING(100 / porcentaje) empleados: se permite
--     UNA ausencia por día (un grupo de una persona siempre puede).
--   * Los demás: ausentes / plantilla activa del grupo <= porcentaje.
--
-- Cuenta EMPLEADOS distintos, y en la misma cuenta entran los días de
-- empresa, los capturados por el operador y los permisos de SAP. Si esta
-- consulta no devuelve renglones, ningún día se pasó del tope.
-- =====================================================================
DECLARE @Anio INT = 2027;
DECLARE @Pct  DECIMAL(5,2) = 8.00;              -- el porcentaje que rige ese año
DECLARE @Min  INT = CEILING(100.0 / @Pct);      -- umbral de "grupo pequeño"

;WITH Fechas AS (
    SELECT DATEFROMPARTS(@Anio, 1, 1) AS F
    UNION ALL
    SELECT DATEADD(DAY, 1, F) FROM Fechas WHERE F < DATEFROMPARTS(@Anio, 12, 31)
),
Plantilla AS (
    SELECT GrupoId, COUNT(*) AS Total
    FROM Users
    WHERE GrupoId IS NOT NULL AND Status = 0     -- 0 = Activo
    GROUP BY GrupoId
),
Vac AS (
    SELECT u.GrupoId, v.FechaVacacion AS Fecha, v.EmpleadoId,
           MAX(CASE WHEN v.TipoVacacion = 'Automatica' THEN 1 ELSE 0 END) AS EsEmpresa
    FROM VacacionesProgramadas v
         JOIN Users u ON u.Id = v.EmpleadoId AND u.Status = 0
    WHERE v.EstadoVacacion = 'Activa' AND YEAR(v.FechaVacacion) = @Anio
    GROUP BY u.GrupoId, v.FechaVacacion, v.EmpleadoId
),
Per AS (
    SELECT DISTINCT u.GrupoId, f.F AS Fecha, u.Id AS EmpleadoId
    FROM PermisosEIncapacidadesSAP p
         JOIN Users u  ON u.Nomina = p.Nomina AND u.Status = 0
         JOIN Fechas f ON f.F >= p.Desde AND f.F <= p.Hasta
    WHERE (p.FechaSolicitud IS NULL OR p.EstadoSolicitud = 'Aprobada')
),
Todos AS (
    SELECT GrupoId, Fecha, EmpleadoId FROM Vac
    UNION
    SELECT GrupoId, Fecha, EmpleadoId FROM Per
),
Dia AS (
    SELECT t.GrupoId, t.Fecha,
           COUNT(*) AS Ausentes,
           SUM(CASE WHEN v.EsEmpresa = 1 THEN 1 ELSE 0 END) AS DiasEmpresa,
           SUM(CASE WHEN v.EsEmpresa = 0 THEN 1 ELSE 0 END) AS Capturados
    FROM Todos t
         LEFT JOIN Vac v ON v.GrupoId = t.GrupoId AND v.Fecha = t.Fecha
                        AND v.EmpleadoId = t.EmpleadoId
    GROUP BY t.GrupoId, t.Fecha
)
SELECT g.Rol AS Grupo, a.NombreGeneral AS Area, d.Fecha,
       p.Total AS Plantilla,
       d.DiasEmpresa, d.Capturados, d.Ausentes,
       CAST(100.0 * d.Ausentes / NULLIF(p.Total, 0) AS DECIMAL(5,2)) AS Porcentaje,
       @Pct AS Maximo,
       CASE WHEN p.Total < @Min THEN 'Grupo pequeño (máx 1 al día)'
            ELSE 'Por porcentaje' END AS ReglaAplicada
FROM Dia d
     JOIN Plantilla p ON p.GrupoId = d.GrupoId
     JOIN Grupos    g ON g.GrupoId = d.GrupoId
     LEFT JOIN Areas a ON a.AreaId = g.AreaId
WHERE (p.Total >= @Min AND 100.0 * d.Ausentes / p.Total > @Pct)
   OR (p.Total <  @Min AND p.Total > 1 AND d.Ausentes > 1)
ORDER BY d.Fecha, g.Rol
OPTION (MAXRECURSION 400);
