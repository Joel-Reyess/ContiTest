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
