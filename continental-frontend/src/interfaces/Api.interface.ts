/**
 * API Interfaces
 * Defines the structure for API requests and responses
 */

// Removed unused User import

export interface ApiResponse<T = unknown> {
    data?: T;
    message?: string;
    success: boolean;
    errorMsg?: string;
}

export interface ApiError {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
}

export interface LoginRequest {
    username?: string;
    nomina?: string;
    password: string;
}
export interface RegisterRequest {
    username: string;
    password: string;
    fullName: string;
    areaId: number | null;
    roles: string[];
    //isValidated?: boolean;
    //areas: number[];
}

// Interfaces para recuperación de contraseña
export interface SolicitarCodigoRequest {
    email: string;
}

export interface SolicitarCodigoResponse {
    success: boolean;
    message: string;
    minutosExpiracion: number | null;
}

export interface ValidarCodigoRequest {
    email: string;
    codigoVerificacion: string;
}

export interface ValidarCodigoResponse {
    valido: boolean;
    message: string;
    intentosRestantes: number | null;
}

export interface CambiarPasswordRequest {
    email: string;
    codigoVerificacion: string;
    nuevaPassword: string;
    confirmarPassword: string;
}

export interface CambiarPasswordResponse {
    success: boolean;
    message: string;
}

export interface LoginResponse {
    token: string;
    expiration: string;
    user?: Record<string, unknown>;
    ultimoInicioSesion?: string | null;
}

export interface RefreshTokenRequest {
    refreshToken: string;
}

export interface RefreshTokenResponse {
    token: string;
    expiration: string;
    refreshToken?: string;
    expiresIn?: number;
}

// Interfaces for Asignación Automática API
export interface DiaVacacion {
    fecha: string;
    turnoOriginal: string;
    tipoVacacion: string;
    porcentajeAusenciaCalculado: number;
}

export interface ResultadoPorEmpleado {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    grupoId: number;
    nombreGrupo: string;
    diasCorrespondientes: number;
    diasAsignados: number;
    semanaAsignada: number;
    diasVacaciones: DiaVacacion[];
    asignacionExitosa: boolean;
    motivoFallo?: string;
}

export interface AsignacionAutomaticaRequest {
    anio: number;
    semanasExcluidas?: number[];
}

// Interfaces para reversión completa de programación anual
export interface ResumenReversionResponse {
    anio: number;
    totalBloques: number;
    bloquesAprobados: number;
    totalAsignacionesBloque: number;
    totalVacaciones: number;
    vacacionesAutomaticas: number;
    vacacionesManuales: number;
    vacacionesTomadas: number;
    solicitudesReprogramacion: number;
    solicitudesFestivos: number;
    cambiosBloque: number;
    empleadosAfectados: number;
    gruposAfectados: number;
    advertencias: string[];
}
export interface EliminarVacacionesPorFechaRequest {
    empleadoId: number;
    fechas: string[];
}

export interface RevertirCompletoResponse {
    anio: number;
    operacionExitosa: boolean;
    mensaje: string;
    fechaEjecucion: string;
    usuarioEjecuto: string;
    bloquesEliminados: number;
    asignacionesBloqueEliminadas: number;
    vacacionesEliminadas: number;
    vacacionesAutomaticasEliminadas: number;
    vacacionesManualesEliminadas: number;
    solicitudesReprogramacionEliminadas: number;
    solicitudesFestivosEliminadas: number;
    cambiosBloqueEliminados: number;
    gruposAfectados: number;
}

export interface AsignacionAutomaticaResponse {
    anioAsignacion: number;
    totalEmpleadosProcesados: number;
    totalEmpleadosAsignados: number;
    totalDiasAsignados: number;
    resultadosPorEmpleado: ResultadoPorEmpleado[];
    advertencias: string[];

    fechaProcesamiento: string;
}

export interface DetalleEmpleadoReversion {
    empleadoId: number;
    nomina: string;
    diasEliminados: number;
}

export interface RevertirAsignacionResponse {
    empleadosAfectados: number;
    totalVacacionesEliminadas: number;
    fechaReversion: string;
}

// Interfaces para generación de bloques de reservación
export interface GenerarBloquesRequest {
    fechaInicioGeneracion: string;
    anioObjetivo: number;
    grupoIds: number[];
    soloSimulacion: boolean;
}

