using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Cómo quedó repartida la programación anual de un año: los días que asignó
    /// la empresa, día por día y mes por mes, con el porcentaje de ausencia que
    /// producen. Sirve para ver de un vistazo si la asignación quedó pareja o si
    /// saturó un mes, y si respetó las áreas o repartió plano.
    /// </summary>
    public class DashboardProgramacionAnualResponse
    {
        public int Anio { get; set; }
        public decimal PorcentajeMaximoGlobal { get; set; }

        /// <summary>Empleados activos de los grupos incluidos en el filtro.</summary>
        public int PlantillaTotal { get; set; }

        /// <summary>Total de días-persona que asignó la empresa en el año.</summary>
        public int DiasEmpresaAsignados { get; set; }

        /// <summary>
        /// Días-persona que capturó el propio operador (o el jefe a su nombre):
        /// todo lo que NO es "Automatica". Es la otra mitad de la foto: la
        /// empresa arranca el año con un piso asignado y encima se va apilando
        /// lo que cada quien pide, así que el porcentaje del día sube conforme
        /// avanza la captura.
        /// </summary>
        public int DiasCapturadosPorOperador { get; set; }

        /// <summary>Cuántos empleados distintos recibieron al menos un día.</summary>
        public int EmpleadosConDiasEmpresa { get; set; }

        /// <summary>Días del año en los que algún grupo quedó por encima de su porcentaje.</summary>
        public int DiasConRebase { get; set; }

        public List<MesProgramacionAnualDto> Meses { get; set; } = new();
        public List<DiaProgramacionAnualDto> Dias { get; set; } = new();
        public List<GrupoProgramacionAnualDto> Grupos { get; set; } = new();
    }

    public class MesProgramacionAnualDto
    {
        public int Mes { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int DiasEmpresaAsignados { get; set; }

        /// <summary>Días del mes que capturó el operador (no "Automatica").</summary>
        public int DiasCapturadosPorOperador { get; set; }

        /// <summary>
        /// Los dos porcentajes que pidió el cliente por separado: cuánto de la
        /// plantilla se va en días de empresa y cuánto en días capturados. Suman
        /// (aprox.) el porcentaje total de ausencia por vacaciones del mes.
        /// </summary>
        public decimal PorcentajeEmpresa { get; set; }
        public decimal PorcentajeCapturado { get; set; }

        public decimal PorcentajePromedio { get; set; }
        public decimal PorcentajeMaximo { get; set; }
        public int DiasConRebase { get; set; }

        /// <summary>
        /// Reparto perfectamente parejo del año entre los doce meses. Es la vara
        /// contra la que se compara: si un mes trae el triple de lo esperado, la
        /// asignación se apiló ahí.
        /// </summary>
        public decimal DiasEsperadosSiFueraParejo { get; set; }
    }

    public class DiaProgramacionAnualDto
    {
        public DateOnly Fecha { get; set; }

        /// <summary>Días que asignó la empresa ese día (TipoVacacion = Automatica).</summary>
        public int DiasEmpresa { get; set; }

        /// <summary>Días que capturó el operador ese día (todo lo que no es Automatica).</summary>
        public int DiasCapturados { get; set; }

        /// <summary>Ausentes por cualquier motivo: vacaciones, permisos y festivos.</summary>
        public int Ausentes { get; set; }

        public int Plantilla { get; set; }
        public decimal Porcentaje { get; set; }

        /// <summary>
        /// Cuánto se pasa del permitido, en puntos porcentuales. 0 si no se pasa.
        /// </summary>
        public decimal ExcedenteSobrePermitido { get; set; }

        /// <summary>Grupos que ese día quedaron por encima de su porcentaje.</summary>
        public List<string> GruposEnRebase { get; set; } = new();
    }

    public class GrupoProgramacionAnualDto
    {
        public int GrupoId { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public int Plantilla { get; set; }
        public int DiasEmpresaAsignados { get; set; }
        public int DiasCapturadosPorOperador { get; set; }

        /// <summary>Días por empleado activo: la cifra que delata un reparto plano.</summary>
        public decimal DiasPorEmpleado { get; set; }

        public int DiasConRebase { get; set; }
    }
}
