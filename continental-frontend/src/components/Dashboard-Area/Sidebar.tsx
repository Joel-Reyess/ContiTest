import React from "react";
import { ExceptionConfiguration } from "./ExceptionConfiguration";
import { ManningExceptionConfiguration } from "./ManningExceptionConfiguration";
import { AbsencePercentageExceptionConfiguration } from "./AbsencePercentageExceptionConfiguration";
import { useAuth } from "@/hooks/useAuth";
import { UserRole } from "@/interfaces/User.interface";
import type { Grupo } from "@/interfaces/Grupo.interface";

interface SidebarProps {
    manningRequerido: number;
    onManningChange: (newManning: number) => void;
    activeView?: string;
    currentDate?: Date;
    selectedGroups?: string[];
    totalPercentage?: number;
    showManning?: boolean;
    currentAreaGroups?: Grupo[];
    areaId?: number;
    areaNombre?: string;
    manningBase?: number;
    areas?: { id: string; name: string; manning?: number }[];
    /** Avisa al calendario que vuelva a pedir las ausencias (traen el manning por grupo). */
    onExcepcionesManningCambiadas?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    manningRequerido,
    onManningChange,
    activeView,
    currentDate,
    selectedGroups = [],
    showManning = true,
    currentAreaGroups = [],
    areaId,
    areaNombre,
    manningBase,
    areas,
    onExcepcionesManningCambiadas
}) => {
    const { hasRole } = useAuth();

    // Solo Ingenieros Industriales y Super Usuarios pueden modificar Manning y % Ausencia
    const canManageManningAndPercentage = hasRole(UserRole.INDUSTRIAL) || hasRole(UserRole.SUPER_ADMIN);

    return (
        <div className="w-72 flex flex-col gap-4">
            <div className="bg-white border border-gray-200 p-4 rounded-lg">
                <div className="text-sm font-semibold text-gray-900 mb-3">Leyenda del Calendario</div>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0"></div>
                        <span className="text-sm text-gray-700">Días inhábiles</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0"></div>
                        <span className="text-sm text-gray-700">Porcentaje rebasado</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
                        <span className="text-sm text-gray-700">Días con personal en vacaciones</span>
                    </div>
                </div>
            </div>

            {/* Manning con Excepciones - Solo para Ingenieros Industriales y Super Usuarios */}
            {showManning && canManageManningAndPercentage && currentDate && (
                <ManningExceptionConfiguration
                    currentDate={currentDate}
                    areaId={areaId}
                    areaNombre={areaNombre}
                    manningBase={manningBase || manningRequerido}
                    onManningChange={onManningChange}
                    areas={areas}
                    // Sin esto el panel no sabía qué grupos estaban marcados y
                    // todo cambio de manning era de toda el área.
                    selectedGroups={selectedGroups}
                    currentAreaGroups={currentAreaGroups}
                    onExcepcionesCambiadas={onExcepcionesManningCambiadas}
                />
            )}

            {/* Excepciones de % Ausencia - Solo para Ingenieros Industriales y Super Usuarios */}
            {showManning && canManageManningAndPercentage && currentDate && currentAreaGroups.length > 0 && (
                <AbsencePercentageExceptionConfiguration
                    currentDate={currentDate}
                    currentAreaGroups={currentAreaGroups}
                />
            )}

            {/* Configuración de excepciones de Tiempo Extra - Disponible para todos */}
            {showManning && activeView === 'Día' && currentDate && (
                <ExceptionConfiguration
                    currentDate={currentDate}
                    currentAreaGroups={currentAreaGroups}
                />
            )}
        </div>
    );
};

export default Sidebar;