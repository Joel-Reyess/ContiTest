using System.Data.Common;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Logic;

public class CalculosSobreManning
{
    private static readonly decimal MAX_PORCENTAJE_DE_AUSENCIA_POR_DIA = 4.5m;
    private readonly FreeTimeDbContext _db;

    public CalculosSobreManning(FreeTimeDbContext db)
    {
        _db = db;
    }

    public virtual decimal CalculaElPorcentajeDisponibleDelDia(int IdGrupo, DateTime? fecha = null, decimal? manning = null)
    {
        if (fecha == null)
        {
            fecha = DateTime.Now;
        }
        DateOnly dateOnly = DateOnly.FromDateTime(fecha.Value);

        var empleadosTrabajanHoyXGrupo = _db.DiasCalendarioEmpleado.Where(dxe => dxe.TipoActividadDelDia == TipoActividadDelDiaEnum.Laboral && dxe.IdGrupo == IdGrupo && dxe.FechaDelDia == dateOnly).Count();
        var totalEmpleadosHoyXGrupo = manning.HasValue ? manning.Value : _db.DiasCalendarioEmpleado.Where(dxe => dxe.IdGrupo == IdGrupo && dxe.FechaDelDia == dateOnly).Count();
        var porcentajeDisponibleHoyXGrupo = ((decimal)empleadosTrabajanHoyXGrupo / (decimal)totalEmpleadosHoyXGrupo) * 100;

        return porcentajeDisponibleHoyXGrupo;
    }

    public virtual decimal CalculaElPorcentajeNoDisponibleDelDia(int IdGrupo, DateTime? fecha = null, decimal? manning = null)
    {
        if (fecha == null)
        {
            fecha = DateTime.Now;
        }
        DateOnly dateOnly = DateOnly.FromDateTime(fecha.Value);

        var empleadosNoTrabajanHoyXGrupo = _db.DiasCalendarioEmpleado.Where(dxe => dxe.TipoActividadDelDia != TipoActividadDelDiaEnum.Laboral && dxe.IdGrupo == IdGrupo && dxe.FechaDelDia == dateOnly).Count();
        var totalEmpleadosHoyXGrupo = manning.HasValue ? manning.Value : _db.DiasCalendarioEmpleado.Where(dxe => dxe.IdGrupo == IdGrupo && dxe.FechaDelDia == dateOnly).Count();
        var porcentajeAusenteTotalEmpleadosHoyXGrupo = totalEmpleadosHoyXGrupo > 0 ? ((decimal)empleadosNoTrabajanHoyXGrupo / (decimal)totalEmpleadosHoyXGrupo) * 100 : 0;

        return porcentajeAusenteTotalEmpleadosHoyXGrupo;
    }

    public virtual bool ElPorcentajeDeAusenciaEstaDentroDelRango(int IdGrupo, DateTime? fecha = null, decimal? porcentajeNoDisponible = null)
    {
        if (fecha == null)
        {
            fecha = DateTime.Now;
        }
        DateOnly dateOnly = DateOnly.FromDateTime(fecha.Value);

        var grupo = _db.Grupos.FirstOrDefault(g => g.GrupoId == IdGrupo);
        if (grupo == null)
        {
            throw new ArgumentException($"No se encontró el grupo con Id {IdGrupo}");
        }

        var manning = ObtenerManningDelDia(IdGrupo, fecha);
        porcentajeNoDisponible = porcentajeNoDisponible ?? CalculaElPorcentajeNoDisponibleDelDia(IdGrupo, fecha);
        return porcentajeNoDisponible <= MAX_PORCENTAJE_DE_AUSENCIA_POR_DIA;
    }

    public virtual decimal ObtenerManningDelDia(int IdGrupo, DateTime? fecha = null)
    {
        if (fecha == null)
        {
            fecha = DateTime.Now;
        }
        DateOnly dateOnly = DateOnly.FromDateTime(fecha.Value);

        var grupo = _db.Grupos.FirstOrDefault(g => g.GrupoId == IdGrupo);
        if (grupo == null)
        {
            throw new ArgumentException($"No se encontró el grupo con Id {IdGrupo}");
        }

        var area = _db.Areas.FirstOrDefault(a => a.AreaId == grupo.AreaId);
        if (area == null)
        {
            throw new ArgumentException($"No se encontró el área con Id {grupo.AreaId} para el grupo {IdGrupo}");
        }

        var manningporDia = _db.ManningPorDia.FirstOrDefault(m => m.IdArea == area.AreaId && m.Fecha == dateOnly);
        var manningPorMes = _db.ManningPorMes.FirstOrDefault(m => m.IdArea == area.AreaId && m.Anio == dateOnly.Year && m.Mes == dateOnly.Month);
        // Excepción mensual capturada por el SuperUsuario (tabla ExcepcionesManning).
        // Tiene prioridad sobre area.Manning base, pero ManningPorDia / ManningPorMes
        // (configuraciones más granulares) siguen ganando si existen.
        var excepcionManning = _db.ExcepcionesManning.FirstOrDefault(e =>
            e.AreaId == area.AreaId &&
            e.Anio == dateOnly.Year &&
            e.Mes == dateOnly.Month &&
            e.Activa);

        if (manningporDia != null)
        {
            return manningporDia.PorcentajeManning;
        }
        else if (manningPorMes != null)
        {
            return manningPorMes.PorcentajeManning;
        }
        else if (excepcionManning != null)
        {
            return excepcionManning.ManningRequeridoExcepcion;
        }

        return area.Manning;
    }

    public virtual PorcentajeAusentePorDia ObtenerPorcentajeNoDisponibleDelDia(int IdGrupo, DateTime? fecha = null)
    {
        if (fecha == null)
        {
            fecha = DateTime.Now;
        }
        DateOnly dateOnly = DateOnly.FromDateTime(fecha.Value);

        var manningDelDia = ObtenerManningDelDia(IdGrupo, fecha);
        var porcentajeDisponible = CalculaElPorcentajeDisponibleDelDia(IdGrupo, fecha, manningDelDia);
        var porcentajeNoDisponible = CalculaElPorcentajeNoDisponibleDelDia(IdGrupo, fecha, manningDelDia);

        return new PorcentajeAusentePorDia(IdGrupo, dateOnly, porcentajeDisponible, porcentajeNoDisponible, ElPorcentajeDeAusenciaEstaDentroDelRango(IdGrupo, fecha, porcentajeNoDisponible));
    }

}

public record struct PorcentajeAusentePorDia(int IdGrupo, DateOnly Fecha, decimal PorcentajeDisponible, decimal PorcentajeNoDisponible, bool DentroDelRango);
