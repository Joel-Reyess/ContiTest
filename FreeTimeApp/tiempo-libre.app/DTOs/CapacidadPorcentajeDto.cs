using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class CapacidadPorcentajeDto
    {
        public int Id { get; set; }
        public string Alcance { get; set; } = string.Empty;
        public string AplicaA { get; set; } = "Ambos";
        /// <summary>null = todo el día; "1", "2" o "3" = solo los grupos que ese día van en ese turno.</summary>
        public string? Turno { get; set; }
        public int? AreaId { get; set; }
        public string? Area { get; set; }
        public int? GrupoId { get; set; }
        public string? Grupo { get; set; }
        public string Periodo { get; set; } = string.Empty;
        /// <summary>"Grupo" (cada grupo contra su plantilla) o "Dia" (todo el personal del área que trabaja ese día).</summary>
        public string Medicion { get; set; } = "Grupo";
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public decimal Porcentaje { get; set; }
        public string? Motivo { get; set; }
        public bool Activa { get; set; }
        public string? CreadoPor { get; set; }
        public DateTime FechaCreacion { get; set; }
        public string? DesactivadoPor { get; set; }
        public DateTime? FechaDesactivacion { get; set; }
        public string? ModificadoPor { get; set; }
        public DateTime? FechaModificacion { get; set; }
        public string Descripcion { get; set; } = string.Empty;
    }

    public class CapacidadesPorcentajeResponse
    {
        /// <summary>false: falta correr Scripts/Migration_CapacidadesPorcentaje.sql.</summary>
        public bool TablaExiste { get; set; } = true;
        /// <summary>
        /// Falta correr Scripts/Migration_CapacidadPorDiaYAnual.sql: se listan sin las
        /// columnas nuevas y no se puede guardar por día, por año ni editar.
        /// </summary>
        public string? FaltaScript { get; set; }
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

        /// <summary>"Ambos", "Empresa" (solo días por la empresa) u "Operador" (solo lo que programan los operadores).</summary>
        public string AplicaA { get; set; } = "Ambos";
        /// <summary>null o vacío = todo el día; "1", "2" o "3" = solo el turno que ese día le toca al grupo por su rol.</summary>
        public string? Turno { get; set; }
        public int? AreaId { get; set; }
        public int? GrupoId { get; set; }

        /// <summary>"Dia", "Semana", "Mes" o "Anio".</summary>
        [Required]
        public string Periodo { get; set; } = "Mes";

        /// <summary>"Grupo" (default) o "Dia" (solo área y todo el día: el personal del área que trabaja ese día).</summary>
        public string? Medicion { get; set; }

        /// <summary>Día (o primer día), cualquier día de la semana, cualquier día del mes o del año.</summary>
        public DateOnly FechaInicio { get; set; }

        /// <summary>Solo para "Dia": último día de un rango corto (hasta 31 días). Si no, igual a FechaInicio.</summary>
        public DateOnly? FechaFin { get; set; }

        [Range(0.1, 100)]
        public decimal Porcentaje { get; set; }

        [MaxLength(300)]
        public string? Motivo { get; set; }
    }

    /// <summary>
    /// Personal que cuenta "por día" en un área (vista previa del formulario): los
    /// grupos que ese día trabajan según su rol y cuántas personas activas tiene cada uno.
    /// </summary>
    public class PersonalDelDiaDto
    {
        public DateOnly Fecha { get; set; }
        public string Dia { get; set; } = string.Empty;
        public int Total { get; set; }
        public List<PersonalGrupoDiaDto> Grupos { get; set; } = new();
        /// <summary>Con el porcentaje pedido, cuántos pueden faltar ese día (null si no se pidió %).</summary>
        public int? MaximoAusentes { get; set; }
    }

    public class PersonalGrupoDiaDto
    {
        public int GrupoId { get; set; }
        public string Grupo { get; set; } = string.Empty;
        public string Turno { get; set; } = string.Empty;
        public int Personas { get; set; }
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
