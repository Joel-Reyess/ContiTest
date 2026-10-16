using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class VacacionRetenidaDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public int Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public DateOnly Fecha { get; set; }
        public int Antiguedad { get; set; }
        public int Corresponden { get; set; }
        public int YaTenia { get; set; }
        /// <summary>Días de común acuerdo activos que tiene HOY en ese año.</summary>
        public int TieneHoy { get; set; }
        public string Estado { get; set; } = string.Empty;
        public DateTime FechaCargaExcel { get; set; }
        public string? ResueltoPor { get; set; }
        public DateTime? FechaResolucion { get; set; }
        public string? Nota { get; set; }
    }

    public class VacacionesRetenidasResponse
    {
        /// <summary>false: no se ha corrido Scripts/Migration_VacacionesRetenidasSAP.sql.</summary>
        public bool TablaExiste { get; set; } = true;
        public List<VacacionRetenidaDto> Retenidas { get; set; } = new();
    }

    public class ResolverRetencionRequest
    {
        public string? Nota { get; set; }
    }

    public class DiaDeExcesoDto
    {
        public DateOnly Fecha { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        public string? Observaciones { get; set; }
        public bool VieneDelExcel { get; set; }
    }

    /// <summary>Empleado que HOY tiene más días activos de los que le tocan por antigüedad.</summary>
    public class ExcesoAntiguedadDto
    {
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public int Antiguedad { get; set; }
        public int CorrespondenEmpresa { get; set; }
        public int CorrespondenComunAcuerdo { get; set; }
        public int TieneEmpresa { get; set; }
        public int TieneComunAcuerdo { get; set; }
        public int Exceso { get; set; }
        public List<DiaDeExcesoDto> Dias { get; set; } = new();
    }
}
