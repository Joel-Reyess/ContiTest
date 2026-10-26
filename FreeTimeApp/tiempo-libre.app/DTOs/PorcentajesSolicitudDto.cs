using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class PorcentajesSolicitudesRequest
    {
        public List<PorcentajeSolicitudItem> Items { get; set; } = new();
    }

    public class PorcentajeSolicitudItem
    {
        /// <summary>Lo que el cliente usa para emparejar la respuesta (ej. "vacacion-laborada-12").</summary>
        public string Clave { get; set; } = string.Empty;
        public int EmpleadoId { get; set; }
        /// <summary>Si no hay EmpleadoId (permisos), se busca por nómina.</summary>
        public int? Nomina { get; set; }
        /// <summary>El día que se pide (fecha nueva; en permisos, el primer día).</summary>
        public DateOnly Fecha { get; set; }
    }

    public class PorcentajeSolicitudDto
    {
        public string Clave { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        /// <summary>% de ausencia del grupo del empleado ese día, contándolo a él.</summary>
        public decimal? PorcentajeTurno { get; set; }
        /// <summary>% de ausencia del área ese día.</summary>
        public decimal? PorcentajeDia { get; set; }
        /// <summary>Límite que rige ese día para el grupo del empleado (para el semáforo).</summary>
        public decimal? PorcentajeMaximo { get; set; }
    }
}
