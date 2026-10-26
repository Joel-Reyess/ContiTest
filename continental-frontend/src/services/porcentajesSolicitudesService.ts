import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

export interface PorcentajeSolicitud {
    clave: string
    area: string
    grupo: string
    porcentajeTurno?: number | null
    porcentajeDia?: number | null
}

export interface PorcentajeSolicitudItem {
    clave: string
    empleadoId: number
    /** Si no hay empleadoId (permisos), se busca por nómina. */
    nomina?: number
    /** yyyy-MM-dd: el día que se pide (fecha nueva; en permisos, el primer día). */
    fecha: string
}

/**
 * % Turno y % Día (y área/grupo del empleado) de las solicitudes que no los
 * guardan, con el mismo cálculo que "Solicitudes de Reprogramaciones".
 */
export const porcentajesSolicitudesService = {
    async calcular(items: PorcentajeSolicitudItem[]): Promise<PorcentajeSolicitud[]> {
        if (items.length === 0) return []
        const resp = (await httpClient.post<PorcentajeSolicitud[]>(
            '/api/solicitudes-porcentajes',
            { items },
            { timeout: 60000 }
        )) as unknown as ApiResponse<PorcentajeSolicitud[]>
        if (!resp?.success) throw new Error(resp?.errorMsg || 'No se pudieron calcular los porcentajes')
        return resp.data ?? []
    },
}
