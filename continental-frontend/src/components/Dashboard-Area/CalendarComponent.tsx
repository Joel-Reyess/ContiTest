/**
 * =============================================================================
 * CALENDAR COMPONENT
 * =============================================================================
 * 
 * @description
 * Componente wrapper del calendario que maneja la selección de áreas y
 * configuración inicial. Proporciona la interfaz principal para la gestión
 * de calendarios por área con opciones de configuración.
 * 
 * @inputs (Datos de endpoints)
 * - areas: Array - Lista de áreas disponibles desde el backend
 *   - id: string - Identificador único del área
 *   - name: string - Nombre descriptivo del área
 * - selectedArea: string - Área actualmente seleccionada
 * 
 * @used_in (Componentes padre)
 * - src/components/Dashboard-Area/AreaDashboard.tsx
 * 
 * @user_roles (Usuarios que acceden)
 * - Jefe de Área
 * - Lider de grupo
 * - Ingeniero industrial
 * 
 * @dependencies
 * - React: Framework base y hooks (useState)
 * - ./CalendarWidget: Widget principal del calendario con funcionalidades completas
 * 
 * @author Vulcanics Dev Team
 * @created 2024
 * @last_modified 2025-08-20
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import CalendarWidget from './CalendarWidget';
import { useAuth } from '@/hooks/useAuth';
import { areasService } from '@/services/areasService';
import { UserRole } from '@/interfaces/User.interface';
import type { AreaByIngenieroItem, AreaByLiderItem } from '@/interfaces/Areas.interface';
import { logger } from '@/utils/logger';

interface AreaOption {
    id: string;
    name: string;
    grupos?: any[];
    jefeFullName?: string;
}

const CalendarComponent: React.FC = () => {
    const { user, hasRole } = useAuth();
    const [selectedArea, setSelectedArea] = useState<string>('');
    const [areas, setAreas] = useState<AreaOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasAttempted, setHasAttempted] = useState(false);

    // Memoize the load areas function to prevent recreating it on every render
    const loadAreas = useCallback(async () => {
        if (!user || hasAttempted) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            setHasAttempted(true);
            let areasData: AreaOption[] = [];

            if (hasRole(UserRole.AREA_ADMIN)) {
                // Jefe de Área: obtener todas las áreas y filtrar por jefeId
                const allAreas = await areasService.getAreas();
                console.log({ allAreas })
                console.log(user.id)
                const userAreas = allAreas.filter(area => area.jefeId === user.id);

                // Obtener detalles completos de cada área incluyendo grupos
                areasData = await Promise.all(
                    userAreas.map(async (area) => {
                        const areaDetails = await areasService.getAreaById(area.areaId);
                        return {
                            id: areaDetails.areaId.toString(),
                            name: areaDetails.nombreGeneral,
                            grupos: areaDetails.grupos || [],
                            jefeFullName: (areaDetails as any)?.jefe?.fullName,
                            manning: areaDetails.manning
                        };
                    })
                );
            } else if (hasRole(UserRole.INDUSTRIAL)) {
                // Ingeniero Industrial: usar endpoint específico
                logger.info(`Loading areas for Ingeniero Industrial - User ID: ${user.id}`, 'CALENDAR_COMPONENT');
                try {
                    const response = await areasService.getAreasByIngeniero(user.id);
                    if (response.success && response.data) {
                        // Obtener detalles completos de cada área incluyendo grupos
                        areasData = await Promise.all(
                            response.data.map(async (item: AreaByIngenieroItem) => {
                                const areaDetails = await areasService.getAreaById(item.areaId);
                                return {
                                    id: areaDetails.areaId.toString(),
                                    name: areaDetails.nombreGeneral,
                                    grupos: areaDetails.grupos || [],
                                    jefeFullName: (areaDetails as any)?.jefe?.fullName,
                                    manning: areaDetails.manning
                                };
                            })
                        );
                        logger.info(`Successfully loaded ${areasData.length} areas for Ingeniero Industrial`, 'CALENDAR_COMPONENT');
                    } else {
                        logger.warn('No areas found for Ingeniero Industrial or API returned unsuccessful response', 'CALENDAR_COMPONENT');
                    }
                } catch (apiError) {
                    logger.error('Failed to load areas for Ingeniero Industrial, falling back to all areas', apiError, 'CALENDAR_COMPONENT');
                    // Fallback: load all areas if the specific endpoint fails
                    const allAreas = await areasService.getAreas();
                    areasData = await Promise.all(
                        allAreas.map(async (area) => {
                            const areaDetails = await areasService.getAreaById(area.areaId);
                            return {
                                id: areaDetails.areaId.toString(),
                                name: areaDetails.nombreGeneral,
                                grupos: areaDetails.grupos || [],
                                manning: areaDetails.manning
                            };
                        })
                    );
                }
            } else if (hasRole(UserRole.GERENTE_BT) || hasRole(UserRole.RH)) {
                // Gerente BT / RH: áreas asignadas vía AreaAsignaciones
                logger.info(`Loading areas for Gerente/RH - User ID: ${user.id}`, 'CALENDAR_COMPONENT');
                try {
                    const response = await areasService.getAreasByAsignacion(user.id);
                    if (response.success && response.data) {
                        areasData = response.data.map((item: AreaByLiderItem) => ({
                            id: item.areaId.toString(),
                            name: item.nombreGeneral,
                            grupos: item.grupos,
                            manning: item.manning
                        }));
                    }
                } catch (apiError) {
                    logger.error('Failed to load areas for Gerente/RH', apiError, 'CALENDAR_COMPONENT');
                }
            } else if (hasRole(UserRole.LEADER)) {
                // Líder de Grupo: usar endpoint específico
                logger.info(`Loading areas for Líder de Grupo - User ID: ${user.id}`, 'CALENDAR_COMPONENT');
                try {
                    const response = await areasService.getAreasByLider(user.id);
                    if (response.success && response.data) {
                        areasData = response.data.map((item: AreaByLiderItem) => ({
                            id: item.areaId.toString(),
                            name: item.nombreGeneral,
                            grupos: item.grupos,
                            manning: item.manning
                        }));
                        logger.info(`Successfully loaded ${areasData.length} areas for Líder de Grupo`, 'CALENDAR_COMPONENT');
                    } else {
                        logger.warn('No areas found for Líder de Grupo or API returned unsuccessful response', 'CALENDAR_COMPONENT');
                    }
                } catch (apiError) {
                    logger.error('Failed to load areas for Líder de Grupo, falling back to all areas', apiError, 'CALENDAR_COMPONENT');
                    // Fallback: load all areas if the specific endpoint fails
                    const allAreas = await areasService.getAreas();
                    areasData = allAreas.map(area => ({
                        id: area.areaId.toString(),
                        name: area.nombreGeneral,
                        grupos: area.grupos,
                        jefeFullName: (area as any)?.jefe?.fullName,
                        manning: area.manning
                    }));
                }
            } else {
                // Para otros roles, obtener todas las áreas
                const allAreas = await areasService.getAreas();
                areasData = allAreas.map(area => ({
                    id: area.areaId.toString(),
                    name: area.nombreGeneral,
                    grupos: area.grupos,
                    jefeFullName: (area as any)?.jefe?.fullName,
                    manning: area.manning
                }));
            }

            console.log({ areasData })
            setAreas(areasData);

            // Auto-select first area if available (only if no area is currently selected)
            if (areasData.length > 0 && areas.length === 0) {
                setSelectedArea(areasData[0].id);
            }

            logger.info(`Loaded ${areasData.length} areas for user role`, 'CALENDAR_COMPONENT');
        } catch (err) {
            logger.error('Error loading areas', err, 'CALENDAR_COMPONENT');
            setError('Error al cargar las áreas');
        } finally {
            setLoading(false);
        }
    }, [user, hasRole]);

    // Load areas when user changes
    useEffect(() => {
        loadAreas();
    }, [loadAreas]);

    const handleAreaChange = (areaId: string) => {
        setSelectedArea(areaId);
        logger.info(`Area changed to: ${areaId}`, 'CALENDAR_COMPONENT');
    };

    // Show loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg">Cargando áreas...</div>
            </div>
        );
    }

    // Show error state
    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-red-500">{error}</div>
            </div>
        );
    }

    // Show no areas message
    if (areas.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">No tienes áreas asignadas</div>
            </div>
        );
    }

    // Get current area data including groups
    const currentAreaData = areas.find(area => area.id === selectedArea);
    const bossName = currentAreaData?.jefeFullName;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-end pr-4">
                <Link
                    to="/area/roles-semanales"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-continental-blue-dark text-continental-blue-dark hover:bg-continental-blue-dark hover:text-white transition-colors"
                >
                    Ver roles semanales
                </Link>
            </div>
            <CalendarWidget
                showTabs={true}
                defaultView="calendar"
                showHeader={true}
                showSidebar={true}
                areas={areas}
                selectedArea={selectedArea}
                onAreaChange={handleAreaChange}
                currentAreaGroups={currentAreaData?.grupos || []}
                bossName={bossName}
            />
        </div>
    );
};

export default CalendarComponent;
