using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Solicitud del delegado sindical cuando un empleado se presentó a trabajar
    /// en un día que tenía programado como vacación. El día original se cancela y
    /// se re-programa en la fecha nueva elegida por el delegado. Requiere aprobación
    /// del jefe de área.
    /// </summary>
    [Table("SolicitudesVacacionLaborada")]
    public class SolicitudesVacacionLaborada
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int Nomina { get; set; }

        [Required]
        public int VacacionOriginalId { get; set; }

        [Required]
        public DateOnly FechaOriginal { get; set; }

        [Required]
        public DateOnly FechaNueva { get; set; }

        [MaxLength(500)]
        public string? Motivo { get; set; }

        [MaxLength(20)]
        public string EstadoSolicitud { get; set; } = "Pendiente"; // 'Pendiente' | 'Aprobada' | 'Rechazada'

        public DateTime FechaSolicitud { get; set; } = DateTime.Now;

        [Required]
        public int SolicitadoPorId { get; set; }

        public int? JefeAreaId { get; set; }

        public DateTime? FechaRespuesta { get; set; }

        public int? AprobadoPorId { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }

        public int? VacacionCanceladaId { get; set; }

        public int? VacacionCreadaId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public DateTime? UpdatedAt { get; set; }

        [ForeignKey("EmpleadoId")]
        public virtual User Empleado { get; set; } = null!;

        [ForeignKey("VacacionOriginalId")]
        public virtual VacacionesProgramadas VacacionOriginal { get; set; } = null!;

        [ForeignKey("SolicitadoPorId")]
        public virtual User? SolicitadoPor { get; set; }

        [ForeignKey("JefeAreaId")]
        public virtual User? JefeArea { get; set; }

        [ForeignKey("AprobadoPorId")]
        public virtual User? AprobadoPor { get; set; }
    }
}
