using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class CapacidadPorcentajeDto
    {
        public int Id { get; set; }
        public string Alcance { get; set; } = string.Empty;
        public int? AreaId { get; set; }
        public string? Area { get; set; }
        public int? GrupoId { get; set; }
        public string? Grupo { get; set; }
        public string Periodo { get; set; } = string.Empty;
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public decimal Porcentaje { get; set; }
        public string? Motivo { get; set; }
        public bool Activa { get; set; }
        public string? CreadoPor { get; set; }
        public DateTime FechaCreacion { get; set; }
        public string? DesactivadoPor { get; set; }
        public DateTime? FechaDesactivacion { get; set; }
        public string Descripcion { get; set; } = string.Empty;
    }

    public class CapacidadesPorcentajeResponse
    {
        /// <summary>false: falta correr Scripts/Migration_CapacidadesPorcentaje.sql.</summary>
        public bool TablaExiste { get; set; } = true;
        public decimal PorcentajeGeneral { get; set; }
        public int? AnioPreparacion { get; set; }
        public decimal? PorcentajePreparacion { get; set; }
        public List<CapacidadPorcentajeDto> Capacidades { get; set; } = new();
    }

    public class CrearCapacidadPorcentajeRequest
    {
        /// <summary>"Planta", "Area" o "Grupo".</summary>
        [Required]
        public string Alcance { get; set; } = "Planta";
        public int? AreaId { get; set; }
        public int? GrupoId { get; set; }

        /// <summary>"Dia", "Semana" o "Mes".</summary>
        [Required]
        public string Periodo { get; set; } = "Mes";

        /// <summary>Día (o primer día), cualquier día de la semana, o cualquier día del mes.</summary>
        public DateOnly FechaInicio { get; set; }

        /// <summary>Solo para "Dia": último día de un rango corto (hasta 31 días). Si no, igual a FechaInicio.</summary>
        public DateOnly? FechaFin { get; set; }

        [Range(0.1, 100)]
        public decimal Porcentaje { get; set; }

        [MaxLength(300)]
        public string? Motivo { get; set; }
    }

    /// <summary>Límite que rige un grupo un día y de dónde sale.</summary>
    public class LimiteDiaDto
    {
        public DateOnly Fecha { get; set; }
        public int GrupoId { get; set; }
        public decimal Porcentaje { get; set; }
        public string Origen { get; set; } = string.Empty;
    }
}
