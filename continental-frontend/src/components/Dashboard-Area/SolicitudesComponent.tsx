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

import React, { useState } from 'react'
import { useVacationConfig } from '../../hooks/useVacationConfig'
import { TurnosActuales } from './TurnosActuales'
import { TablaSolicitudes } from './TablaSolicitudes'
import { SolicitudesPermisos } from './SolicitudesPermisos';
import { TablaFestivosTrabajados } from './TablaFestivosTrabajados';
import { TablaPermutas } from './TablaPermutas';
import { ChevronDown } from 'lucide-react'
import { useLocation } from 'react-router-dom';
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

type TabOption = 'solicitudes' | 'festivos' | 'permutas' | 'permisos' | 'vacaciones';

const SolicitudesComponent: React.FC = () => {
    const location = useLocation()
    const { config, loading, error } = useVacationConfig()
    const [selectedTab, setSelectedTab] = useState<TabOption>(() => {
        const stateTab = (location.state as any)?.activeTab
        return (stateTab as TabOption) || 'vacaciones'
    })

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

    const tabOptions = [
        {value: 'vacaciones' as TabOption, label: 'Solicitudes Reprogramaciones'},
        {value: 'festivos' as TabOption, label: 'Festivos Trabajados'},
        {value: 'permisos' as TabOption, label: 'Solicitudes Permisos'},
        {value: 'permutas' as TabOption, label: 'Permutas de Turno'},
    ]

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
                        {/* Dropdown selector */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="relative">
                                <select
                                    value={selectedTab}
                                    onChange={(e) => setSelectedTab(e.target.value as TabOption)}
                                    className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-base font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-gray-400 transition-colors"
                                >
                                    {tabOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                    <ChevronDown className="w-5 h-5" />
                                </div>
                            </div>
                        </div>

                        {/* Contenido dinámico según selección */}
                        <div className="animate-fadeIn">
                            {selectedTab === 'vacaciones' && <TablaSolicitudes />}
                            {selectedTab === 'festivos' && <TablaFestivosTrabajados />}
                            {selectedTab === 'permisos' && <SolicitudesPermisos />}
                            {selectedTab === 'permutas' && <TablaPermutas />}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default SolicitudesComponent