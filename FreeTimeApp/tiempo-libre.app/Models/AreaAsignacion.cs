using System;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Asignación many-to-many entre Area y User para roles "extra" que no
    /// tienen su propia tabla (Gerente BT y RH). Se distingue por RolId
    /// (7 = Gerente BT, 8 = RH). Un usuario puede estar asignado a N áreas
    /// bajo el mismo rol o bajo distintos roles.
    /// </summary>
    public class AreaAsignacion
    {
        public int AreaId { get; set; }

        [ForeignKey(nameof(AreaId))]
        [JsonIgnore]
        public virtual Area? Area { get; set; }

        public int UserId { get; set; }

        [ForeignKey(nameof(UserId))]
        [JsonIgnore]
        public virtual User? User { get; set; }

        public int RolId { get; set; }

        [ForeignKey(nameof(RolId))]
        [JsonIgnore]
        public virtual Rol? Rol { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
