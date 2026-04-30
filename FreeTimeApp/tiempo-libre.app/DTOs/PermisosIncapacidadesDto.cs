using System;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// DTO para crear un permiso o incapacidad manualmente
    /// </summary>
    public class CrearPermisoIncapacidadRequest
    {
        [Required(ErrorMessage = "La n�mina del empleado es requerida")]
        public int Nomina { get; set; }

        [Required(ErrorMessage = "La clave de ausencia es requerida")]
        public string ClAbPre { get; set; } = string.Empty; // C�digo SAP (2380, 1331, etc.)

        [Required(ErrorMessage = "La fecha de inicio es requerida")]
        public DateOnly FechaInicio { get; set; }

        [Required(ErrorMessage = "La fecha fin es requerida")]
        public DateOnly FechaFin { get; set; }

        [MaxLength(500)]
        public string? Observaciones { get; set; }

        /// <summary>
        /// N�mero de d�as del permiso/incapacidad
        /// </summary>
        public int? Dias { get; set; }
    }

    /// <summary>
    /// DTO para extender la fecha "Hasta" de un permiso/incapacidad existente.
    /// </summary>
    public class ExtenderPermisoIncapacidadRequest
    {
        [Required(ErrorMessage = "El Id del permiso/incapacidad es requerido")]
        public int PermisoId { get; set; }

        [Required(ErrorMessage = "La nueva fecha Hasta es requerida")]
        public DateOnly NuevaFechaHasta { get; set; }

        [MaxLength(500)]
        public string? Observaciones { get; set; }
    }

    /// <summary>
    /// DTO para respuesta de creaci�n de permiso/incapacidad
    /// </summary>
    public class CrearPermisoIncapacidadResponse
    {
        public bool Exitoso { get; set; }
        public string Mensaje { get; set; } = string.Empty;
        public int Nomina { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string TipoPermiso { get; set; } = string.Empty; // P, V, G, E, A, M, R, S, O, H
        public string DescripcionPermiso { get; set; } = string.Empty;
        public DateOnly FechaInicio { get; set; }
        public DateOnly FechaFin { get; set; }
        public int DiasAfectados { get; set; }
        public List<DateOnly> FechasRegistradas { get; set; } = new();
    }

    /// <summary>
    /// DTO para consultar permisos e incapacidades de un empleado
    /// </summary>
    public class ConsultarPermisosRequest
    {
        public int? Nomina { get; set; }
        public int? EmpleadoId { get; set; }
        public DateOnly? FechaInicio { get; set; }
        public DateOnly? FechaFin { get; set; }
        public int? ClAbPre { get; set; }
    }

    /// <summary>
    /// DTO para listado de permisos e incapacidades
    /// </summary>
    public class PermisoIncapacidadDto
    {
        public int Id { get; set; }
        public int Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Posicion { get; set; } = string.Empty;
        public DateOnly Desde { get; set; }
        public DateOnly Hasta { get; set; }
        public int ClAbPre { get; set; }
        public string ClaveVisualizacion { get; set; } = string.Empty; // P, V, G, E, A, M, R, S, O, H
        public string ClaseAbsentismo { get; set; } = string.Empty; // Descripci�n legible
        public double Dias { get; set; }
        public double DiaNat { get; set; }
        public string? Observaciones { get; set; }
        public bool EsRegistroManual { get; set; }
        public DateTime FechaRegistro { get; set; }
    }

    /// <summary>
    /// DTO para response de consulta de permisos
    /// </summary>
    public class ConsultarPermisosResponse
    {
        public int TotalRegistros { get; set; }
        public List<PermisoIncapacidadDto> Permisos { get; set; } = new();
    }

    /// <summary>
    /// DTO para eliminar un permiso/incapacidad
    /// </summary>
    public class EliminarPermisoRequest
    {
        [Required]
        public int Nomina { get; set; }

        [Required]
        public DateOnly Desde { get; set; }

        [Required]
        public DateOnly Hasta { get; set; }

        [Required]
        public int ClAbPre { get; set; }
    }

    /// <summary>
    /// Cat�logo de tipos de permisos e incapacidades
    /// </summary>
    public class TipoPermisoDto
    {
        public string ClAbPre { get; set; } = string.Empty;
        public string ClaveVisualizacion { get; set; } = string.Empty;
        public string Concepto { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public bool RequiereAprobacion { get; set; }
        public bool AplicaDescuento { get; set; }
    }

    /// <summary>
    /// DTO para obtener el cat�logo de tipos de permisos
    /// </summary>
    public class CatalogoPermisosResponse
    {
        public List<TipoPermisoDto> TiposPermisos { get; set; } = new()
        {
            new TipoPermisoDto
            {
                ClAbPre = "2380",
                ClaveVisualizacion = "P",
                Concepto = "Permiso con Goce",
                Descripcion = "Permiso con goce de sueldo",
                RequiereAprobacion = true,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "1331",
                ClaveVisualizacion = "P",
                Concepto = "Permiso Defunci�n",
                Descripcion = "Permiso por defunci�n",
                RequiereAprobacion = true,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "1100",
                ClaveVisualizacion = "V",
                Concepto = "Vacaci�n",
                Descripcion = "Vacaciones",
                RequiereAprobacion = false,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "2310",
                ClaveVisualizacion = "G",
                Concepto = "Permiso sin Goce",
                Descripcion = "Permiso sin goce de sueldo",
                RequiereAprobacion = true,
                AplicaDescuento = true
            },
            new TipoPermisoDto
            {
                ClAbPre = "2380",
                ClaveVisualizacion = "E",
                Concepto = "Inc. Enfermedad General",
                Descripcion = "Incapacidad por enfermedad general",
                RequiereAprobacion = false,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "2381",
                ClaveVisualizacion = "A",
                Concepto = "Inc. Accidente de Trabajo",
                Descripcion = "Incapacidad por accidente de trabajo",
                RequiereAprobacion = false,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "2396",
                ClaveVisualizacion = "M",
                Concepto = "Inc. por Maternidad",
                Descripcion = "Incapacidad por maternidad",
                RequiereAprobacion = false,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "2394",
                ClaveVisualizacion = "R",
                Concepto = "Inc. Pble. Riesgo Trabajo",
                Descripcion = "Incapacidad probable riesgo de trabajo",
                RequiereAprobacion = false,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "2123",
                ClaveVisualizacion = "S",
                Concepto = "Suspensi�n",
                Descripcion = "Suspensi�n",
                RequiereAprobacion = true,
                AplicaDescuento = true
            },
            new TipoPermisoDto
            {
                ClAbPre = "1315",
                ClaveVisualizacion = "O",
                Concepto = "PCG por Paternidad",
                Descripcion = "Permiso con goce por paternidad",
                RequiereAprobacion = false,
                AplicaDescuento = false
            },
            new TipoPermisoDto
            {
                ClAbPre = "2381",
                ClaveVisualizacion = "H",
                Concepto = "Perm.sin goce de sueldo",
                Descripcion = "Permiso sin goce de sueldo",
                RequiereAprobacion = true,
                AplicaDescuento = true
            }
        };
    }
}