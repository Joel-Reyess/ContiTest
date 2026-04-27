namespace tiempo_libre.Models.Enums
{
    public enum TiposDeNotificacionEnum
    {
        RegistroVacaciones = 1, // Registro de vacaciones de un empleado de su area/grupo
        SolicitudSuplente = 2, // Solicitud de suplente
        CambioDeManning = 3, // Cambios de manning
        SolicitudReprogramacion = 4, // Solicitud de reprogramación
        AprobacionReprogramacion = 5, // Aprobación de reprogramación
        RechazoReprogramacion = 6, // Rechazo de reprogramación
        SolicitudFestivoTrabajado = 7, // Solicitud de festivo trabajado
        SolicitudIntercambioDiaFestivo = 8, // Solicitud de intercambio de día festivo (legacy)
        SistemaBloques = 9, // Sistema de bloques de reservación
        SolicitudPermiso,      // Para cuando se crea una solicitud
        RespuestaSolicitud,
        SolicitudEdicionDiaEmpresa = 12, // Solicitud de edición de días asignados por empresa
        RespuestaEdicionDiaEmpresa = 13  // Respuesta del jefe a solicitud de edición
    }

    public enum EstatusNotificacionEnum
    {
        NoLeida = 0, // Notificación no leída
        Leida = 1, // Notificación leída
        Archivada = 2 // Notificación archivada
    }
}
