using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class GeneracionBloquesRequest
    {
        [Required]
        public DateTime FechaInicioGeneracion { get; set; }

        [Required]
        [Range(2024, 2030)]
        public int AnioObjetivo { get; set; }

        /// <summary>
        /// Lista de IDs de grupos específicos a procesar. Si está vacío, procesa todos los grupos
        /// </summary>
        public List<int>? GrupoIds { get; set; }

        /// <summary>
        /// Si es true, solo simula la generación sin guardar en base de datos
        /// </summary>
        public bool SoloSimulacion { get; set; } = true;
    }

    public class GeneracionBloquesResponse
    {
        public int AnioObjetivo { get; set; }
        public DateTime FechaInicioGeneracion { get; set; }
        public int TotalGruposProcesados { get; set; }
        public int TotalBloqueGenerados { get; set; }
        public int TotalEmpleadosAsignados { get; set; }
        public List<ResumenPorGrupo> ResumenPorGrupo { get; set; } = new();
        public List<string> Advertencias { get; set; } = new();
        public List<string> Errores { get; set; } = new();
        public DateTime FechaProcesamiento { get; set; } = DateTime.UtcNow;
        public bool GeneracionExitosa { get; set; }
    }

    public class ResumenPorGrupo
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public string NombreArea { get; set; } = string.Empty;
        public int PersonasPorTurno { get; set; }
        public int DuracionHoras { get; set; }
        public int TotalEmpleados { get; set; }
        public int TotalBloques { get; set; }
        public int BloquesRegulares { get; set; }
        public int BloquesCola { get; set; }
        public DateTime FechaInicioBloque { get; set; }
        public DateTime FechaFinBloque { get; set; }
        public List<BloqueGeneradoDto> Bloques { get; set; } = new();
        public bool GeneracionExitosa { get; set; }
        public string? MotivoError { get; set; }
    }

    public class BloqueGeneradoDto
    {
        public int Id { get; set; }
        public int NumeroBloque { get; set; }
        public DateTime FechaHoraInicio { get; set; }
        public DateTime FechaHoraFin { get; set; }
        public int PersonasPorBloque { get; set; }
        public bool EsBloqueCola { get; set; }
        public List<EmpleadoAsignadoBloqueDto> EmpleadosAsignados { get; set; } = new();
    }

    public class EmpleadoAsignadoBloqueDto
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Nomina { get; set; } = string.Empty;
        public int PosicionEnBloque { get; set; }
        public DateTime? FechaIngreso { get; set; }
        public int? AntiguedadAnios { get; set; }
        public string Estado { get; set; } = string.Empty; // 'Asignado', 'Reservado', 'Completado', 'Transferido', 'NoRespondio'
    }

    public class AprobarBloquesRequest
    {
        [Required]
        public int AnioObjetivo { get; set; }

        [Required]
        public List<int> GrupoIds { get; set; } = new();

        [MaxLength(500)]
        public string? Observaciones { get; set; }
    }

    public class SaltarTurnoRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int BloqueId { get; set; }

        [MaxLength(200)]
        public string? Motivo { get; set; }
    }

    public class CambiarBloqueRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int BloqueOrigenId { get; set; }

        [Required]
        public int BloqueDestinoId { get; set; }

        [Required]
        [MaxLength(200)]
        public string Motivo { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? ObservacionesAdicionales { get; set; }
    }

    public class CambiarBloqueResponse
    {
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NominaEmpleado { get; set; } = string.Empty;
        public BloqueDto BloqueOrigen { get; set; } = new();
        public BloqueDto BloqueDestino { get; set; } = new();
        public bool CambioExitoso { get; set; }
        public string? MotivoFallo { get; set; }
        public DateTime FechaCambio { get; set; } = DateTime.UtcNow;
    }

    public class BloqueDto
    {
        public int Id { get; set; }
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int NumeroBloque { get; set; }
        public DateTime FechaHoraInicio { get; set; }
        public DateTime FechaHoraFin { get; set; }
        public int PersonasPorBloque { get; set; }
        public bool EsBloqueCola { get; set; }
        public string Estado { get; set; } = string.Empty;
        public int EmpleadosAsignados { get; set; }
        public int EspaciosDisponibles { get; set; }
    }

    public class ConsultaBloquesRequest
    {
        public int? AnioObjetivo { get; set; }
        public int? GrupoId { get; set; }
        public int? AreaId { get; set; }
        public string? Estado { get; set; } // 'Activo', 'Completado', 'Cancelado'
        public bool? SoloBloquesConEspacio { get; set; }
    }

    public class ConsultaBloquesResponse
    {
        public int TotalBloques { get; set; }
        public List<BloqueDetalladoDto> Bloques { get; set; } = new();
    }

    public class BloqueDetalladoDto : BloqueDto
    {
        public string NombreArea { get; set; } = string.Empty;
        public int DuracionHoras { get; set; }
        public DateTime? FechaAprobacion { get; set; }
        public string? NombreAprobador { get; set; }
        public new List<EmpleadoAsignadoBloqueDto> EmpleadosAsignados { get; set; } = new();
    }

    public class ConsultaBloquesPorFechaRequest
    {
        [Required]
        public DateTime Fecha { get; set; }

        public int? AreaId { get; set; }

        public int? GrupoId { get; set; }

        [Range(2024, 2030)]
        public int? AnioObjetivo { get; set; }
    }

    public class ConsultaBloquesPorFechaResponse
    {
        public DateTime FechaConsulta { get; set; }
        public int? AreaId { get; set; }
        public string? NombreArea { get; set; }
        public int? GrupoId { get; set; }
        public string? NombreGrupo { get; set; }
        public List<BloquePorGrupoDto> BloquesPorGrupo { get; set; } = new();
    }

    public class BloquePorGrupoDto
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public string NombreArea { get; set; } = string.Empty;
        public BloqueDetalladoDto? BloqueActual { get; set; }
        public BloqueDetalladoDto? BloqueSiguiente { get; set; }
        public string EstadoConsulta { get; set; } = string.Empty; // "EnCurso", "EntreBloque", "SinBloques"
        public string? Observacion { get; set; }
    }

    public class EliminacionBloquesResponse
    {
        public int AnioObjetivo { get; set; }
        public int TotalBloquesEliminados { get; set; }
        public int GruposAfectados { get; set; }
        public List<int> GrupoIds { get; set; } = new();
        public List<DetalleGrupoEliminado> DetalleGrupos { get; set; } = new();
        public DateTime FechaEliminacion { get; set; } = DateTime.Now;
        public string UsuarioEjecuto { get; set; } = string.Empty;
    }

    public class DetalleGrupoEliminado
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int BloquesEliminados { get; set; }
        public bool TeniaBloquesAprobados { get; set; }
    }

    // DTOs para reporte de empleados que no respondieron
    public class EmpleadosNoRespondioResponse
    {
        public int Anio { get; set; }
        public int TotalEmpleadosNoRespondio { get; set; }
        public int EmpleadosEnBloquesRegulares { get; set; }
        public int EmpleadosEnBloqueCola { get; set; }
        public List<EmpleadoNoRespondioDto> Empleados { get; set; } = new();
        public DateTime FechaReporte { get; set; }
    }

    public class EmpleadoNoRespondioDto
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Nomina { get; set; } = string.Empty;
        public string? Maquina { get; set; }
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int AreaId { get; set; }
        public string NombreArea { get; set; } = string.Empty;
        public int BloqueId { get; set; }
        public int NumeroBloque { get; set; }
        public bool EsBloqueCola { get; set; }
        public DateTime FechaLimiteBloque { get; set; }
        public DateTime FechaAsignacion { get; set; }
        public string? Observaciones { get; set; }
        public bool RequiereAccionUrgente { get; set; }
    }
}