/**
 * =============================================================================
 * CALENDAR VIEWS
 * =============================================================================
 * 
 * @description
 * Colección de componentes para diferentes vistas del calendario (mensual, semanal, diaria).
 * Cada vista renderiza los datos del calendario de forma específica con interacciones
 * apropiadas para la selección de fechas y visualización de información.
 * 
 * @inputs (Props del componente)
 * - calendarData: CalendarData | null - Datos del calendario con días y estadísticas
 * - currentDate: Date - Fecha actualmente seleccionada/mostrada
 * - selectedGroups: string[] - Grupos seleccionados para filtrar información
 * - dayNames?: string[] - Nombres de los días para encabezados
 * - onSelectDate: (date: Date) => void - Callback para seleccionar una fecha específica
 * 
 * @used_in (Componentes padre)
 * - src/components/Dashboard-Area/CalendarView.tsx
 * 
 * @user_roles (Usuarios que acceden)
 * - Jefe de Área
 * 
 * @dependencies
 * - React: Framework base
 * - ../../interfaces/Calendar.interface: Tipos de datos del calendario
 * 
 * @author Vulcanics Dev Team
 * @created 2024
 * @last_modified 2025-08-20
 * =============================================================================
 */

import React from 'react';
import type { CalendarData } from '../../interfaces/Calendar.interface';
import type { AusenciasPorFecha } from '../../interfaces/Ausencias.interface';
import type { Grupo } from '@/interfaces/Areas.interface';

interface ViewProps {
    calendarData: CalendarData | null;
    currentDate: Date;
    selectedGroups: string[];
    dayNames?: string[];
    onSelectDate: (date: Date) => void;
    currentAreaGroups?: Grupo[];
    ausenciasData: AusenciasPorFecha[];
}

