using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
//using tiempo_libre.Logic;
using Microsoft.EntityFrameworkCore;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
//using System.Security.Claims;

[ApiController]
[Route("api/[controller]")]
// ...existing using statements...
[Authorize] // Acceso sólo para usuarios autenticados
public class GrupoController : ControllerBase
{
    private readonly FreeTimeDbContext _db;
    public GrupoController(FreeTimeDbContext db)
    {
        _db = db;
    }

    // PUT: api/Grupo/{id}/Lider
    [HttpPut("{id}/Lider")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> AsignarLider(int id, [FromBody] int? liderId)
    {
        var grupo = await _db.Grupos.FindAsync(id);
        if (grupo == null)
        {
            return NotFound(new ApiResponse<Grupo>(false, null, "Grupo no encontrado"));
        }

        // Si liderId es null o 0, remover el líder
        if (liderId == null || liderId == 0)
        {
            grupo.LiderId = null;
            await _db.SaveChangesAsync();
            return Ok(new ApiResponse<Grupo>(true, grupo));
        }

        // Validar que el líder existe
        var lider = await _db.Users.FindAsync(liderId.Value);
        if (lider == null)
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "El líder especificado no existe"));
        }

        grupo.LiderId = liderId;
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Grupo>(true, grupo));
    }

    // PUT: api/Grupo/{id}/LiderSuplente
    [HttpPut("{id}/LiderSuplente")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> AsignarLiderSuplente(int id, [FromBody] int liderSuplenteId)
    {
        var grupo = await _db.Grupos.FindAsync(id);
        if (grupo == null)
        {
            return NotFound(new ApiResponse<Grupo>(false, null, "Grupo no encontrado"));
        }
        var liderSuplente = await _db.Users.FindAsync(liderSuplenteId);
        if (liderSuplente == null)
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "El líder suplente especificado no existe"));
        }
        grupo.LiderSuplenteId = liderSuplenteId;
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Grupo>(true, grupo));
    }

    // PUT: api/Grupo/{id}/Turno
    [HttpPut("{id}/Turno")]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> UpdateTurno(int id, [FromBody] GrupoUpdateTurnoRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "Datos inválidos"));
        }

        var grupo = await _db.Grupos.FindAsync(id);
        if (grupo == null)
        {
            return NotFound(new ApiResponse<Grupo>(false, null, "Grupo no encontrado"));
        }

        grupo.PersonasPorTurno = request.PersonasPorTurno;
        grupo.DuracionDeturno = request.DuracionDeturno;

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<Grupo>(true, grupo));
    }

    // POST: api/Grupo
    [HttpPost]
    [Authorize(Roles = "SuperUsuario")]
    public async Task<IActionResult> Create([FromBody] Grupo? grupo)
    {
        if (grupo == null)
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "El grupo es requerido"));
        }
        // Validar campos requeridos
        if (string.IsNullOrWhiteSpace(grupo.IdentificadorSAP) || grupo.PersonasPorTurno <= 0 || grupo.DuracionDeturno <= 0)
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "Datos requeridos faltantes o inválidos"));
        }
        // Validar que el Lider exista
        if (grupo.LiderId == null || !await _db.Users.AnyAsync(u => u.Id == grupo.LiderId))
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "El líder especificado no existe"));
        }
        // Validar que el LiderSuplente exista si se recibe
        if (grupo.LiderSuplenteId != null && !await _db.Users.AnyAsync(u => u.Id == grupo.LiderSuplenteId))
        {
            return BadRequest(new ApiResponse<Grupo>(false, null, "El líder suplente especificado no existe"));
        }
        _db.Grupos.Add(grupo);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Detail), new { id = grupo.GrupoId }, new ApiResponse<Grupo>(true, grupo));
    }

    // GET: api/Grupo/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> Detail(int id)
    {
        var grupo = await _db.Grupos
            .Include(g => g.Area)
            .FirstOrDefaultAsync(g => g.GrupoId == id);
        if (grupo == null)
        {
            return NotFound(new ApiResponse<Grupo>(false, null, "Grupo no encontrado"));
        }
        var dto = new GrupoDetail(
            grupo.GrupoId,
            grupo.Rol,
            grupo.AreaId,
            grupo.Area.UnidadOrganizativaSap,
            grupo.Area.NombreGeneral,
            grupo.IdentificadorSAP,
            grupo.PersonasPorTurno,
            grupo.DuracionDeturno,
            grupo.LiderId,
            grupo.LiderSuplenteId
        );
        return Ok(new ApiResponse<GrupoDetail>(true, dto));
    }

    // GET: api/Grupo
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var grupos = await _db.Grupos
            .Include(g => g.Area)
            .Select(g => new GrupoDetail(
            g.GrupoId,
            g.Rol,
            g.AreaId,
            g.Area.UnidadOrganizativaSap,
            g.Area.NombreGeneral,
            g.IdentificadorSAP,
            g.PersonasPorTurno,
            g.DuracionDeturno,
            g.LiderId,
            g.LiderSuplenteId
        )).ToListAsync();
        return Ok(new ApiResponse<List<GrupoDetail>>(true, grupos));
    }

    // POST: api/Grupo/transferir-empleado
    //[HttpPost("transferir-empleado")]
    //[Authorize(Roles = "SuperUsuario,Ingeniero Industrial")]
    //public async Task<IActionResult> TransferirEmpleado([FromBody] TransferirEmpleadoRequest request)
    //{
    //    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    //    if (!int.TryParse(userIdClaim, out int realizadoPorId))
    //        return Unauthorized(new ApiResponse<TransferirEmpleadoResponse>(false, null, "No autorizado"));

    //    if (request.EmpleadoId <= 0 || request.GrupoDestinoId <= 0)
    //        return BadRequest(new ApiResponse<TransferirEmpleadoResponse>(false, null, "Datos inválidos"));

    //    var empleado = await _db.Users
    //        .Include(u => u.Grupo)
    //        .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);

    //    if (empleado == null)
    //        return NotFound(new ApiResponse<TransferirEmpleadoResponse>(false, null, "Empleado no encontrado"));

    //    if (empleado.GrupoId == null)
    //        return BadRequest(new ApiResponse<TransferirEmpleadoResponse>(false, null, "El empleado no está asignado a ningún grupo"));

    //    if (empleado.GrupoId == request.GrupoDestinoId)
    //        return BadRequest(new ApiResponse<TransferirEmpleadoResponse>(false, null, "El empleado ya pertenece al grupo destino"));

    //    var grupoDestino = await _db.Grupos
    //        .Include(g => g.Area)
    //        .FirstOrDefaultAsync(g => g.GrupoId == request.GrupoDestinoId);

    //    if (grupoDestino == null)
    //        return NotFound(new ApiResponse<TransferirEmpleadoResponse>(false, null, "Grupo destino no encontrado"));

    //    var grupoOrigenId = empleado.GrupoId.Value;
    //    var grupoOrigen = await _db.Grupos
    //        .Include(g => g.Area)
    //        .FirstOrDefaultAsync(g => g.GrupoId == grupoOrigenId);

    //    // Verificar manning en grupo destino (solo advertencia)
    //    bool huboAdvertenciaManning = false;
    //    string? detallesManning = null;
    //    try
    //    {
    //        var manning = new CalculosSobreManning(_db);
    //        var porcentajeNoDisponible = manning.CalculaElPorcentajeNoDisponibleDelDia(request.GrupoDestinoId);
    //        if (porcentajeNoDisponible > 4.5m)
    //        {
    //            huboAdvertenciaManning = true;
    //            detallesManning = $"El grupo destino tiene {porcentajeNoDisponible:F1}% de ausencia hoy (máximo permitido: 4.5%)";
    //        }
    //    }
    //    catch { /* La verificación de manning es informativa, no bloquea */ }

    //    await using var transaction = await _db.Database.BeginTransactionAsync();
    //    try
    //    {
    //        // Actualizar grupo y área del empleado
    //        empleado.GrupoId = request.GrupoDestinoId;
    //        empleado.AreaId = grupoDestino.AreaId;
    //        _db.Users.Update(empleado);

    //        // Actualizar registros futuros de DiasCalendarioEmpleado
    //        var hoy = DateOnly.FromDateTime(DateTime.Now);
    //        var diasFuturos = await _db.DiasCalendarioEmpleado
    //            .Where(d => d.IdUsuarioEmpleadoSindicalizado == request.EmpleadoId && d.FechaDelDia >= hoy)
    //            .ToListAsync();

    //        foreach (var dia in diasFuturos)
    //        {
    //            dia.IdGrupo = request.GrupoDestinoId;
    //            dia.IdArea = grupoDestino.AreaId;
    //        }

    //        // Registrar la transferencia
    //        var transferencia = new TransferenciaGrupo
    //        {
    //            EmpleadoId = request.EmpleadoId,
    //            GrupoOrigenId = grupoOrigenId,
    //            GrupoDestinoId = request.GrupoDestinoId,
    //            RealizadoPorId = realizadoPorId,
    //            FechaTransferencia = DateTime.UtcNow,
    //            Motivo = request.Motivo,
    //            HuboAdvertenciaManning = huboAdvertenciaManning
    //        };
    //        _db.TransferenciasGrupo.Add(transferencia);

    //        await _db.SaveChangesAsync();
    //        await transaction.CommitAsync();

    //        return Ok(new ApiResponse<TransferirEmpleadoResponse>(true, new TransferirEmpleadoResponse
    //        {
    //            Exito = true,
    //            Mensaje = $"Empleado {empleado.FullName} transferido exitosamente al grupo {grupoDestino.Rol}",
    //            AdvertenciaManning = huboAdvertenciaManning,
    //            DetallesManning = detallesManning,
    //            TransferenciaId = transferencia.Id,
    //            NombreEmpleado = empleado.FullName,
    //            NominaEmpleado = empleado.Nomina ?? 0,
    //            GrupoOrigen = grupoOrigen?.Rol ?? grupoOrigenId.ToString(),
    //            GrupoDestino = grupoDestino.Rol,
    //            AreaDestino = grupoDestino.Area?.NombreGeneral ?? string.Empty,
    //            DiasCalendarioActualizados = diasFuturos.Count
    //        }));
    //    }
    //    catch (Exception ex)
    //    {
    //        await transaction.RollbackAsync();
    //        return StatusCode(500, new ApiResponse<TransferirEmpleadoResponse>(false, null, $"Error al realizar la transferencia: {ex.Message}"));
    //    }
    //}

    //// GET: api/Grupo/historial-transferencias
    //[HttpGet("historial-transferencias")]
    //[Authorize(Roles = "SuperUsuario,Ingeniero Industrial")]
    //public async Task<IActionResult> HistorialTransferencias()
    //{
    //    var historial = await _db.TransferenciasGrupo
    //        .Include(t => t.Empleado)
    //        .Include(t => t.GrupoOrigen).ThenInclude(g => g.Area)
    //        .Include(t => t.GrupoDestino).ThenInclude(g => g.Area)
    //        .Include(t => t.RealizadoPor)
    //        .OrderByDescending(t => t.FechaTransferencia)
    //        .Select(t => new HistorialTransferenciaDto
    //        {
    //            Id = t.Id,
    //            EmpleadoId = t.EmpleadoId,
    //            NombreEmpleado = t.Empleado.FullName,
    //            NominaEmpleado = t.Empleado.Nomina ?? 0,
    //            GrupoOrigenId = t.GrupoOrigenId,
    //            GrupoOrigen = t.GrupoOrigen.Rol,
    //            AreaOrigen = t.GrupoOrigen.Area != null ? t.GrupoOrigen.Area.NombreGeneral : string.Empty,
    //            GrupoDestinoId = t.GrupoDestinoId,
    //            GrupoDestino = t.GrupoDestino.Rol,
    //            AreaDestino = t.GrupoDestino.Area != null ? t.GrupoDestino.Area.NombreGeneral : string.Empty,
    //            NombreRealizadoPor = t.RealizadoPor.FullName,
    //            FechaTransferencia = t.FechaTransferencia,
    //            Motivo = t.Motivo,
    //            HuboAdvertenciaManning = t.HuboAdvertenciaManning
    //        })
    //        .ToListAsync();

    //    return Ok(new ApiResponse<List<HistorialTransferenciaDto>>(true, historial));
    //}

    // GET: api/Grupo/Area/{areaId}
    [HttpGet("Area/{areaId}")]
    public async Task<IActionResult> ListByArea(int areaId)
    {
        var grupos = await _db.Grupos
            .Include(g => g.Area)
            .Where(g => g.AreaId == areaId)
            .Select(g => new GrupoDetail(
                g.GrupoId,
                g.Rol,
                g.AreaId,
                g.Area.UnidadOrganizativaSap,
                g.Area.NombreGeneral,
                g.IdentificadorSAP,
                g.PersonasPorTurno,
                g.DuracionDeturno,
                g.LiderId,
                g.LiderSuplenteId
            )).ToListAsync();
        return Ok(new ApiResponse<List<GrupoDetail>>(true, grupos));
    }
}

public class GrupoDetail
{
    public int GrupoId { get; set; }
    public string Rol { get; set; }
    public int AreaId { get; set; }
    public string AreaUnidadOrganizativaSap { get; set; }
    public string AreaNombre { get; set; }
    public string IdentificadorSAP { get; set; }
    public int PersonasPorTurno { get; set; }
    public int DuracionDeturno { get; set; }
    public int? LiderId { get; set; }
    public int? LiderSuplenteId { get; set; }

    public GrupoDetail(int grupoId, string rol, int areaId, string areaUnidadOrganizativaSap, string areaNombre, string identificadorSAP, int personasPorTurno, int duracionDeturno, int? liderId, int? liderSuplenteId)
    {
        GrupoId = grupoId;
        Rol = rol;
        AreaId = areaId;
        AreaUnidadOrganizativaSap = areaUnidadOrganizativaSap;
        AreaNombre = areaNombre;
        IdentificadorSAP = identificadorSAP;
        PersonasPorTurno = personasPorTurno;
        DuracionDeturno = duracionDeturno;
        LiderId = liderId;
        LiderSuplenteId = liderSuplenteId;
    }
}
