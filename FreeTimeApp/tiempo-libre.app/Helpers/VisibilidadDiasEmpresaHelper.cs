using System.Security.Claims;

namespace tiempo_libre.Helpers
{
    /// <summary>
    /// Quién puede ver el historial COMPLETO de movimientos de días de empresa
    /// (edición desde Vacaciones + reprogramación del superusuario).
    ///
    /// Los miembros del comité sindical operan la app como delegados pero en la
    /// BD tienen rol "Empleado Sindicalizado": el frontend les da la experiencia
    /// de delegado por número de nómina o por área "Sindicato", no por rol. Un
    /// [Authorize(Roles = "...Delegado Sindical...")] los deja fuera con 403 y la
    /// pantalla se queda vacía sin decir por qué.
    ///
    /// Por eso el endpoint autoriza también al sindicalizado y el alcance se
    /// decide después: quien no tenga mando ve únicamente lo suyo.
    /// </summary>
    public static class VisibilidadDiasEmpresaHelper
    {
        /// <summary>Nombre del área que agrupa al comité sindical.</summary>
        public const string AreaSindicato = "Sindicato";

        /// <summary>
        /// True si el rol por sí solo ya da visibilidad completa. El comité
        /// sindical no entra aquí (se reconoce por área, no por rol) — de eso se
        /// encarga el servicio, que sí tiene acceso a la BD.
        /// </summary>
        public static bool TieneRolDeMando(ClaimsPrincipal usuario) =>
            usuario.IsInRole("SuperUsuario") || usuario.IsInRole("Super Usuario") ||
            usuario.IsInRole("DelegadoSindical") || usuario.IsInRole("Delegado Sindical") ||
            usuario.IsInRole("Jefe De Area") || usuario.IsInRole("JefeArea") ||
            usuario.IsInRole("Gerente BT") || usuario.IsInRole("GerenteBT") ||
            usuario.IsInRole("RH");
    }
}
