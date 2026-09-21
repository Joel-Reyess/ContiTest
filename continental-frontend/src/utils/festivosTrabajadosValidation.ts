/**
 * =============================================================================
 * FESTIVOS TRABAJADOS - VALIDATION RULES
 * =============================================================================
 *
 * Reglas de negocio para solicitudes de festivos trabajados:
 *
 * 1. El empleado tiene 1 A�O desde la fecha del festivo trabajado para SOLICITAR
 *    la compensaci�n.
 * 2. Una vez solicitado, tiene 1 MES desde la fecha de solicitud para USAR el d�a,
 *    pero NO puede exceder el aniversario de 1 a�o + 1 mes desde la fecha trabajada.
 * 3. Si ya expir�, mostrar alerta espec�fica.
 * 4. Si est� cerca del vencimiento, mostrar advertencia con d�as restantes.
 *
 * @author Vulcanics Dev Team
 * =============================================================================
 */

import { fechaLocalISO } from './fechaLocal';

export interface FestivoValidationResult {
    isValid: boolean
    isExpired: boolean
    isCloseToDeadline: boolean
    daysRemaining: number
    requestDeadline: Date
    useDeadline: Date
    alertMessage?: string
    warningMessage?: string
}

export interface FechaUsoValidationResult {
    isValid: boolean
    message?: string
    maxDate: string
}

/**
 * Parsea una fecha en formato "YYYY-MM-DD" de forma segura (sin problemas de zona horaria).
 */
function parseDateSafe(dateStr: string): Date {
    const partes = dateStr.split('-')
    return new Date(
        parseInt(partes[0]),
        parseInt(partes[1]) - 1,
        parseInt(partes[2])
    )
}

/**
 * Formatea una fecha para mostrar al usuario en espa�ol de M�xico.
 */
function formatDateES(date: Date): string {
    return date.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

/**
 * Valida si un festivo trabajado a�n puede ser solicitado para compensaci�n.
 *
 * @param fechaTrabajada - Fecha del festivo trabajado (formato "YYYY-MM-DD")
 * @param referenceDate  - Fecha de referencia (por defecto: hoy)
 * @returns Resultado de la validaci�n con mensajes para el usuario
 */
export function validarFestivoParaSolicitud(
    fechaTrabajada: string,
    referenceDate?: Date
): FestivoValidationResult {
    const today = referenceDate ?? new Date()
    const fechaTrabajadaDate = parseDateSafe(fechaTrabajada)

    // L�mite para SOLICITAR: 1 a�o desde la fecha trabajada
    const requestDeadline = new Date(fechaTrabajadaDate)
    requestDeadline.setFullYear(requestDeadline.getFullYear() + 1)

    // L�mite absoluto para USAR: 1 a�o + 1 mes desde la fecha trabajada
    const useDeadline = new Date(fechaTrabajadaDate)
    useDeadline.setFullYear(useDeadline.getFullYear() + 1)
    useDeadline.setMonth(useDeadline.getMonth() + 1)

    // Calcular d�as restantes para solicitar
    const diffMs = requestDeadline.getTime() - today.getTime()
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    const isExpired = daysRemaining < 0
    const isCloseToDeadline = !isExpired && daysRemaining <= 30

    const result: FestivoValidationResult = {
        isValid: !isExpired,
        isExpired,
        isCloseToDeadline,
        daysRemaining: Math.max(daysRemaining, 0),
        requestDeadline,
        useDeadline,
    }

    if (isExpired) {
        result.alertMessage =
            `El festivo trabajado del ${formatDateES(fechaTrabajadaDate)} ya expir�. ` +
            `Ten�as hasta el ${formatDateES(requestDeadline)} para solicitarlo.`
    }

    if (isCloseToDeadline) {
        result.warningMessage =
            `Quedan ${daysRemaining} d�a${daysRemaining !== 1 ? 's' : ''} para solicitar este festivo trabajado. ` +
            `Fecha l�mite: ${formatDateES(requestDeadline)}.`
    }

    return result
}

/**
 * Valida que la fecha de USO seleccionada est� dentro de la ventana permitida.
 *
 * La fecha de uso no puede exceder 1 a�o + 1 mes desde la fecha del festivo trabajado.
 * Este l�mite es absoluto y no depende de cu�ndo se realiza la solicitud.
 *
 * @param fechaTrabajada - Fecha del festivo trabajado (formato "YYYY-MM-DD")
 * @param fechaUso       - Fecha de uso seleccionada (formato "YYYY-MM-DD")
 * @returns Resultado de la validaci�n con fecha m�xima permitida
 */
export function validarFechaDeUso(
    fechaTrabajada: string,
    fechaUso: string
): FechaUsoValidationResult {
    const fechaTrabajadaDate = parseDateSafe(fechaTrabajada)
    const fechaUsoDate = parseDateSafe(fechaUso)

    // L�mite absoluto: 1 a�o + 1 mes desde la fecha trabajada
    const limiteAbsoluto = new Date(fechaTrabajadaDate)
    limiteAbsoluto.setFullYear(limiteAbsoluto.getFullYear() + 1)
    limiteAbsoluto.setMonth(limiteAbsoluto.getMonth() + 1)

    const maxDate = limiteAbsoluto
    const maxDateStr = fechaLocalISO(maxDate)

    if (fechaUsoDate > maxDate) {
        return {
            isValid: false,
            message:
                `La fecha seleccionada excede el l�mite permitido. ` +
                `La fecha m�xima para usar este festivo es el ${formatDateES(maxDate)}.`,
            maxDate: maxDateStr,
        }
    }

    return { isValid: true, maxDate: maxDateStr }
}

/**
 * Calcula la fecha m�xima permitida para usar un festivo (�til para limitar el date picker).
 *
 * @param fechaTrabajada - Fecha del festivo trabajado (formato "YYYY-MM-DD")
 * @returns Fecha m�xima en formato "YYYY-MM-DD"
 */
export function calcularFechaMaximaUso(
    fechaTrabajada: string
): string {
    const fechaTrabajadaDate = parseDateSafe(fechaTrabajada)

    const limiteAbsoluto = new Date(fechaTrabajadaDate)
    limiteAbsoluto.setFullYear(limiteAbsoluto.getFullYear() + 1)
    limiteAbsoluto.setMonth(limiteAbsoluto.getMonth() + 1)

    return fechaLocalISO(limiteAbsoluto)
}
