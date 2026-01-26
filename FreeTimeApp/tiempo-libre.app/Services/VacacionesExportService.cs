using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    public class VacacionesExportService
    {
        private readonly FreeTimeDbContext _context;
        private readonly ILogger<VacacionesExportService> _logger;

        public VacacionesExportService(
            FreeTimeDbContext context,
            ILogger<VacacionesExportService> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Genera un archivo Excel con las vacaciones programadas agrupadas por área
        /// </summary>
        /// <param name="year">Año a filtrar (opcional, si es null exporta todas)</param>
        /// <returns>MemoryStream con el archivo Excel generado</returns>
        public async Task<(MemoryStream Stream, string FileName)> GenerarExcelPorAreaAsync(int? year = null, int? areaId = null)
        {
            try
            {
                _logger.LogInformation("Iniciando generación de Excel de vacaciones por área para año: {Year}", year?.ToString() ?? "Todos");

                // Obtener datos
                var query = _context.VacacionesProgramadas
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Grupo)
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Area)
                    .AsQueryable();

                if (year.HasValue)
                {
                    var startDate = new DateOnly(year.Value, 1, 1);
                    var endDate = new DateOnly(year.Value, 12, 31);
                    query = query.Where(v => v.FechaVacacion >= startDate && v.FechaVacacion <= endDate);
                }

                if (areaId.HasValue)
                {
                    query = query.Where(v => v.Empleado.AreaId == areaId.Value);
                }

                var vacaciones = await query
                    .OrderBy(v => v.Empleado.Nomina)
                    .ThenBy(v => v.FechaVacacion)
                    .ToListAsync();

                _logger.LogInformation("Se encontraron {Count} registros de vacaciones", vacaciones.Count);

                if (vacaciones.Count == 0)
                {
                    throw new InvalidOperationException("No hay datos para exportar");
                }

                // Agrupar vacaciones por área
                var vacacionesPorArea = vacaciones
                    .GroupBy(v => new
                    {
                        AreaId = v.Empleado?.AreaId ?? 0,
                        AreaNombre = v.Empleado?.Area?.NombreGeneral ?? "Sin Área"
                    })
                    .OrderBy(g => g.Key.AreaNombre)
                    .ToList();

                _logger.LogInformation("Agrupando por área: {Count} áreas encontradas", vacacionesPorArea.Count);

                // Crear archivo Excel
                using var workbook = new XLWorkbook();

                // Configurar encabezados (reutilizable para cada hoja)
                var headers = new[]
                {
                    "ID", "Nómina", "Nombre Completo", "Área", "Grupo",
                    "Fecha Vacación", "Tipo Vacación", "Origen Asignación",
                    "Estado Vacación", "Periodo Programación", "Fecha Programación",
                    "Puede ser Intercambiada", "Observaciones", "Fecha Creación",
                    "Creado Por", "Última Actualización", "Actualizado Por"
                };

                // Rastrear nombres de hojas usados para evitar duplicados
                var usedSheetNames = new HashSet<string>();

                // Crear una hoja por área
                foreach (var areaGroup in vacacionesPorArea)
                {
                    var areaNombre = areaGroup.Key.AreaNombre;
                    var vacacionesArea = areaGroup.OrderBy(v => v.Empleado?.Nomina).ThenBy(v => v.FechaVacacion).ToList();

                    // Sanitizar nombre de hoja (máximo 31 caracteres, sin caracteres inválidos)
                    var sheetName = SanitizeSheetName(areaNombre);

                    // Manejar duplicados
                    var uniqueSheetName = sheetName;
                    var counter = 1;
                    while (usedSheetNames.Contains(uniqueSheetName))
                    {
                        var suffix = $" ({counter})";
                        var maxLength = 31 - suffix.Length;
                        uniqueSheetName = sheetName.Substring(0, Math.Min(sheetName.Length, maxLength)) + suffix;
                        counter++;
                    }
                    usedSheetNames.Add(uniqueSheetName);

                    var worksheet = workbook.Worksheets.Add(uniqueSheetName);

                    _logger.LogInformation("Generando hoja: {AreaNombre} con {Count} registros", areaNombre, vacacionesArea.Count);

                    // Configurar encabezados
                    for (int i = 0; i < headers.Length; i++)
                    {
                        var cell = worksheet.Cell(1, i + 1);
                        cell.Value = headers[i];
                        cell.Style.Font.Bold = true;
                        cell.Style.Fill.BackgroundColor = XLColor.LightBlue;
                        cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    }

                    // Llenar datos
                    int row = 2;
                    foreach (var vacacion in vacacionesArea)
                    {
                        worksheet.Cell(row, 1).Value = vacacion.Id;
                        worksheet.Cell(row, 2).Value = vacacion.Empleado?.Nomina?.ToString() ?? "";
                        worksheet.Cell(row, 3).Value = vacacion.Empleado?.FullName ?? "";
                        worksheet.Cell(row, 4).Value = vacacion.Empleado?.Area?.NombreGeneral ?? "";
                        worksheet.Cell(row, 5).Value = vacacion.Empleado?.Grupo?.Rol ?? "";
                        worksheet.Cell(row, 6).Value = vacacion.FechaVacacion.ToString("ddMMyyyy");
                        worksheet.Cell(row, 7).Value = vacacion.TipoVacacion;
                        worksheet.Cell(row, 8).Value = vacacion.OrigenAsignacion;
                        worksheet.Cell(row, 9).Value = vacacion.EstadoVacacion;
                        worksheet.Cell(row, 10).Value = vacacion.PeriodoProgramacion;
                        worksheet.Cell(row, 11).Value = vacacion.FechaProgramacion.ToString("dd/MMyyyy");
                        worksheet.Cell(row, 12).Value = vacacion.PuedeSerIntercambiada ? "Sí" : "No";
                        worksheet.Cell(row, 13).Value = vacacion.Observaciones ?? "";
                        worksheet.Cell(row, 14).Value = vacacion.CreatedAt.ToString("dd/MM/yyyy");
                        worksheet.Cell(row, 15).Value = vacacion.CreatedBy?.ToString() ?? "";
                        worksheet.Cell(row, 16).Value = vacacion.UpdatedAt?.ToString("dd/MM/yyyy") ?? "";
                        worksheet.Cell(row, 17).Value = vacacion.UpdatedBy?.ToString() ?? "";
                        row++;
                    }

                    // Ajustar columnas
                    worksheet.Columns().AdjustToContents();

                    // Aplicar filtros
                    worksheet.RangeUsed().SetAutoFilter();

                    // Congelar primera fila
                    worksheet.SheetView.FreezeRows(1);
                }

                // Guardar en MemoryStream
                var stream = new MemoryStream();
                workbook.SaveAs(stream);
                stream.Position = 0;

                // Generar nombre de archivo
                var timestamp = DateTime.Now;
                var fileName = year.HasValue
                    ? $"VacacionesProgramadas_{year}_{timestamp:yyyyMMdd_HHmmss}.xlsx"
                    : $"VacacionesProgramadas_Todas_{timestamp:yyyyMMdd_HHmmss}.xlsx";

                _logger.LogInformation("Excel generado exitosamente: {FileName}", fileName);

                return (stream, fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar Excel de vacaciones por área");
                throw;
            }
        }

        /// <summary>
        /// Genera el archivo plano para SAP.
        /// Formato: NOMINA,FECHA(ddMMyyyy),FECHA(ddMMyyyy),1100 (sin encabezados)
        /// </summary>
        /// <param name="year">Año a filtrar (obligatorio)</param>
        /// <param name="areaId">ID de área opcional</param>
        /// <param name="gruposRol">Lista opcional de roles de grupo</param>
        /// <returns>MemoryStream con el archivo y nombre sugerido</returns>
        public async Task<(MemoryStream Stream, string FileName)> GenerarReporteSapAsync(
            int year,
            int? areaId = null,
            List<string>? gruposRol = null)
        {
            try
            {
                if (year <= 0)
                    throw new ArgumentException("El año es obligatorio", nameof(year));

                _logger.LogInformation("Generando Reporte SAP para año {Year}, área {AreaId}, grupos {Grupos}",
                    year, areaId?.ToString() ?? "Todos", gruposRol != null ? string.Join(",", gruposRol) : "Todos");

                var query = _context.VacacionesProgramadas
                    .AsNoTracking()
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Grupo)
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Area)
                    .Where(v => v.FechaVacacion >= new DateOnly(year, 1, 1)
                             && v.FechaVacacion <= new DateOnly(year, 12, 31));

                if (areaId.HasValue)
                    query = query.Where(v => v.Empleado!.AreaId == areaId.Value);

                if (gruposRol != null && gruposRol.Any())
                    query = query.Where(v => v.Empleado!.Grupo != null && gruposRol.Contains(v.Empleado.Grupo.Rol));

                var datos = await query
                    .OrderBy(v => v.Empleado!.Nomina)
                    .ThenBy(v => v.FechaVacacion)
                    .Select(v => new
                    {
                        v.Empleado!.Nomina,
                        v.FechaVacacion
                    })
                    .ToListAsync();

                if (datos.Count == 0)
                    throw new InvalidOperationException("No se encontraron registros de vacaciones para los filtros aplicados");

                var sb = new StringBuilder(datos.Count * 32);

                foreach (var item in datos)
                {
                    var fecha = item.FechaVacacion.ToString("ddMMyyyy");
                    sb.Append(item.Nomina)
                      .Append(',')
                      .Append(fecha)
                      .Append(',')
                      .Append(fecha)
                      .Append(',')
                      .Append("1100")
                      .Append('\n');
                }

                // UTF-8 sin BOM (SAP-friendly)
                var encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
                var bytes = encoding.GetBytes(sb.ToString());
                var stream = new MemoryStream(bytes, writable: false);

                var fileName = $"ReporteSAP_{year}_{DateTime.Now:yyyyMMdd_HHmmss}.txt";

                _logger.LogInformation("Reporte SAP generado con {Count} líneas", datos.Count);

                return (stream, fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generando el Reporte SAP");
                throw;
            }
        }

        /// <summary>
        /// Genera el reporte de días a eliminar para SAP basado en reprogramaciones aceptadas.
        /// </summary>
        public async Task<(MemoryStream Stream, string FileName)> GenerarReporteSapReprogramacionEliminarAsync(
            int year,
            int? areaId = null,
            List<string>? gruposRol = null)
        {
            return await GenerarReporteSapReprogramacionBaseAsync(year, true, areaId, gruposRol);
        }

        /// <summary>
        /// Genera el reporte de días nuevos a reprogramar para SAP basado en reprogramaciones aceptadas.
        /// </summary>
        public async Task<(MemoryStream Stream, string FileName)> GenerarReporteSapReprogramacionNuevosAsync(
            int year,
            int? areaId = null,
            List<string>? gruposRol = null)
        {
            return await GenerarReporteSapReprogramacionBaseAsync(year, false, areaId, gruposRol);
        }

        private async Task<(MemoryStream Stream, string FileName)> GenerarReporteSapReprogramacionBaseAsync(
            int year,
            bool esParaEliminar,
            int? areaId = null,
            List<string>? gruposRol = null)
        {
            try
            {
                _logger.LogInformation("Generando Reporte SAP Reprogramación ({Tipo}) basado en Solicitudes para año {Year}",
                    esParaEliminar ? "Eliminar" : "Nuevos", year);

                var query = _context.SolicitudesReprogramacion
                    .AsNoTracking()
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Area)
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Grupo)
                    .Where(s => s.EstadoSolicitud == "Aprobada");

                // Filtrar por año de la fecha nueva (que es el periodo objetivo usualmente)
                query = query.Where(s => s.FechaNuevaSolicitada.Year == year);

                if (areaId.HasValue)
                    query = query.Where(s => s.Empleado.AreaId == areaId.Value);

                if (gruposRol != null && gruposRol.Any())
                    query = query.Where(s => s.Empleado.Grupo != null && gruposRol.Contains(s.Empleado.Grupo.Rol));

                var datos = await query
                    .OrderBy(s => s.Empleado.Nomina)
                    .Select(s => new
                    {
                        s.Empleado.Nomina,
                        Fecha = esParaEliminar ? s.FechaOriginalGuardada : s.FechaNuevaSolicitada
                    })
                    .ToListAsync();

                // if (datos.Count == 0)
                //    throw new InvalidOperationException($"No se encontraron reprogramaciones aceptadas para {year}");

                var sb = new StringBuilder(datos.Count * 32);

                if (datos.Count == 0)
                {
                     _logger.LogWarning("No se encontraron reprogramaciones para el año {Year}. Generando archivo vacío.", year);
                }
                else
                {
                    foreach (var item in datos)
                    {
                        var fechaStr = item.Fecha.ToString("ddMMyyyy");
                        sb.Append(item.Nomina)
                          .Append(',')
                          .Append(fechaStr)
                          .Append(',')
                          .Append(fechaStr)
                          .Append(',')
                          .Append("1100")
                          .Append('\n');
                    }
                }

                var encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
                var bytes = encoding.GetBytes(sb.ToString());
                var stream = new MemoryStream(bytes, writable: false);

                var prefix = esParaEliminar ? "ReporteSAP_Reprog_Eliminar" : "ReporteSAP_Reprog_Nuevos";
                var fileName = $"{prefix}_{year}_{DateTime.Now:yyyyMMdd_HHmmss}.csv";

                return (stream, fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generando reporte SAP de reprogramación");
                throw;
            }
        }

        /// <summary>
        /// Sanitiza el nombre de una hoja de Excel para cumplir con las restricciones:
        /// - Máximo 31 caracteres
        /// - No puede contener: : \ / ? * [ ]
        /// </summary>
        private static string SanitizeSheetName(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                return "Sin Nombre";
            }

            // Remover caracteres inválidos para nombres de hojas de Excel
            var invalidChars = new[] { ':', '\\', '/', '?', '*', '[', ']' };
            var sanitized = name;
            foreach (var c in invalidChars)
            {
                sanitized = sanitized.Replace(c.ToString(), "");
            }

            // Truncar a 31 caracteres (límite de Excel)
            if (sanitized.Length > 31)
            {
                sanitized = sanitized.Substring(0, 31);
            }

            return string.IsNullOrWhiteSpace(sanitized) ? "Hoja" : sanitized;
        }
    }
}
