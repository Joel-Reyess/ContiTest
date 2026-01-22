using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Collections.Generic;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using Microsoft.AspNetCore.Http;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
using tiempo_libre.Middlewares;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.app.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // Acceso sólo para usuarios autenticados
    public class UserController : ControllerBase
    {
        private readonly FreeTimeDbContext _dbContext;
        private readonly ILogger<UserController> _logger;

        public UserController(FreeTimeDbContext dbContext, ILogger<UserController> logger)
        {
            _dbContext = dbContext;
            _logger = logger;
        }

        // EP: Modificar la máquina de un usuario
        [HttpPatch("update-maquina/{id}")]
        [Authorize]
        public async Task<IActionResult> UpdateUserMaquina(int id, [FromBody] UpdateMaquinaRequest request)
        {
            var userToUpdate = await _dbContext.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Id == id);
            if (userToUpdate == null)
            {
                _logger.LogWarning("Intento de modificar máquina de usuario inexistente. Id: {Id}", id);
                return NotFound(new ApiResponse<object>(false, null, "Usuario no encontrado"));
            }

            var currentUsername = User.Identity?.Name;
            var currentUser = await _dbContext.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Username == currentUsername);
            if (currentUser == null)
            {
                _logger.LogWarning("Usuario no autenticado al modificar máquina. Id: {Id}", id);
                return Unauthorized(new ApiResponse<object>(false, null, "No hay sesión iniciada"));
            }

            var allowedRoles = new[] { "SuperUsuario", "Super Usuario", "Jefe De Area", "JefeArea", "Lider De Grupo", "Ingeniero Industrial" };
            bool hasPermission = currentUser.Roles.Any(r => allowedRoles.Contains(r.Name));
            if (!hasPermission)
            {
                _logger.LogWarning("Usuario {Username} sin permisos para modificar máquina de usuario {Id}", currentUsername, id);
                return Forbid();
            }

            // Validar que el usuario a modificar tenga el rol Empleado_Sindicalizado
            var empleadoSindicalizadoId = (int)RolEnum.Empleado_Sindicalizado;
            bool isSindicalizado = userToUpdate.Roles.Any(r => r.Id == empleadoSindicalizadoId);
            if (!isSindicalizado)
            {
                _logger.LogWarning("Intento de asignar máquina a usuario sin rol sindicalizado. Id: {Id}", id);
                return BadRequest(new ApiResponse<object>(false, null, "Solo se puede asignar máquina a usuarios con rol Empleado_Sindicalizado"));
            }

            userToUpdate.Maquina = request.Maquina;
            userToUpdate.UpdatedAt = DateTime.UtcNow;
            userToUpdate.UpdatedBy = currentUser.Username;
            await _dbContext.SaveChangesAsync();

            _logger.LogInformation("Máquina modificada para usuario {Id} por {Username}", id, currentUsername);
            var updatedUser = _dbContext.Users
                .Where(u => u.Id == id)
                .Select(u => new
                {
                    u.Id,
                    u.FullName,
                    u.Username,
                    u.Maquina,
                    u.UpdatedAt,
                    u.UpdatedBy
                })
                .FirstOrDefault();
            return Ok(new ApiResponse<object>(true, updatedUser));
        }

        // EP: Modificar datos de usuario
        [HttpPatch("update/{id}")]
        [Authorize]
        public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest request)
        {
            var userToUpdate = await _dbContext.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Id == id);
            if (userToUpdate == null)
            {
                _logger.LogWarning("Intento de modificar datos de usuario inexistente. Id: {Id}", id);
                return NotFound(new ApiResponse<object>(false, null, "Usuario no encontrado"));
            }

            var currentUsername = User.Identity?.Name;
            var currentUser = await _dbContext.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Username == currentUsername);
            if (currentUser == null)
            {
                _logger.LogWarning("Usuario no autenticado al modificar datos. Id: {Id}", id);
                return Unauthorized(new ApiResponse<object>(false, null, "No hay sesión iniciada"));
            }

            bool isSuperUser = currentUser.Roles.Any(r => r.Name == "SuperUsuario");
            if (currentUser.Id != userToUpdate.Id && !isSuperUser)
            {
                _logger.LogWarning("Usuario {Username} sin permisos para modificar datos de usuario {Id}", currentUsername, id);
                return Forbid();
            }

            // Validaciones básicas
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.FullName))
            {
                _logger.LogWarning("Datos requeridos faltantes al modificar usuario {Id}", id);
                return BadRequest(new ApiResponse<object>(false, null, "Username y FullName son requeridos"));
            }

            // Validar área y grupo (ahora opcionales)
            if (request.AreaId.HasValue && (request.AreaId <= 0 || !_dbContext.Areas.Any(a => a.AreaId == request.AreaId)))
            {
                _logger.LogWarning("Área no válida al modificar usuario {Id}", id);
                return BadRequest(new ApiResponse<object>(false, null, "Área no válida"));
            }
            if (request.GrupoId.HasValue && (request.GrupoId <= 0 || !_dbContext.Grupos.Any(g => g.GrupoId == request.GrupoId)))
            {
                _logger.LogWarning("Grupo no válido al modificar usuario {Id}", id);
                return BadRequest(new ApiResponse<object>(false, null, "Grupo no válido"));
            }

            // Validar roles
            var validRoleIds = _dbContext.Roles.Select(r => r.Id).ToHashSet();
            if (request.Roles == null || request.Roles.Any(rid => !validRoleIds.Contains(rid)))
            {
                _logger.LogWarning("Roles no válidos al modificar usuario {Id}", id);
                return BadRequest(new ApiResponse<object>(false, null, "Uno o más roles no son válidos"));
            }

            // Aplicar cambios
            userToUpdate.Username = request.Username;
            userToUpdate.FullName = request.FullName;
            userToUpdate.AreaId = request.AreaId;
            userToUpdate.GrupoId = request.GrupoId;
            userToUpdate.Status = request.Status;
            userToUpdate.UpdatedAt = DateTime.UtcNow;
            userToUpdate.UpdatedBy = currentUser.Username;

            // Actualizar roles
            var newRoles = _dbContext.Roles.Where(r => request.Roles.Contains(r.Id)).ToList();
            userToUpdate.Roles.Clear();
            foreach (var role in newRoles)
                userToUpdate.Roles.Add(role);

            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Datos de usuario {Id} modificados por {Username}", id, currentUsername);
            // Retornar los datos del usuario actualizado igual que GetUserDetail
            var updatedUser = _dbContext.Users
                .Where(u => u.Id == id)
                .Select(u => new
                {
                    u.Id,
                    u.FullName,
                    u.Username,
                    u.AreaId,
                    u.GrupoId,
                    u.Status,
                    u.CreatedAt,
                    u.CreatedBy,
                    u.UpdatedAt,
                    u.UpdatedBy
                })
                .FirstOrDefault();
            return Ok(new ApiResponse<object>(true, updatedUser));
        }

        // EP: Listar usuarios por rol
        [HttpPost("usuarios-por-rol")]
        [Authorize]
        public async Task<IActionResult> GetUsuariosPorRol([FromBody] UsuariosPorRolRequest request)
        {
            int? rolId = null;
            if (request.RolInt.HasValue)
            {
                if (!Enum.IsDefined(typeof(RolEnum), request.RolInt.Value))
                {
                    _logger.LogWarning("RolInt no válido en usuarios-por-rol: {RolInt}", request.RolInt);
                    return BadRequest(new ApiResponse<object>(false, null, "El rol proporcionado no es válido"));
                }
                rolId = request.RolInt.Value;
            }
            else if (!string.IsNullOrWhiteSpace(request.RolString))
            {
                // Buscar el rol por nombre en la base de datos (case-insensitive)
                var role = await _dbContext.Roles
                    .FirstOrDefaultAsync(r => r.Name.ToLower() == request.RolString.ToLower());
                if (role == null)
                {
                    _logger.LogWarning("RolString no válido en usuarios-por-rol: {RolString}", request.RolString);
                    return BadRequest(new ApiResponse<object>(false, null, "El rol proporcionado no es válido"));
                }
                rolId = role.Id;
            }
            else
            {
                _logger.LogWarning("Petición sin rol en usuarios-por-rol");
                return BadRequest(new ApiResponse<object>(false, null, "Se debe proporcionar un rol válido (string o int)"));
            }

            // Buscar usuarios activos con ese rol
            var usuarios = await _dbContext.Users
                .Include(u => u.Roles)
                .Where(u => u.Status == UserStatus.Activo && u.Roles.Any(r => r.Id == rolId))
                .Select(u => new UsuarioInfoDto
                {
                    Id = u.Id,
                    FullName = u.FullName,
                    Username = u.Username,
                    UnidadOrganizativaSap = _dbContext.Areas.Where(a => a.AreaId == u.AreaId).Select(a => a.UnidadOrganizativaSap).FirstOrDefault() ?? "NA",
                    Rol = u.Roles.FirstOrDefault(r => r.Id == rolId) != null ? u.Roles.First(r => r.Id == rolId).Name : ""
                })
                .ToListAsync();

            _logger.LogInformation("Usuarios por rol consultados. RolId: {RolId}, Total: {Total}", rolId, usuarios.Count);
            return Ok(new ApiResponse<List<UsuarioInfoDto>>(true, usuarios));
        }

        // EP: Modificar el estatus de un usuario
        [HttpPatch("change-status/{id}")]
        [Authorize(Roles = "SuperUsuario")]
        public async Task<IActionResult> ChangeUserStatus(int id, [FromBody] ChangeUserStatusRequest request)
        {
            var user = await _dbContext.Users.FindAsync(id);
            if (user == null)
            {
                _logger.LogWarning("Intento de modificar estatus de usuario inexistente. Id: {Id}", id);
                return NotFound(new ApiResponse<object>(false, null, "Usuario no encontrado"));
            }

            // Validar que el status recibido sea válido
            if (!Enum.IsDefined(typeof(UserStatus), request.NewStatus))
            {
                _logger.LogWarning("Estatus no válido al modificar usuario {Id}", id);
                return BadRequest(new ApiResponse<object>(false, null, "El estatus proporcionado no es válido"));
            }

            var newStatus = (UserStatus)request.NewStatus;
            if (user.Status == newStatus)
            {
                _logger.LogInformation("Estatus ya era el mismo para usuario {Id}", id);
                return Ok(new ApiResponse<object>(true, new { msg = "El estatus ya es el mismo, no se realizaron cambios." }));
            }

            user.Status = newStatus;
            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Estatus de usuario {Id} modificado a {Status}", id, newStatus);
            return Ok(new ApiResponse<object>(true, new { msg = "Estatus actualizado correctamente." }));
        }

        // EP Detail: Retorne los datos generales del Usuario basado en el Id recibido.
        [HttpGet("detail/{id}")]
        public async Task<IActionResult> GetUserDetail(int id)
        {
            var baseUser = await _dbContext.Users
                .Where(u => u.Id == id)
                .Select(u => new
                {
                    u.Id,
                    u.FullName,
                    u.Username,
                    u.Nomina,
                    u.Status,
                    u.AreaId,
                    u.GrupoId,
                    u.Maquina,
                    u.FechaIngreso,
                    u.CreatedAt,
                    u.CreatedBy,
                    u.UpdatedAt,
                    u.UpdatedBy,
                    Roles = u.Roles.Select(r => new UserRoleBasicDto
                    {
                        Id = r.Id,
                        Name = r.Name,
                        Abreviation = r.Abreviation
                    }).ToList()
                })
                .FirstOrDefaultAsync();

            if (baseUser == null)
            {
                _logger.LogWarning("Intento de consultar detalle de usuario inexistente. Id: {Id}", id);
                return NotFound(new ApiResponse<object>(false, null, "Usuario no encontrado"));
            }

            // Verificar si tiene roles de liderazgo para incluir áreas consolidadas
            var hasLeadershipRole = baseUser.Roles.Any(r =>
                r.Name == "Jefe De Area" || r.Name == "Lider De Grupo" || r.Name == "Ingeniero Industrial");

            _logger.LogInformation("Usuario {UserId} tiene rol de liderazgo: {HasLeadershipRole}. Roles: {Roles}",
                baseUser.Id, hasLeadershipRole, string.Join(", ", baseUser.Roles.Select(r => r.Name)));

            var fechaIngresoEmpleado = await ObtenerFechaAltaPorNominaAsync(baseUser.Nomina);
            var fechaIngreso = fechaIngresoEmpleado ?? baseUser.FechaIngreso;

            var user = new UserDetailDto
            {
                Id = baseUser.Id,
                FullName = baseUser.FullName,
                Username = baseUser.Username,
                Status = baseUser.Status,
                Area = baseUser.AreaId.HasValue ? await _dbContext.Areas
                    .Where(a => a.AreaId == baseUser.AreaId)
                    .Select(a => new AreaBasicDto
                    {
                        AreaId = a.AreaId,
                        NombreGeneral = a.NombreGeneral
                    }).FirstOrDefaultAsync() : null,
                Grupo = baseUser.GrupoId.HasValue ? await _dbContext.Grupos
                    .Where(g => g.GrupoId == baseUser.GrupoId)
                    .Select(g => new GrupoBasicDto
                    {
                        GrupoId = g.GrupoId,
                        Rol = g.Rol
                    }).FirstOrDefaultAsync() : null,
                Roles = baseUser.Roles,
                Maquina = baseUser.Maquina,
                FechaIngreso = fechaIngreso.HasValue ? fechaIngreso.Value.ToDateTime(TimeOnly.MinValue) : (DateTime?)null,
                CreatedAt = baseUser.CreatedAt,
                CreatedBy = baseUser.CreatedBy,
                UpdatedAt = baseUser.UpdatedAt,
                UpdatedBy = baseUser.UpdatedBy,
                Areas = hasLeadershipRole ? await BuildConsolidatedAreas(baseUser.Id) : null
            };

            _logger.LogInformation("Detalle de usuario consultado. Id: {Id}", id);
            return Ok(new ApiResponse<UserDetailDto>(true, user));
        }

        // EP UsuariosPorArea: Retorna el listado de usuarios relacionados a una área
        [HttpGet("usuarios-por-area/{areaId}")]
        public IActionResult GetUsuariosPorArea(int areaId)
        {
            var areas = _dbContext.Areas.AsNoTracking().Select(a => new
            {
                a.AreaId,
                a.UnidadOrganizativaSap
            }).ToList();

            var grupos = _dbContext.Grupos.AsNoTracking().Select(g => new
            {
                g.GrupoId,
                g.Rol,
                g.AreaId
            }).ToList();

            var usuarios = _dbContext.Users
                .Where(u => u.AreaId == areaId)
                .AsEnumerable()
                .Join(areas,
                        u => u.AreaId,
                        a => a.AreaId,
                        (u, a) => new { u, a })
                .Join(grupos,
                        ua => ua.u.GrupoId,
                        g => g.GrupoId,
                        (ua, g) => new UsuarioInfoDto
                        {
                            FullName = ua.u.FullName,
                            Username = ua.u.Username,
                            UnidadOrganizativaSap = ua.a.UnidadOrganizativaSap,
                            Rol = g.Rol
                        })
                .ToList();

            _logger.LogInformation("Usuarios por área consultados. AreaId: {AreaId}, Total: {Total}", areaId, usuarios.Count);
            return Ok(new ApiResponse<List<UsuarioInfoDto>>(true, usuarios));
        }

        // EP UsuariosPorGrupo: Retorna el listado de usuarios relacionados a un grupo
        [HttpGet("usuarios-por-grupo/{grupoId}")]
        public IActionResult GetUsuariosPorGrupo(int grupoId)
        {
            int rolId = (int)RolEnum.Empleado_Sindicalizado;
            var areas = _dbContext.Areas.AsNoTracking().Select(a => new
            {
                a.AreaId,
                a.UnidadOrganizativaSap
            }).ToList();

            var grupos = _dbContext.Grupos.AsNoTracking()
                .Where(g => g.GrupoId == grupoId)
                .Select(g => new
                {
                    g.GrupoId,
                    g.Rol,
                    g.AreaId
                }).ToList();

            var usuarios = _dbContext.Users
                .Where(u => u.GrupoId == grupoId && !u.Roles.Any(r => r.Id == rolId))
                .AsEnumerable()
                .Join(areas,
                        u => u.AreaId,
                        a => a.AreaId,
                        (u, a) => new { u, a })
                .Join(grupos,
                        ua => ua.u.GrupoId,
                        g => g.GrupoId,
                        (ua, g) => new UsuarioInfoDto
                        {
                            FullName = ua.u.FullName,
                            Username = ua.u.Username,
                            UnidadOrganizativaSap = ua.a.UnidadOrganizativaSap,
                            Rol = g.Rol
                        })
                .ToList();

            _logger.LogInformation("Usuarios por grupo consultados. GrupoId: {GrupoId}, Total: {Total}", grupoId, usuarios.Count);
            return Ok(new ApiResponse<List<UsuarioInfoDto>>(true, usuarios));
        }

        // EP EmpleadosSindicalizadosPorArea: Retorna los usuarios con rol Empleado_Sindicalizado con filtros opcionales y paginación
        [HttpPost("empleados-sindicalizados")]
        [Authorize]
        public async Task<ActionResult<ApiResponse<PaginatedEmpleadosResponse>>> GetEmpleadosSindicalizadosPorArea([FromBody] EmpleadosSindicalizadosGetListRequest request)
        {
            int rolId = (int)RolEnum.Empleado_Sindicalizado;

            // Validar paginación
            int page = request.Page ?? 1;
            int pageSize = request.PageSize ?? 10;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 1000) pageSize = 10;
            // Validar área si se proporciona
            if (request.AreaId.HasValue)
            {
                var area = await _dbContext.Areas.FirstOrDefaultAsync(a => a.AreaId == request.AreaId);
                if (area == null)
                {
                    _logger.LogWarning("Petición de empleados sindicalizados con área inexistente. AreaId: {AreaId}", request.AreaId);
                    return BadRequest(new ApiResponse<object>(false, null, "Área no encontrada"));
                }
            }

            // Validar grupo si se proporciona
            if (request.GrupoId.HasValue)
            {
                var grupo = await _dbContext.Grupos.FirstOrDefaultAsync(g => g.GrupoId == request.GrupoId.Value);
                if (grupo == null)
                {
                    _logger.LogWarning("Petición de empleados sindicalizados con grupo inexistente. GrupoId: {GrupoId}", request.GrupoId);
                    return BadRequest(new ApiResponse<object>(false, null, "Grupo no encontrado"));
                }

                // Si se proporciona tanto área como grupo, validar que el grupo pertenezca al área
                if (request.AreaId.HasValue && grupo.AreaId != request.AreaId)
                {
                    _logger.LogWarning("Petición de empleados sindicalizados con grupo no válido. GrupoId: {GrupoId}, AreaId: {AreaId}", request.GrupoId, request.AreaId);
                    return BadRequest(new ApiResponse<object>(false, null, "El grupo no pertenece al área especificada"));
                }
            }

            // Construir consulta base
            var query = _dbContext.Users
                .Include(u => u.Roles)
                .Where(u => u.Roles.Any(r => r.Id == rolId));

            // Aplicar filtros opcionales
            if (request.AreaId.HasValue)
            {
                query = query.Where(u => u.AreaId == request.AreaId.Value);
            }

            if (request.GrupoId.HasValue)
            {
                query = query.Where(u => u.GrupoId == request.GrupoId.Value);
            }

            var totalUsers = await query.CountAsync();
            var totalPages = (int)Math.Ceiling((double)totalUsers / pageSize);

            var usuarios = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new UsuarioInfoDto
                {
                    Id = u.Id,
                    FullName = u.FullName,
                    Username = u.Username,
                    UnidadOrganizativaSap = _dbContext.Areas
                        .Where(a => a.AreaId == u.AreaId)
                        .Select(a => a.UnidadOrganizativaSap)
                        .FirstOrDefault() ?? "NA",
                    Rol = "Empleado_Sindicalizado",
                    FechaIngreso = _dbContext.Empleados
                        .Where(e => e.Nomina == u.Nomina)
                        .Select(e => e.FechaAlta)
                        .FirstOrDefault() ?? u.FechaIngreso,
                    Nomina = u.Nomina,
                    Area = u.AreaId > 0 ? _dbContext.Areas
                        .Where(a => a.AreaId == u.AreaId)
                        .Select(a => new AreaInfoDto
                        {
                            AreaId = a.AreaId,
                            NombreGeneral = a.NombreGeneral,
                            UnidadOrganizativaSap = a.UnidadOrganizativaSap
                        }).FirstOrDefault() : null,
                    Grupo = u.GrupoId > 0 ? _dbContext.Grupos
                        .Where(g => g.GrupoId == u.GrupoId)
                        .Select(g => new GrupoInfoDto
                        {
                            GrupoId = g.GrupoId,
                            Rol = g.Rol,
                            IdentificadorSAP = g.IdentificadorSAP,
                            PersonasPorTurno = g.PersonasPorTurno,
                            DuracionDeturno = g.DuracionDeturno
                        }).FirstOrDefault() : null
                })
                .ToListAsync();

            var response = new PaginatedEmpleadosResponse
            {
                Usuarios = usuarios,
                CurrentPage = page,
                PageSize = pageSize,
                TotalUsers = totalUsers,
                TotalPages = totalPages,
                HasNextPage = page < totalPages,
                HasPreviousPage = page > 1,
                FilteredByArea = request.AreaId,
                FilteredByGrupo = request.GrupoId
            };

            _logger.LogInformation("Empleados sindicalizados consultados. AreaId: {AreaId}, GrupoId: {GrupoId}, Page: {Page}, Total: {Total}",
                request.AreaId, request.GrupoId, page, totalUsers);

            return Ok(new ApiResponse<PaginatedEmpleadosResponse>(true, response));
        }

        // EP Perfil del usuario actual
        [HttpGet("profile")]
        public async Task<IActionResult> GetCurrentUserProfile()
        {
            var username = User.Identity?.Name;
            if (string.IsNullOrEmpty(username))
            {
                _logger.LogWarning("Intento de acceso a perfil sin sesión iniciada");
                return Unauthorized(new ApiResponse<object>(false, null, "No hay sesión iniciada"));
            }

            // Incluir los roles del usuario
            var user = _dbContext.Users.Include(u => u.Roles).FirstOrDefault(u => u.Username == username);
            if (user == null)
            {
                _logger.LogWarning("Usuario no encontrado en perfil: {Username}", username);
                return NotFound(new ApiResponse<object>(false, null, "Usuario no encontrado"));
            }
            _logger.LogInformation("Perfil consultado para usuario: {Username}", username);

            AreaProfileDto? area = null;
            if (user.AreaId > 0)
            {
                var areaEntity = _dbContext.Areas.FirstOrDefault(a => a.AreaId == user.AreaId);
                if (areaEntity != null)
                {
                    area = new AreaProfileDto
                    {
                        AreaId = areaEntity.AreaId,
                        NombreGeneral = areaEntity.NombreGeneral,
                        UnidadOrganizativaSap = areaEntity.UnidadOrganizativaSap
                    };
                }
            }
            GrupoProfileDto? grupo = null;
            if (user.GrupoId > 0)
            {
                var grupoEntity = _dbContext.Grupos.FirstOrDefault(g => g.GrupoId == user.GrupoId);
                if (grupoEntity != null)
                {
                    grupo = new GrupoProfileDto
                    {
                        GrupoId = grupoEntity.GrupoId,
                        Rol = grupoEntity.Rol,
                        IdentificadorSAP = grupoEntity.IdentificadorSAP
                    };
                }
            }

            var roles = (user.Roles ?? new List<Rol>()).Select(r => new UserProfileRolDTO
            {
                Name = r.Name,
                Description = r.Description,
                Abreviation = r.Abreviation
            }).ToList() ?? new List<UserProfileRolDTO>();

            var fechaIngresoEmpleado = await ObtenerFechaAltaPorNominaAsync(user.Nomina);
            var fechaIngreso = fechaIngresoEmpleado ?? user.FechaIngreso;

            var profile = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                FullName = user.FullName,
                rols = roles,
                Area = area,
                Grupo = grupo,
                Maquina = user.Maquina,
                FechaIngreso = fechaIngreso,
                Antiguedad = fechaIngreso.HasValue ? (float?)((DateTime.UtcNow - fechaIngreso.Value.ToDateTime(TimeOnly.MinValue)).TotalDays / 365) : null
            };
            return Ok(new ApiResponse<UserProfileDto>(true, profile));
        }

        [HttpPost("invalidate-empleados-cache")]
        [Authorize(Roles = "SuperUsuario")]
        public IActionResult InvalidateEmpleadosCache()
        {
            // Este endpoint es solo para notificar al frontend que invalide su caché
            _logger.LogInformation("Solicitud de invalidación de caché de empleados");
            return Ok(new ApiResponse<object>(true, new { message = "Cache invalidation requested" }));
        }

        // EP: Actualizar suplente basado en el rol
        [HttpPost("suplente")]
        [RolesAllowedAttribute("SuperUsuario", "JefeDeArea", "LiderDeGrupo", "IngenieroIndustrial", "Super Usuario", "Jefe De Area", "Lider De Grupo", "Ingeniero Industrial")]
        public async Task<IActionResult> UpdateSuplente([FromBody] UpdateSuplenteRequest request)
        {
            var username = User.Identity?.Name;
            if (string.IsNullOrEmpty(username))
            {
                _logger.LogWarning("Intento de actualizar suplente sin sesión iniciada");
                return Unauthorized(new ApiResponse<object>(false, null, "No hay sesión iniciada"));
            }

            // Validar que el usuario tenga permisos para actualizar suplentes
            var currentUser = await _dbContext.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Username == username);
            if (currentUser == null)
            {
                return Unauthorized(new ApiResponse<object>(false, null, "Usuario no encontrado"));
            }

            var allowedRoles = new[] { "SuperUsuario", "Jefe De Area", "Lider De Grupo", "Ingeniero Industrial" };
            bool hasPermission = currentUser.Roles.Any(r => allowedRoles.Contains(r.Name));
            if (!hasPermission)
            {
                return Forbid();
            }

            // Validar que el suplente existe y tiene el rol apropiado si se proporciona
            if (request.SuplenteId.HasValue)
            {
                var suplente = await _dbContext.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Id == request.SuplenteId.Value);
                if (suplente == null)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "El suplente especificado no existe"));
                }

                // Validar que el suplente tenga el rol apropiado
                var requiredRoleName = request.Rol switch
                {
                    "JefeDeArea" => "Jefe De Area",
                    "LiderDeGrupo" => "Lider De Grupo",
                    "IngenieroIndustrial" => "Ingeniero Industrial",
                    _ => null
                };

                // Validar que el suplente tenga el rol apropiado
                if (requiredRoleName != null && !suplente.Roles.Any(r => r.Name == requiredRoleName))
                {
                    return BadRequest(new ApiResponse<object>(false, null, $"El usuario suplente no tiene el rol '{requiredRoleName}'"));
                }
            }

            try
            {
                switch (request.Rol)
                {
                    case "Jefe De Area":
                        if (!request.AreaId.HasValue)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "AreaId es requerido para Jefe de Area"));
                        }

                        var area = await _dbContext.Areas.FirstOrDefaultAsync(a => a.AreaId == request.AreaId.Value);
                        if (area == null)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "Area no encontrada"));
                        }

                        area.JefeSuplenteId = request.SuplenteId;
                        break;

                    case "Lider De Grupo":
                        if (!request.GrupoId.HasValue)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "GrupoId es requerido para Lider de Grupo"));
                        }

                        var grupo = await _dbContext.Grupos.FirstOrDefaultAsync(g => g.GrupoId == request.GrupoId.Value);
                        if (grupo == null)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "Grupo no encontrado"));
                        }

                        grupo.LiderSuplenteId = request.SuplenteId;
                        break;

                    case "Ingeniero Industrial":
                        if (!request.AreaId.HasValue)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "AreaId es requerido para Ingeniero Industrial"));
                        }

                        // Buscar la relación AreaIngeniero activa para el usuario actual
                        var areaIngenieroRelation = await _dbContext.AreaIngenieros
                            .AsNoTracking()
                            .FirstOrDefaultAsync(ai => ai.AreaId == request.AreaId.Value &&
                                                      ai.IngenieroId == currentUser!.Id);

                        if (areaIngenieroRelation == null)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "No se encontró una relación activa entre el ingeniero y el área especificada"));
                        }

                        // Obtener la entidad para actualizar
                        var entityToUpdate = await _dbContext.AreaIngenieros
                            .FirstOrDefaultAsync(ai => ai.Id == areaIngenieroRelation.Id);

                        if (entityToUpdate == null)
                        {
                            return BadRequest(new ApiResponse<object>(false, null, "No se pudo obtener la relación para actualizar"));
                        }

                        entityToUpdate.SuplenteId = request.SuplenteId;
                        break;

                    default:
                        return BadRequest(new ApiResponse<object>(false, null, "Rol no válido. Roles permitidos: JefeDeArea, LiderDeGrupo, IngenieroIndustrial"));
                }

                await _dbContext.SaveChangesAsync();

                _logger.LogInformation("Suplente actualizado. Rol: {Rol}, AreaId: {AreaId}, GrupoId: {GrupoId}, SuplenteId: {SuplenteId}, Usuario: {Username}",
                    request.Rol, request.AreaId, request.GrupoId, request.SuplenteId, username);

                return Ok(new ApiResponse<object>(true, null, "Suplente actualizado correctamente"));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar suplente. Rol: {Rol}, AreaId: {AreaId}, GrupoId: {GrupoId}",
                    request.Rol, request.AreaId, request.GrupoId);
                return StatusCode(500, new ApiResponse<object>(false, null, "Error interno del servidor"));
            }
        }

        // EP: Listar todos los usuarios con paginación (excluyendo usuarios que solo tienen rol Empleado_Sindicalizado)
        [HttpGet("list")]
        [RolesAllowedAttribute("SuperUsuario", "JefeDeArea", "LiderDeGrupo", "IngenieroIndustrial")]
        public async Task<IActionResult> GetAllUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 1000) pageSize = 10;
            var empleadoSindicalizadoId = (int)RolEnum.Empleado_Sindicalizado;

            // Obtener usuarios que NO solo tengan el rol Empleado_Sindicalizado
            var query = _dbContext.Users
                .Include(u => u.Roles)
                .Where(u => !u.Roles.All(r => r.Id == empleadoSindicalizadoId) || !u.Roles.Any());

            var totalUsers = await query.CountAsync();
            var totalPages = (int)Math.Ceiling((double)totalUsers / pageSize);

            var baseUsers = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.FullName,
                    u.Status,
                    u.AreaId,
                    u.GrupoId,
                    u.CreatedAt,
                    u.UpdatedAt,
                    Roles = u.Roles.Select(r => new UserRoleBasicDto
                    {
                        Id = r.Id,
                        Name = r.Name,
                        Abreviation = r.Abreviation
                    }).ToList()
                })
                .ToListAsync();

            var users = new List<UserListDto>();

            foreach (var baseUser in baseUsers)
            {
                var userDto = new UserListDto
                {
                    Id = baseUser.Id,
                    Username = baseUser.Username,
                    FullName = baseUser.FullName,
                    Status = baseUser.Status,
                    Area = baseUser.AreaId.HasValue ? await _dbContext.Areas
                        .Where(a => a.AreaId == baseUser.AreaId)
                        .Select(a => new AreaBasicDto
                        {
                            AreaId = a.AreaId,
                            NombreGeneral = a.NombreGeneral
                        }).FirstOrDefaultAsync() : null,
                    Grupo = baseUser.GrupoId.HasValue ? await _dbContext.Grupos
                        .Where(g => g.GrupoId == baseUser.GrupoId)
                        .Select(g => new GrupoBasicDto
                        {
                            GrupoId = g.GrupoId,
                            Rol = g.Rol
                        }).FirstOrDefaultAsync() : null,
                    Roles = baseUser.Roles,
                    Areas = await BuildConsolidatedAreas(baseUser.Id),
                    CreatedAt = baseUser.CreatedAt,
                    UpdatedAt = baseUser.UpdatedAt
                };

                users.Add(userDto);
            }

            var response = new PaginatedUsersResponse
            {
                Users = users,
                CurrentPage = page,
                PageSize = pageSize,
                TotalUsers = totalUsers,
                TotalPages = totalPages,
                HasNextPage = page < totalPages,
                HasPreviousPage = page > 1
            };

            return Ok(new ApiResponse<PaginatedUsersResponse>(true, response));
        }

        private async Task<DateOnly?> ObtenerFechaAltaPorNominaAsync(int? nomina)
        {
            if (!nomina.HasValue)
            {
                return null;
            }

            return await _dbContext.Empleados
                .Where(e => e.Nomina == nomina.Value)
                .Select(e => e.FechaAlta)
                .FirstOrDefaultAsync();
        }

        // EP: Obtener empleados sindicalizados del área del jefe actual
        [HttpGet("empleados-sindicalizados/mi-area")]
        [Authorize]
        public async Task<ActionResult<ApiResponse<List<UsuarioInfoDto>>>> GetEmpleadosSindicalizadosMiArea()
        {
            var username = User.Identity?.Name;
            var currentUser = await _dbContext.Users
                .Include(u => u.Roles)
                .FirstOrDefaultAsync(u => u.Username == username);

            if (currentUser == null)
            {
                return Unauthorized(new ApiResponse<List<UsuarioInfoDto>>(false, null, "No hay sesión iniciada"));
            }

            var isJefe = currentUser.Roles.Any(r => r.Name == "Jefe De Area");
            if (!isJefe)
            {
                return Forbid();
            }

            // ✅ CAMBIO CRÍTICO: Consultar áreas donde es jefe EN TIEMPO REAL desde Areas
            var areasComoJefe = await _dbContext.Areas
                .Where(a => a.JefeId == currentUser.Id)
                .Select(a => a.AreaId)
                .ToListAsync();

            if (!areasComoJefe.Any())
            {
                return Ok(new ApiResponse<List<UsuarioInfoDto>>(true, new List<UsuarioInfoDto>()));
            }

            int rolId = (int)RolEnum.Empleado_Sindicalizado;

            // ✅ IMPORTANTE: Usar INNER JOIN para asegurar datos actualizados
            var usuarios = await (from u in _dbContext.Users
                                  join e in _dbContext.Empleados on u.Nomina equals e.Nomina into emp
                                  from empleado in emp.DefaultIfEmpty()
                                  where u.AreaId.HasValue &&
                                        areasComoJefe.Contains(u.AreaId.Value) &&
                                        u.Roles.Any(r => r.Id == rolId)
                                  select new UsuarioInfoDto
                                  {
                                      Id = u.Id,
                                      FullName = u.FullName,
                                      Username = u.Username,
                                      Nomina = u.Nomina,
                                      UnidadOrganizativaSap = _dbContext.Areas
                                          .Where(a => a.AreaId == u.AreaId)
                                          .Select(a => a.UnidadOrganizativaSap)
                                          .FirstOrDefault() ?? "NA",
                                      Rol = empleado != null ? empleado.Rol : "Empleado_Sindicalizado",
                                      Area = u.AreaId > 0 ? _dbContext.Areas
                                          .Where(a => a.AreaId == u.AreaId)
                                          .Select(a => new AreaInfoDto
                                          {
                                              AreaId = a.AreaId,
                                              NombreGeneral = a.NombreGeneral,
                                              UnidadOrganizativaSap = a.UnidadOrganizativaSap
                                          }).FirstOrDefault() : null,
                                      Grupo = u.GrupoId > 0 ? _dbContext.Grupos
                                          .Where(g => g.GrupoId == u.GrupoId)
                                          .Select(g => new GrupoInfoDto
                                          {
                                              GrupoId = g.GrupoId,
                                              Rol = g.Rol,
                                              IdentificadorSAP = g.IdentificadorSAP,
                                              PersonasPorTurno = g.PersonasPorTurno,
                                              DuracionDeturno = g.DuracionDeturno
                                          }).FirstOrDefault() : null
                                  })
                                  .ToListAsync();

            return Ok(new ApiResponse<List<UsuarioInfoDto>>(true, usuarios));
        }

        private async Task<List<AreaWithRoleDto>> BuildConsolidatedAreas(int userId)
        {
            _logger.LogInformation("BuildConsolidatedAreas llamado para usuario {UserId}", userId);
            var consolidatedAreas = new List<AreaWithRoleDto>();

            // 1. Áreas donde es jefe - incluir todos los grupos del área
            var areasAsJefe = await _dbContext.Areas
                .Where(a => a.JefeId == userId)
                .Select(a => new
                {
                    a.AreaId,
                    a.NombreGeneral,
                    Grupos = a.Grupos.Select(g => new GrupoBasicDto
                    {
                        GrupoId = g.GrupoId,
                        Rol = g.Rol
                    }).ToList()
                })
                .ToListAsync();

            foreach (var area in areasAsJefe)
            {
                consolidatedAreas.Add(new AreaWithRoleDto
                {
                    AreaId = area.AreaId,
                    NombreGeneral = area.NombreGeneral,
                    UserRole = "Jefe",
                    Grupos = area.Grupos
                });
            }

            // 2. Grupos donde es líder - incluir solo el área y esos grupos específicos
            var gruposAsLider = await _dbContext.Grupos
                .Where(g => g.LiderId == userId)
                .Select(g => new
                {
                    g.AreaId,
                    Area = g.Area.NombreGeneral,
                    Grupo = new GrupoBasicDto
                    {
                        GrupoId = g.GrupoId,
                        Rol = g.Rol
                    }
                })
                .ToListAsync();

            var gruposGroupedByArea = gruposAsLider.GroupBy(g => new { g.AreaId, g.Area });
            foreach (var areaGroup in gruposGroupedByArea)
            {
                // Verificar si ya existe el área como jefe para no duplicar
                if (!consolidatedAreas.Any(ca => ca.AreaId == areaGroup.Key.AreaId))
                {
                    consolidatedAreas.Add(new AreaWithRoleDto
                    {
                        AreaId = areaGroup.Key.AreaId,
                        NombreGeneral = areaGroup.Key.Area,
                        UserRole = "Lider",
                        Grupos = areaGroup.Select(g => g.Grupo).ToList()
                    });
                }
            }

            // 3. Áreas donde es ingeniero - incluir todos los grupos del área
            var areasAsIngeniero = await _dbContext.AreaIngenieros
                .Where(ai => ai.IngenieroId == userId && ai.Activo)
                .Select(ai => new
                {
                    ai.Area.AreaId,
                    ai.Area.NombreGeneral,
                    Grupos = ai.Area.Grupos.Select(g => new GrupoBasicDto
                    {
                        GrupoId = g.GrupoId,
                        Rol = g.Rol
                    }).ToList()
                })
                .ToListAsync();

            foreach (var area in areasAsIngeniero)
            {
                // Verificar si ya existe el área como jefe o líder para no duplicar
                if (!consolidatedAreas.Any(ca => ca.AreaId == area.AreaId))
                {
                    consolidatedAreas.Add(new AreaWithRoleDto
                    {
                        AreaId = area.AreaId,
                        NombreGeneral = area.NombreGeneral,
                        UserRole = "Ingeniero",
                        Grupos = area.Grupos
                    });
                }
            }

            _logger.LogInformation("BuildConsolidatedAreas para usuario {UserId} devolvió {Count} áreas",
                userId, consolidatedAreas.Count);
            return consolidatedAreas;
        }
    }

    #region DTOs for UserController
    public class UsuariosPorRolRequest
    {
        public int? RolInt { get; set; }
        public string? RolString { get; set; }
    }

    public class UpdateMaquinaRequest
    {
        public required string Maquina { get; set; }
    }

    public class ChangeUserStatusRequest
    {
        public required int NewStatus { get; set; }
    }

    public class UserProfileRolDTO
    {
        public required string Name { get; set; }
        public required string Description { get; set; }
        public required string Abreviation { get; set; }
    }

    public class UpdateUserRequest
    {
        public required string Username { get; set; }
        public required string FullName { get; set; }
        public int? AreaId { get; set; }
        public int? GrupoId { get; set; }
        public required List<int> Roles { get; set; }
        public UserStatus Status { get; set; }
    }

    public class UserProfileDto
    {
        public int Id { get; set; }
        public required string Username { get; set; }
        public required string FullName { get; set; }
        public AreaProfileDto? Area { get; set; }
        public GrupoProfileDto? Grupo { get; set; }
        public string? Maquina { get; set; }
        public DateOnly? FechaIngreso { get; set; }
        public float? Antiguedad { get; set; }
        public List<UserProfileRolDTO> rols { get; set; } = new();
    }

    public class AreaProfileDto
    {
        public int AreaId { get; set; }
        public required string NombreGeneral { get; set; }
        public string? UnidadOrganizativaSap { get; set; }
    }

    public class GrupoProfileDto
    {
        public int GrupoId { get; set; }
        public required string Rol { get; set; }
        public string? IdentificadorSAP { get; set; }
    }

    public class UserListDto
    {
        public int Id { get; set; }
        public required string Username { get; set; }
        public required string FullName { get; set; }
        public UserStatus Status { get; set; }
        public AreaBasicDto? Area { get; set; }
        public GrupoBasicDto? Grupo { get; set; }
        public required List<UserRoleBasicDto> Roles { get; set; }
        // Áreas consolidadas con sus grupos según el rol del usuario
        public List<AreaWithRoleDto> Areas { get; set; } = new();
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class AreaBasicDto
    {
        public int AreaId { get; set; }
        public required string NombreGeneral { get; set; }
    }

    public class GrupoBasicDto
    {
        public int GrupoId { get; set; }
        public required string Rol { get; set; }
    }

    public class AreaWithRoleDto
    {
        public int AreaId { get; set; }
        public required string NombreGeneral { get; set; }
        public required string UserRole { get; set; } // "Jefe", "Lider", "Ingeniero"
        public List<GrupoBasicDto> Grupos { get; set; } = new();
    }

    public class UserRoleBasicDto
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public required string Abreviation { get; set; }
    }

    public class PaginatedUsersResponse
    {
        public required List<UserListDto> Users { get; set; }
        public int CurrentPage { get; set; }
        public int PageSize { get; set; }
        public int TotalUsers { get; set; }
        public int TotalPages { get; set; }
        public bool HasNextPage { get; set; }
        public bool HasPreviousPage { get; set; }
    }

    public class UserDetailDto
    {
        public int Id { get; set; }
        public required string FullName { get; set; }
        public required string Username { get; set; }
        public UserStatus Status { get; set; }
        public AreaBasicDto? Area { get; set; }
        public GrupoBasicDto? Grupo { get; set; }
        public required List<UserRoleBasicDto> Roles { get; set; }
        public string? Maquina { get; set; }
        public DateTime? FechaIngreso { get; set; }
        public DateTime CreatedAt { get; set; }
        public int CreatedBy { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
        // Áreas consolidadas solo para roles de liderazgo
        public List<AreaWithRoleDto>? Areas { get; set; }
    }

    public class EmpleadosSindicalizadosGetListRequest
    {
        public int? AreaId { get; set; }
        public int? GrupoId { get; set; }
        public int? Page { get; set; }
        public int? PageSize { get; set; }
    }

    public class PaginatedEmpleadosResponse
    {
        public List<UsuarioInfoDto> Usuarios { get; set; }
        public int CurrentPage { get; set; }
        public int PageSize { get; set; }
        public int TotalUsers { get; set; }
        public int TotalPages { get; set; }
        public bool HasNextPage { get; set; }
        public bool HasPreviousPage { get; set; }
        public int? FilteredByArea { get; set; }
        public int? FilteredByGrupo { get; set; }
    }
    #endregion
}
