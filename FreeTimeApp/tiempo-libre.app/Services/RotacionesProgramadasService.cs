using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Rotaciones de patrón agendadas a una (o varias) fecha(s) futura(s).
    /// Ejecución automática por EjecucionRotacionesProgramadasBackgroundService.
    /// </summary>
    public class RotacionesProgramadasService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ReglasTurnoService _reglasTurnoService;
        private readonly ILogger<RotacionesProgramadasService> _logger;

        private static readonly int[] DiasPermitidos = new[] { 7, 14, 21 };

        public RotacionesProgramadasService(
            FreeTimeDbContext db,
            ReglasTurnoService reglasTurnoService,
            ILogger<RotacionesProgramadasService> logger)
        {
            _db = db;
            _reglasTurnoService = reglasTurnoService;
            _logger = logger;
        }

        public async Task<List<RotacionProgramadaDto>> ListarAsync(DateTime? desde, DateTime? hasta)
        {
            var q = _db.RotacionesReglaProgramadas
                .Include(r => r.CreatedByUser)
                .AsQueryable();

            if (desde.HasValue)
                q = q.Where(r => r.FechaEjecucion >= desde.Value.Date);
            if (hasta.HasValue)
                q = q.Where(r => r.FechaEjecucion <= hasta.Value.Date);

            var rows = await q.OrderBy(r => r.FechaEjecucion).ThenBy(r => r.CodigoRegla).ToListAsync();
            return rows.Select(ToDto).ToList();
        }

        public async Task<CrearRotacionesProgramadasResponse> CrearAsync(
            CrearRotacionesProgramadasRequest request, int usuarioId)
        {
            if (string.IsNullOrWhiteSpace(request.CodigoRegla))
                throw new InvalidOperationException("Debes indicar el código de la regla.");

            var esArranque = request.PatronBaseline != null && request.PatronBaseline.Count > 0;
            if (!esArranque && !DiasPermitidos.Contains(request.DiasRotacion))
                throw new InvalidOperationException(
                    $"Los días a rotar sólo admiten valores {string.Join(", ", DiasPermitidos)}.");

            if (esArranque)
            {
                if (request.PatronBaseline!.Count % 7 != 0)
                    throw new InvalidOperationException(
                        $"El patrón de arranque debe tener longitud múltiplo de 7 (actual: {request.PatronBaseline.Count}).");
                if (request.PatronBaseline.Any(string.IsNullOrWhiteSpace))
                    throw new InvalidOperationException(
                        "Todos los turnos del patrón de arranque deben tener un valor.");
            }

            var regla = await _db.ReglasTurno.FirstOrDefaultAsync(r => r.Codigo == request.CodigoRegla);
            if (regla == null)
                throw new InvalidOperationException($"No existe la regla '{request.CodigoRegla}'.");

            // En modo Arranque permitimos reglas Pendientes (así se activan al llegar la fecha).
            if (!esArranque && regla.Estado != "Activa")
                throw new InvalidOperationException(
                    $"La regla '{request.CodigoRegla}' está en estado '{regla.Estado}'. Sólo se pueden agendar rotaciones sobre reglas Activas.");

            var hoy = DateTime.UtcNow.Date;
            var fechas = request.Fechas
                .Select(f => f.Date)
                .Where(f => f > hoy)
                .Distinct()
                .OrderBy(f => f)
                .ToList();

            if (fechas.Count == 0)
                throw new InvalidOperationException("Debes indicar al menos una fecha futura (posterior a hoy).");

            var yaAgendadas = await _db.RotacionesReglaProgramadas
                .Where(r => r.CodigoRegla == request.CodigoRegla
                            && r.Estado == "Pendiente"
                            && fechas.Contains(r.FechaEjecucion))
                .Select(r => r.FechaEjecucion)
                .ToListAsync();

            var omitidas = new List<string>();
            var creadas = new List<RotacionesReglaProgramadas>();

            foreach (var fecha in fechas)
            {
                if (yaAgendadas.Contains(fecha))
                {
                    omitidas.Add($"{fecha:yyyy-MM-dd} (ya tenía rotación pendiente para {request.CodigoRegla})");
                    continue;
                }

                var row = new RotacionesReglaProgramadas
                {
                    CodigoRegla = request.CodigoRegla,
                    FechaEjecucion = fecha,
                    DiasRotacion = request.DiasRotacion,
                    PatronBaseline = esArranque
                        ? JsonSerializer.Serialize(request.PatronBaseline)
                        : null,
                    Estado = "Pendiente",
                    CreatedByUserId = usuarioId,
                    CreatedAt = DateTime.UtcNow,
                    Notas = string.IsNullOrWhiteSpace(request.Notas) ? null : request.Notas.Trim()
                };
                _db.RotacionesReglaProgramadas.Add(row);
                creadas.Add(row);
            }

            await _db.SaveChangesAsync();

            var ids = creadas.Select(r => r.Id).ToList();
            var recargadas = await _db.RotacionesReglaProgramadas
                .Include(r => r.CreatedByUser)
                .Where(r => ids.Contains(r.Id))
                .OrderBy(r => r.FechaEjecucion)
                .ToListAsync();

            return new CrearRotacionesProgramadasResponse
            {
                Creadas = recargadas.Select(ToDto).ToList(),
                Omitidas = omitidas
            };
        }

        public async Task<bool> CancelarAsync(int id)
        {
            var row = await _db.RotacionesReglaProgramadas.FirstOrDefaultAsync(r => r.Id == id);
            if (row == null)
                throw new InvalidOperationException("No existe la rotación programada.");
            if (row.Estado != "Pendiente")
                throw new InvalidOperationException($"Sólo se pueden cancelar rotaciones en estado Pendiente (actual: {row.Estado}).");

            row.Estado = "Cancelada";
            await _db.SaveChangesAsync();
            return true;
        }

        /// <summary>
        /// Ejecuta todas las rotaciones pendientes con FechaEjecucion &lt;= hoy.
        /// Agrupa por (CodigoRegla, DiasRotacion) para minimizar SaveChanges y
        /// respetar la semántica de acumulación en ReglasTurnoService.RotarAsync.
        /// </summary>
        public async Task<int> EjecutarPendientesAsync()
        {
            var hoy = DateTime.UtcNow.Date;

            var pendientes = await _db.RotacionesReglaProgramadas
                .Where(r => r.Estado == "Pendiente" && r.FechaEjecucion <= hoy)
                .OrderBy(r => r.FechaEjecucion)
                .ThenBy(r => r.Id)
                .ToListAsync();

            if (pendientes.Count == 0) return 0;

            int ejecutadas = 0;

            foreach (var row in pendientes)
            {
                try
                {
                    if (!string.IsNullOrEmpty(row.PatronBaseline))
                    {
                        var patron = JsonSerializer.Deserialize<List<string>>(row.PatronBaseline)
                                     ?? new List<string>();
                        var req = new ActualizarPatronReglaTurnoRequest
                        {
                            Patron = patron,
                            Notas = row.Notas
                        };
                        await _reglasTurnoService.ActualizarPatronAsync(
                            row.CodigoRegla, req, row.CreatedByUserId);

                        _logger.LogInformation(
                            "✅ Arranque programado #{Id} ejecutado: regla {Codigo}, patrón fijado ({N} días).",
                            row.Id, row.CodigoRegla, patron.Count);
                    }
                    else
                    {
                        var req = new RotarReglasTurnoRequest
                        {
                            Codigos = new List<string> { row.CodigoRegla },
                            Dias = row.DiasRotacion,
                            Notas = row.Notas
                        };
                        await _reglasTurnoService.RotarAsync(req, row.CreatedByUserId);

                        _logger.LogInformation(
                            "✅ Rotación programada #{Id} ejecutada: regla {Codigo}, {Dias} días.",
                            row.Id, row.CodigoRegla, row.DiasRotacion);
                    }

                    row.Estado = "Ejecutada";
                    row.FechaEjecutadaReal = DateTime.UtcNow;
                    row.MensajeError = null;
                    ejecutadas++;
                }
                catch (Exception ex)
                {
                    row.Estado = "Fallida";
                    row.MensajeError = ex.Message.Length > 500 ? ex.Message.Substring(0, 500) : ex.Message;
                    _logger.LogError(ex,
                        "❌ Rotación programada #{Id} falló: regla {Codigo}, {Dias} días.",
                        row.Id, row.CodigoRegla, row.DiasRotacion);
                }
            }

            await _db.SaveChangesAsync();
            return ejecutadas;
        }

        private static RotacionProgramadaDto ToDto(RotacionesReglaProgramadas r) => new()
        {
            Id = r.Id,
            CodigoRegla = r.CodigoRegla,
            FechaEjecucion = r.FechaEjecucion,
            DiasRotacion = r.DiasRotacion,
            PatronBaseline = string.IsNullOrEmpty(r.PatronBaseline)
                ? null
                : JsonSerializer.Deserialize<List<string>>(r.PatronBaseline),
            Estado = r.Estado,
            CreatedByUserId = r.CreatedByUserId,
            CreatedByUserNombre = r.CreatedByUser?.FullName,
            CreatedAt = r.CreatedAt,
            FechaEjecutadaReal = r.FechaEjecutadaReal,
            MensajeError = r.MensajeError,
            Notas = r.Notas
        };
    }
}
