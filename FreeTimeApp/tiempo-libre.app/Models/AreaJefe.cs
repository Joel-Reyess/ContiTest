using System;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Relación many-to-many entre Area y User para modelar N jefes de área
    /// por área. Cualquier usuario en esta tabla para el área X puede ver y
    /// aprobar todas las solicitudes del área. No hay distinción titular/suplente
    /// aquí (esa vive en Area.JefeId/JefeSuplenteId por compat, y se replica en
    /// AreaJefes al asignar).
    /// </summary>
    public class AreaJefe
    {
        public int AreaId { get; set; }

        [ForeignKey(nameof(AreaId))]
        [JsonIgnore]
        public virtual Area? Area { get; set; }

        public int UserId { get; set; }

        [ForeignKey(nameof(UserId))]
        [JsonIgnore]
        public virtual User? User { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