export interface EmpleadoAsignadoBloque {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    posicionEnBloque: number;
    fechaIngreso: string;
    antiguedadAnios: number;
}

export interface BloqueDetalle {
    id: number;
    numeroBloque: number;
    fechaHoraInicio: string;
    fechaHoraFin: string;
    personasPorBloque: number;
    esBloqueCola: boolean;
    empleadosAsignados: EmpleadoAsignadoBloque[];
}

export interface ResumenPorGrupoBloque {
    grupoId: number;
    nombreGrupo: string;
    nombreArea: string;
    personasPorTurno: number;
    duracionHoras: number;
    totalEmpleados: number;
    totalBloques: number;
    bloquesRegulares: number;
    bloquesCola: number;
    fechaInicioBloque: string;
    fechaFinBloque: string;
    bloques: BloqueDetalle[];
    generacionExitosa: boolean;
}

export interface GenerarBloquesResponse {
    anioObjetivo: number;
    fechaInicioGeneracion: string;
    totalGruposProcesados: number;
    totalBloqueGenerados: number;
    totalEmpleadosAsignados: number;
    resumenPorGrupo: ResumenPorGrupoBloque[];
    advertencias: string[];
    errores: string[];
    fechaProcesamiento: string;
    generacionExitosa: boolean;
}

// Interfaces para estadísticas de bloques
export interface EstadisticasEmpleados {
    totalEmpleadosAsignados: number;
    empleadosConEstadoAsignado: number;
    empleadosConEstadoReservado: number;
    empleadosConEstadoCompletado: number;
    empleadosConEstadoTransferido: number;
    empleadosConEstadoNoRespondio: number;
    empleadosEnBloquesRegulares: number;
    empleadosEnBloqueCola: number;
    porcentajeCompletado: number;
    porcentajeReservado: number;
    porcentajeNoRespondio: number;
}

export interface EstadisticasBloquesResponse {
    anioConsultado: number;
    totalBloques: number;
    bloquesEnBorrador: number;
    bloquesAprobados: number;
    bloquesCompletados: number;
    fechaPrimerBloque: string;
    fechaUltimoBloque: string;
    estadisticasEmpleados: EstadisticasEmpleados;
    fechaConsulta: string;
}

// Interfaces para eliminación de bloques
export interface DetalleGrupoEliminado {
    grupoId: number;
    nombreGrupo: string;
    bloquesEliminados: number;
    teniaBloquesAprobados: boolean;
}

export interface EliminarBloquesResponse {
    anioObjetivo: number;
    totalBloquesEliminados: number;
    gruposAfectados: number;
    grupoIds: number[];
    detalleGrupos: DetalleGrupoEliminado[];
    fechaEliminacion: string;
    usuarioEjecuto: string;
}

export enum EmpleadoEstado {
    ASIGNADO = 'Asignado',
    RESERVADO = 'Reservado',
    COMPLETADO = 'Completado',
    TRANSFERIDO = 'Transferido',
    NO_RESPONDIO = 'NoRespondio',
    MANUAL = 'MANUAL'
}

// Interfaces para obtener bloques de reservación
export interface EmpleadoBloque {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    posicionEnBloque: number;
    fechaIngreso: string;
    antiguedadAnios: number;
    estado: EmpleadoEstado;
}



export interface BloqueReservacion {
    nombreArea: string;
    duracionHoras: number;
    empleadosAsignados: EmpleadoBloque[];
    id: number;
    grupoId: number;
    nombreGrupo: string;
    numeroBloque: number;
    fechaHoraInicio: string;
    fechaHoraFin: string;
    personasPorBloque: number;
    esBloqueCola: boolean;
    estado: string;
    espaciosDisponibles: number;
}

export interface BloquesReservacionResponse {
    totalBloques: number;
    bloques: BloqueReservacion[];
}

// Interfaces para obtener bloques por fecha
export interface BloquesPorFechaResponse {
    fechaConsulta: string;
    grupoId: number;
    nombreGrupo: string;
    bloquesPorGrupo: BloquePorGrupo[];
}

