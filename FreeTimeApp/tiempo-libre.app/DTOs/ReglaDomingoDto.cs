using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class ReglaDomingoDto
    {
        public int Id { get; set; }
        public int AreaId { get; set; }
        public string Area { get; set; } = string.Empty;
        public int? GrupoId { get; set; }
        public string? Grupo { get; set; }
        public string Tipo { get; set; } = string.Empty;
        public bool IncluyeSabado { get; set; }
        /// <summary>"Domingo", "Sabado" o "Ambos".</summary>
        public string DiaAplicacion { get; set; } = "Domingo";
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public string? Motivo { get; set; }
        public bool Activa { get; set; }
        public string? CreadoPor { get; set; }
        public DateTime FechaCreacion { get; set; }
        public string? DesactivadoPor { get; set; }
        public DateTime? FechaDesactivacion { get; set; }
        /// <summary>Solo activas: en cuántos de sus sábados/domingos manda.</summary>
        public int? DiasQueManda { get; set; }
        /// <summary>Solo activas: cuántos sábados/domingos tiene su periodo.</summary>
        public int? DiasDelPeriodo { get; set; }
        /// <summary>Las reglas que le ganan los demás días (más cortas o de grupo), con cuántos.</summary>
        public List<string> GanadaPor { get; set; } = new();
    }

    public class ReglasDomingoResponse
    {
        /// <summary>false: falta correr Scripts/Migration_ReglasDomingo.sql.</summary>
        public bool TablaExiste { get; set; } = true;
        public List<ReglaDomingoDto> Reglas { get; set; } = new();
    }

    public class CrearReglaDomingoRequest
    {
        /// <summary>Una o varias unidades organizativas: se crea una regla por cada una.</summary>
        public List<int> AreaIds { get; set; } = new();
        /// <summary>Todas las unidades organizativas (se ignora AreaIds y GrupoId).</summary>
        public bool TodaLaPlanta { get; set; }
        /// <summary>Opcional, solo con una unidad: la regla aplica a ese grupo.</summary>
        public int? GrupoId { get; set; }
        /// <summary>
        /// "SinDomingo" (paro sin asignaciones: descanso para todos) o "RolNormal"
        /// (excepción: se trabaja según el rol) o "ParoEmpresa" (paro con días por la
        /// empresa: los operadores no programan y la asignación pone ahí los días por la
        /// empresa de quien lo trabajaba según su rol).
        /// </summary>
        public string Tipo { get; set; } = "SinDomingo";
        /// <summary>Solo si no viene DiaAplicacion (pantallas anteriores): true = sábado y domingo.</summary>
        public bool IncluyeSabado { get; set; }
        /// <summary>"Domingo", "Sabado" o "Ambos". Si no viene, se toma de IncluyeSabado.</summary>
        public string? DiaAplicacion { get; set; }
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public string? Motivo { get; set; }
    }

    /// <summary>Qué pasó al guardar: nuevas, las que reemplazaron a una de las mismas fechas y las que ya estaban.</summary>
    public class ResultadoReglasDomingoDto
    {
        public int Creadas { get; set; }
        public int Reemplazadas { get; set; }
        public int YaExistian { get; set; }
        /// <summary>Unidades donde la regla nueva no manda en todos sus días porque otra le gana.</summary>
        public List<string> Avisos { get; set; } = new();
    }

    /// <summary>Día por la empresa en un sábado/domingo de paro (reporte por unidad organizativa).</summary>
    public class DiaEmpresaEnParoDto
    {
        public int VacacionId { get; set; }
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int AreaId { get; set; }
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public DateOnly Fecha { get; set; }
        /// <summary>El turno que le tocaba ese día por su rol ("1", "2", "3").</summary>
        public string Turno { get; set; } = string.Empty;
        /// <summary>"EnParo", "SeTrabaja" u "OtroParo".</summary>
        public string Situacion { get; set; } = string.Empty;
        public string Detalle { get; set; } = string.Empty;
    }

    /// <summary>Desactivar o reactivar de una vez las reglas que se guardaron juntas (p. ej. toda la planta).</summary>
    public class CambiarEstadoReglasDomingoRequest
    {
        public List<int> Ids { get; set; } = new();
        public bool Activa { get; set; }
    }

    /// <summary>Vacación activa que cae en un día que una regla dejó no laborable.</summary>
    public class VacacionEnNoLaborableDto
    {
        public int VacacionId { get; set; }
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public DateOnly Fecha { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        public string Motivo { get; set; } = string.Empty;
    }
}
