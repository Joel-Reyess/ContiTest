using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    /// <summary>Un día asignado por la empresa que cae en descanso según el rol actual del empleado.</summary>
    public class DiaEmpresaEnDescansoDto
    {
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int? AreaId { get; set; }
        public string Area { get; set; } = string.Empty;
        public int GrupoId { get; set; }
        public string Grupo { get; set; } = string.Empty;
        public int VacacionId { get; set; }
        public DateOnly Fecha { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        /// <summary>Turno que trae el rol ese día ("D" o "0").</summary>
        public string Turno { get; set; } = string.Empty;
        /// <summary>El día ya pasó: se puede reprogramar igual (papeleta retroactiva), pero va al final.</summary>
        public bool YaPaso { get; set; }
        /// <summary>Ya hay una reprogramación de día empresa pendiente para ese día.</summary>
        public bool TieneSolicitudPendiente { get; set; }
    }

    public class DiasEmpresaEnDescansoResponse
    {
        public int Anio { get; set; }
        public int TotalDias { get; set; }
        public int TotalEmpleados { get; set; }
        public List<DiaEmpresaEnDescansoDto> Dias { get; set; } = new();
    }
}