export interface BloquePorGrupo {
    grupoId: number;
    nombreGrupo: string;
    nombreArea: string;
    bloqueActual: BloqueReservacion | null;
    bloqueSiguiente: BloqueReservacion | null;
    estadoConsulta: 'EnCurso' | 'Proximo' | 'NoEncontrado';
}

export interface ResumenPorGrupo {
    grupoId: number;
    nombreGrupo: string;
    empleadosAsignados: number;
    totalDiasAsignados: number;
    promedioDisPorEmpleado: number;
}

export interface DistribucionPorSemana {
    numeroSemana: number;
    fechaInicio: string;
    fechaFin: string;
    empleadosAsignados: number;
    totalDiasAsignados: number;
}

export interface EstadisticasAsignacion {
    totalEmpleadosSindicalizados: number;
    empleadosConAsignacion: number;
    empleadosSinAsignacion: number;
    porcentajeCobertura: number;
    promedioDisPorEmpleado: number;
    totalDiasDisponiblesNoAsignados: number;
}

export interface ResumenAsignacionAutomaticaResponse {
    anio: number;
    asignacionRealizada: boolean;
    totalVacacionesAsignadas: number;
    empleadosConAsignacion: number;
    resumenPorGrupos: ResumenPorGrupo[];
    distribucionPorSemanas: DistribucionPorSemana[];
    fechaUltimaAsignacion: string;
    estadisticas: EstadisticasAsignacion;
}

export interface ResetPasswordRequest {
    token: string;
    password: string;
    confirmPassword: string;
}

export interface ChangePasswordRequest {
    CurrentPassword: string;
    NewPassword: string;
    ConfirmNewPassword: string;
}

export interface ChangeUserPasswordRequest {
    UserId: number;
    NewPassword: string;
    ConfirmNewPassword: string;
}

export interface FirstTimePasswordResetRequest {
    username?: string;
    nomina?: string;
    password: string;
    confirmPassword: string;
}

// Role interfaces
export interface Role {
    id: number;
    name: string;
    description: string;
    abreviation: string;
}

// HTTP Methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Request configuration
export interface RequestConfig {
    method: HttpMethod;
    url: string;
    data?: unknown;
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
    timeout?: number;
    requiresAuth?: boolean;
    skipRetry?: boolean;
}

// Empleados Sindicalizados interfaces
export interface EmpleadosSindicalizadosRequest {
    AreaId?: number;
    GrupoId?: number;
    Page?: number;
    PageSize?: number;
}

interface Area {
    areaId: number;
    nombreGeneral: string;
    unidadOrganizativaSap: string;
}

interface Grupo {
    grupoId: number;
    rol: string;
    identificadorSAP: string;
    personasPorTurno: number;
    duracionDeturno: number;
}
export interface UsuarioInfoDto {
    id: number;
    fullName: string;
    username: string;
    unidadOrganizativaSap: string;
    rol: string;
    fechaIngreso: string;
    nomina: string;
    maquina?: string;
    area: Area;
    grupo: Grupo;
}


export interface PaginatedEmpleadosResponse {
    usuarios: UsuarioInfoDto[];
    currentPage: number;
    pageSize: number;
    totalUsers: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    filteredByArea?: number;
    filteredByGrupo?: number;
}

// Vacation Configuration interfaces
export interface VacationConfig {
    id: number;
    porcentajeAusenciaMaximo: number;
    periodoActual: string;
    anioVigente: number;
    createdAt: string;
    updatedAt: string;
}

// Vacation Assignment interfaces
export interface VacacionAsignada {
    id: number;
    fechaVacacion: string;
    tipoVacacion: string;
    origenAsignacion: string;
    estadoVacacion: string;
    periodoProgramacion: string;
    fechaProgramacion: string;
    puedeSerIntercambiada: boolean;
    observaciones: string;
    numeroSemana: number;
    diaSemana: string;
}

export interface ResumenVacaciones {
    diasEmpresa: number;
    diasAsignadosAutomaticamente: number;
    diasProgramables: number;
    totalDisponibles: number;
    asignadasAutomaticamente: number;
    anuales: number;
    reprogramaciones: number;
    festivosTrabajados: number;
    porAsignar: number;
}

export interface VacacionesAsignadasResponse {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    anio: number;
    totalVacaciones: number;
    resumen: ResumenVacaciones;
    vacaciones: VacacionAsignada[];
}

