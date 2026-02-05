using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    [Table("SolicitudesReprogramacion")]
    public class SolicitudesReprogramacion
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int VacacionOriginalId { get; set; }

        [Required]
        public DateOnly FechaNuevaSolicitada { get; set; }

        [Required]
        public DateOnly FechaOriginalGuardada { get; set; } // Guarda la fecha original antes de cualquier modificación

        [MaxLength(20)]
        public string EstadoSolicitud { get; set; } = "Pendiente"; // 'Pendiente', 'Aprobada', 'Rechazada'

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }

        public int? JefeAreaId { get; set; }

        public int? SolicitadoPorId { get; set; }

        [ForeignKey("SolicitadoPorId")]
        public virtual User? SolicitadoPor { get; set; }

        public DateTime FechaSolicitud { get; set; } = DateTime.Now;

        public DateTime? FechaRespuesta { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal? PorcentajeCalculado { get; set; } // Para auditoría

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public DateTime? UpdatedAt { get; set; }

        [MaxLength(500)]
        public string? ObservacionesEmpleado { get; set; }

        [MaxLength(500)]
        public string? ObservacionesJefe { get; set; }

        // Navigation properties
        [ForeignKey("EmpleadoId")]
        public virtual User Empleado { get; set; } = null!;

        [ForeignKey("VacacionOriginalId")]
        public virtual VacacionesProgramadas VacacionOriginal { get; set; } = null!;

        [ForeignKey("JefeAreaId")]
        public virtual User? JefeArea { get; set; }
    }
}
