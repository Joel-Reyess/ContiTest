using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/roles")]
    public class RolesSemanaController : ControllerBase
    {
        private readonly FreeTimeDbContext _db;
        private readonly RolSemanalCalculoService _rolSemanal;

        public RolesSemanaController(
            FreeTimeDbContext db,
            RolSemanalCalculoService rolSemanal)
        {
            _db = db;
            _rolSemanal = rolSemanal;
        }

        /// <summary>
        /// True si el usuario autenticado puede consultar el rol de ese grupo.
        /// El endpoint solo pedía [Authorize] con una lista de roles: cualquiera
        /// de ellos podía pedir CUALQUIER grupoId, y el filtrado por área vivía
        /// únicamente en el selector del frontend.
        ///
        /// El delegado sindical y el comité siguen viendo cualquier grupo (es su
        /// función); a quien tiene alcance por área —jefe, ingeniero, líder,
        /// Gerente BT, RH— se le exige que el grupo caiga dentro de sus áreas; y
        /// el empleado sindicalizado de a pie queda limitado a SU grupo: antes
        /// caía en el mismo saco que el delegado y veía el rol semanal de toda
        /// la planta.
        /// </summary>
        private async Task<bool> PuedeVerGrupoAsync(int grupoId)
        {
            if (User.IsInRole("SuperUsuario") || User.IsInRole("Super Usuario"))
                return true;

            var claim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(claim, out var userId)) return false;

            var tieneAlcancePorArea =
                User.IsInRole("Jefe De Area") || User.IsInRole("JefeArea") || User.IsInRole("JefeDeArea") ||
                User.IsInRole("Ingeniero Industrial") || User.IsInRole("IngenieroIndustrial") ||
                User.IsInRole("Lider De Grupo") || User.IsInRole("LiderDeGrupo") ||
                User.IsInRole("Gerente BT") || User.IsInRole("GerenteBT") ||
                User.IsInRole("RH");

            if (!tieneAlcancePorArea)
            {
                var esDelegado =
                    User.IsInRole("Delegado Sindical") || User.IsInRole("DelegadoSindical");

                if (!esDelegado)
                {
                    // El comité sindical está dado de alta como sindicalizado
                    // pero opera como delegado; se reconoce por el área
                    // "Sindicato", igual que en ReprogramacionService.
                    var datos = await _db.Users
                        .Where(u => u.Id == userId)
                        .Select(u => new
                        {
                            u.GrupoId,
                            AreaPropia = u.Area != null ? u.Area.NombreGeneral : null,
                            AreaGrupo = u.Grupo != null && u.Grupo.Area != null
                                ? u.Grupo.Area.NombreGeneral
                                : null
                        })
                        .FirstOrDefaultAsync();

                    if (datos == null) return false;

                    var esSindicato =
                        string.Equals(datos.AreaPropia, "Sindicato", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(datos.AreaGrupo, "Sindicato", StringComparison.OrdinalIgnoreCase);

                    if (!esSindicato)
                        return datos.GrupoId.HasValue && datos.GrupoId.Value == grupoId;
                }

                return true;
            }

            var areaDelGrupo = await _db.Grupos
                .Where(g => g.GrupoId == grupoId)
                .Select(g => (int?)g.AreaId)
                .FirstOrDefaultAsync();
            if (areaDelGrupo == null) return false;

            var areasVisibles = await Helpers.AreasVisiblesHelper.AreasVisiblesAsync(_db, userId);
            return areasVisibles.Contains(areaDelGrupo.Value);
        }

        /// <summary>
        /// Obtiene los turnos semanales (lunes a domingo) de un grupo.
        /// El cálculo de códigos vive en RolSemanalCalculoService, compartido
        /// con el dashboard de tiempo extra/ausencias para que ambos coincidan.
        /// </summary>
        /// <param name="grupoId">ID del grupo</param>
        /// <param name="fechaInicio">Fecha de inicio de la semana (yyyy-MM-dd).</param>
        [HttpGet("grupo/{grupoId}/semana")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,JefeArea,Jefe De Area,SuperUsuario, Lider De Grupo,IngenieroIndustrial, Ingeniero Industrial, Super Usuario,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ObtenerRolesSemanales(
            [FromRoute] int grupoId,
            [FromQuery] DateTime fechaInicio)
        {
            try
            {
                if (!await PuedeVerGrupoAsync(grupoId))
                    return StatusCode(403, new ApiResponse<object>(false, null,
                        "No tienes acceso al rol semanal de este grupo."));

                var inicio = DateOnly.FromDateTime(fechaInicio.Date);
                var fin = inicio.AddDays(6);

                var grupo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == grupoId);

                var empleados = await _db.Users
                    .Where(u => u.GrupoId == grupoId && u.Status == tiempo_libre.Models.Enums.UserStatus.Activo)
                    .Select(u => new { u.Id, u.Nomina, u.FullName })
                    .ToListAsync();

                // Códigos de turno finales por (empleado, fecha) — misma fuente que el dashboard.
                var codigos = await _rolSemanal.CalcularCodigosTurnoGrupoAsync(grupoId, inicio, fin);

                var semana = new System.Collections.Generic.List<WeeklyRoleEntryDto>();
                foreach (var emp in empleados)
                {
                    foreach (var kv in codigos
                        .Where(k => k.Key.empleadoId == emp.Id)
                        .OrderBy(k => k.Key.fecha))
                    {
                        semana.Add(new WeeklyRoleEntryDto
                        {
                            Fecha = kv.Key.fecha.ToString("yyyy-MM-dd"),
                            CodigoTurno = kv.Value,
                            Empleado = new WeeklyRoleEmployeeDto
                            {
                                Id = emp.Id,
                                Nomina = emp.Nomina?.ToString() ?? string.Empty,
                                FullName = emp.FullName ?? string.Empty
                            }
                        });
                    }
                }

                var response = new WeeklyRolesResponseDto
                {
                    GrupoId = grupoId,
                    GrupoNombre = grupo?.Rol,
                    Semana = semana
                };

                return Ok(new ApiResponse<WeeklyRolesResponseDto>(true, response, null));
            }
            catch (Exception ex)
            {
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}
