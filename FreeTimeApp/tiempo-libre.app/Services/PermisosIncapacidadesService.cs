using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Services
{
    public class PermisosIncapacidadesService
    {
        private readonly FreeTimeDbContext _db;
        private readonly NotificacionesService _notificacionesService;
        private readonly ILogger<PermisosIncapacidadesService> _logger;

        // Mapeo de ClAbPre a Clave de Visualizaci�n
        private readonly Dictionary<int, string> _mapeoClaves = new()
        {
            { 2380, "P" },  // Permiso con Goce (tambi�n usado para E)
            { 1331, "P" },  // Permiso Defunci�n
            { 1100, "V" },  // Vacaci�n
            { 2310, "G" },  // Permiso sin Goce
            { 2381, "A" },  // Inc. Accidente de Trabajo (tambi�n H)
            { 2396, "M" },  // Inc. por Maternidad
            { 2394, "R" },  // Inc. Pble. Riesgo Trabajo
            { 2123, "S" },  // Suspensi�n
            { 1315, "O" }   // PCG por Paternidad
        };

        private readonly Dictionary<int, string> _descripcionClaves = new()
        {
            { 2380, "Permiso con Goce / Inc. Enfermedad General" },
            { 1331, "Permiso Defunci�n" },
            { 1100, "Vacaci�n" },
            { 2310, "Permiso sin Goce" },
            { 2381, "Inc. Accidente de Trabajo / Perm. sin goce" },
            { 2396, "Inc. por Maternidad" },
            { 2394, "Inc. Pble. Riesgo Trabajo" },
            { 2123, "Suspensi�n" },
            { 1315, "PCG por Paternidad" }
        };

        public PermisosIncapacidadesService(
            FreeTimeDbContext db,
            NotificacionesService notificacionesService,
            ILogger<PermisosIncapacidadesService> logger)
        {
            _db = db;
            _notificacionesService = notificacionesService;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene la clave de visualizaci�n seg�n el c�digo SAP y contexto
        /// </summary>
        private string ObtenerClaveVisualizacion(int clAbPre, string? contexto = null)
        {
            // Casos especiales donde el mismo ClAbPre tiene m�ltiples visualizaciones
            if (clAbPre == 2380)
            {
                // Si el contexto indica enfermedad, retorna "E", sino "P"
                return contexto?.ToUpper().Contains("ENFERMEDAD") == true ? "E" : "P";
            }

            if (clAbPre == 2381)
            {
                // Si el contexto indica permiso sin goce, retorna "H", sino "A"
                return contexto?.ToUpper().Contains("PERMISO") == true ? "H" : "A";
            }

            return _mapeoClaves.TryGetValue(clAbPre, out var clave) ? clave : clAbPre.ToString();
        }

        /// <summary>
        /// Crea un registro de permiso o incapacidad
        /// </summary>
        public async Task<ApiResponse<CrearPermisoIncapacidadResponse>> CrearPermisoIncapacidadAsync(
            CrearPermisoIncapacidadRequest request,
            int usuarioRegistraId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {
                // 1. Validar que el empleado existe
                var empleado = await _db.Users
                    .Include(u => u.Grupo)
                        .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(u => u.Nomina == request.Nomina);

                if (empleado == null)
                {
                    return new ApiResponse<CrearPermisoIncapacidadResponse>(
                        false, null, $"No se encontr� un empleado con n�mina {request.Nomina}");
                }

                // 2. Validar fechas
                if (request.FechaFin < request.FechaInicio)
                {
                    return new ApiResponse<CrearPermisoIncapacidadResponse>(
                        false, null, "La fecha fin no puede ser anterior a la fecha de inicio");
                }

                // 3. Validar que el tipo de permiso existe en el cat�logo
                var clAbPreInt = int.Parse(request.ClAbPre);
                if (!_mapeoClaves.ContainsKey(clAbPreInt) && clAbPreInt != 2381)
                {
                    return new ApiResponse<CrearPermisoIncapacidadResponse>(
                        false, null, $"El c�digo de permiso {request.ClAbPre} no es v�lido");
                }

                // 4. Calcular d�as h�biles (excluyendo fines de semana y d�as inh�biles)
                var diasInhabiles = await _db.DiasInhabiles
                    .Where(d => d.Fecha >= request.FechaInicio && d.Fecha <= request.FechaFin)
                    .Select(d => d.Fecha)
                    .ToListAsync();

                var fechasAfectadas = new List<DateOnly>();
                var fechaActual = request.FechaInicio;

                while (fechaActual <= request.FechaFin)
                {
                    var diaSemana = fechaActual.DayOfWeek;

                    // Excluir fines de semana y d�as inh�biles
                    if (diaSemana != DayOfWeek.Saturday &&
                        diaSemana != DayOfWeek.Sunday &&
                        !diasInhabiles.Contains(fechaActual))
                    {
                        fechasAfectadas.Add(fechaActual);
                    }

                    fechaActual = fechaActual.AddDays(1);
                }

                if (!fechasAfectadas.Any())
                {
                    return new ApiResponse<CrearPermisoIncapacidadResponse>(
                        false, null, "El rango de fechas seleccionado no contiene d�as h�biles");
                }

                // 5. Verificar conflictos con permisos existentes
                var conflictos = await _db.PermisosEIncapacidadesSAP
                    .Where(p => p.Nomina == request.Nomina &&
                               ((p.Desde >= request.FechaInicio && p.Desde <= request.FechaFin) ||
                                (p.Hasta >= request.FechaInicio && p.Hasta <= request.FechaFin) ||
                                (p.Desde <= request.FechaInicio && p.Hasta >= request.FechaFin)))
                    .ToListAsync();

                if (conflictos.Any())
                {
                    var detalleConflictos = string.Join(", ",
                        conflictos.Select(c => $"{c.ClaseAbsentismo} ({c.Desde:dd/MM/yyyy} - {c.Hasta:dd/MM/yyyy})"));

                    _logger.LogWarning(
                        "Conflictos encontrados para n�mina {Nomina}: {Conflictos}",
                        request.Nomina, detalleConflictos);
                }

                // 6. Obtener la clave de visualizaci�n
                var claveVisualizacion = ObtenerClaveVisualizacion(clAbPreInt, request.Observaciones);
                var descripcion = _descripcionClaves.TryGetValue(clAbPreInt, out var desc)
                    ? desc
                    : "Permiso/Incapacidad";

                // 7. Crear el registro en la tabla PermisosEIncapacidadesSAP
                var nuevoPermiso = new PermisosEIncapacidadesSAP
                {
                    Nomina = request.Nomina,
                    Nombre = empleado.FullName,
                    Posicion = empleado.Posicion ?? "N/A",
                    Desde = request.FechaInicio,
                    Hasta = request.FechaFin,
                    ClAbPre = clAbPreInt,
                    ClaseAbsentismo = descripcion,
                    Dias = request.Dias ?? fechasAfectadas.Count,
                    DiaNat = fechasAfectadas.Count,
                    Observaciones = request.Observaciones,
                    EsRegistroManual = true,
                    FechaRegistro = DateTime.Now,
                    UsuarioRegistraId = usuarioRegistraId
                };

                _db.PermisosEIncapacidadesSAP.Add(nuevoPermiso);
                await _db.SaveChangesAsync();

                // 8. Notificar al empleado y jefe de �rea
                var usuarioRegistra = await _db.Users.FindAsync(usuarioRegistraId);

                await _notificacionesService.CrearNotificacionAsync(
                    Models.Enums.TiposDeNotificacionEnum.RegistroVacaciones,
                    $"Registro de {descripcion}",
                    $"Se ha registrado un permiso/incapacidad del {request.FechaInicio:dd/MM/yyyy} al {request.FechaFin:dd/MM/yyyy}. " +
                    $"D�as afectados: {fechasAfectadas.Count}. " +
                    (string.IsNullOrEmpty(request.Observaciones) ? "" : $"Observaciones: {request.Observaciones}"),
                    usuarioRegistra?.FullName ?? "Sistema",
                    empleado.Id,
                    usuarioRegistraId,
                    empleado.Grupo?.AreaId,
                    empleado.GrupoId,
                    "PermisoIncapacidad",
                    null,
                    new
                    {
                        Nomina = request.Nomina,
                        TipoPermiso = claveVisualizacion,
                        FechaInicio = request.FechaInicio,
                        FechaFin = request.FechaFin,
                        Dias = fechasAfectadas.Count
                    }
                );

                await transaction.CommitAsync();

                var response = new CrearPermisoIncapacidadResponse
                {
                    Exitoso = true,
                    Mensaje = $"Permiso/Incapacidad registrado exitosamente. {fechasAfectadas.Count} d�a(s) afectado(s).",
                    Nomina = request.Nomina,
                    NombreEmpleado = empleado.FullName,
                    TipoPermiso = claveVisualizacion,
                    DescripcionPermiso = descripcion,
                    FechaInicio = request.FechaInicio,
                    FechaFin = request.FechaFin,
                    DiasAfectados = fechasAfectadas.Count,
                    FechasRegistradas = fechasAfectadas
                };

                _logger.LogInformation(
                    "Permiso/Incapacidad creado para n�mina {Nomina}: {Tipo} del {Inicio} al {Fin}",
                    request.Nomina, claveVisualizacion, request.FechaInicio, request.FechaFin);

                return new ApiResponse<CrearPermisoIncapacidadResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al crear permiso/incapacidad para n�mina {Nomina}", request.Nomina);
                return new ApiResponse<CrearPermisoIncapacidadResponse>(
                    false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Consulta permisos e incapacidades con filtros
        /// </summary>
        public async Task<ApiResponse<ConsultarPermisosResponse>> ConsultarPermisosAsync(
            ConsultarPermisosRequest request)
        {
            try
            {
                var query = _db.PermisosEIncapacidadesSAP.AsQueryable();

                if (request.Nomina.HasValue)
                {
                    query = query.Where(p => p.Nomina == request.Nomina.Value);
                }

                if (request.EmpleadoId.HasValue)
                {
                    var empleado = await _db.Users
                        .Where(u => u.Id == request.EmpleadoId.Value)
                        .Select(u => u.Nomina)
                        .FirstOrDefaultAsync();

                    if (empleado.HasValue)
                    {
                        query = query.Where(p => p.Nomina == empleado.Value);
                    }
                }

                if (request.FechaInicio.HasValue)
                {
                    query = query.Where(p => p.Hasta >= request.FechaInicio.Value);
                }

                if (request.FechaFin.HasValue)
                {
                    query = query.Where(p => p.Desde <= request.FechaFin.Value);
                }

                if (request.ClAbPre.HasValue)
                {
                    query = query.Where(p => p.ClAbPre == request.ClAbPre.Value);
                }

                var permisos = await query
                    .OrderByDescending(p => p.Desde)
                    .ToListAsync();

                var permisosDto = permisos.Select(p => new PermisoIncapacidadDto
                {
                    Id = p.Id,
                    Nomina = p.Nomina,
                    Nombre = p.Nombre,
                    Posicion = p.Posicion,
                    Desde = p.Desde,
                    Hasta = p.Hasta,
                    ClAbPre = p.ClAbPre,
                    ClaveVisualizacion = ObtenerClaveVisualizacion(p.ClAbPre, p.ClaseAbsentismo),
                    ClaseAbsentismo = p.ClaseAbsentismo,
                    Dias = p.Dias ?? 0,
                    DiaNat = p.DiaNat ?? 0,
                    Observaciones = p.Observaciones,
                    EsRegistroManual = p.EsRegistroManual,
                    FechaRegistro = p.FechaRegistro
                }).ToList();

                var response = new ConsultarPermisosResponse
                {
                    TotalRegistros = permisosDto.Count,
                    Permisos = permisosDto
                };

                return new ApiResponse<ConsultarPermisosResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar permisos/incapacidades");
                return new ApiResponse<ConsultarPermisosResponse>(
                    false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Elimina un permiso o incapacidad (solo registros manuales)
        /// </summary>
        public async Task<ApiResponse<object>> EliminarPermisoAsync(
            EliminarPermisoRequest request,
            int usuarioEliminaId)
        {
            try
            {
                var permiso = await _db.PermisosEIncapacidadesSAP
                    .FirstOrDefaultAsync(p =>
                        p.Nomina == request.Nomina &&
                        p.Desde == request.Desde &&
                        p.Hasta == request.Hasta &&
                        p.ClAbPre == request.ClAbPre);

                if (permiso == null)
                {
                    return new ApiResponse<object>(false, null, "Permiso/Incapacidad no encontrado");
                }

                if (!permiso.EsRegistroManual)
                {
                    return new ApiResponse<object>(
                        false, null,
                        "No se pueden eliminar registros provenientes de SAP. Solo se pueden eliminar registros manuales.");
                }

                _db.PermisosEIncapacidadesSAP.Remove(permiso);
                await _db.SaveChangesAsync();

                _logger.LogInformation(
                    "Permiso/Incapacidad eliminado por usuario {UsuarioId}: N�mina {Nomina}, {Desde} - {Hasta}",
                    usuarioEliminaId, request.Nomina, request.Desde, request.Hasta);

                return new ApiResponse<object>(
                    true, null,
                    "Permiso/Incapacidad eliminado exitosamente");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar permiso/incapacidad");
                return new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Obtiene el cat�logo de tipos de permisos e incapacidades
        /// </summary>
        public CatalogoPermisosResponse ObtenerCatalogoPermisos()
        {
            return new CatalogoPermisosResponse();
        }

        /// <summary>
        /// Extiende la fecha "Hasta" de un permiso/incapacidad existente.
        /// Activar las nomenclaturas (E, A, M, P, etc.) en el rol semanal en los nuevos días.
        /// Solo Jefe de Área, Ingeniero Industrial, Líder de Grupo o SuperUsuario.
        /// </summary>
        public async Task<ApiResponse<object>> ExtenderPermisoIncapacidadAsync(
            ExtenderPermisoIncapacidadRequest request,
            int usuarioId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var permiso = await _db.PermisosEIncapacidadesSAP
                    .FirstOrDefaultAsync(p => p.Id == request.PermisoId);

                if (permiso == null)
                    return new ApiResponse<object>(false, null, "Permiso/incapacidad no encontrado.");

                if (request.NuevaFechaHasta <= permiso.Hasta)
                    return new ApiResponse<object>(false, null,
                        $"La nueva fecha Hasta ({request.NuevaFechaHasta:yyyy-MM-dd}) debe ser posterior a la actual ({permiso.Hasta:yyyy-MM-dd}).");

                // Recalcular d�as h�biles totales en [Desde, NuevaFechaHasta]
                var diasInhabiles = await _db.DiasInhabiles
                    .Where(d => d.Fecha >= permiso.Desde && d.Fecha <= request.NuevaFechaHasta)
                    .Select(d => d.Fecha)
                    .ToListAsync();

                int diasHabiles = 0;
                int diasNaturales = 0;
                for (var f = permiso.Desde; f <= request.NuevaFechaHasta; f = f.AddDays(1))
                {
                    diasNaturales++;
                    if (f.DayOfWeek == DayOfWeek.Saturday || f.DayOfWeek == DayOfWeek.Sunday) continue;
                    if (diasInhabiles.Contains(f)) continue;
                    diasHabiles++;
                }

                var hastaAnterior = permiso.Hasta;
                permiso.Hasta = request.NuevaFechaHasta;
                permiso.Dias = diasHabiles;
                permiso.DiaNat = diasNaturales;
                permiso.EsRegistroManual = true;

                if (!string.IsNullOrWhiteSpace(request.Observaciones))
                {
                    var marca = $"[Extendido por usuario {usuarioId} el {DateTime.UtcNow:yyyy-MM-dd HH:mm}: {hastaAnterior:yyyy-MM-dd} → {request.NuevaFechaHasta:yyyy-MM-dd}] ";
                    permiso.Observaciones = string.IsNullOrEmpty(permiso.Observaciones)
                        ? marca + request.Observaciones
                        : permiso.Observaciones + " | " + marca + request.Observaciones;
                }

                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation(
                    "Usuario {UsuarioId} extendió permiso {PermisoId} de nómina {Nomina}: {Anterior} → {Nuevo}",
                    usuarioId, permiso.Id, permiso.Nomina, hastaAnterior, request.NuevaFechaHasta);

                return new ApiResponse<object>(true, new
                {
                    permisoId = permiso.Id,
                    nomina = permiso.Nomina,
                    desde = permiso.Desde,
                    hastaAnterior,
                    hastaNuevo = permiso.Hasta,
                    diasHabiles,
                    diasNaturales,
                }, "Permiso/incapacidad extendido correctamente.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error extendiendo permiso/incapacidad {Id}", request.PermisoId);
                return new ApiResponse<object>(false, null, "Error al extender: " + ex.Message);
            }
        }
    }
}