export const MonthlyView: React.FC<ViewProps> = ({ calendarData, currentDate, selectedGroups, dayNames = [], onSelectDate, currentAreaGroups, ausenciasData }) => {
    if (!calendarData) return <div>No hay datos disponibles</div>;

    return (
        <div className="calendar-grid rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-100">
                {dayNames.map(day => (
                    <div key={day} className="p-3 text-center font-semibold text-gray-700 border-r last:border-r-0">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7">
                {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay() }, (_, i) => (
                    <div key={`empty-${i}`} className="calendar-cell bg-gray-50"></div>
                ))}

                {calendarData.days.map((day) => {
                    // Obtener datos reales de ausencias para este día
                    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day.day);
                    const dateString = dayDate.toISOString().split('T')[0];
                    const ausenciasDelDia = ausenciasData.find(a => a.fecha === dateString);

                    const labelFor = (id: string) => {
                        const g = currentAreaGroups?.find(ag => ag.grupoId.toString() === id);
                        if (g) {
                            //const base = g.rol.split('_')[0];
                            const base = g.rol;
                            const index = (currentAreaGroups || []).findIndex(ag => ag.grupoId.toString() === id);
                            return `${base} ${index + 1}`;
                        }
                        return `G ${id}`;
                    };

                    // Usar datos reales de ausencias si están disponibles, sino fallback a datos del calendario
                    const groupsData = selectedGroups.length > 0
                        ? selectedGroups.map(groupIdStr => {
                            const groupId = parseInt(groupIdStr);
                            
                            // Buscar datos reales de ausencias para este grupo
                            const grupoAusencias = ausenciasDelDia?.ausenciasPorGrupo.find(g => g.grupoId === groupId);
                            
                            let percentage = 0;
                            if (grupoAusencias) {
                                // Usar porcentaje real de ausencias
                                percentage = grupoAusencias.porcentajeAusencia;
                            } else {
                                // Fallback a datos del calendario
                                const manningByGroupName = new Map(day.manning.map(m => [m.group, m.percentage]));
                                percentage = manningByGroupName.get(groupIdStr) ?? day.averagePercentage;
                            }
                            
                            return { 
                                id: groupIdStr, 
                                name: labelFor(groupIdStr), 
                                percentage,
                                ausenciasInfo: grupoAusencias // Información adicional de ausencias
                            };
                        })
                        : [];
                    
                    const isSunday = dayDate.getDay() === 0;
                    const divisor = isSunday ? 2 : 3;
                    const totalPercentage = groupsData.length > 0
                        ? groupsData.reduce((sum, g) => sum + g.percentage, 0) / divisor
                        : 0;

                    // Indicadores basados en datos reales de ausencias
                    const hasExceededLimit = ausenciasDelDia?.ausenciasPorGrupo.some(g => g.excedeLimite) || false;
                    const hasHighAbsence = totalPercentage > 3;
                    const hasAbsentEmployees = ausenciasDelDia?.ausenciasPorGrupo.some(g => g.empleadosAusentes.length > 0) || false;

                    return (
                        <div
                            key={day.day}
                            className={`calendar-cell bg-white relative ${
                                hasExceededLimit ? 'border-2 border-red-500 bg-red-50' : 
                                hasHighAbsence ? 'border-2 border-yellow-500 bg-yellow-50' : 
                                hasAbsentEmployees ? 'border border-orange-300 bg-orange-50' : ''
                            }`}
                            style={{ minHeight: selectedGroups.length > 2 ? '130px' : '85px' }}
                            onClick={() => onSelectDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day.day))}
                            title={ausenciasDelDia ? 
                                `Fecha: ${dateString}\n${ausenciasDelDia.ausenciasPorGrupo.map(g => 
                                    `${g.nombreGrupo}: ${g.porcentajeAusencia}% ausencia (${g.personalDisponible}/${g.personalTotal} disponible)`
                                ).join('\n')}` : 
                                'Sin datos de ausencias'
                            }
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-sm font-semibold">{day.day}</span>
                                {selectedGroups.length > 0 && (
                                    <div className="flex items-center gap-1">
                                        <span className={`text-xs font-bold ${
                                            hasExceededLimit ? 'text-red-700' :
                                            hasHighAbsence ? 'text-yellow-700' :
                                            'text-gray-700'
                                        }`}>
                                            {totalPercentage.toFixed(1)}%
                                        </span>
                                        {hasExceededLimit && <span className="text-red-500 text-xs">⚠️</span>}
                                        {hasAbsentEmployees && <span className="text-orange-500 text-xs">👥</span>}
                                    </div>
                                )}
                            </div>

                            {/* Manning details con datos reales */}
                            {selectedGroups.length > 0 && (
                                <div className="text-xs space-y-0.5 overflow-hidden">
                                    {groupsData.map(group => (
                                        <div key={group.id} className="text-gray-600 truncate">
                                            <span className="font-medium">{group.name}:</span>
                                            <span className={`ml-1 ${
                                                group.ausenciasInfo?.excedeLimite ? 'text-red-600 font-bold' :
                                                group.percentage > 3 ? 'text-yellow-600' :
                                                'text-gray-700'
                                            }`}>
                                                {group.percentage.toFixed(1)}%
                                            </span>
                                            {group.ausenciasInfo && (
                                                <span className="ml-1 text-gray-500">
                                                    ({group.ausenciasInfo.personalDisponible}/{group.ausenciasInfo.personalTotal})
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Indicador de empleados ausentes */}
                            {hasAbsentEmployees && (
                                <div className="absolute bottom-1 right-1">
                                    <div className="bg-orange-500 text-white text-xs px-1 py-0.5 rounded text-center leading-none">
                                        {ausenciasDelDia?.ausenciasPorGrupo.reduce((sum, g) => sum + g.empleadosAusentes.length, 0)}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const WeeklyView: React.FC<ViewProps> = ({ calendarData, currentDate, selectedGroups, dayNames = [], onSelectDate, currentAreaGroups, ausenciasData }) => {
    if (!calendarData) return <div>No hay datos disponibles</div>;

    // Obtener la semana actual
    const today = new Date(currentDate);
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - currentDay);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        return day;
    });

    return (
        <div className="calendar-grid rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-100">
                {dayNames.map(day => (
                    <div key={day} className="p-3 text-center font-semibold text-gray-700 border-r last:border-r-0">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7">
                {weekDays.map((date, index) => {
                    const dayData = calendarData.days.find(d => d.day === date.getDate());
                    
                    // Obtener datos reales de ausencias para este día
                    const dateString = date.toISOString().split('T')[0];
                    const ausenciasDelDia = ausenciasData.find(a => a.fecha === dateString);

                    const labelFor = (id: string) => {
                        const g = currentAreaGroups?.find(ag => ag.grupoId.toString() === id);
                        if (g) {
                            //const base = g.rol.split('_')[0];
                            const base = g.rol;
                            const index = (currentAreaGroups || []).findIndex(ag => ag.grupoId.toString() === id);
                            return `${base} ${index + 1}`;
                        }
                        return `G ${id}`;
                    };

                    // Usar datos reales de ausencias si están disponibles
                    const groupsData = selectedGroups.length > 0
                        ? selectedGroups.map(groupIdStr => {
                            const groupId = parseInt(groupIdStr);
                            const grupoAusencias = ausenciasDelDia?.ausenciasPorGrupo.find(g => g.grupoId === groupId);
                            
                            let percentage = 0;
                            if (grupoAusencias) {
                                percentage = grupoAusencias.porcentajeAusencia;
                            } else {
                                // Fallback a datos del calendario
                                const manningByGroupName = new Map((dayData?.manning || []).map(m => [m.group, m.percentage]));
                                percentage = manningByGroupName.get(groupIdStr) ?? dayData?.averagePercentage ?? 0;
                            }
                            
                            return { 
                                id: groupIdStr, 
                                name: labelFor(groupIdStr), 
                                percentage,
                                ausenciasInfo: grupoAusencias
                            };
                        })
                        : [];
                    
                    const isSunday = date.getDay() === 0;
                    const divisor = isSunday ? 2 : 3;
                    const totalPercentage = groupsData.length > 0
                        ? groupsData.reduce((sum, g) => sum + g.percentage, 0) / divisor
                        : 0;

                    // Indicadores visuales
                    const hasExceededLimit = ausenciasDelDia?.ausenciasPorGrupo.some(g => g.excedeLimite) || false;
                    const hasHighAbsence = totalPercentage > 3;

                    return (
                        <div 
                            onClick={() => onSelectDate(date)} 
                            key={index} 
                            className={`calendar-cell bg-white ${
                                hasExceededLimit ? 'border-2 border-red-500 bg-red-50' : 
                                hasHighAbsence ? 'border-2 border-yellow-500 bg-yellow-50' : ''
                            }`} 
                            style={{ minHeight: selectedGroups.length > 2 ? '160px' : '120px' }}
                            title={ausenciasDelDia ? 
                                `${date.toLocaleDateString('es-ES')}\n${ausenciasDelDia.ausenciasPorGrupo.map(g => 
                                    `${g.nombreGrupo}: ${g.porcentajeAusencia}% ausencia`
                                ).join('\n')}` : 
                                date.toLocaleDateString('es-ES')
                            }
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-sm font-semibold">{date.getDate()}</span>
                                {selectedGroups.length > 0 && (
                                    <div className="flex items-center gap-1">
                                        <span className={`text-xs font-bold ${
                                            hasExceededLimit ? 'text-red-700' :
                                            hasHighAbsence ? 'text-yellow-700' :
                                            'text-gray-700'
                                        }`}>
                                            {totalPercentage.toFixed(1)}%
                                        </span>
                                        {hasExceededLimit && <span className="text-red-500 text-xs">⚠️</span>}
                                    </div>
                                )}
                            </div>

                            {selectedGroups.length > 0 && (
                                <div className="text-xs space-y-0.5 overflow-hidden">
                                    {groupsData.map(group => (
                                        <div key={group.id} className="text-gray-600 truncate">
                                            <span className="font-medium">{group.name}:</span>
                                            <span className={`ml-1 ${
                                                group.ausenciasInfo?.excedeLimite ? 'text-red-600 font-bold' :
                                                group.percentage > 3 ? 'text-yellow-600' :
                                                'text-gray-700'
                                            }`}>
                                                {group.percentage.toFixed(1)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const DailyView: React.FC<ViewProps> = ({ calendarData, currentDate, selectedGroups, currentAreaGroups, ausenciasData }) => {
    if (!calendarData) return <div>No hay datos disponibles</div>;


    // Función para obtener el nombre del grupo
    const labelFor = (id: string) => {
        const g = currentAreaGroups?.find(ag => ag.grupoId.toString() === id);
        if (g) {
            //const base = g.rol.split('_')[0];
            const base = g.rol;
            const index = (currentAreaGroups || []).findIndex(ag => ag.grupoId.toString() === id);
            return `${base} ${index + 1}`;
        }
        return `Grupo ${id}`;
    };

    // Obtener datos reales de ausencias para este día
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const dateString = dayDate.toISOString().split('T')[0];
    const ausenciasDelDia = ausenciasData.find(a => a.fecha === dateString);

    // Función para obtener el personal de cada grupo usando datos reales
    const getPersonalData = (groupId: string) => {
        const groupIdNum = parseInt(groupId);
        const grupoAusencias = ausenciasDelDia?.ausenciasPorGrupo.find(g => g.grupoId === groupIdNum);

        if (grupoAusencias) {
            // Mapear empleados disponibles si existen
            const disponible = (grupoAusencias.empleadosDisponibles || []).map(emp => ({
                id: emp.empleadoId.toString(),
                nomina: emp.nomina?.toString() || 'N/A',
                nombre: emp.nombreCompleto,
                rol: emp.rol || ''
            }));

            // Mapear empleados ausentes
            const noDisponible = grupoAusencias.empleadosAusentes.map(emp => ({
                id: emp.empleadoId.toString(),
                nomina: emp.nomina?.toString() || 'N/A',
                nombre: emp.nombreCompleto,
                motivo: emp.tipoAusencia +
                    (emp.tipoVacacion ? ` (${emp.tipoVacacion})` : '') +
                    (emp.maquina ? ` - ${emp.maquina}` : '')
            }));
            console.log('DEBUG getPersonalData:', {
                groupId,
                groupIdNum,
                dateString,
                ausenciasDelDia,
                grupoAusencias,
                todosLosGrupos: ausenciasDelDia?.ausenciasPorGrupo.map(g => ({ id: g.grupoId, nombre: g.nombreGrupo }))
            });
            return {
                disponible,
                noDisponible,
                stats: {
                    personalTotal: grupoAusencias.personalTotal,
                    personalDisponible: grupoAusencias.personalDisponible,
                    personalNoDisponible: grupoAusencias.personalNoDisponible,
                    porcentajeAusencia: grupoAusencias.porcentajeAusencia,
                    excedeLimite: grupoAusencias.excedeLimite,
                    porcentajeMaximo: grupoAusencias.porcentajeMaximoPermitido
                }
            };
        }

        // Fallback si no hay datos de ausencias
        return {
            disponible: [],
            noDisponible: [],
            stats: null
        };
    };
    console.log('DEBUG DailyView:', {
        currentDate: currentDate.toISOString(),
        dateString,
        ausenciasDelDia,
        selectedGroups,
        ausenciasPorGrupo: ausenciasDelDia?.ausenciasPorGrupo
    });
    return (
        <div className="max-w-6xl mx-auto px-auto p-5">
            <div className="mb-6">
                <div className="text-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                        {currentDate.toLocaleDateString('es-ES', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        })}
                    </h2>
                </div>
            </div>

            {selectedGroups.length > 0 ? (
                <div className="space-y-6">
                    {selectedGroups.map(groupId => {
                        const groupName = labelFor(groupId);
                        const personalData = getPersonalData(groupId);
                        const stats = personalData.stats;
                        
                        return (
                            <div key={groupId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <div className={`px-6 py-3 border-b border-gray-200 ${
                                    stats?.excedeLimite ? 'bg-red-50' : 'bg-gray-50'
                                }`}>
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-lg font-semibold text-gray-900">{groupName}</h3>
                                        <div className="flex items-center gap-4">
                                            {stats && (
                                                <>
                                                    <div className="text-sm text-gray-600">
                                                        <span className="font-medium">Personal:</span>
                                                        <span className="ml-1 text-green-600">{stats.personalDisponible}</span>
                                                        <span className="text-gray-400">/</span>
                                                        <span className="text-gray-900">{stats.personalTotal}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-600">% Ausencia:</span>
                                                        <span className={`text-sm font-semibold ${
                                                            stats.excedeLimite ? 'text-red-600' : 
                                                            stats.porcentajeAusencia > 3 ? 'text-yellow-600' : 
                                                            'text-gray-900'
                                                        }`}>
                                                            {stats.porcentajeAusencia.toFixed(1)}%
                                                        </span>
                                                        {stats.excedeLimite && (
                                                            <span className="text-red-500 text-xs">⚠️ Límite excedido</span>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {stats && (
                                        <div className="mt-2 text-xs text-gray-500">
                                            Límite máximo permitido: {stats.porcentajeMaximo}%
                                        </div>
                                    )}
                                </div>
                                
                                <div className="grid md:grid-cols-2 gap-6 p-6">
                                    <div>
                                        <h4 className="text-lg font-semibold text-green-600 mb-4 flex items-center gap-2">
                                            Personal disponible
                                            {stats && (
                                                <span className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded">
                                                    {stats.personalDisponible}
                                                </span>
                                            )}
                                        </h4>
                                        <div className="space-y-2">
                                            {personalData.disponible.length > 0 ? (
                                                // Mostrar lista detallada de empleados disponibles
                                                personalData.disponible.map(persona => (
                                                    <div
                                                        key={persona.id}
                                                        className="flex items-start gap-3 p-3 bg-green-50 rounded border border-green-200"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="font-medium text-gray-900">{persona.nombre}</div>
                                                            <div className="font-semibold text-gray-800 leading-tight">{persona.nomina}</div>
                                                            <div className="text-sm text-gray-600">ID: {persona.id}</div>
                                                            {persona.rol && (
                                                                <div className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded mt-1 inline-block">
                                                                    {persona.rol}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-green-500 text-xl">✓</div>
                                                    </div>
                                                ))
                                            ) : stats ? (
                                                // Si hay empleados disponibles pero no lista detallada
                                                <div className="text-center text-gray-500 py-4 bg-yellow-50 border border-yellow-200 rounded">
                                                    <p className="text-sm font-medium text-yellow-800">
                                                        ⚠️ Lista detallada no disponible
                                                    </p>
                                                    <p className="text-xs text-gray-600 mt-2">
                                                        {stats.personalDisponible} empleados disponibles
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-3">
                                                        💡 El backend necesita incluir el campo "empleadosDisponibles" en la respuesta
                                                    </p>
                                                </div>
                                            ) : (
                                                // No hay datos del grupo
                                                <div className="text-center text-gray-500 py-4">
                                                    <p className="text-sm">Sin datos disponibles para este grupo</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
                                            Personal NO disponible
                                            {stats && (
                                                <span className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded">
                                                    {stats.personalNoDisponible}
                                                </span>
                                            )}
                                        </h4>
                                        <div className="space-y-2">
                                            {personalData.noDisponible.length > 0 ? (
                                                personalData.noDisponible.map(persona => (
                                                    <div key={persona.id} className="flex items-start gap-3 p-3 bg-red-50 rounded border border-red-200">
                                                        <div className="flex-1">
                                                            <div className="font-medium text-gray-900">{persona.nombre}</div>
                                                            <div className="font-semibold text-gray-800 leading-tight">{persona.nomina}</div>
                                                            <div className="text-sm text-gray-600">ID: {persona.id}</div>
                                                            <div className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded mt-1 inline-block">
                                                                {persona.motivo}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center text-gray-500 py-4">
                                                    <p className="text-sm">✅ No hay empleados ausentes</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center text-gray-500 py-12">
                    <div className="bg-white rounded-lg border border-gray-200 p-8">
                        <p className="text-lg mb-2">Selecciona grupos para ver datos</p>
                        <p className="text-sm text-gray-400">Elige uno o más grupos desde el selector superior para ver el personal disponible y no disponible.</p>
                    </div>
                </div>
            )}
        </div>
    );
};