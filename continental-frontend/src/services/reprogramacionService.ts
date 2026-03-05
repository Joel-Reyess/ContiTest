/**
 * Servicio para manejar solicitudes de reprogramación de vacaciones
 */

import { httpClient } from '@/services/httpClient';
import type {
    ApiResponse,
    HistorialReprogramacionResponse,
    SolicitudReprogramacion,
    SolicitarReprogramacionRequest,
    SolicitarReprogramacionResponse
} from '@/interfaces/Api.interface';

export class ReprogramacionService {
    /**
     * Obtiene el historial de solicitudes de reprogramación para un empleado.
     * Incluye fallback de endpoint/plural y nombres de query (`anioVacaciones`/`anio`).
     */
    static async obtenerHistorial(
        empleadoId: number,
        anio: number
    ): Promise<HistorialReprogramacionResponse> {
        const primaryUrl = `/api/reprogramacion/historial/${empleadoId}`;
        const fallbackUrl = `/api/reprogramaciones/historial/${empleadoId}`;

        const tryFetch = async (url: string, queryKey: string) => {
            const response = await httpClient.get<ApiResponse<HistorialReprogramacionResponse>>(
                url,
                { [queryKey]: anio },
                { timeout: 30000 }
            );

            // Algunos backends regresan { data, success } y otros directamente el payload
            if ((response as any)?.data) {
                return (response as any).data as HistorialReprogramacionResponse;
            }
            if ((response as any)?.success === false) {
                throw new Error((response as any)?.errorMsg || 'Error al obtener historial de solicitudes');
            }
            if (Array.isArray((response as any)?.solicitudes)) {
                return response as unknown as HistorialReprogramacionResponse;
            }

            throw new Error('Respuesta inválida al obtener historial de reprogramaciones');
        };

        try {
            console.log('Obteniendo historial de reprogramación (primario):', { empleadoId, anio, url: primaryUrl });
            return await tryFetch(primaryUrl, 'anioVacaciones');
        } catch (primaryError: any) {
            console.warn('Falló endpoint primario, probando fallback', primaryError);
            try {
                return await tryFetch(fallbackUrl, 'anio');
            } catch (fallbackError: any) {
                console.error('Error en obtenerHistorial (todos los intentos):', fallbackError);

                let errorMessage = 'Error al obtener el historial de solicitudes. Por favor intente nuevamente.';
                const msg = fallbackError?.message || primaryError?.message;

                if (msg?.includes('Network Error') || msg?.includes('Failed to fetch')) {
                    errorMessage = 'Error de conexión. Verifique su conexión e intente nuevamente.';
                } else if (msg) {
                    errorMessage = msg;
                }

                throw new Error(errorMessage);
            }
        }
    }

    /**
     * Obtiene el historial de solicitudes creadas por el usuario autenticado (delegado sindical / jefe)
     * FIXED: Maneja el error 404 y retorna un historial vacío
     */
    static async obtenerCreadasPorMi(anio: number): Promise<HistorialReprogramacionResponse> {
        try {
            const url = '/api/reprogramacion/creadas-por-mi';
            const response = await httpClient.get<ApiResponse<HistorialReprogramacionResponse>>(
                url,
                { anio },
                { timeout: 30000 }
            );

            if ((response as any)?.data) {
                return (response as any).data as HistorialReprogramacionResponse;
            }
            if ((response as any)?.success === false) {
                throw new Error((response as any)?.errorMsg || 'Error al obtener historial');
            }
            if (Array.isArray((response as any)?.solicitudes)) {
                return response as unknown as HistorialReprogramacionResponse;
            }

            throw new Error('Respuesta inválida');
        } catch (error: any) {
            console.error('Error en obtenerCreadasPorMi:', error);
            throw error;
        }
    }

