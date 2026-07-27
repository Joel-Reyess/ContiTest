using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.Helpers;
using tiempo_libre.Models;

/// <summary>
/// Endpoints de solo lectura para diagnosticar en productivo (sin acceso SQL)
/// por qué un jefe ve/no ve solicitudes de ciertas áreas.
/// </summary>
[ApiController]
[Route("api/diagnostico-visibilidad")]
[Authorize]
public class DiagnosticoVisibilidadController : ControllerBase
{
    private readonly FreeTimeDbContext _db;

    public DiagnosticoVisibilidadController(FreeTimeDbContext db)
    {
        _db = db;
    }

    private async Task<bool> CallerAutorizadoAsync()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(claim, out var callerId)) return false;

        var caller = await _db.Users
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.Id == callerId);

        return caller != null && RolesHelper.TieneRol(caller.Roles,
            "Super Usuario", "RH", "Gerente BT", "Jefe De Area");
    }

    // GET api/diagnostico-visibilidad/jefe/{nomina}
    // Muestra, para el usuario con esa nómina: sus roles, su área directa y la
    // de su grupo, las áreas donde figura en AreaJefes, las áreas donde figura
    // en las columnas legacy JefeId/JefeSuplenteId, y cuántas solicitudes de
    // reprogramación Pendientes hay por área (con el match tolerante
    // AreaId/Grupo.AreaId que usan las vistas).
    [HttpGet("jefe/{nomina:int}")]
    public async Task<IActionResult> DiagnosticoJefe(int nomina)
    {
        if (!await CallerAutorizadoAsync()) return Forbid();

        var user = await _db.Users
            .Include(u => u.Roles)
            .Include(u => u.Area)
            .Include(u => u.Grupo).ThenInclude(g => g.Area)
            .FirstOrDefaultAsync(u => u.Nomina == nomina);

        if (user == null)
            return NotFound(new { mensaje = $"No existe usuario con nómina {nomina}" });

        var areasPorAreaJefes = await _db.AreaJefes
            .Where(aj => aj.UserId == user.Id)
            .Select(aj => new
            {
                aj.AreaId,
                Nombre = aj.Area.NombreGeneral,
                OtrosJefes = aj.Area.Jefes
                    .Where(x => x.UserId != user.Id)
                    .Select(x => new { x.UserId, Nombre = x.User.FullName })
                    .ToList(),
                LegacyJefeId = aj.Area.JefeId,
                LegacyJefeSuplenteId = aj.Area.JefeSuplenteId
            })
            .ToListAsync();

        var areasPorLegacy = await _db.Areas
            .Where(a => a.JefeId == user.Id || a.JefeSuplenteId == user.Id)
            .Select(a => new
            {
                a.AreaId,
                Nombre = a.NombreGeneral,
                EsJefePrincipal = a.JefeId == user.Id,
                EsJefeSuplente = a.JefeSuplenteId == user.Id,
                TieneFilasAreaJefes = a.Jefes.Any(),
                JefesEnAreaJefes = a.Jefes
                    .Select(x => new { x.UserId, Nombre = x.User.FullName })
                    .ToList()
            })
            .ToListAsync();

        // Mismo cálculo de áreas visibles que usan las vistas: AreaJefes, más
        // legacy JefeId/JefeSuplenteId SOLO en áreas sin ninguna fila AreaJefes.
        var areasVisibles = areasPorAreaJefes.Select(a => a.AreaId)
            .Concat(areasPorLegacy.Where(a => !a.TieneFilasAreaJefes).Select(a => a.AreaId))
            .Distinct()
            .ToList();

        // Todas las solicitudes Pendientes del sistema agrupadas por el área
        // efectiva del empleado (Grupo.AreaId si existe, si no Users.AreaId),
        // para localizar dónde están cayendo las de "Preparación de Materiales 2".
        var pendientes = await _db.SolicitudesReprogramacion
            .Where(s => s.EstadoSolicitud == "Pendiente")
            .Select(s => new
            {
                s.Id,
                AreaUsuario = s.Empleado.AreaId,
                AreaGrupo = s.Empleado.Grupo != null ? (int?)s.Empleado.Grupo.AreaId : null,
                s.JefeAreaId
            })
            .ToListAsync();

        var nombresAreas = await _db.Areas
            .ToDictionaryAsync(a => a.AreaId, a => a.NombreGeneral);

        var pendientesPorArea = pendientes
            .GroupBy(p => p.AreaGrupo ?? p.AreaUsuario)
            .Select(g => new
            {
                AreaId = g.Key,
                Nombre = g.Key.HasValue && nombresAreas.ContainsKey(g.Key.Value)
                    ? nombresAreas[g.Key.Value] : "(sin área)",
                Total = g.Count(),
                // Mismo criterio tolerante de las vistas: visible si el área
                // directa del empleado O la de su grupo está en las del jefe.
                VisiblesParaEsteJefe = g.Count(p =>
                    (p.AreaUsuario.HasValue && areasVisibles.Contains(p.AreaUsuario.Value)) ||
                    (p.AreaGrupo.HasValue && areasVisibles.Contains(p.AreaGrupo.Value)) ||
                    p.JefeAreaId == user.Id),
                ConDesfaseUsuarioVsGrupo = g.Count(p =>
                    p.AreaUsuario.HasValue && p.AreaGrupo.HasValue && p.AreaUsuario != p.AreaGrupo),
                AsignadasDirectoAlJefe = g.Count(p => p.JefeAreaId == user.Id)
            })
            .OrderBy(x => x.AreaId)
            .ToList();

        return Ok(new
        {
            Usuario = new
            {
                user.Id,
                user.Nomina,
                user.FullName,
                Roles = user.Roles.Select(r => r.Name).ToList(),
                AreaIdDirecta = user.AreaId,
                AreaDirecta = user.Area?.NombreGeneral,
                user.GrupoId,
                AreaIdGrupo = user.Grupo?.AreaId,
                AreaGrupo = user.Grupo?.Area?.NombreGeneral
            },
            AreasPorAreaJefes = areasPorAreaJefes,
            AreasPorLegacyJefeId = areasPorLegacy,
            AreasVisiblesEfectivas = areasVisibles
                .Select(id => new { AreaId = id, Nombre = nombresAreas.GetValueOrDefault(id, "?") })
                .ToList(),
            SolicitudesPendientesPorArea = pendientesPorArea
        });
    }

    // GET api/diagnostico-visibilidad/areas-jefes
    // Panorama completo: cada área con sus jefes en AreaJefes y en las columnas
    // legacy, marcando dónde difieren (candidatas a reasignar desde la UI).
    [HttpGet("areas-jefes")]
    public async Task<IActionResult> AreasJefes()
    {
        if (!await CallerAutorizadoAsync()) return Forbid();

        var areas = await _db.Areas
            .Select(a => new
            {
                a.AreaId,
                Nombre = a.NombreGeneral,
                LegacyJefeId = a.JefeId,
                LegacyJefeNombre = a.Jefe != null ? a.Jefe.FullName : null,
                LegacySuplenteId = a.JefeSuplenteId,
                LegacySuplenteNombre = a.JefeSuplente != null ? a.JefeSuplente.FullName : null,
                JefesAreaJefes = a.Jefes
                    .Select(x => new { x.UserId, Nombre = x.User.FullName })
                    .ToList()
            })
            .ToListAsync();

        var resultado = areas.Select(a => new
        {
            a.AreaId,
            a.Nombre,
            a.LegacyJefeId,
            a.LegacyJefeNombre,
            a.LegacySuplenteId,
            a.LegacySuplenteNombre,
            a.JefesAreaJefes,
            // true cuando alguna columna legacy apunta a alguien que NO está en
            // AreaJefes: ese usuario ve el área por el fallback legacy aunque ya
            // no sea su jefe. Candidata a reasignarse desde la UI (Áreas →
            // asignar jefes) para alinear ambas fuentes sin tocar la BD.
            Desalineada =
                (a.LegacyJefeId.HasValue && a.JefesAreaJefes.Count > 0 &&
                 !a.JefesAreaJefes.Any(j => j.UserId == a.LegacyJefeId.Value)) ||
                (a.LegacySuplenteId.HasValue && a.JefesAreaJefes.Count > 0 &&
                 !a.JefesAreaJefes.Any(j => j.UserId == a.LegacySuplenteId.Value))
        }).ToList();

        return Ok(new
        {
            TotalAreas = resultado.Count,
            Desalineadas = resultado.Count(r => r.Desalineada),
            Areas = resultado.OrderByDescending(r => r.Desalineada).ThenBy(r => r.AreaId).ToList()
        });
    }
}
