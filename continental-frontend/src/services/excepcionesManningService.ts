import { httpClient } from "@/services/httpClient";
import type {
    ApiResponse,
    ExcepcionManning,
    CreateExcepcionManningRequest,
    UpdateExcepcionManningRequest
} from "@/interfaces/Api.interface";

export const excepcionesManningService = {
    /**
     * Obtener excepciones de manning con filtros opcionales
     * @param areaId - ID del área (opcional)
     * @param anio - Año (opcional)
     * @param mes - Mes 1-12 (opcional)
     * @param soloActivas - Solo excepciones activas (default: true)
     */
    async getExcepcionesManning(
        areaId?: number,
        anio?: number,
        mes?: number,
        soloActivas: boolean = true
    ): Promise<ExcepcionManning[]> {
        try {
            const params = new URLSearchParams();

            if (areaId !== undefined) {
                params.append('areaId', areaId.toString());
            }
            if (anio !== undefined) {
                params.append('anio', anio.toString());
            }
            if (mes !== undefined) {
                params.append('mes', mes.toString());
            }
            params.append('soloActivas', soloActivas.toString());
            // Cache-buster: el GET de excepciones se cacheaba en el browser y
            // tras una edición posterior F5 mostraba el valor viejo. Forzamos
            // URL única por request para evitar 304/cache.
            params.append('_t', Date.now().toString());

            const queryString = params.toString();
            const url = `/api/configuracion-vacaciones/excepciones-manning${queryString ? `?${queryString}` : ''}`;

            const response = await httpClient.get<ApiResponse<ExcepcionManning[]>>(url);

            // Extract data from API response
            const excepcionesData = response.data || response;
            if (!Array.isArray(excepcionesData)) {
                console.warn("Expected array of excepciones manning, got:", excepcionesData);
                return [];
            }

            return excepcionesData as unknown as ExcepcionManning[];
        } catch (error: any) {
            // Si es error 403, significa que el usuario no tiene permisos
            if (error.response?.status === 403) {
                console.warn("User does not have permission to view manning exceptions");
                return [];
            }
            console.error("Error in excepcionesManningService.getExcepcionesManning:", error);
            throw error;
        }
    },

    /**
     * Crear una nueva excepción de manning
     * @param excepcionData - Datos de la nueva excepción
     */
    async createExcepcionManning(excepcionData: CreateExcepcionManningRequest): Promise<ExcepcionManning> {
        try {
            const response = await httpClient.post<ApiResponse<ExcepcionManning>>(
                `/api/configuracion-vacaciones/excepciones-manning`,
                excepcionData
            );

            // Extract data from API response
            const createdExcepcion = response.data || response;
            if (!createdExcepcion) {
                throw new Error("Invalid response from server");
            }

            return createdExcepcion as unknown as ExcepcionManning;
        } catch (error: any) {
            console.error("Error in excepcionesManningService.createExcepcionManning:", error);

            // Manejar errores específicos de la API
            if (error.response?.status === 403) {
                throw new Error('No tienes permisos para crear excepciones de manning');
            } else if (error.response?.status === 400) {
                const errorMsg = error.response?.data?.errorMsg;
                if (errorMsg?.includes('Ya existe una excepción activa')) {
                    throw new Error(errorMsg);
                } else if (errorMsg?.includes('no existe')) {
                    throw new Error(errorMsg);
                } else if (errorMsg?.includes('Datos inválidos')) {
                    throw new Error(errorMsg);
                }
                throw new Error(errorMsg || 'Error en los datos de la excepción');
            } else if (error.response?.status === 401) {
                throw new Error('No se pudo identificar el usuario');
            }

            throw error;
        }
    },

    /**
     * Actualizar una excepción existente
     * @param excepcionId - ID de la excepción a actualizar
     * @param excepcionData - Nuevos datos de la excepción
     */
    async updateExcepcionManning(
        excepcionId: number,
        excepcionData: UpdateExcepcionManningRequest
    ): Promise<ExcepcionManning> {
        try {
            const response = await httpClient.put<ApiResponse<ExcepcionManning>>(
                `/api/configuracion-vacaciones/excepciones-manning/${excepcionId}`,
                excepcionData
            );

            // Extract data from API response
            const updatedExcepcion = response.data || response;
            if (!updatedExcepcion) {
                throw new Error("Invalid response from server");
            }

            return updatedExcepcion as unknown as ExcepcionManning;
        } catch (error: any) {
            console.error("Error in excepcionesManningService.updateExcepcionManning:", error);

            // Manejar errores específicos de la API
            if (error.response?.status === 403) {
                throw new Error('No tienes permisos para actualizar excepciones de manning');
            } else if (error.response?.status === 404) {
                throw new Error(`Excepción con ID ${excepcionId} no encontrada`);
            } else if (error.response?.status === 400) {
                throw new Error(error.response?.data?.errorMsg || 'Error en los datos de la excepción');
            }

            throw error;
        }
    },

    /**
     * Eliminar (desactivar) una excepción de manning
     * @param excepcionId - ID de la excepción a eliminar
     */
    async deleteExcepcionManning(excepcionId: number): Promise<boolean> {
        try {
            const response = await httpClient.delete<ApiResponse<boolean>>(
                `/api/configuracion-vacaciones/excepciones-manning/${excepcionId}`
            );

            // Extract data from API response
            const deleteResult = response.data || response;
            return deleteResult as unknown as boolean;
        } catch (error: any) {
            console.error("Error in excepcionesManningService.deleteExcepcionManning:", error);

            // Manejar errores específicos de la API
            if (error.response?.status === 403) {
                throw new Error('No tienes permisos para eliminar excepciones de manning');
            } else if (error.response?.status === 404) {
                throw new Error(`Excepción con ID ${excepcionId} no encontrada`);
            }

            throw error;
        }
    },

    /**
     * Obtener la excepción de manning activa para un área, año y mes específicos
     * @param areaId - ID del área
     * @param anio - Año
     * @param mes - Mes (1-12)
     */
    async getExcepcionActivaParaMes(areaId: number, anio: number, mes: number): Promise<ExcepcionManning | null> {
        try {
            const excepciones = await this.getExcepcionesManning(areaId, anio, mes, true);
            return excepciones.length > 0 ? excepciones[0] : null;
        } catch (error) {
            console.error("Error getting active exception for month:", error);
            return null;
        }
    }
};