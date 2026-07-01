using System;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para crear una solicitud de "vacación laborada":
    /// el delegado indica que el empleado se presentó a trabajar en un día que
    /// tenía programado como vacación (VacacionOriginalId) y elige la fecha
    /// nueva en la que quiere que la vacación se re-programe.
    /// </summary>
    public class SolicitarVacacionLaboradaRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int VacacionOriginalId { get; set; }

        /// <summary>Fecha nueva en formato yyyy-MM-dd.</summary>
        [Required]
        public string FechaNueva { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? Motivo { get; set; }
    }

    public class AprobarVacacionLaboradaRequest
    {
        [Required]
        public int SolicitudId { get; set; }

        [Required]
        public bool Aprobada { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }

    public class VacacionLaboradaDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public int Nomina { get; set; }
        public string? NombreEmpleado { get; set; }
        public string? AreaEmpleado { get; set; }
        public string? GrupoEmpleado { get; set; }

        public int VacacionOriginalId { get; set; }
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }

        public string? Motivo { get; set; }
        public string EstadoSolicitud { get; set; } = "Pendiente";
        public DateTime FechaSolicitud { get; set; }

        public int SolicitadoPorId { get; set; }
        public string? NombreSolicitadoPor { get; set; }

        public int? JefeAreaId { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public int? AprobadoPorId { get; set; }
        public string? NombreAprobadoPor { get; set; }
        public string? MotivoRechazo { get; set; }

        public int? VacacionCanceladaId { get; set; }
        public int? VacacionCreadaId { get; set; }
    }
}
