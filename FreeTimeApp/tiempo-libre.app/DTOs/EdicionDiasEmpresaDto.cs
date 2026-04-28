using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    // ─── Request DTOs ───────────────────────────────────────────────────────────

    public class SolicitarEdicionDiaEmpresaRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int VacacionOriginalId { get; set; }

        [Required]
        public DateOnly FechaNueva { get; set; }

        [MaxLength(500)]
        public string? ObservacionesEmpleado { get; set; }
    }

    public class ResponderEdicionDiaEmpresaRequest
    {
        [Required]
        public int SolicitudId { get; set; }

        [Required]
        public bool Aprobar { get; set; }

        [MaxLength(500)]
        public string? ObservacionesJefe { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }

    public class CrearConfiguracionEdicionRequest
    {
        [Required]
        public DateOnly FechaInicioPeriodo { get; set; }

        [Required]
        public DateOnly FechaFinPeriodo { get; set; }

        [MaxLength(300)]
        public string? Descripcion { get; set; }

        public bool Habilitado { get; set; } = true;
    }

    // ─── Response DTOs ──────────────────────────────────────────────────────────

    public class ConfiguracionEdicionDiasEmpresaDto
    {
        public int Id { get; set; }
        public bool Habilitado { get; set; }
        public DateOnly FechaInicioPeriodo { get; set; }
        public DateOnly FechaFinPeriodo { get; set; }
        public string? Descripcion { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SolicitudEdicionDiaEmpresaDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public int? NominaEmpleado { get; set; }
        public int VacacionOriginalId { get; set; }
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string EstadoSolicitud { get; set; } = string.Empty;
        public string? MotivoRechazo { get; set; }
        public string? ObservacionesEmpleado { get; set; }
        public string? ObservacionesJefe { get; set; }
        public DateTime FechaSolicitud { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public string? NombreJefeArea { get; set; }
        public string? NombreSolicitadoPor { get; set; }
    }

    public class ReporteDiasReprogramadosEmpresaDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string? Area { get; set; }
        public string? Grupo { get; set; }
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string EstadoSolicitud { get; set; } = string.Empty;
        public DateTime FechaSolicitud { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public string? NombreJefeArea { get; set; }
        public string? NombreSolicitadoPor { get; set; }
        public string? ObservacionesEmpleado { get; set; }
        public string? MotivoRechazo { get; set; }
    }
}