    /**
     * Obtiene las últimas N solicitudes de un empleado
     */
    static async obtenerUltimasSolicitudes(
        empleadoId: number,
        anio: number,
        limite: number = 3
    ): Promise<SolicitudReprogramacion[]> {
        try {
            const historial = await this.obtenerHistorial(empleadoId, anio);
            const solicitudesOrdenadas = (historial?.solicitudes ?? [])
                .sort((a, b) => new Date(b.fechaSolicitud).getTime() - new Date(a.fechaSolicitud).getTime())
                .slice(0, limite);
            return solicitudesOrdenadas;
        } catch (error: any) {
            console.error('Error al obtener últimas solicitudes:', error);
            // SI ES ERROR 400 (timeout del backend), retornar vacío
            if (error?.status === 400 || error?.message?.includes('timeout')) {
                console.warn('⚠️ Timeout en consulta de solicitudes, retornando vacío');
                return [];
            }
            return [];
        }
    }

    /**
     * Solicita una reprogramación de vacación
     */
    static async solicitarReprogramacion(
        request: SolicitarReprogramacionRequest
    ): Promise<SolicitarReprogramacionResponse> {
        try {
            console.log('Solicitando reprogramación:', request);

            const response = await httpClient.post<ApiResponse<SolicitarReprogramacionResponse>>(
                '/api/reprogramacion/solicitar',
                request,
                { timeout: 30000 }
            );

            if (!response.success || !response.data) {
                // Manejar casos de error específicos
                const errorMsg = response.errorMsg || 'Error al procesar la solicitud';

                if (errorMsg.includes('Período no es') || errorMsg.includes('periodo')) {
                    throw new Error('El período actual no permite reprogramaciones');
                } else if (errorMsg.includes('automática')) {
                    throw new Error('Las vacaciones automáticas no pueden ser reprogramadas');
                } else if (errorMsg.includes('inhábil')) {
                    throw new Error('La fecha seleccionada cae en un día inhábil');
                } else if (errorMsg.includes('Conflicto') || errorMsg.includes('conflicto')) {
                    throw new Error('La fecha seleccionada tiene conflicto con otra vacación');
                } else if (errorMsg.includes('permisos')) {
                    throw new Error('No tienes permisos para realizar esta acción');
                } else if (errorMsg.includes('ya existe') || errorMsg.includes('duplicada')) {
                    throw new Error('Ya existe una solicitud para esta vacación');
                }

                throw new Error(errorMsg);
            }

            const result = response.data as unknown as SolicitarReprogramacionResponse;
            console.log('Solicitud creada exitosamente:', result);
            return result;
        } catch (error: any) {
            console.error('Error en solicitarReprogramacion:', error);
            // TEMPORAL: Ver el detalle completo del error
            console.error('❌ ERROR COMPLETO:', JSON.stringify(error, null, 2));
            console.error('❌ details:', JSON.stringify(error?.details, null, 2));
            console.error('❌ details.errorMsg:', error?.details?.errorMsg);
            console.error('❌ details.message:', error?.details?.message);

            // Si el error ya tiene un mensaje personalizado, usarlo
            if (error?.message) {
                throw error;
            }

            // Manejar errores HTTP específicos
            if (error?.status === 400) {
                const details = error?.details;
                console.error('❌ Error 400 Details:', details);

                if (details?.message) {
                    throw new Error(details.message);
                }

                if (details?.errors) {
                    const firstError = Object.values(details.errors)[0];
                    if (Array.isArray(firstError) && firstError.length > 0) {
                        throw new Error(firstError[0]);
                    }
                }

                // Intentar extraer mensaje del error
                const errorText = typeof details === 'string' ? details : JSON.stringify(details);
                if (errorText.length > 0 && errorText.length < 200) {
                    throw new Error(errorText);
                }

                throw new Error('Solicitud inválida. Verifique los datos e intente nuevamente.');
            }

            if (error?.status === 403) {
                throw new Error('No tienes permisos para realizar esta acción.');
            }

            if (error?.status === 409) {
                throw new Error('Conflicto: Ya existe una solicitud para esta vacación.');
            }

            // Error genérico
            throw new Error('Error al solicitar la reprogramación. Por favor intente nuevamente.');
        }
    }
}