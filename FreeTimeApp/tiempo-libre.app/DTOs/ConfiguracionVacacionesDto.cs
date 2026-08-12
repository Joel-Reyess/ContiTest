using System;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class ConfiguracionVacacionesRequest
    {
        [Required]
        [Range(0.1, 100.0, ErrorMessage = "El porcentaje debe estar entre 0.1 y 100")]
        public decimal PorcentajeAusenciaMaximo { get; set; }

        [Required]
        [RegularExpression("^(ProgramacionAnual|Reprogramacion|Cerrado)$", 
            ErrorMessage = "El período debe ser: ProgramacionAnual, Reprogramacion o Cerrado")]
        public string PeriodoActual { get; set; } = string.Empty;

        [Required]
        [Range(2020, 2100, ErrorMessage = "El año debe estar entre 2020 y 2100")]
        public int AnioVigente { get; set; }

        /// <summary>
        /// Año en preparación de programación anual (coexiste con la
        /// reprogramación del año vigente). null = sin preparación en curso.
        /// OJO: el PUT siempre persiste este valor; los clientes deben
        /// reenviar el valor actual si no desean cambiarlo.
        /// </summary>
        [Range(2020, 2100, ErrorMessage = "El año de programación debe estar entre 2020 y 2100")]
        public int? AnioProgramacionAnual { get; set; }
    }

    public class ConfiguracionVacacionesResponse
    {
        public int Id { get; set; }
        public decimal PorcentajeAusenciaMaximo { get; set; }
        public string PeriodoActual { get; set; } = string.Empty;
        public int AnioVigente { get; set; }
        public int? AnioProgramacionAnual { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedByUser { get; set; }
    }

    public class ExcepcionPorcentajeRequest
    {
        [Required]
        public int GrupoId { get; set; }

        [Required]
        public DateOnly Fecha { get; set; }

        [Required]
        [Range(0.1, 100.0, ErrorMessage = "El porcentaje debe estar entre 0.1 y 100")]
        public decimal PorcentajeMaximoPermitido { get; set; }

        [MaxLength(200)]
        public string? Motivo { get; set; }
    }

    public class ExcepcionPorcentajeResponse
    {
        public int Id { get; set; }
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public string NombreArea { get; set; } = string.Empty;
        public DateOnly Fecha { get; set; }
        public decimal PorcentajeMaximoPermitido { get; set; }
        public string? Motivo { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedByUser { get; set; } = string.Empty;
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedByUser { get; set; }
    }

    public class CambioPeriodoRequest
    {
        [Required]
        [RegularExpression("^(ProgramacionAnual|Reprogramacion|Cerrado)$", 
            ErrorMessage = "El período debe ser: ProgramacionAnual, Reprogramacion o Cerrado")]
        public string NuevoPeriodo { get; set; } = string.Empty;
    }

    public class ConsultaExcepcionesRequest
    {
        public int? GrupoId { get; set; }
        public DateOnly? FechaInicio { get; set; }
        public DateOnly? FechaFin { get; set; }
    }

    // DTOs para ExcepcionesManning
    public class ExcepcionManningRequest
    {
        [Required]
        public int AreaId { get; set; }

        [Required]
        [Range(2024, 2100, ErrorMessage = "El año debe estar entre 2024 y 2100")]
        public int Anio { get; set; }

        [Required]
        [Range(1, 12, ErrorMessage = "El mes debe estar entre 1 y 12")]
        public int Mes { get; set; }

        [Required]
        [Range(1, 200, ErrorMessage = "El manning debe estar entre 1 y 200")]
        public int ManningRequeridoExcepcion { get; set; }

        [MaxLength(500)]
        public string? Motivo { get; set; }
    }

    public class ExcepcionManningResponse
    {
        public int Id { get; set; }
        public int AreaId { get; set; }
        public string NombreArea { get; set; } = string.Empty;
        public int Anio { get; set; }
        public int Mes { get; set; }
        public string MesNombre { get; set; } = string.Empty;
        public int ManningRequeridoExcepcion { get; set; }
        public int ManningBase { get; set; } // Manning original del área
        public string? Motivo { get; set; }
        public bool Activa { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedByUser { get; set; } = string.Empty;
        public DateTime? UpdatedAt { get; set; }
    }

    public class ConsultaExcepcionesManningRequest
    {
        public int? AreaId { get; set; }
        public int? Anio { get; set; }
        public int? Mes { get; set; }
        public bool? SoloActivas { get; set; } = true;
    }
}
