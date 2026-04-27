import { type JSX } from 'react'
import { Routes, Route } from 'react-router-dom'

import EmployeeHome from './EmployeeHome'
import RequestVacations from './RequestVacations'
import MyVacations from './MyVacations'
import MyRequests from './MyRequests'
import { PeriodOptions } from '@/interfaces/Calendar.interface'
import { Plantilla } from './Plantilla'
import { useVacationConfig } from '@/hooks/useVacationConfig'
import WeeklyRoles from './WeeklyRoles'
import MisPermutas from './MisPermutas';
import EdicionDiasEmpresa from './EdicionDiasEmpresa';


const EmployeeDashboard = (): JSX.Element => {
    const { currentPeriod, loading, error } = useVacationConfig();

    // Mostrar loading mientras se obtiene la configuración
    if (loading) {
        return (
            <div className="flex flex-col min-h-screen w-full bg-continental-bg">
                <div className="flex-1 min-h-screen h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative h-10 w-10">
                            <div className="absolute inset-0 rounded-full border-2 border-continental-gray-3" />
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-continental-yellow animate-spin" />
                        </div>
                        <p className="text-sm font-medium text-continental-gray-1 uppercase tracking-wider">Cargando configuración</p>
                    </div>
                </div>
            </div>
        );
    }

    // Mostrar error si hay problemas al cargar la configuración
    if (error) {
        return (
            <div className="flex flex-col min-h-screen w-full bg-continental-bg">
                <div className="flex-1 min-h-screen h-full flex items-center justify-center p-6">
                    <div className="industrial-surface max-w-md w-full p-8 text-center">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--color-continental-red)_10%,white)] text-continental-red mb-5">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold tracking-tight text-continental-black mb-2">Error al cargar configuración</h3>
                        <p className="text-sm text-continental-gray-1 mb-6">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center justify-center px-5 h-10 bg-continental-yellow text-continental-black text-sm font-semibold rounded-md shadow-industrial-sm hover:bg-[#f79400] transition-colors cursor-pointer"
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen w-full bg-continental-bg">

            {/* Main Content */}
            <div className="flex-1 min-h-screen h-full">
                <Routes>
                    <Route index element={<EmployeeHome currentPeriod={currentPeriod} />} />

                    {/* Rutas condicionales basadas en el período actual */}
                    {currentPeriod === PeriodOptions.annual && (
                        <Route path="solicitar-vacaciones" element={<RequestVacations />} />
                    )}

                    {currentPeriod === PeriodOptions.reprogramming && (
                        <Route path="mis-solicitudes" element={<MyRequests />} />
                    )}

                    {/* Rutas disponibles en todos los períodos */}
                    <Route path="plantilla" element={<Plantilla />} />
                    <Route path="mis-vacaciones" element={<MyVacations currentPeriod={currentPeriod} />} />
                    <Route path="roles-semanales" element={<WeeklyRoles />} />
                    <Route path="mis-permutas" element={<MisPermutas />} />
                    <Route path="edicion-dias-empresa" element={<EdicionDiasEmpresa />} />
                </Routes>
            </div>
        </div>
    )
}

export default EmployeeDashboard