// Vacation Availability interfaces
export interface MesDisponibilidad {
    mes: number;
    nombreMes: string;
    diasDisponibles: number;
    diasNoDisponibles: number;
    totalDiasProcesados: number;
    porcentajeDisponibilidad: number;
}

export interface DisponibilidadVacacionesResponse {
    anio: number;
    grupoId: number;
    nombreGrupo: string;
    mesesDelAnio: MesDisponibilidad[];
}

export interface VacationConfig {
    id: number;
    periodoActual: string;
    anioVigente: number;
    porcentajeAusenciaMaximo: number;
    fechaActualizacion: string;
}

// Interfaces para excepciones de porcentaje
export interface ExcepcionPorcentaje {
    id: number;
    grupoId: number;
    nombreGrupo?: string;
    nombreArea?: string;
    fecha: string; // DateOnly format: "2025-01-15"
    porcentajeMaximoPermitido: number;
    motivo?: string;
    createdAt: string;
    createdByUser: string;
    updatedAt?: string | null;
    updatedByUser?: string | null;
    grupo?: any; // Puede ser null según la respuesta
}

export interface CreateExcepcionRequest {
    grupoId: number;
    fecha: string; // DateOnly format: "2025-01-15"
    porcentajeMaximoPermitido: number;
    motivo?: string;
}

export interface UpdateExcepcionRequest {
    grupoId: number;
    fecha: string; // DateOnly format: "2025-01-15"
    porcentajeMaximoPermitido: number;
    motivo?: string;
}

export interface ExcepcionesResponse {
    excepciones: ExcepcionPorcentaje[];
    totalCount: number;
}

export interface DeleteExcepcionResponse {
    mensaje: string;
    excepcionId: number;
}

// Interfaces para excepciones de manning
export interface ExcepcionManning {
    id: number;
    areaId: number;
    nombreArea?: string;
    anio: number;
    mes: number;
    mesNombre?: string;
    manningRequeridoExcepcion: number;
    manningBase?: number;
    motivo?: string;
    activa: boolean;
    createdAt: string;
    createdByUser: string;
    updatedAt?: string | null;
    creadoPorUserId?: number;
    area?: {
        areaId: number;
        nombreGeneral: string;
        manning: number;
    };
}

export interface CreateExcepcionManningRequest {
    areaId: number;
    anio: number;
    mes: number;
    manningRequeridoExcepcion: number;
    motivo?: string;
}

export interface UpdateExcepcionManningRequest {
    areaId: number;
    anio: number;
    mes: number;
    manningRequeridoExcepcion: number;
    motivo?: string;
}

// Ausencias/Porcentajes interfaces
export interface EmpleadoAusente {
    empleadoId: number;
    nombreCompleto: string;
    tipoAusencia: string;
}

export interface AusenciasPorGrupo {
    grupoId: number;
    nombreGrupo: string;
    areaId: number;
    nombreArea: string;
    manningRequerido: number;
    personalTotal: number;
    personalNoDisponible: number;
    personalDisponible: number;
    porcentajeDisponible: number;
    porcentajeAusencia: number;
    porcentajeMaximoPermitido: number;
    excedeLimite: boolean;
    puedeReservar: boolean;
    empleadosAusentes: EmpleadoAusente[];
}

export interface AusenciasPorFecha {
    fecha: string;
    ausenciasPorGrupo: AusenciasPorGrupo[];
}

export interface CalcularAusenciasRequest {
    fechaInicio: string;
    fechaFin?: string;
    grupoId: number;
}

export interface CalcularAusenciasResponse {
    data: AusenciasPorFecha[];
}

// Reserva Anual interfaces
export interface ReservaAnualRequest {
    empleadoId: number;
    anioVacaciones: number;
    FechasSeleccionadas: string[];
}

export interface FechaNoDisponible {
    fecha: string;
    motivo: string;
    detalle: string;
}

export interface VacacionProgramada {
    id: number;
    fecha: string;
    tipoVacacion: string;
    estadoVacacion: string;
}

