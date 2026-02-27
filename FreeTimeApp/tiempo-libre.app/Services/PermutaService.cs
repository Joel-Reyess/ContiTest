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
                    TurnoEmpleadoOrigen = request.TurnoEmpleadoDestino ?? request.TurnoEmpleadoOrigen,  // Turno que el ORIGEN recibirá
                    TurnoEmpleadoDestino = request.TurnoEmpleadoOrigen,
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

        public async Task<PermutasListResponse> ObtenerPermutasAsync(int? anio = null, int? usuarioId = null, int? areaIdFiltro = null)
        {
            try
            {
                _db.Database.SetCommandTimeout(60);

                var usuarioConsulta = await _db.Users
                    .Include(u => u.Roles)
                    .Include(u => u.Grupo)
                        .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(u => u.Id == usuarioId);

                if (usuarioConsulta == null)
                {
                    _logger.LogWarning("⚠️ Usuario no encontrado: {UsuarioId}", usuarioId);
                    return new PermutasListResponse { Permutas = new List<PermutaListItem>(), Total = 0 };
                }

                var esJefeArea = usuarioConsulta.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe De Area");
                var esSuperUsuario = usuarioConsulta.Roles.Any(r => r.Name == "SuperUsuario");

                // ✅ BUSCAR ÁREA EN MÚLTIPLES LUGARES
                int? areaDelJefe = usuarioConsulta.AreaId ?? usuarioConsulta.Grupo?.Area?.AreaId;

                // ✅ SI NO TIENE ÁREA EN Usuario NI en Grupo, buscar en Areas.JefeId
                if (!areaDelJefe.HasValue && esJefeArea)
                {
                    var areaComoJefe = await _db.Areas
                        .Where(a => a.JefeId == usuarioId)
                        .Select(a => a.AreaId)
                        .FirstOrDefaultAsync();

                    if (areaComoJefe > 0)
                    {
                        areaDelJefe = areaComoJefe;
                        _logger.LogInformation("📌 Área encontrada en Areas.JefeId: {AreaId}", areaDelJefe);
                    }
                }

                _logger.LogInformation("👤 Usuario: {Nombre}, Roles: {Roles}, AreaIdDirecto: {AreaIdDirecto}, AreaDelGrupo: {AreaDelGrupo}, AreaFinal: {AreaFinal}, EsJefe: {EsJefe}, EsSuper: {EsSuper}, AreaFiltro: {AreaFiltro}",
                    usuarioConsulta.FullName,
                    string.Join(", ", usuarioConsulta.Roles.Select(r => r.Name)),
                    usuarioConsulta.AreaId,
                    usuarioConsulta.Grupo?.Area?.AreaId,
                    areaDelJefe,
                    esJefeArea,
                    esSuperUsuario,
                    areaIdFiltro);

                var query = _db.Permutas
                    .Include(p => p.EmpleadoOrigen)
                        .ThenInclude(e => e.Grupo)
                            .ThenInclude(g => g.Area)
                    .Include(p => p.EmpleadoDestino)
                        .ThenInclude(e => e.Grupo)
                            .ThenInclude(g => g.Area)
                    .Include(p => p.SolicitadoPor)
                    .Include(p => p.JefeAprobador)
                    .AsQueryable();

                // ✅ DETERMINAR QUÉ ÁREA FILTRAR
                int? areaIdAplicar = null;

                if (areaIdFiltro.HasValue)
                {
                    areaIdAplicar = areaIdFiltro.Value;
                    _logger.LogInformation("🔹 Usando área del FILTRO FRONTEND: {AreaId}", areaIdAplicar);
                }
                else if (esJefeArea && !esSuperUsuario && areaDelJefe.HasValue)
                {
                    areaIdAplicar = areaDelJefe.Value;
                    _logger.LogInformation("🔹 Usando área del JEFE: {AreaId}", areaIdAplicar);
                }

                if (areaIdAplicar.HasValue)
                {
                    _logger.LogInformation("🔒 APLICANDO FILTRO DE ÁREA: {AreaId}", areaIdAplicar.Value);

                    query = query.Where(p =>
                        p.EmpleadoOrigen.Grupo != null &&
                        p.EmpleadoOrigen.Grupo.Area != null &&
                        p.EmpleadoOrigen.Grupo.Area.AreaId == areaIdAplicar.Value
                    );
                }
                else
                {
                    _logger.LogInformation("🔓 SIN FILTRO DE ÁREA (SuperUsuario o sin área)");
                }

                if (anio.HasValue)
                {
                    query = query.Where(p => p.FechaPermuta.Year == anio.Value);
                }

                var permutasRaw = await query.ToListAsync();
                _logger.LogInformation("📋 Permutas encontradas DESPUÉS DEL FILTRO: {Count}", permutasRaw.Count);

                foreach (var p in permutasRaw.Take(3))
                {
                    _logger.LogInformation("   - Permuta {Id}: {Empleado} (AreaId: {AreaId}, Area: {Area})",
                        p.Id,
                        p.EmpleadoOrigen?.FullName,
                        p.EmpleadoOrigen?.Grupo?.Area?.AreaId,
                        p.EmpleadoOrigen?.Grupo?.Area?.NombreGeneral);
                }

                var permutas = permutasRaw
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
                        SolicitadoPorId = p.SolicitadoPorId,
                        FechaSolicitud = p.FechaSolicitud,
                        EstadoSolicitud = p.EstadoSolicitud,
                        JefeAprobadorNombre = p.JefeAprobador != null ? p.JefeAprobador.FullName : null,
                        FechaRespuesta = p.FechaRespuesta,
                        MotivoRechazo = p.MotivoRechazo,
                        EmpleadoOrigenNomina = p.EmpleadoOrigen.Nomina.HasValue ? p.EmpleadoOrigen.Nomina.Value.ToString() : null,
                        EmpleadoDestinoNomina = p.EmpleadoDestino != null && p.EmpleadoDestino.Nomina.HasValue ? p.EmpleadoDestino.Nomina.Value.ToString() : null,
                    })
                    .ToList();

                _logger.LogInformation("✅ TOTAL PERMUTAS RETORNADAS: {Count}", permutas.Count);

                return new PermutasListResponse { Permutas = permutas, Total = permutas.Count };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error al obtener permutas");
                return new PermutasListResponse { Permutas = new List<PermutaListItem>(), Total = 0 };
            }
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

        public async Task<ApiResponse<object>> ResponderSolicitudPermutaAsync(
    int permutaId, bool aprobar, string? motivoRechazo, int jefeAreaId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                _logger.LogInformation("=== INICIO ResponderSolicitudPermutaAsync ===");
                _logger.LogInformation("PermutaId: {PermutaId}, Aprobar: {Aprobar}, JefeAreaId: {JefeAreaId}",
                    permutaId, aprobar, jefeAreaId);

                var permuta = await _db.Permutas
    .Include(p => p.EmpleadoOrigen)
        .ThenInclude(e => e.Grupo)
            .ThenInclude(g => g.Area)
    .Include(p => p.EmpleadoDestino)
        .ThenInclude(e => e.Grupo)
            .ThenInclude(g => g.Area)
    .FirstOrDefaultAsync(p => p.Id == permutaId);

                if (permuta == null)
                {
                    _logger.LogWarning("Permuta no encontrada: {PermutaId}", permutaId);
                    return new ApiResponse<object>(false, null, "Permuta no encontrada");
                }

                _logger.LogInformation("Permuta encontrada. Estado actual: {Estado}", permuta.EstadoSolicitud);

                if (permuta.EstadoSolicitud != "Pendiente")
                {
                    _logger.LogWarning("Permuta ya fue procesada. Estado: {Estado}", permuta.EstadoSolicitud);
                    return new ApiResponse<object>(false, null,
                        $"La permuta ya fue {permuta.EstadoSolicitud.ToLower()}");
                }

                // Obtener información del usuario que está aprobando
                var usuarioAprobador = await _db.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Id == jefeAreaId);

                if (usuarioAprobador == null)
                {
                    _logger.LogWarning("Usuario aprobador no encontrado: {JefeAreaId}", jefeAreaId);
                    return new ApiResponse<object>(false, null, "Usuario no encontrado");
                }

                _logger.LogInformation("Usuario aprobador: {Usuario}, Roles: {Roles}",
                    usuarioAprobador.FullName,
                    string.Join(", ", usuarioAprobador.Roles.Select(r => r.Name)));

                // Verificar si es SuperUsuario
                var esSuperUsuario = usuarioAprobador.Roles.Any(r => r.Name == "SuperUsuario");

                // Verificar si es Delegado Sindical
                var esDelegadoSindical = usuarioAprobador.Roles.Any(r =>
                    r.Name == "DelegadoSindical" || r.Name == "Delegado Sindical");

                // Verificar si es Jefe de Área
                var esJefeArea = usuarioAprobador.Roles.Any(r =>
                    r.Name == "JefeArea" || r.Name == "Jefe De Area");

                _logger.LogInformation("Validación de roles - SuperUsuario: {Super}, Delegado: {Delegado}, Jefe: {Jefe}",
                    esSuperUsuario, esDelegadoSindical, esJefeArea);

                // Validar permisos
                if (!esSuperUsuario && !esDelegadoSindical && !esJefeArea)
                {
                    _logger.LogWarning("Usuario sin permisos para aprobar. Roles: {Roles}",
                        string.Join(", ", usuarioAprobador.Roles.Select(r => r.Name)));
                    return new ApiResponse<object>(false, null,
                        "No tiene permisos para aprobar permutas");
                }

                // Si es Jefe de Área (y no es SuperUsuario ni Delegado), validar que sea del área correcta
                if (esJefeArea && !esSuperUsuario && !esDelegadoSindical && usuarioAprobador.AreaId.HasValue)
                {
                    var areaEmpleado = permuta.EmpleadoOrigen?.Grupo?.Area?.AreaId;
                    _logger.LogInformation("Validando área - ÁreaEmpleado (via Grupo): {AreaEmpleado}, ÁreaJefe: {AreaJefe}",
                        areaEmpleado, usuarioAprobador.AreaId);

                    if (!areaEmpleado.HasValue || usuarioAprobador.AreaId != areaEmpleado.Value)
                    {
                        _logger.LogWarning("Jefe de área diferente. ÁreaJefe: {AreaJefe}, ÁreaEmpleado: {AreaEmpleado}",
                            usuarioAprobador.AreaId, areaEmpleado);
                        return new ApiResponse<object>(false, null,
                            "No tiene permisos para aprobar permutas de esta área");
                    }
                }

                // Actualizar la permuta
                permuta.EstadoSolicitud = aprobar ? "Aprobada" : "Rechazada";
                permuta.JefeAprobadorId = jefeAreaId;
                permuta.FechaRespuesta = DateTime.UtcNow;
                permuta.MotivoRechazo = aprobar ? null : motivoRechazo;

                _logger.LogInformation("Actualizando permuta - Nuevo estado: {Estado}", permuta.EstadoSolicitud);

                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("✅ Permuta {PermutaId} {Estado} por usuario {UsuarioId} ({Roles})",
                    permutaId, permuta.EstadoSolicitud, jefeAreaId,
                    string.Join(", ", usuarioAprobador.Roles.Select(r => r.Name)));

                return new ApiResponse<object>(true, null,
                    $"Permuta {permuta.EstadoSolicitud.ToLower()} exitosamente");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "❌ Error al responder permuta {PermutaId}. Detalles: {Message}",
                    permutaId, ex.Message);
                return new ApiResponse<object>(false, null, $"Error: {ex.Message}");
            }
        }
    }
}