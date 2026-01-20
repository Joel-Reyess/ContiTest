/**
 * =============================================================================
 * SOLICITUDES COMPONENT
 * =============================================================================
 *
 * @description
 * Componente principal para gestión de solicitudes del área. Muestra contenido
 * diferente según el estado del periodo de vacaciones:
 * - ProgramacionAnual: Muestra turnos actuales y siguientes
 * - Reprogramacion: Muestra tabla de solicitudes
 * - Cerrado: Muestra mensaje de periodo cerrado
 *
 * @used_in (Componentes padre)
 * - src/components/Dashboard-Area/AreaDashboard.tsx
 *
 * @user_roles (Usuarios que acceden)
 * - Jefe de Área
 *
 * @dependencies
 * - React: Framework base
 * - useVacationConfig: Hook para obtener configuración de vacaciones
 * - TurnosActuales: Componente para mostrar turnos actuales
 * - TablaSolicitudes: Componente para mostrar tabla de solicitudes
 *
 * @author Vulcanics Dev Team
 * @created 2024
 * @last_modified 2025-09-28
 * =============================================================================
 */

import React from 'react'
import { useVacationConfig } from '../../hooks/useVacationConfig'
import { TurnosActuales } from './TurnosActuales'
import { TablaSolicitudes } from './TablaSolicitudes'
import { SolicitudesPermisos } from './SolicitudesPermisos';
import { TablaFestivosTrabajados } from './TablaFestivosTrabajados';
function HeaderPeriodos({ periodoActual }: { periodoActual: string | null }) {
    const getPeriodoStatus = (periodo: 'ProgramacionAnual' | 'Reprogramacion') => {
        if (periodoActual === periodo) {
            return { color: 'bg-green-500', text: 'Abierto' }
        }
        return { color: 'bg-red-500', text: 'Cerrado' }
    }

    const anualStatus = getPeriodoStatus('ProgramacionAnual')
    const reprogramacionStatus = getPeriodoStatus('Reprogramacion')

    return (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-center gap-6 text-center">
                <div className="flex items-center gap-2 text-gray-900 font-medium">
                    <span>Periodo de solicitudes anual</span>
                    <span className="flex items-center gap-2 text-gray-700 font-normal">
                        <span className={`w-2.5 h-2.5 rounded-full ${anualStatus.color}`} />
                        {anualStatus.text}
                    </span>
                </div>
                <div className="h-5 w-px bg-gray-300" />
                <div className="flex items-center gap-2 text-gray-900 font-medium">
                    <span>Periodo de Reprogramación</span>
                    <span className="flex items-center gap-2 text-gray-700 font-normal">
                        <span className={`w-2.5 h-2.5 rounded-full ${reprogramacionStatus.color}`} />
                        {reprogramacionStatus.text}
                    </span>
                </div>
            </div>
        </div>
    )
}

const SolicitudesComponent: React.FC = () => {
    const { config, loading, error } = useVacationConfig()

    if (loading) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-600">Cargando configuración...</div>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-red-600">{error}</div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-[1400px] mx-auto space-y-4">
                <HeaderPeriodos periodoActual={config?.periodoActual || null} />

                {config?.periodoActual === 'Cerrado' && (
                    <div className="bg-white border border-gray-200 rounded-lg p-8">
                        <div className="text-center">
                            <h2 className="text-lg font-semibold text-gray-900 mb-2">
                                Periodo Cerrado
                            </h2>
                            <p className="text-gray-600">
                                El periodo de vacaciones se encuentra cerrado. El superusuario debe
                                activarlo para comenzar la programación anual.
                            </p>
                        </div>
                    </div>
                )}

                {config?.periodoActual === 'ProgramacionAnual' && <TurnosActuales anioVigente={config?.anioVigente || new Date().getFullYear() + 1} />}
                {config?.periodoActual === 'Reprogramacion' && (
                    <>
                        <TablaSolicitudes />
                        <TablaFestivosTrabajados />
                        <SolicitudesPermisos />
                    </>
                )}
            </div>
        </div>
    )
}

export default SolicitudesComponent