export interface ReservaAnualResponse {
    empleadoId: number;
    nombreEmpleado: string;
    anioVacaciones: number;
    diasProgramablesDisponibles: number;
    diasProgramados: number;
    vacacionesProgramadas: VacacionProgramada[];
    fechasNoDisponibles: FechaNoDisponible[];
    advertencias: string[];
    reservaExitosa: boolean;
    motivoFallo?: string;
    fechaReserva: string;
}

export interface ForgotPasswordRequest {
    nomina: string;
}

// Interfaces para Reprogramación
export interface SolicitudReprogramacion {
    id: number;
    empleadoId: number;
    nombreEmpleado: string;
    nominaEmpleado: string;
    areaEmpleado: string;
    grupoEmpleado: string;
    vacacionOriginalId: number;
    fechaOriginal: string;
    fechaNueva: string;
    motivo: string;
    estadoSolicitud: 'Pendiente' | 'Aprobada' | 'Rechazada';
    requiereAprobacion: boolean;
    porcentajeCalculado: number;
    fechaSolicitud: string;
    solicitadoPor: string;
    fechaAprobacion: string | null;
    aprobadoPor: string | null;
    motivoRechazo: string | null;
    puedeAprobar: boolean;
}

export interface HistorialReprogramacionResponse {
    totalSolicitudes: number;
    pendientes: number;
    aprobadas: number;
    rechazadas: number;
    solicitudes: SolicitudReprogramacion[];
    total?: number;
}

// Request para solicitar reprogramación
export interface SolicitarReprogramacionRequest {
    empleadoId: number;
    vacacionOriginalId: number;
    fechaNueva: string;
    motivo: string;
}

// Response de solicitud de reprogramación
export interface SolicitarReprogramacionResponse {
    solicitudId: number;
    empleadoId: number;
    nombreEmpleado: string;
    nominaEmpleado: string;
    fechaOriginal: string;
    fechaNueva: string;
    motivo: string;
    estadoSolicitud: string;
    requiereAprobacion: boolean;
    porcentajeCalculado: number;
    mensajeValidacion: string;
    fechaSolicitud: string;
    solicitadoPor: string;
}

// Interfaces para cambio de empleado entre bloques
export interface CambiarEmpleadoRequest {
    empleadoId: number;
    bloqueOrigenId: number;
    bloqueDestinoId: number;
    motivo: string;
    observacionesAdicionales?: string;
}

export interface CambiarEmpleadoResponse {
    empleadoId: number;
    nombreEmpleado: string;
    nominaEmpleado: string;
    bloqueOrigen: {
        id: number;
        grupoId: number;
        nombreGrupo: string;
        numeroBloque: number;
        fechaHoraInicio: string;
        fechaHoraFin: string;
        personasPorBloque: number;
        esBloqueCola: boolean;
        estado: string;
        empleadosAsignados: number;
        espaciosDisponibles: number;
    };
    bloqueDestino: {
        id: number;
        grupoId: number;
        nombreGrupo: string;
        numeroBloque: number;
        fechaHoraInicio: string;
        fechaHoraFin: string;
        personasPorBloque: number;
        esBloqueCola: boolean;
        estado: string;
        empleadosAsignados: number;
        espaciosDisponibles: number;
    };
    cambioExitoso: boolean;
    fechaCambio: string;
}

// Interfaces para empleados que no respondieron
export interface EmpleadoNoRespondio {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    maquina: string | null;
    grupoId: number;
    nombreGrupo: string;
    areaId: number;
    nombreArea: string;
    bloqueId: number;
    numeroBloque: number;
    esBloqueCola: boolean;
    fechaLimiteBloque: string;
    fechaAsignacion: string;
    observaciones: string;
    requiereAccionUrgente: boolean;
}

export interface EmpleadosNoRespondieronResponse {
    anio: number;
    totalEmpleadosNoRespondio: number;
    empleadosEnBloquesRegulares: number;
    empleadosEnBloqueCola: number;
    empleados: EmpleadoNoRespondio[];
    fechaReporte: string;
}

// Interfaces para reportes de vacaciones
export interface EmpleadoFaltanteCaptura {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    maquina: string | null;
    grupoId: number;
    nombreGrupo: string;
    areaId: number;
    nombreArea: string;
    bloqueId: number;
    numeroBloque: number;
    esBloqueCola: boolean;
    fechaLimiteBloque: string;
    fechaAsignacion: string;
    observaciones: string | null;
    requiereAccionUrgente: boolean;
}

