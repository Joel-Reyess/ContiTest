using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class AreaAssignJefeRequest
    {
        public int? JefeId { get; set; }
        public int? JefeSuplenteId { get; set; }

        /// <summary>
        /// Lista completa de jefes del área (multi-jefes). Si viene con valores,
        /// reemplaza a AreaJefes por completo con esta lista. Si va nulo o vacío,
        /// se conservan las asignaciones existentes (compat) y solo se aplican
        /// JefeId/JefeSuplenteId.
        /// </summary>
        public List<int>? JefeIds { get; set; }
    }
}
