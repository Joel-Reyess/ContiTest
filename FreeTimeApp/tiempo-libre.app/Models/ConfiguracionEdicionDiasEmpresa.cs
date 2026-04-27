using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    [Table("ConfiguracionEdicionDiasEmpresa")]
    public class ConfiguracionEdicionDiasEmpresa
    {
        [Key]
        public int Id { get; set; }

        public bool Habilitado { get; set; } = false;

        [Required]
        public DateOnly FechaInicioPeriodo { get; set; }

        [Required]
        public DateOnly FechaFinPeriodo { get; set; }

        [MaxLength(300)]
        public string? Descripcion { get; set; }

        public int? CreadoPorId { get; set; }

        [ForeignKey("CreadoPorId")]
        public virtual User? CreadoPor { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }
    }
}
