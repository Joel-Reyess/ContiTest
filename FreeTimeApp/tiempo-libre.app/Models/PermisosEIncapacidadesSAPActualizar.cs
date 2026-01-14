using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Modelo para la tabla PermisosEIncapacidadesSAP_Actualizar
    /// Tabla de staging que recibe datos de SAP para ser sincronizados
    /// NO TIENE CLAVE PRIMARIA en la base de datos
    /// </summary>
    [Table("PermisosEIncapacidadesSAP_Actualizar")]
    public class PermisosEIncapacidadesSAPActualizar
    {
        [Column("Nomina")]
        public string? Nomina { get; set; }

        [Column("Nombre")]
        public string? Nombre { get; set; }

        [Column("Posicion")]
        public string? Posicion { get; set; }

        [Column("Desde")]
        public string? Desde { get; set; }

        [Column("Hasta")]
        public string? Hasta { get; set; }

        [Column("ClAbPre")]
        public string? ClAbPre { get; set; }

        [Column("ClaseAbsentismo")]
        public string? ClaseAbsentismo { get; set; }

        [Column("Dias")]
        public string? Dias { get; set; }

        [Column("DiaNat")]
        public string? DiaNat { get; set; }
    }
}