export interface EmpleadosFaltantesCapturaResponse {
    anio: number;
    totalEmpleados: number;
    totalCriticos: number;
    empleados: EmpleadoFaltanteCaptura[];
    fechaReporte: string;
}

export interface VacacionAsignadaEmpresa {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    maquina: string | null;
    areaId: number | null;
    nombreArea: string | null;
    grupoId: number | null;
    nombreGrupo: string | null;
    fechaVacacion: string;
    tipoVacacion: string;
    origenAsignacion: string;
    estadoVacacion: string;
    periodoProgramacion: string;
    fechaProgramacion: string;
    observaciones: string | null;
}

export interface VacacionesAsignadasEmpresaResponse {
    anio: number;
    totalVacaciones: number;
    totalEmpleados: number;
    vacaciones: VacacionAsignadaEmpresa[];
    fechaReporte: string;
}

export interface EmpleadoEnVacaciones {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    maquina: string | null;
    areaId: number | null;
    nombreArea: string | null;
    grupoId: number | null;
    nombreGrupo: string | null;
    fechaVacacion: string;
    tipoVacacion: string;
    origenAsignacion: string;
    estadoVacacion: string;
    periodoProgramacion: string;
    observaciones: string | null;
}

export interface EmpleadosEnVacacionesResponse {
    fechaConsulta: string;
    totalRegistros: number;
    totalEmpleados: number;
    empleados: EmpleadoEnVacaciones[];
    fechaReporte: string;
}

// Interfaces para asignación manual de vacaciones
export interface AsignacionManualRequest {
    empleadoId: number;
    fechasVacaciones: string[];
    tipoVacacion: 'Anual' | 'Reprogramacion' | 'Automatica' | 'Manual' | 'Compensatoria' | 'Extraordinaria';
    origenAsignacion: 'Manual' | 'Automatica' | 'Sistema';
    estadoVacacion: 'Activa' | 'Intercambiada' | 'Cancelada';
    observaciones: string;
    motivoAsignacion: string;
    ignorarRestricciones: boolean;
    notificarEmpleado: boolean;
    bloqueId?: number | null;
    origenSolicitud: 'NoRespondio' | 'Ajuste' | 'Correcion' | 'Especial';
}

export interface AsignacionManualResponse {
    exitoso: boolean;
    empleadoId: number;
    nombreEmpleado: string;
    vacacionesAsignadasIds: number[];
    fechasAsignadas: string[];
    totalDiasAsignados: number;
    tipoVacacion: string;
    mensaje: string;
    advertencias: string[];
    fechaAsignacion: string;
    usuarioAsigno: string;
}

// Interfaces para la nueva API de vacaciones asignadas completa
export interface EmpleadoDetalle {
    empleadoId: number;
    nombreCompleto: string;
    nomina: string;
    anio: number;
    totalVacaciones: number;
    resumen: {
        diasEmpresa: number;
        diasAsignadosAutomaticamente: number;
        diasProgramables: number;
        totalDisponibles: number;
        asignadasAutomaticamente: number;
        anuales: number;
        reprogramaciones: number;
        festivosTrabajados: number;
        porAsignar: number;
    };
    vacaciones: Array<{
        id: number;
        fechaVacacion: string;
        tipoVacacion: string;
        origenAsignacion: string;
        estadoVacacion: string;
        periodoProgramacion: string;
        fechaProgramacion: string;
        puedeSerIntercambiada: boolean;
        observaciones?: string;
        numeroSemana: number;
        diaSemana: string;
    }>;
}

export interface ResumenGeneral {
    totalDiasDisponibles: number;
    totalDiasAsignados: number;
    totalDiasPendientes: number;
    asignadasPorTipo: {
        [key: string]: number;
    };
    asignadasPorEstado: {
        [key: string]: number;
    };
}

export interface ResumenArea {
    areaId: number;
    nombreArea: string;
    totalEmpleados: number;
    totalDiasAsignados: number;
    totalDiasPendientes: number;
}

export interface ResumenGrupo {
    grupoId: number;
    nombreGrupo: string;
    totalEmpleados: number;
    totalDiasAsignados: number;
    totalDiasPendientes: number;
}

