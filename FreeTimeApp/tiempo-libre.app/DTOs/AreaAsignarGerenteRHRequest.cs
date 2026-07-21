using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Payload para asignar Gerentes BT y/o RH a un área. Cada lista es la
    /// fuente de verdad completa para su rol: reemplaza a la asignación
    /// existente. Un null significa "no tocar ese rol".
    /// </summary>
    public class AreaAsignarGerenteRHRequest
    {
        public List<int>? GerenteIds { get; set; }
        public List<int>? RHIds { get; set; }
    }
}
