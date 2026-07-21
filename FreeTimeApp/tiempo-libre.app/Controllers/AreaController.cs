using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Acceso sólo para usuarios autenticados
public class AreaController : ControllerBase
{
    private readonly FreeTimeDbContext _db;
    public AreaController(FreeTimeDbContext db)
    {
        _db = db;
    }

    // POST: api/Area
    [HttpPost]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> Create([FromBody] Area? area)
    {
        if (area == null)
        {
            return BadRequest(new ApiResponse<Area>(false, null, "El área es requerida"));
        }
        _db.Areas.Add(area);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Detail), new { id = area.AreaId }, new ApiResponse<Area>(true, area));
    }

    // GET: api/Area/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> Detail(int id)
    {
        var area = await _db.Areas
            .Include(a => a.Jefe)
            .Include(a => a.JefeSuplente)
            .Include(a => a.Jefes).ThenInclude(aj => aj.User)
            .Include(a => a.Asignaciones).ThenInclude(aa => aa.User)
            .FirstOrDefaultAsync(a => a.AreaId == id);

        if (area == null)
        {
            return NotFound(new ApiResponse<Area>(false, null, "Área no encontrada"));
        }

        var jefesLista = area.Jefes
            .Where(aj => aj.User != null)
            .Select(aj => new UserBasicDto
            {
                Id = aj.User!.Id,
                FullName = aj.User.FullName,
                Username = aj.User.Username
            })
            .OrderBy(u => u.FullName)
            .ToList();

        var gerentesLista = area.Asignaciones
            .Where(aa => aa.User != null && aa.RolId == (int)tiempo_libre.Models.RolEnum.Gerente_BT)
            .Select(aa => new UserBasicDto
            {
                Id = aa.User!.Id,
                FullName = aa.User.FullName,
                Username = aa.User.Username
            })
            .OrderBy(u => u.FullName)
            .ToList();

        var rhLista = area.Asignaciones
            .Where(aa => aa.User != null && aa.RolId == (int)tiempo_libre.Models.RolEnum.RH)
            .Select(aa => new UserBasicDto
            {
                Id = aa.User!.Id,
                FullName = aa.User.FullName,
                Username = aa.User.Username
            })
            .OrderBy(u => u.FullName)
            .ToList();

        var areaDetail = new AreaDetailDto
        {
            AreaId = area.AreaId,
            UnidadOrganizativaSap = area.UnidadOrganizativaSap,
            NombreGeneral = area.NombreGeneral,
            Manning = (int) area.Manning,
            JefeId = area.JefeId,
            Jefe = area.Jefe != null ? new UserBasicDto
            {
                Id = area.Jefe.Id,
                FullName = area.Jefe.FullName,
                Username = area.Jefe.Username
            } : null,
            JefeSuplenteId = area.JefeSuplenteId,
            JefeSuplente = area.JefeSuplente != null ? new UserBasicDto
            {
                Id = area.JefeSuplente.Id,
                FullName = area.JefeSuplente.FullName,
                Username = area.JefeSuplente.Username
            } : null,
            Jefes = jefesLista,
            Gerentes = gerentesLista,
            RH = rhLista
        };

        return Ok(new ApiResponse<AreaDetailDto>(true, areaDetail));
    }

    // GET: api/Area
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> List()
    {
        var areas = await _db.Areas
            .Include(a => a.Grupos)
                .ThenInclude(g => g.Lider)
            .Include(a => a.Jefe)
            .Include(a => a.JefeSuplente)
            .AsNoTracking()
            .ToListAsync();

        var areaDetailList = areas.Select(area => new AreaDetailDto
        {
            AreaId = area.AreaId,
            UnidadOrganizativaSap = area.UnidadOrganizativaSap,
            NombreGeneral = area.NombreGeneral,
            Manning = (int)area.Manning,
            JefeId = area.JefeId,
            Jefe = area.Jefe != null ? new UserBasicDto
            {
                Id = area.Jefe.Id,
                FullName = area.Jefe.FullName,
                Username = area.Jefe.Username
            } : null,
            JefeSuplenteId = area.JefeSuplenteId,
            JefeSuplente = area.JefeSuplente != null ? new UserBasicDto
            {
                Id = area.JefeSuplente.Id,
                FullName = area.JefeSuplente.FullName,
                Username = area.JefeSuplente.Username
            } : null,
            Grupos = area.Grupos.Select(g => new GrupoBasicDto
            {
                GrupoId = g.GrupoId,
                Rol = g.Rol,
                IdentificadorSAP = g.IdentificadorSAP,
                PersonasPorTurno = g.PersonasPorTurno,
                DuracionDeturno = g.DuracionDeturno,
                LiderId = g.LiderId,
                Lider = g.Lider != null ? new UserBasicDto
                {
                    Id = g.Lider.Id,
                    FullName = g.Lider.FullName,
                    Username = g.Lider.Username
                } : null
            }).ToList()
        }).ToList();

        return Ok(new ApiResponse<List<AreaDetailDto>>(true, areaDetailList));
    }

    // DELETE: api/Area/{areaId}/Grupo/{grupoId}
    [HttpDelete("{areaId}/Grupo/{grupoId}")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> DeleteGrupo(int areaId, int grupoId)
    {
        var area = await _db.Areas.Include(a => a.Grupos).FirstOrDefaultAsync(a => a.AreaId == areaId);
        if (area == null)
        {
            return NotFound(new ApiResponse<Area>(false, null, "Área no encontrada"));
        }
        var grupo = area.Grupos.FirstOrDefault(g => g.GrupoId == grupoId);
        if (grupo == null || grupo.AreaId != areaId)
        {
            return NotFound(new ApiResponse<Area>(false, null, "Grupo no encontrado en el área"));
        }
        _db.Grupos.Remove(grupo);
        await _db.SaveChangesAsync();
        var updatedArea = await _db.Areas.Include(a => a.Grupos).FirstOrDefaultAsync(a => a.AreaId == areaId);
        return Ok(new ApiResponse<Area>(true, updatedArea));
    }

    // POST: api/Area/{areaId}/Grupo
    [HttpPost("{areaId}/Grupo")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> AddGrupo(int areaId, [FromBody] tiempo_libre.DTOs.GrupoCreateRequest request)
    {
        var area = await _db.Areas.Include(a => a.Grupos).FirstOrDefaultAsync(a => a.AreaId == areaId);
        if (area == null)
        {
            return NotFound(new ApiResponse<tiempo_libre.DTOs.AreaDetailDTO>(false, null, "Área no encontrada"));
        }
        if (string.IsNullOrWhiteSpace(request.Rol) || string.IsNullOrWhiteSpace(request.IdentificadorSAP))
        {
            return BadRequest(new ApiResponse<Area>(false, null, "Rol e Identificador SAP son requeridos"));
        }
        if (request.LiderId.HasValue)
        {
            var liderExists = await _db.Users.AnyAsync(u => u.Id == request.LiderId.Value);
            if (!liderExists)
            {
                return BadRequest(new ApiResponse<Area>(false, null, "El líder especificado no existe"));
            }
        }
        var grupo = new Grupo
        {
            Rol = request.Rol,
            AreaId = areaId,
            IdentificadorSAP = request.IdentificadorSAP,
            PersonasPorTurno = request.PersonasPorTurno,
            DuracionDeturno = request.DuracionDeturno,
            LiderId = request.LiderId,
        };
        _db.Grupos.Add(grupo);
        await _db.SaveChangesAsync();
        var updatedArea = await _db.Areas.Include(a => a.Grupos).FirstOrDefaultAsync(a => a.AreaId == areaId);
        if (updatedArea == null)
        {
            return NotFound(new ApiResponse<tiempo_libre.DTOs.AreaDetailDTO>(false, null, "Área no encontrada tras agregar grupo"));
        }
        var areaDto = new tiempo_libre.DTOs.AreaDetailDTO
        {
            AreaId = updatedArea.AreaId,
            NombreGeneral = updatedArea.NombreGeneral,
            UnidadOrganizativaSap = updatedArea.UnidadOrganizativaSap,
            Grupos = updatedArea.Grupos.Select(g => new tiempo_libre.DTOs.GrupoDetailDTO
            {
                GrupoId = g.GrupoId,
                Rol = g.Rol,
                IdentificadorSAP = g.IdentificadorSAP,
                PersonasPorTurno = g.PersonasPorTurno,
                DuracionDeturno = g.DuracionDeturno,
                LiderId = g.LiderId
            }).ToList()
        };
        return Ok(new ApiResponse<tiempo_libre.DTOs.AreaDetailDTO>(true, areaDto));
    }

    // PUT: api/Area/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> Update(int id, [FromBody] Area update)
    {
        var area = await _db.Areas.FindAsync(id);
        if (area == null)
        {
            return NotFound(new ApiResponse<Area>(false, null, "Área no encontrada"));
        }
        if (string.IsNullOrWhiteSpace(update.UnidadOrganizativaSap) || string.IsNullOrWhiteSpace(update.NombreGeneral))
        {
            return BadRequest(new ApiResponse<Area>(false, null, "UnidadOrganizativaSap y NombreGeneral son requeridos"));
        }
        // Validar duplicados solo si el valor cambió (tras trim, case-insensitive).
        // De lo contrario, cualquier edición que no toque SAP/Nombre — como cambiar
        // solo el Manning — falla si la BD tiene duplicados históricos.
        var sapNuevo = update.UnidadOrganizativaSap.Trim();
        var nombreNuevo = update.NombreGeneral.Trim();
        var sapActual = (area.UnidadOrganizativaSap ?? "").Trim();
        var nombreActual = (area.NombreGeneral ?? "").Trim();

        if (!string.Equals(nombreNuevo, nombreActual, StringComparison.OrdinalIgnoreCase) &&
            _db.Areas.Any(a => a.NombreGeneral == nombreNuevo && a.AreaId != id))
        {
            return BadRequest(new ApiResponse<Area>(false, null, "El nombre general ya existe"));
        }
        if (!string.Equals(sapNuevo, sapActual, StringComparison.OrdinalIgnoreCase) &&
            _db.Areas.Any(a => a.UnidadOrganizativaSap == sapNuevo && a.AreaId != id))
        {
            return BadRequest(new ApiResponse<Area>(false, null, "La unidad organizativa SAP ya existe"));
        }
        area.UnidadOrganizativaSap = sapNuevo;
        area.NombreGeneral = nombreNuevo;
        area.Manning = update.Manning;
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Area>(true, area));
    }

    // PATCH: api/Area/{id}/manning
    // Endpoint dedicado para que Ingeniero Industrial pueda ajustar sólo el manning
    // base del área sin recibir permiso para tocar nombre/SAP/jefes.
    [HttpPatch("{id}/manning")]
    [Authorize(Roles = "SuperUsuario,Super Usuario,Ingeniero Industrial,IngenieroIndustrial")]
    public async Task<IActionResult> UpdateManning(int id, [FromBody] tiempo_libre.DTOs.AreaManningUpdateRequest request)
    {
        if (request == null || request.Manning < 0)
        {
            return BadRequest(new ApiResponse<object>(false, null, "Manning inválido"));
        }

        var area = await _db.Areas.FindAsync(id);
        if (area == null)
        {
            return NotFound(new ApiResponse<object>(false, null, "Área no encontrada"));
        }

        area.Manning = request.Manning;
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Area>(true, area));
    }

    // PATCH: api/Area/{id}/asignar-jefes
    [HttpPatch("{id}/asignar-jefes")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> AssignJefes(int id, [FromBody] tiempo_libre.DTOs.AreaAssignJefeRequest request)
    {
        var area = await _db.Areas
            .Include(a => a.Jefes)
            .FirstOrDefaultAsync(a => a.AreaId == id);
        if (area == null)
        {
            return NotFound(new ApiResponse<Area>(false, null, "Área no encontrada"));
        }

        // Recolectar TODOS los ids que deben quedar en AreaJefes.
        // - Si viene JefeIds (multi-jefes), esa es la lista fuente de verdad.
        // - Si no viene JefeIds, se toma la unión de JefeId + JefeSuplenteId
        //   para no romper el flujo antiguo.
        var ids = new HashSet<int>();
        if (request.JefeIds != null && request.JefeIds.Count > 0)
        {
            foreach (var jid in request.JefeIds) if (jid > 0) ids.Add(jid);
        }
        if (request.JefeId.HasValue && request.JefeId.Value > 0) ids.Add(request.JefeId.Value);
        if (request.JefeSuplenteId.HasValue && request.JefeSuplenteId.Value > 0) ids.Add(request.JefeSuplenteId.Value);

        // Validar que todos existan y tengan rol "Jefe De Area".
        if (ids.Count > 0)
        {
            var users = await _db.Users
                .Include(u => u.Roles)
                .Where(u => ids.Contains(u.Id))
                .ToListAsync();
            if (users.Count != ids.Count)
                return BadRequest(new ApiResponse<Area>(false, null, "Alguno(s) de los jefes indicados no existe(n)."));
            var invalid = users.Where(u => !u.Roles.Any(r => r.Name == "Jefe De Area")).Select(u => u.FullName).ToList();
            if (invalid.Any())
                return BadRequest(new ApiResponse<Area>(false, null, $"No tiene(n) rol 'Jefe de Area': {string.Join(", ", invalid)}"));
        }

        // Mantener JefeId/JefeSuplenteId por compatibilidad:
        //   - JefeId  = primer id de JefeIds (o request.JefeId si aplica)
        //   - JefeSuplenteId = segundo id (o request.JefeSuplenteId)
        var listaFinal = (request.JefeIds != null && request.JefeIds.Count > 0)
            ? request.JefeIds.Where(v => v > 0).Distinct().ToList()
            : new List<int>();

        if (listaFinal.Count > 0)
        {
            area.JefeId = listaFinal[0];
            area.JefeSuplenteId = listaFinal.Count > 1 ? listaFinal[1] : (int?)null;
        }
        else
        {
            area.JefeId = request.JefeId;
            area.JefeSuplenteId = request.JefeSuplenteId;
        }

        // Reemplazar AreaJefes con la unión completa.
        _db.AreaJefes.RemoveRange(area.Jefes);
        foreach (var uid in ids)
        {
            area.Jefes.Add(new AreaJefe { AreaId = area.AreaId, UserId = uid, CreatedAt = DateTime.UtcNow });
        }

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Area>(true, area));
    }

    // PATCH: api/Area/{id}/asignar-gerente-rh
    // Reemplaza en un solo request la lista de Gerentes BT y/o RH asignados
    // al área. Cada lista es "fuente de verdad": lo que venga en el body es
    // exactamente lo que queda. Null = no tocar ese rol.
    [HttpPatch("{id}/asignar-gerente-rh")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> AssignGerenteRH(int id, [FromBody] tiempo_libre.DTOs.AreaAsignarGerenteRHRequest request)
    {
        var area = await _db.Areas
            .Include(a => a.Asignaciones)
            .FirstOrDefaultAsync(a => a.AreaId == id);
        if (area == null)
            return NotFound(new ApiResponse<Area>(false, null, "Área no encontrada"));

        var gerenteRolId = (int)tiempo_libre.Models.RolEnum.Gerente_BT;
        var rhRolId = (int)tiempo_libre.Models.RolEnum.RH;

        // Validar existencia y rol de los usuarios que vienen (si vienen).
        var todosIds = new HashSet<int>();
        if (request.GerenteIds != null) foreach (var uid in request.GerenteIds) if (uid > 0) todosIds.Add(uid);
        if (request.RHIds != null) foreach (var uid in request.RHIds) if (uid > 0) todosIds.Add(uid);

        Dictionary<int, tiempo_libre.Models.User> usersById = new();
        if (todosIds.Count > 0)
        {
            var usersLoaded = await _db.Users
                .Include(u => u.Roles)
                .Where(u => todosIds.Contains(u.Id))
                .ToListAsync();
            if (usersLoaded.Count != todosIds.Count)
                return BadRequest(new ApiResponse<Area>(false, null, "Alguno(s) de los usuarios indicados no existe(n)."));
            usersById = usersLoaded.ToDictionary(u => u.Id);
        }

        List<string> Invalidos(IEnumerable<int>? ids, string rolNombre)
        {
            if (ids == null) return new List<string>();
            return ids.Where(uid => uid > 0)
                .Where(uid => usersById.TryGetValue(uid, out var u) && !u.Roles.Any(r => r.Name == rolNombre))
                .Select(uid => usersById[uid].FullName)
                .ToList();
        }

        var invGerente = Invalidos(request.GerenteIds, "Gerente BT");
        if (invGerente.Any())
            return BadRequest(new ApiResponse<Area>(false, null, $"No tiene(n) rol 'Gerente BT': {string.Join(", ", invGerente)}"));

        var invRH = Invalidos(request.RHIds, "RH");
        if (invRH.Any())
            return BadRequest(new ApiResponse<Area>(false, null, $"No tiene(n) rol 'RH': {string.Join(", ", invRH)}"));

        // Reemplazar Gerentes si la lista viene (null → conservar).
        if (request.GerenteIds != null)
        {
            var actuales = area.Asignaciones.Where(a => a.RolId == gerenteRolId).ToList();
            _db.AreaAsignaciones.RemoveRange(actuales);
            foreach (var uid in request.GerenteIds.Where(v => v > 0).Distinct())
            {
                area.Asignaciones.Add(new AreaAsignacion
                {
                    AreaId = area.AreaId,
                    UserId = uid,
                    RolId = gerenteRolId,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // Reemplazar RH si la lista viene.
        if (request.RHIds != null)
        {
            var actuales = area.Asignaciones.Where(a => a.RolId == rhRolId).ToList();
            _db.AreaAsignaciones.RemoveRange(actuales);
            foreach (var uid in request.RHIds.Where(v => v > 0).Distinct())
            {
                area.Asignaciones.Add(new AreaAsignacion
                {
                    AreaId = area.AreaId,
                    UserId = uid,
                    RolId = rhRolId,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Area>(true, area));
    }

    /// <summary>
    /// Obtiene las áreas donde el usuario especificado es líder de grupo
    /// </summary>
    /// <param name="liderId">ID del usuario que es líder de grupo</param>
    /// <returns>Lista de áreas donde el usuario es líder</returns>
    [HttpGet("by-lider/{liderId}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<AreaDetailDTO>>>> GetAreasByLider(int liderId)
    {
        var areas = await _db.Areas
            .Where(a => a.Grupos.Any(g => g.LiderId == liderId))
            .Select(a => new AreaDetailDTO
            {
                AreaId = a.AreaId,
                UnidadOrganizativaSap = a.UnidadOrganizativaSap,
                NombreGeneral = a.NombreGeneral,
                Manning = (int)a.Manning,
                Grupos = a.Grupos
                    .Where(g => g.LiderId == liderId)
                    .Select(g => new GrupoDetailDTO
                    {
                        GrupoId = g.GrupoId,
                        Rol = g.Rol,
                        IdentificadorSAP = g.IdentificadorSAP,
                        PersonasPorTurno = g.PersonasPorTurno,
                        DuracionDeturno = g.DuracionDeturno,
                        LiderId = g.LiderId
                    }).ToList()
            })
            .ToListAsync();

        if (!areas.Any())
        {
            return NotFound(new ApiResponse<List<AreaDetailDTO>>(false, null, "No se encontraron áreas para el líder especificado"));
        }

        return Ok(new ApiResponse<List<AreaDetailDTO>>(true, areas));
    }

    #region AreaIngeniero Management Endpoints

    /// <summary>
    /// Asignar un ingeniero a un área
    /// </summary>
    [HttpPost("{areaId}/assign-ingeniero")]
    [Authorize(Roles = "SuperUsuario,Administrador")]
    public async Task<ActionResult<AreaIngenieroDTO>> AssignIngenieroToArea(int areaId, [FromBody] AreaIngenieroAssignRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(new ApiResponse<AreaIngenieroDTO>(false, null, "Datos de entrada inválidos"));
        }

        // Verificar que el área existe
        var area = await _db.Areas.FindAsync(areaId);
        if (area == null)
        {
            return NotFound(new ApiResponse<AreaIngenieroDTO>(false, null, $"Área con ID {areaId} no encontrada"));
        }

        // Verificar que el usuario existe
        var ingeniero = await _db.Users.FindAsync(request.IngenieroId);
        if (ingeniero == null)
        {
            return NotFound(new ApiResponse<AreaIngenieroDTO>(false, null, $"Usuario con ID {request.IngenieroId} no encontrado"));
        }

        // Verificar que no existe una asignación activa
        var existingAssignment = await _db.AreaIngenieros
            .FirstOrDefaultAsync(ai => ai.AreaId == areaId && 
                                     ai.IngenieroId == request.IngenieroId && 
                                     ai.Activo);

        if (existingAssignment != null)
        {
            return Conflict(new ApiResponse<AreaIngenieroDTO>(false, null, "El ingeniero ya está asignado a esta área"));
        }

        // Crear nueva asignación
        var areaIngeniero = new AreaIngeniero
        {
            AreaId = areaId,
            IngenieroId = request.IngenieroId,
            FechaAsignacion = DateTime.UtcNow,
            Activo = true
        };

        _db.AreaIngenieros.Add(areaIngeniero);
        await _db.SaveChangesAsync();

        // Cargar datos relacionados para la respuesta
        await _db.Entry(areaIngeniero)
            .Reference(ai => ai.Area)
            .LoadAsync();
        await _db.Entry(areaIngeniero)
            .Reference(ai => ai.Ingeniero)
            .LoadAsync();

        var result = new AreaIngenieroDTO
        {
            Id = areaIngeniero.Id,
            AreaId = areaIngeniero.AreaId,
            AreaNombre = areaIngeniero.Area.NombreGeneral,
            IngenieroId = areaIngeniero.IngenieroId,
            FullName = areaIngeniero.Ingeniero.FullName,
            Username = areaIngeniero.Ingeniero.Username,
            FechaAsignacion = areaIngeniero.FechaAsignacion,
            FechaDesasignacion = areaIngeniero.FechaDesasignacion,
            Activo = areaIngeniero.Activo
        };

        return Ok(new ApiResponse<AreaIngenieroDTO>(true, result));
    }

    /// <summary>
    /// Desasignar un ingeniero de un área
    /// </summary>
    [HttpPost("{areaId}/unassign-ingeniero/{id}")]
    [Authorize(Roles = "SuperUsuario,Administrador,Ingeniero Industrial, SuperUsuario, Administrador")]
    public async Task<ActionResult<AreaIngenieroDTO>> UnassignIngenieroFromArea(int areaId, int id)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(new ApiResponse<AreaIngenieroDTO>(false, null, "Datos de entrada inválidos"));
        }

        var assignment = await _db.AreaIngenieros
            .Include(ai => ai.Area)
            .Include(ai => ai.Ingeniero)
            .FirstOrDefaultAsync(ai => ai.Id == id);


        if (assignment == null)
        {
            return NotFound(new ApiResponse<AreaIngenieroDTO>(false, null, "No se encontró una asignación activa para este ingeniero en esta área"));
        }

        var result = new AreaIngenieroDTO
        {
            Id = assignment.Id,
            AreaId = assignment.AreaId,
            AreaNombre = assignment.Area.NombreGeneral,
            IngenieroId = assignment.IngenieroId,
            FullName = assignment.Ingeniero.FullName,
            Username = assignment.Ingeniero.Username,
            FechaAsignacion = assignment.FechaAsignacion,
            FechaDesasignacion = DateTime.UtcNow,
            Activo = false
        };

        // Eliminar el registro completamente
        _db.AreaIngenieros.Remove(assignment);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<AreaIngenieroDTO>(true, result));
    }

    /// <summary>
    /// Obtener todas las asignaciones de ingenieros por área
    /// </summary>
    [HttpGet("{areaId}/ingenieros")]
    [Authorize]
    public async Task<ActionResult<List<AreaIngenieroDTO>>> GetIngenierosByArea(int areaId, [FromQuery] bool? activo = null)
    {
        var area = await _db.Areas.FindAsync(areaId);
        if (area == null)
        {
            return NotFound(new ApiResponse<List<AreaIngenieroDTO>>(false, null, "Área no encontrada"));
        }

        var query = _db.AreaIngenieros
            .Include(ai => ai.Area)
            .Include(ai => ai.Ingeniero)
            .Where(ai => ai.AreaId == areaId);

        if (activo.HasValue)
        {
            query = query.Where(ai => ai.Activo == activo.Value);
        }

        var assignments = await query.ToListAsync();

        var result = assignments.Select(assignment => new AreaIngenieroDTO
        {
            Id = assignment.Id,
            AreaId = assignment.AreaId,
            AreaNombre = assignment.Area.NombreGeneral,
            IngenieroId = assignment.IngenieroId,
            FullName = assignment.Ingeniero.FullName,
            Username = assignment.Ingeniero.Username,
            FechaAsignacion = assignment.FechaAsignacion,
            FechaDesasignacion = assignment.FechaDesasignacion,
            Activo = assignment.Activo
        }).ToList();

        return Ok(new ApiResponse<List<AreaIngenieroDTO>>(true, result));
    }

    /// <summary>
    /// Obtener todas las áreas asignadas a un ingeniero
    /// </summary>
    [HttpGet("by-ingeniero/{ingenieroId}")]
    [Authorize(Roles = "Super Usuario,Administrador,Jefe,Jefe Suplente,Ingeniero Industrial")]
    public async Task<ActionResult<List<AreaIngenieroDTO>>> GetAreasByIngeniero(int ingenieroId, [FromQuery] bool? activo = null)
    {
        var ingeniero = await _db.Users.FindAsync(ingenieroId);
        if (ingeniero == null)
        {
            return NotFound(new ApiResponse<List<AreaIngenieroDTO>>(false, null, "Ingeniero no encontrado"));
        }

        var query = _db.AreaIngenieros
            .Include(ai => ai.Area)
            .Include(ai => ai.Ingeniero)
            .Include(ai => ai.Suplente)
            .Where(ai => ai.IngenieroId == ingenieroId || ai.SuplenteId == ingenieroId);

        if (activo.HasValue)
        {
            query = query.Where(ai => ai.Activo == activo.Value);
        }

        var assignments = await query.ToListAsync();

        var result = assignments.Select(assignment => new AreaIngenieroDTO
        {
            Id = assignment.Id,
            AreaId = assignment.AreaId,
            AreaNombre = assignment.Area.NombreGeneral,
            IngenieroId = assignment.IngenieroId,
            FullName = assignment.Ingeniero.FullName,
            Username = assignment.Ingeniero.Username,
            SuplenteId = assignment.SuplenteId,
            SuplenteFullName = assignment.Suplente?.FullName,
            SuplenteUsername = assignment.Suplente?.Username,
            FechaAsignacion = assignment.FechaAsignacion,
            FechaDesasignacion = assignment.FechaDesasignacion,
            Activo = assignment.Activo
        }).ToList();

        return Ok(new ApiResponse<List<AreaIngenieroDTO>>(true, result));
    }

    #endregion

    #region DTOs for AreaController
    public class AreaDetailDto
    {
        public int AreaId { get; set; }
        public required string UnidadOrganizativaSap { get; set; }
        public required string NombreGeneral { get; set; }
        public int Manning { get; set; }
        public int? JefeId { get; set; }
        public UserBasicDto? Jefe { get; set; }
        public int? JefeSuplenteId { get; set; }
        public UserBasicDto? JefeSuplente { get; set; }
        public List<UserBasicDto> Jefes { get; set; } = new();
        public List<UserBasicDto> Gerentes { get; set; } = new();
        public List<UserBasicDto> RH { get; set; } = new();
        public List<GrupoBasicDto> Grupos { get; set; } = new();
    }

    public class UserBasicDto
    {
        public int Id { get; set; }
        public required string FullName { get; set; }
        public required string Username { get; set; }
    }

    public class GrupoBasicDto
    {
        public int GrupoId { get; set; }
        public required string Rol { get; set; }
        public required string IdentificadorSAP { get; set; }
        public int PersonasPorTurno { get; set; }
        public int DuracionDeturno { get; set; }
        public int? LiderId { get; set; }
        public UserBasicDto? Lider { get; set; }
    }

    public class AreaIngenieroDTO
    {
        public int Id { get; set; }
        public int AreaId { get; set; }
        public string AreaNombre { get; set; } = null!;
        public int IngenieroId { get; set; }
        public string FullName { get; set; } = null!;
        public string Username { get; set; } = null!;
        public int? SuplenteId { get; set; }
        public string? SuplenteFullName { get; set; }
        public string? SuplenteUsername { get; set; }
        public DateTime FechaAsignacion { get; set; }
        public DateTime? FechaDesasignacion { get; set; }
        public bool Activo { get; set; }
    }

    public class AreaIngenieroAssignRequest
    {
        public int IngenieroId { get; set; }
    }
    #endregion
}