export interface VacacionesAsignadasCompleteResponse {
    totalEmpleados: number;
    anio: number;
    areaId?: number;
    nombreArea?: string;
    grupoId?: number;
    nombreGrupo?: string;
    resumenGeneral: ResumenGeneral;
    empleadosDetalle: EmpleadoDetalle[];
    resumenAreas?: ResumenArea[];
    resumenGrupos?: ResumenGrupo[];
}

export interface SolicitudFilters {
    areaId?: number;
    fechaDesde?: string;
    fechaHasta?: string;
    estadoSolicitud?: string; // ✅ Agregar esta línea
}

// Interfaces para Permutas
export interface SolicitudPermutaRequest {
    empleadoOrigenId: number;
    empleadoDestinoId: number | null;
    fechaPermuta: string; // Mantener como string en frontend
    motivo: string;
    solicitadoPor: number; // ✅ Agregar este campo
    turnoEmpleadoOrigen: string; // ✅ AGREGAR
    turnoEmpleadoDestino: string | null;
}

export interface EmpleadoPermutaInfo {
    id: number;
    nombre: string;
    turnoOriginal: string;
    turnoNuevo: string;
}

export interface SolicitudPermutaResponse {
    exitoso: boolean;
    mensaje: string;
    permutaId: number;
    empleadoOrigen: EmpleadoPermutaInfo;
    empleadoDestino: EmpleadoPermutaInfo;
    fechaPermuta: string;
}

// ============================================================================
// PERMISOS E INCAPACIDADES INTERFACES
// ============================================================================

export interface SolicitudPermisoDto {
    id: number;
    nominaEmpleado: number;
    nombreEmpleado: string;
    clAbPre: string;
    claveVisualizacion: string;
    descripcionPermiso: string;
    fechaInicio: string;
    fechaFin: string;
    observaciones?: string;
    estado: 'Pendiente' | 'Aprobada' | 'Rechazada';
    motivoRechazo?: string;
    fechaSolicitud: Date;
    fechaRespuesta?: Date;
    delegadoNombre: string;
    jefeAreaNombre?: string;
}

export interface ConsultarSolicitudesPermisosResponse {
    totalRegistros: number;
    solicitudes: SolicitudPermisoDto[];
}

// ============================================================================
// EDICIÓN DE DÍAS EMPRESA INTERFACES
// ============================================================================

export interface ConfiguracionEdicionDiasEmpresa {
    id: number;
    habilitado: boolean;
    fechaInicioPeriodo: string;
    fechaFinPeriodo: string;
    descripcion?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface SolicitudEdicionDiaEmpresa {
    id: number;
    empleadoId: number;
    nombreEmpleado: string;
    nominaEmpleado?: number;
    vacacionOriginalId: number;
    fechaOriginal: string;
    fechaNueva: string;
    estadoSolicitud: 'Pendiente' | 'Aprobada' | 'Rechazada';
    motivoRechazo?: string;
    observacionesEmpleado?: string;
    observacionesJefe?: string;
    fechaSolicitud: string;
    fechaRespuesta?: string;
    nombreJefeArea?: string;
    nombreSolicitadoPor?: string;
}

export interface ReporteDiasReprogramadosEmpresa {
    id: number;
    empleadoId: number;
    nomina?: number;
    nombreEmpleado: string;
    area?: string;
    grupo?: string;
    fechaOriginal: string;
    fechaNueva: string;
    estadoSolicitud: string;
    fechaSolicitud: string;
    fechaRespuesta?: string;
    nombreJefeArea?: string;
    nombreSolicitadoPor?: string;
    observacionesEmpleado?: string;
    motivoRechazo?: string;
}

export interface SolicitarEdicionDiaEmpresaRequest {
    empleadoId: number;
    vacacionOriginalId: number;
    fechaNueva: string;
    observacionesEmpleado?: string;
}

export interface ResponderEdicionDiaEmpresaRequest {
    solicitudId: number;
    aprobar: boolean;
    observacionesJefe?: string;
    motivoRechazo?: string;
}

export interface CrearConfiguracionEdicionRequest {
    fechaInicioPeriodo: string;
    fechaFinPeriodo: string;
    descripcion?: string;
    habilitado: boolean;
}
