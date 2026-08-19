using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    [Table("ConfiguracionVacaciones")]
    public class ConfiguracionVacaciones
    {
        [Key]
        public int Id { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal PorcentajeAusenciaMaximo { get; set; } = 4.5m;

        [Required]
        [MaxLength(20)]
        public string PeriodoActual { get; set; } = "Cerrado"; // 'ProgramacionAnual', 'Reprogramacion', 'Cerrado'

        [Required]
        public int AnioVigente { get; set; }

        /// <summary>
        /// Año cuya programación anual se está PREPARANDO mientras el año vigente
        /// sigue operando (p. ej. preparar 2027 durante la reprogramación de 2026).
        /// NULL = no hay preparación en curso. Permite que la programación anual
        /// del siguiente año y la reprogramación del año en curso convivan.
        /// Requiere la columna en BD: ver sql/2026-08-12-anio-programacion-anual.sql
        /// </summary>
        public int? AnioProgramacionAnual { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public DateTime? UpdatedAt { get; set; }
    }
}
