using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class AsignacionAutomaticaRequest
    {
        [Required]
        [Range(2024, 2100, ErrorMessage = "El año debe estar entre 2024 y 2100")]
        public int Anio { get; set; }

        /// <summary>
        /// Lista de IDs de grupos a procesar. Si está vacío, procesa todos los grupos
        /// </summary>
        public List<int>? GrupoIds { get; set; }

        /// <summary>
        /// Semanas a excluir del proceso (1-52). Por defecto excluye semanas de navidad
        /// </summary>
        public List<int>? SemanasExcluidas { get; set; }

        /// <summary>
        /// Si es true, solo simula la asignación sin guardar en base de datos
        /// </summary>
        public bool SoloSimulacion { get; set; } = false;
    }

    public class AsignacionAutomaticaResponse
    {
        public int AnioAsignacion { get; set; }
        public int TotalEmpleadosProcesados { get; set; }
        public int TotalEmpleadosAsignados { get; set; }
        public int TotalDiasAsignados { get; set; }
        public List<AsignacionEmpleadoResult> ResultadosPorEmpleado { get; set; } = new();
        public List<string> Advertencias { get; set; } = new();
        public DateTime FechaProcesamiento { get; set; } = DateTime.Now;
    }

    public class AsignacionEmpleadoResult
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Nomina { get; set; } = string.Empty;
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int DiasCorrespondientes { get; set; }
        public int DiasAsignados { get; set; }
        public int SemanaAsignada { get; set; }
        public List<DiaVacacionAsignado> DiasVacaciones { get; set; } = new();
        public bool AsignacionExitosa { get; set; }
        public string? MotivoFallo { get; set; }
    }

    public class DiaVacacionAsignado
    {
        public DateOnly Fecha { get; set; }
        public string TurnoOriginal { get; set; } = string.Empty;
        public string TipoVacacion { get; set; } = "Automatica";
        public decimal PorcentajeAusenciaCalculado { get; set; }
    }

    public class SemanaCalendario
    {
        public int NumeroSemana { get; set; }
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public List<DiaCalendario> Dias { get; set; } = new();
    }

    public class DiaCalendario
    {
        public DateOnly Fecha { get; set; }
        public string Turno { get; set; } = string.Empty;
        public bool EsDescanso { get; set; }
        public bool EsDiaInhabil { get; set; }
        public bool TieneVacacion { get; set; }
        public bool TieneIncidencia { get; set; }
    }

    public class VacacionesAsignadasRequest
    {
        public int? Anio { get; set; }
        public string? TipoVacacion { get; set; } // 'Automatica', 'Anual', 'Reprogramacion', 'FestivoTrabajado'
        public string? EstadoVacacion { get; set; } // 'Activa', 'Intercambiada', 'Cancelada'
    }

    public class VacacionesEmpleadoListResponse
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Nomina { get; set; } = string.Empty;
        public int? Anio { get; set; }
        public int TotalVacaciones { get; set; }
        public VacacionesResumen Resumen { get; set; } = new();
        public List<VacacionDetalle> Vacaciones { get; set; } = new();
    }

    public class VacacionesResumen
    {
        // División de días disponibles según cálculo por antigüedad
        public int DiasEmpresa { get; set; }
        public int DiasAsignadosAutomaticamente { get; set; }
        public int DiasProgramables { get; set; }
        public int TotalDisponibles { get; set; }

        // Días ya asignados por tipo
        public int AsignadasAutomaticamente { get; set; }
        public int Anuales { get; set; }
        public int Reprogramaciones { get; set; }
        public int FestivosTrabajados { get; set; }

        /// <summary>
        /// Días pendientes por asignar (diasAsignadosAutomaticamente + diasProgramables - días ya asignados)
        /// </summary>
        public int PorAsignar { get; set; }
    }

    public class VacacionDetalle
    {
        public int Id { get; set; }
        public DateOnly FechaVacacion { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        public string OrigenAsignacion { get; set; } = string.Empty;
        public string EstadoVacacion { get; set; } = string.Empty;
        public string PeriodoProgramacion { get; set; } = string.Empty;
        public DateTime FechaProgramacion { get; set; }
        public bool PuedeSerIntercambiada { get; set; }
        public string? Observaciones { get; set; }
        public int NumeroSemana { get; set; }
        public string DiaSemana { get; set; } = string.Empty;
    }

    public class ReversionAsignacionResponse
    {
        public int Anio { get; set; }
        public int TotalVacacionesEliminadas { get; set; }
        public int EmpleadosAfectados { get; set; }
        public List<int> GruposAfectados { get; set; } = new();
        public List<EmpleadoReversionDetalle> DetalleEmpleados { get; set; } = new();
        public DateTime FechaReversion { get; set; } = DateTime.Now;
    }

    public class EmpleadoReversionDetalle
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Nomina { get; set; } = string.Empty;
        public int DiasEliminados { get; set; }
    }

    public class VacacionesAsignadasFiltroRequest
    {
        public int? EmpleadoId { get; set; }
        public int? AreaId { get; set; }
        public int? GrupoId { get; set; }
        public int? Anio { get; set; }
        public string? TipoVacacion { get; set; } // 'Automatica', 'Anual', 'Reprogramacion', 'FestivoTrabajado'
        public string? EstadoVacacion { get; set; } // 'Activa', 'Intercambiada', 'Cancelada'
        public bool IncluirDetalleEmpleado { get; set; } = true;
        public bool IncluirResumenPorArea { get; set; } = false;
        public bool IncluirResumenPorGrupo { get; set; } = false;
    }

    public class VacacionesAsignadasMultipleResponse
    {
        public int TotalEmpleados { get; set; }
        public int? Anio { get; set; }
        public int? AreaId { get; set; }
        public string? NombreArea { get; set; }
        public int? GrupoId { get; set; }
        public string? NombreGrupo { get; set; }
        public VacacionesResumenGeneral ResumenGeneral { get; set; } = new();
        public List<VacacionesEmpleadoListResponse> EmpleadosDetalle { get; set; } = new();
        public List<ResumenVacacionesPorArea>? ResumenAreas { get; set; }
        public List<ResumenVacacionesPorGrupo>? ResumenGrupos { get; set; }
    }

    public class VacacionesResumenGeneral
    {
        public int TotalDiasDisponibles { get; set; }
        public int TotalDiasAsignados { get; set; }
        public int TotalDiasPendientes { get; set; }
        public Dictionary<string, int> AsignadasPorTipo { get; set; } = new();
        public Dictionary<string, int> AsignadasPorEstado { get; set; } = new();
    }

    public class ResumenVacacionesPorArea
    {
        public int AreaId { get; set; }
        public string NombreArea { get; set; } = string.Empty;
        public int TotalEmpleados { get; set; }
        public int TotalDiasAsignados { get; set; }
        public int TotalDiasPendientes { get; set; }
    }

    public class ResumenVacacionesPorGrupo
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int TotalEmpleados { get; set; }
        public int TotalDiasAsignados { get; set; }
        public int TotalDiasPendientes { get; set; }
    }

    public class ResumenAsignacionAutomaticaResponse
    {
        public int Anio { get; set; }
        public bool AsignacionRealizada { get; set; }
        public int TotalVacacionesAsignadas { get; set; }
        public int EmpleadosConAsignacion { get; set; }
        public List<ResumenAsignacionPorGrupo> ResumenPorGrupos { get; set; } = new();
        public List<ResumenPorSemana> DistribucionPorSemanas { get; set; } = new();
        public DateTime? FechaUltimaAsignacion { get; set; }
        public EstadisticasGenerales Estadisticas { get; set; } = new();
    }

    public class ResumenAsignacionPorGrupo
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int EmpleadosAsignados { get; set; }
        public int TotalDiasAsignados { get; set; }
        public decimal PromedioDisPorEmpleado { get; set; }
    }

    public class ResumenPorSemana
    {
        public int NumeroSemana { get; set; }
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public int EmpleadosAsignados { get; set; }
        public int TotalDiasAsignados { get; set; }
    }

    public class EstadisticasGenerales
    {
        public int TotalEmpleadosSindicalizados { get; set; }
        public int EmpleadosConAsignacion { get; set; }
        public int EmpleadosSinAsignacion { get; set; }
        public decimal PorcentajeCobertura { get; set; }
        public int PromedioDisPorEmpleado { get; set; }
        public int TotalDiasDisponiblesNoAsignados { get; set; }
    }

    public class EmpleadoSinAsignacionDto
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Nomina { get; set; } = string.Empty;
        public string? Maquina { get; set; }
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int AreaId { get; set; }
        public string NombreArea { get; set; } = string.Empty;
        public int DiasCorrespondientes { get; set; }
        public int DiasAsignadosAutomaticamente { get; set; }
        public int DiasProgramablesAnual { get; set; }
        public int DiasYaAsignados { get; set; }
        public string? MotivoNoAsignacion { get; set; }
        public bool TieneTurnosDisponibles { get; set; }
        public DateTime? FechaIngreso { get; set; }
        public int AntiguedadAnios { get; set; }
    }

    public class EmpleadosSinAsignacionResponse
    {
        public int Anio { get; set; }
        public int TotalEmpleadosSinAsignacion { get; set; }
        public List<EmpleadoSinAsignacionDto> Empleados { get; set; } = new();
        public ResumenPorMotivo ResumenMotivos { get; set; } = new();
        public DateTime FechaReporte { get; set; } = DateTime.Now;
    }

    public class ResumenPorMotivo
    {
        public int SinTurnosDisponibles { get; set; }
        public int DiasInsuficientes { get; set; }
        public int ErrorProcesamiento { get; set; }
        public int OtrosMotivos { get; set; }
    }
}
