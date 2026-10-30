using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class ReglaDomingoDto
    {
        public int Id { get; set; }
        public int AreaId { get; set; }
        public string Area { get; set; } = string.Empty;
        public int? GrupoId { get; set; }
        public string? Grupo { get; set; }
        public string Tipo { get; set; } = string.Empty;
        public bool IncluyeSabado { get; set; }
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public string? Motivo { get; set; }
        public bool Activa { get; set; }
        public string? CreadoPor { get; set; }
        public DateTime FechaCreacion { get; set; }
        public string? DesactivadoPor { get; set; }
        public DateTime? FechaDesactivacion { get; set; }
    }

    public class ReglasDomingoResponse
    {
        /// <summary>false: falta correr Scripts/Migration_ReglasDomingo.sql.</summary>
        public bool TablaExiste { get; set; } = true;
        public List<ReglaDomingoDto> Reglas { get; set; } = new();
    }

    public class CrearReglaDomingoRequest
    {
        /// <summary>Una o varias unidades organizativas: se crea una regla por cada una.</summary>
        public List<int> AreaIds { get; set; } = new();
        /// <summary>Opcional, solo con una unidad: la regla aplica a ese grupo.</summary>
        public int? GrupoId { get; set; }
        /// <summary>"SinDomingo" o "RolNormal".</summary>
        public string Tipo { get; set; } = "SinDomingo";
        public bool IncluyeSabado { get; set; }
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public string? Motivo { get; set; }
    }

    /// <summary>Vacación activa que cae en un día que una regla dejó no laborable.</summary>
    public class VacacionEnNoLaborableDto
    {
        public int VacacionId { get; set; }
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public DateOnly Fecha { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        public string Motivo { get; set; } = string.Empty;
    }
}
