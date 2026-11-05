using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Regla dominical por unidad organizativa y periodo (requerimiento de
    /// planeación anual 2027, punto 1). En el periodo elegido en el calendario, el
    /// área (o un grupo de ella) trabaja sin domingos —y si se marca, tampoco
    /// sábados—: ese día nadie labora, no se programan vacaciones ni días por la
    /// empresa, y el rol semanal y los calendarios lo muestran como descanso. El
    /// tipo "RolNormal" sirve de excepción: un grupo del área que sigue con el rol
    /// a siete días. Sin reglas, todo es rol normal, como antes.
    /// No se borra: se desactiva y se puede reactivar (queda quién y cuándo).
    /// </summary>
    [Table("ReglasDomingo")]
    public class ReglaDomingo
    {
        [Key]
        public int Id { get; set; }

        /// <summary>Unidad organizativa (área).</summary>
        public int AreaId { get; set; }

        /// <summary>Opcional: solo este grupo del área.</summary>
        public int? GrupoId { get; set; }

        /// <summary>"SinDomingo" (no laborable) o "RolNormal" (siete días, excepción).</summary>
        [Required, MaxLength(12)]
        public string Tipo { get; set; } = "SinDomingo";

        /// <summary>Con "SinDomingo": el sábado tampoco es laborable.</summary>
        public bool IncluyeSabado { get; set; }

        public DateOnly FechaInicio { get; set; }

        public DateOnly FechaFin { get; set; }

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
