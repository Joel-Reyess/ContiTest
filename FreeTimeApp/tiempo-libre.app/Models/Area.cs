using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace tiempo_libre.Models;

public partial class Area
{
    public int AreaId { get; set; }
    public string UnidadOrganizativaSap { get; set; } = null!;
    public string NombreGeneral { get; set; } = null!;
    public string? EncargadoRegistro { get; set; }

    [Column(TypeName = "decimal(5,2)")]
    public decimal Manning { get; set; } = 0;
    public int? JefeId { get; set; }
    public virtual User? Jefe { get; set; } = null!;
    public int? JefeSuplenteId { get; set; }
    public virtual User? JefeSuplente { get; set; } = null!;

    [JsonIgnore]
    public virtual ICollection<Grupo> Grupos { get; set; }
    [JsonIgnore]
    public virtual ICollection<ManningPorMes> ManningPorMes { get; set; }
    [JsonIgnore]
    public virtual ICollection<ManningPorDia> ManningPorDia { get; set; }
    [JsonIgnore]
    public virtual ICollection<AreaIngeniero> AreaIngenieros { get; set; }
    [JsonIgnore]
    public virtual ICollection<User> Ingenieros { get; set; }

    /// <summary>
    /// Todos los jefes de área (incluye los que hoy viven en JefeId/JefeSuplenteId
    /// más los agregados por multi-jefes). Cualquiera de ellos puede aprobar
    /// solicitudes del área.
    /// </summary>
    [JsonIgnore]
    public virtual ICollection<AreaJefe> Jefes { get; set; }

    public Area()
    {
        Grupos = new HashSet<Grupo>();
        ManningPorMes = new HashSet<ManningPorMes>();
        ManningPorDia = new HashSet<ManningPorDia>();
        AreaIngenieros = new HashSet<AreaIngeniero>();
        Ingenieros = new HashSet<User>();
        Jefes = new HashSet<AreaJefe>();
    }
}