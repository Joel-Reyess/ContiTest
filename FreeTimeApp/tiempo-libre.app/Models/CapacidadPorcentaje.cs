using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Capacidad adicional de ausencia por periodo (oct-2026): Ingeniería Industrial
    /// autoriza tiempo extra y con eso un porcentaje distinto al general durante un
    /// día, una semana o un mes, para toda la planta, un área o un grupo. Mientras
    /// está vigente manda sobre el general; al terminar el periodo vuelve a regir
    /// el general. No se borra: se desactiva (y se puede reactivar), así queda el
    /// historial de quién la puso y quién la quitó.
    /// </summary>
    [Table("CapacidadesPorcentaje")]
    public class CapacidadPorcentaje
    {
        [Key]
        public int Id { get; set; }

        /// <summary>"Planta", "Area" o "Grupo".</summary>
        [Required, MaxLength(10)]
        public string Alcance { get; set; } = "Planta";

        public int? AreaId { get; set; }

        public int? GrupoId { get; set; }

        /// <summary>"Dia", "Semana" (lunes a domingo) o "Mes".</summary>
        [Required, MaxLength(10)]
        public string Periodo { get; set; } = "Mes";

        public DateOnly FechaInicio { get; set; }

        public DateOnly FechaFin { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal Porcentaje { get; set; }

        [MaxLength(300)]
        public string? Motivo { get; set; }

        public bool Activa { get; set; } = true;

        public int? CreadoPorId { get; set; }

        public DateTime FechaCreacion { get; set; } = DateTime.Now;

        public int? DesactivadoPorId { get; set; }

        public DateTime? FechaDesactivacion { get; set; }

        [ForeignKey(nameof(AreaId))]
        public virtual Area? Area { get; set; }

        [ForeignKey(nameof(GrupoId))]
        public virtual Grupo? Grupo { get; set; }

        [ForeignKey(nameof(CreadoPorId))]
        public virtual User? CreadoPor { get; set; }

        [ForeignKey(nameof(DesactivadoPorId))]
        public virtual User? DesactivadoPor { get; set; }
    }
}
