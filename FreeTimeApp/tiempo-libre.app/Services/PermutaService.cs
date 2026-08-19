using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;
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

                // Fecha del cambio (solo cambio individual que se mueve de día)
                DateOnly? fechaDestino = null;
                if (!string.IsNullOrWhiteSpace(request.FechaDestino))
                {
                    if (!DateOnly.TryParseExact(request.FechaDestino, "yyyy-MM-dd",
                        System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.None,
                        out var fechaDestinoParsed))
                    {
                        return new ApiResponse<SolicitudPermutaResponse>(false, null,
                            "Formato de fecha del cambio inválido");
                    }

                    if (fechaDestinoParsed != fechaPermuta)
                    {
                        fechaDestino = fechaDestinoParsed;
                    }
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

                if (fechaDestino.HasValue && !esCambioIndividual)
                {
                    return new ApiResponse<SolicitudPermutaResponse>(false, null,
                        "La fecha del cambio solo aplica en cambios individuales; " +
                        "la permuta entre dos empleados es de un solo día");
                }

                var permuta = new Permuta
                {
                    EmpleadoOrigenId = request.EmpleadoOrigenId,
                    EmpleadoDestinoId = request.EmpleadoDestinoId,
                    FechaPermuta = fechaPermuta,
                    FechaDestino = fechaDestino,
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

                if (!usuarioId.HasValue)
                {
                    // Llamar sin usuarioId dejaba la consulta sin dueño: no encontraba
                    // usuario y regresaba 0 permutas en silencio (los exports caían
                    // aquí y bajaban archivos vacíos). Es un error de programación.
                    throw new ArgumentNullException(nameof(usuarioId),
                        "ObtenerPermutasAsync requiere el id del usuario que consulta");
                }

                var usuarioConsulta = await _db.Users
                    .AsNoTracking()
                    .Include(u => u.Roles)
                    .Include(u => u.Area)
                    .Include(u => u.Grupo)
                        .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(u => u.Id == usuarioId);

                if (usuarioConsulta == null)
                {
                    _logger.LogWarning("⚠️ Usuario no encontrado: {UsuarioId}", usuarioId);
                    return new PermutasListResponse { Permutas = new List<PermutaListItem>(), Total = 0 };
                }

                var esJefeArea = RolesHelper.TieneRol(usuarioConsulta.Roles, "Jefe De Area");
                var esSuperUsuario = RolesHelper.TieneRol(usuarioConsulta.Roles, "SuperUsuario", "Super Usuario");
                var esGerenteOrRH = RolesHelper.TieneRol(usuarioConsulta.Roles, "Gerente BT", "RH");
                var tieneAreaScope = esJefeArea || esGerenteOrRH;

                // Mismo heurístico que ReprogramacionService.ConsultarSolicitudesAsync:
                // los integrantes del comité sindical no siempre traen el rol Delegado
                // en BD, pero su área es "Sindicato".
                var esDelegadoSindical = RolesHelper.TieneRol(usuarioConsulta.Roles, "Delegado Sindical") ||
                                         usuarioConsulta.Grupo?.Area?.NombreGeneral?.ToLower() == "sindicato" ||
                                         usuarioConsulta.Area?.NombreGeneral?.ToLower() == "sindicato";

                // Área efectiva del delegado: Users.AreaId, o la de su Grupo cuando el
                // sync SAP deja AreaId en null / desincronizado.
                int? areaIdDelegado = null;
                if (esDelegadoSindical)
                {
                    areaIdDelegado = usuarioConsulta.AreaId ?? usuarioConsulta.Grupo?.Area?.AreaId;
                }

                // Áreas donde este usuario tiene visibilidad: AreaJefes (Jefe de Área)
                // ∪ AreaAsignaciones (Gerente BT / RH). Un mismo usuario puede tener
                // varias áreas — todas cuentan.
                var areasComoJefe = tieneAreaScope
                    ? await AreasVisiblesHelper.AreasVisiblesAsync(_db, usuarioConsulta.Id)
                    : new List<int>();

                // Fallback: si no aparece como JefeId en ninguna área pero tiene rol jefe,
                // intentamos por su AreaId / Grupo.Area (compatibilidad con data legacy).
                if (esJefeArea && areasComoJefe.Count == 0)
                {
                    var areaFallback = usuarioConsulta.AreaId ?? usuarioConsulta.Grupo?.Area?.AreaId;
                    if (areaFallback.HasValue) areasComoJefe.Add(areaFallback.Value);
                }

                _logger.LogInformation("👤 Usuario: {Nombre}, Roles: {Roles}, AreaIdDirecto: {AreaIdDirecto}, AreaDelGrupo: {AreaDelGrupo}, ÁreasComoJefe: [{Areas}], EsJefe: {EsJefe}, EsSuper: {EsSuper}, AreaFiltro: {AreaFiltro}",
                    usuarioConsulta.FullName,
                    string.Join(", ", usuarioConsulta.Roles.Select(r => r.Name)),
                    usuarioConsulta.AreaId,
                    usuarioConsulta.Grupo?.Area?.AreaId,
                    string.Join(", ", areasComoJefe),
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

                if (areaIdFiltro.HasValue && (esSuperUsuario || tieneAreaScope || esDelegadoSindical))
                {
                    // Frontend mandó área específica. Defensivo: para jefes, también
                    // incluimos permutas asignadas a él como JefeAprobadorId y las que
                    // tocan al empleado DESTINO (no solo origen).
                    //
                    // Se exige rol con visibilidad: sin esa guarda, un sindicalizado
                    // que mandara ?areaId=N se saltaba su rama y leía las permutas de
                    // toda esa área.
                    var area = areaIdFiltro.Value;
                    var jefeIdLocal = usuarioId!.Value;
                    _logger.LogInformation("🔒 APLICANDO FILTRO DE ÁREA: {AreaId}", area);

                    query = query.Where(p =>
                        (p.EmpleadoOrigen.Grupo != null && p.EmpleadoOrigen.Grupo.Area != null &&
                         p.EmpleadoOrigen.Grupo.Area.AreaId == area) ||
                        (p.EmpleadoDestino != null && p.EmpleadoDestino.Grupo != null && p.EmpleadoDestino.Grupo.Area != null &&
                         p.EmpleadoDestino.Grupo.Area.AreaId == area) ||
                        (esJefeArea && p.JefeAprobadorId == jefeIdLocal));
                }
                else if (tieneAreaScope && !esSuperUsuario && areasComoJefe.Count == 0)
                {
                    // Gerente BT / RH (o jefe) sin ningún área asignada. Antes esta
                    // combinación se escapaba al else de abajo y se quedaba SIN
                    // filtro: veía las permutas de toda la planta. Cero es la
                    // respuesta correcta; lo que falta es asignarle sus áreas.
                    query = query.Where(p => false);
                    _logger.LogWarning(
                        "🔒 Usuario {UsuarioId} con scope de área pero SIN áreas asignadas: no se devuelven permutas",
                        usuarioId);
                }
                else if (tieneAreaScope && !esSuperUsuario)
                {
                    // Sin filtro frontend: auto-restringir a TODAS las áreas visibles
                    // (jefe o asignación Gerente/RH), origen O destino, más permutas
                    // asignadas a él como jefe aprobador.
                    var jefeIdLocal = usuarioId!.Value;
                    _logger.LogInformation("🔒 APLICANDO FILTRO MULTI-ÁREA del usuario: [{Areas}]",
                        string.Join(", ", areasComoJefe));

                    query = query.Where(p =>
                        (p.EmpleadoOrigen.Grupo != null && p.EmpleadoOrigen.Grupo.Area != null &&
                         areasComoJefe.Contains(p.EmpleadoOrigen.Grupo.Area.AreaId)) ||
                        (p.EmpleadoDestino != null && p.EmpleadoDestino.Grupo != null && p.EmpleadoDestino.Grupo.Area != null &&
                         areasComoJefe.Contains(p.EmpleadoDestino.Grupo.Area.AreaId)) ||
                        (esJefeArea && p.JefeAprobadorId == jefeIdLocal));
                }
                else if (esDelegadoSindical)
                {
                    // El delegado no tenía rama propia: caía al else de abajo y se
                    // quedaba SIN filtro, leyendo las permutas de toda la planta de
                    // todos los años. Con el volumen real eso agotaba el
                    // CommandTimeout y el catch lo convertía en "0 permutas".
                    // Mismo criterio que ReprogramacionService: las que él solicitó
                    // más las de su área (aquí SolicitadoPorId no es nullable, así
                    // que no aplica la rama de "sin solicitante").
                    var delegadoIdLocal = usuarioId.Value;
                    query = query.Where(p =>
                        p.SolicitadoPorId == delegadoIdLocal ||
                        (areaIdDelegado.HasValue &&
                            ((p.EmpleadoOrigen.Grupo != null && p.EmpleadoOrigen.Grupo.Area != null &&
                              p.EmpleadoOrigen.Grupo.Area.AreaId == areaIdDelegado.Value) ||
                             (p.EmpleadoDestino != null && p.EmpleadoDestino.Grupo != null && p.EmpleadoDestino.Grupo.Area != null &&
                              p.EmpleadoDestino.Grupo.Area.AreaId == areaIdDelegado.Value))));

                    _logger.LogInformation(
                        "🔒 FILTRO DELEGADO SINDICAL {UsuarioId} (AreaId={AreaId})",
                        delegadoIdLocal, areaIdDelegado);
                }
                else if (!esSuperUsuario)
                {
                    // Sindicalizado u otro rol sin privilegio: solo las permutas que
                    // lo involucran o que él pidió. Antes caía en el else sin filtro
                    // y veía las de sus compañeros (mismo problema de privacidad que
                    // ya se corrigió en ReprogramacionService).
                    var propioIdLocal = usuarioId.Value;
                    query = query.Where(p =>
                        p.EmpleadoOrigenId == propioIdLocal ||
                        p.EmpleadoDestinoId == propioIdLocal ||
                        p.SolicitadoPorId == propioIdLocal);

                    _logger.LogInformation("🔒 FILTRO PROPIO (rol sin scope): usuario {UsuarioId}", propioIdLocal);
                }
                else
                {
                    _logger.LogInformation("🔓 SIN FILTRO DE ÁREA (SuperUsuario)");
                }

                if (anio.HasValue)
                {
                    query = query.Where(p => p.FechaPermuta.Year == anio.Value);
                }

                var permutasRaw = await query
                    .AsNoTracking()
                    .OrderByDescending(p => p.FechaSolicitud)
                    .ToListAsync();
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
                    .Select(p => new PermutaListItem
                    {
                        Id = p.Id,
                        EmpleadoOrigenNombre = p.EmpleadoOrigen.FullName,
                        EmpleadoDestinoNombre = p.EmpleadoDestino != null ? p.EmpleadoDestino.FullName : "N/A",
                        FechaPermuta = p.FechaPermuta,
                        FechaDestino = p.FechaDestino,
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
                // NO devolver una lista vacía: hacerlo convertía cualquier falla
                // (incluido el timeout de SQL) en un "0 permutas" con HTTP 200, y la
                // pantalla no tenía forma de distinguir "no hay" de "reventó".
                // Que propague; el controller responde 500 y el usuario ve un error.
                _logger.LogError(ex, "❌ Error al obtener permutas (usuario {UsuarioId}, año {Anio})",
                    usuarioId, anio);
                throw;
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
                var esSuperUsuario = RolesHelper.TieneRol(usuarioAprobador.Roles, "SuperUsuario", "Super Usuario");

                // Verificar si es Delegado Sindical
                var esDelegadoSindical = RolesHelper.TieneRol(usuarioAprobador.Roles, "Delegado Sindical");

                // Verificar si es Jefe de Área
                var esJefeArea = RolesHelper.TieneRol(usuarioAprobador.Roles, "Jefe De Area");

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