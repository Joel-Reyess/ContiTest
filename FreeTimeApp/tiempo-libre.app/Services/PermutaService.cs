using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Controllers;

namespace tiempo_libre.Services
{
    public class PermutaService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<PermutaService> _logger;

        public PermutaService(
            FreeTimeDbContext db,
            ILogger<PermutaService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<ApiResponse<SolicitudPermutaResponse>> SolicitarPermutaAsync(
            SolicitudPermutaRequest request, int usuarioSolicitanteId)
        {
            try
            {
                if (!DateOnly.TryParseExact(request.FechaPermuta, "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var fechaPermuta))
                {
                    return new ApiResponse<SolicitudPermutaResponse>(false, null,
                        "Formato de fecha inválido");
                }

                var empleadoOrigen = await _db.Users
                    .Include(u => u.Grupo)
                    .Include(u => u.Area)
                    .FirstOrDefaultAsync(u => u.Id == request.EmpleadoOrigenId);

                if (empleadoOrigen == null)
                {
                    return new ApiResponse<SolicitudPermutaResponse>(false, null,
                        "Empleado origen no encontrado");
                }

                // Validación condicional de empleado destino
                User? empleadoDestino = null;
                bool esCambioIndividual = !request.EmpleadoDestinoId.HasValue || request.EmpleadoDestinoId.Value == 0;

                if (!esCambioIndividual)
                {
                    empleadoDestino = await _db.Users
                        .Include(u => u.Grupo)
                        .Include(u => u.Area)
                        .FirstOrDefaultAsync(u => u.Id == request.EmpleadoDestinoId);

                    if (empleadoDestino == null)
                    {
                        return new ApiResponse<SolicitudPermutaResponse>(false, null,
                            "Empleado destino no encontrado");
                    }

                    if (empleadoOrigen.AreaId != empleadoDestino.AreaId)
                    {
                        return new ApiResponse<SolicitudPermutaResponse>(false, null,
                            "Los empleados deben pertenecer a la misma área");
                    }
                }

                var permuta = new Permuta
                {
                    EmpleadoOrigenId = request.EmpleadoOrigenId,
                    EmpleadoDestinoId = request.EmpleadoDestinoId,
                    FechaPermuta = fechaPermuta,
                    TurnoEmpleadoOrigen = request.TurnoEmpleadoOrigen,
                    TurnoEmpleadoDestino = request.TurnoEmpleadoDestino,
                    Motivo = request.Motivo,
                    SolicitadoPorId = usuarioSolicitanteId,
                    FechaSolicitud = DateTime.UtcNow
                };

                _db.Permutas.Add(permuta);
                await _db.SaveChangesAsync();

                var response = new SolicitudPermutaResponse
                {
                    Exitoso = true,
                    Mensaje = esCambioIndividual ? "Cambio de turno registrado exitosamente" : "Permuta registrada exitosamente",
                    PermutaId = permuta.Id,
                    EmpleadoOrigen = new EmpleadoPermutaInfo
                    {
                        Id = empleadoOrigen.Id,
                        Nombre = empleadoOrigen.FullName ?? string.Empty,
                        TurnoOriginal = request.TurnoEmpleadoOrigen,
                        TurnoNuevo = request.TurnoEmpleadoDestino ?? request.TurnoEmpleadoOrigen
                    },
                    EmpleadoDestino = empleadoDestino != null ? new EmpleadoPermutaInfo
                    {
                        Id = empleadoDestino.Id,
                        Nombre = empleadoDestino.FullName ?? string.Empty,
                        TurnoOriginal = request.TurnoEmpleadoDestino ?? string.Empty,
                        TurnoNuevo = request.TurnoEmpleadoOrigen
                    } : null,
                    FechaPermuta = fechaPermuta
                };

                _logger.LogInformation(esCambioIndividual
                    ? "Cambio de turno registrado: {Origen} - {Fecha}"
                    : "Permuta registrada: {Origen} ⇄ {Destino} - {Fecha}",
                    empleadoOrigen.FullName, empleadoDestino?.FullName ?? "", fechaPermuta);

                return new ApiResponse<SolicitudPermutaResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al registrar permuta");
                return new ApiResponse<SolicitudPermutaResponse>(false, null,
                    $"Error: {ex.Message}");
            }
        }

        public async Task<PermutasListResponse> ObtenerPermutasAsync(int? anio = null, int? usuarioId = null)
        {
            var query = _db.Permutas
                .Include(p => p.EmpleadoOrigen)
                    .ThenInclude(e => e.Area)
                .Include(p => p.EmpleadoDestino)
                    .ThenInclude(e => e.Area)
                .Include(p => p.SolicitadoPor)
                .AsQueryable();

            // Si se proporciona usuarioId, filtrar por área del jefe
            if (usuarioId.HasValue)
            {
                var usuario = await _db.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Id == usuarioId.Value);

                if (usuario != null)
                {
                    // Si es Jefe de Área, filtrar por su área
                    if (usuario.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe de Área"))
                    {
                        var areaId = usuario.AreaId;
                        query = query.Where(p => p.EmpleadoOrigen.AreaId == areaId);
                    }
                    // Si es SuperUsuario, mostrar todas las permutas (no filtrar)
                    // Si es otro rol, mostrar solo sus propias permutas
                    else if (!usuario.Roles.Any(r => r.Name == "SuperUsuario"))
                    {
                        query = query.Where(p => p.SolicitadoPorId == usuarioId.Value);
                    }
                }
            }

            if (anio.HasValue)
            {
                query = query.Where(p => p.FechaPermuta.Year == anio.Value);
            }

            var permutas = await query
                .OrderByDescending(p => p.FechaSolicitud)
                .Select(p => new PermutaListItem
                {
                    Id = p.Id,
                    EmpleadoOrigenNombre = p.EmpleadoOrigen.FullName,
                    EmpleadoDestinoNombre = p.EmpleadoDestino != null ? p.EmpleadoDestino.FullName : "N/A",
                    FechaPermuta = p.FechaPermuta,
                    TurnoEmpleadoOrigen = p.TurnoEmpleadoOrigen,
                    TurnoEmpleadoDestino = p.TurnoEmpleadoDestino ?? "N/A",
                    Motivo = p.Motivo,
                    SolicitadoPorNombre = p.SolicitadoPor.FullName,
                    FechaSolicitud = p.FechaSolicitud
                })
                .ToListAsync();

            return new PermutasListResponse
            {
                Permutas = permutas,
                Total = permutas.Count
            };
        }

        // Método para exportar a CSV
        public async Task<byte[]> ExportarPermutasACsvAsync(int? anio = null, int? usuarioId = null)
        {
            var resultado = await ObtenerPermutasAsync(anio, usuarioId);
            var permutas = resultado.Permutas;

            var csv = new System.Text.StringBuilder();
            csv.AppendLine("ID,Fecha Solicitud,Fecha Permuta,Empleado Origen,Turno Origen,Empleado Destino,Turno Destino,Motivo,Solicitado Por");

            foreach (var p in permutas)
            {
                csv.AppendLine($"{p.Id},{p.FechaSolicitud:yyyy-MM-dd HH:mm},{p.FechaPermuta:yyyy-MM-dd}," +
                    $"{p.EmpleadoOrigenNombre},{p.TurnoEmpleadoOrigen}," +
                    $"{p.EmpleadoDestinoNombre},{p.TurnoEmpleadoDestino}," +
                    $"\"{p.Motivo}\",{p.SolicitadoPorNombre}");
            }

            return System.Text.Encoding.UTF8.GetBytes(csv.ToString());
        }
    }
}