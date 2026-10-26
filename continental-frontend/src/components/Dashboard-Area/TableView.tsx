import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarData } from '../../interfaces/Calendar.interface';
import type { Grupo } from '@/interfaces/Areas.interface';
import type { AusenciasPorFecha } from '@/interfaces/Ausencias.interface';
import { empleadosService } from '@/services/empleadosService';
import type { UsuarioInfoDto } from '@/interfaces/Api.interface';
import rolesService, { type WeeklyRolesResponse } from '@/services/rolesService';
import { toast } from 'sonner';

interface TableViewProps {
    calendarData: CalendarData | null;
    currentDate: Date;
    selectedGroups: string[];
    weekOffset: number;
    monthNames: string[];
    onNavigateMonth: (direction: 'prev' | 'next') => void;
    onNavigateWeek: (direction: 'prev' | 'next') => void;
    currentAreaGroups?: Grupo[];
    ausenciasData?: AusenciasPorFecha[];
    manningRequerido?: number;
}

type EmployeeByGroup = Record<string, UsuarioInfoDto[]>;
type LoadingByGroup = Record<string, boolean>;
type WeeklyRolesByGroup = Record<string, WeeklyRolesResponse>;

const dayLabels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

const getWeekStart = (date: Date, offset: number): Date => {
    const base = new Date(date);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + offset);
    const day = base.getDay(); // 0 = Sunday
    const diff = day === 0 ? -6 : 1 - day; // move to Monday
    base.setDate(base.getDate() + diff);
    return base;
};

const buildWeekDays = (date: Date, offset: number): Date[] => {
    const start = getWeekStart(date, offset);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
    });
};

const getFallbackShift = (employeeIndex: number, dayIndex: number): string => {
    const pattern = ['D', '1', '2', '3'];
    return pattern[(employeeIndex + dayIndex) % pattern.length];
};

const getSortableValue = (employee: UsuarioInfoDto): number | string => {
    const raw = employee.nomina || employee.username || '';
    const numeric = parseInt(raw, 10);
    if (!Number.isNaN(numeric)) return numeric;
    return raw.toLowerCase();
};

const sortEmployees = (list: UsuarioInfoDto[]): UsuarioInfoDto[] => {
    return [...list].sort((a, b) => {
        const aVal = getSortableValue(a);
        const bVal = getSortableValue(b);
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return aVal - bVal;
        }
        return aVal.toString().localeCompare(bVal.toString());
    });
};

const TableView: React.FC<TableViewProps> = ({
    calendarData,
    currentDate,
    selectedGroups,
    weekOffset,
    monthNames,
    onNavigateMonth,
    onNavigateWeek,
    currentAreaGroups = [],
    ausenciasData = [],
    manningRequerido = 0
}) => {
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [groupEmployees, setGroupEmployees] = useState<EmployeeByGroup>({});
    const [isLoadingEmployees, setIsLoadingEmployees] = useState<LoadingByGroup>({});
    const [weeklyRoles, setWeeklyRoles] = useState<WeeklyRolesByGroup>({});
    const [isLoadingWeekly, setIsLoadingWeekly] = useState<LoadingByGroup>({});

    const weekDays = useMemo(() => buildWeekDays(currentDate, weekOffset), [currentDate, weekOffset]);
    const weekStartIso = useMemo(
        () => (weekDays.length ? format(weekDays[0], 'yyyy-MM-dd') : ''),
        [weekDays]
    );
    const weekRangeLabel = useMemo(() => {
        if (!weekDays.length) return '';
        const start = weekDays[0];
        const end = weekDays[weekDays.length - 1];
        return `${format(start, "dd MMM", { locale: es })} - ${format(end, "dd MMM yyyy", { locale: es })}`;
    }, [weekDays]);

    const currentGroupLabel = useMemo(() => {
        if (!selectedGroup) return '';
        const match = currentAreaGroups.find(g => g.grupoId.toString() === selectedGroup);
        if (match?.rol) return match.rol;
        if (match?.nombreGeneral) return match.nombreGeneral;
        return `Grupo ${selectedGroup}`;
    }, [selectedGroup, currentAreaGroups]);

    // Load employees for the selected group (cached)
    useEffect(() => {
        const loadEmployees = async () => {
            if (!selectedGroup) return;
            if (groupEmployees[selectedGroup] || isLoadingEmployees[selectedGroup]) return;

            const grupoId = parseInt(selectedGroup, 10);
            if (Number.isNaN(grupoId)) return;

            try {
                setIsLoadingEmployees(prev => ({ ...prev, [selectedGroup]: true }));
                const response = await empleadosService.getEmpleadosSindicalizados({
                    GrupoId: grupoId,
                    PageSize: 200
                });
                const sorted = sortEmployees(response.usuarios || []);
                setGroupEmployees(prev => ({ ...prev, [selectedGroup]: sorted }));
            } catch (error) {
                console.error('Error loading employees', error);
                toast.error('No se pudieron cargar los empleados del grupo.');
                setGroupEmployees(prev => ({ ...prev, [selectedGroup]: [] }));
            } finally {
                setIsLoadingEmployees(prev => ({ ...prev, [selectedGroup]: false }));
            }
        };

        loadEmployees();
    }, [selectedGroup, groupEmployees, isLoadingEmployees]);

    // Load weekly roles for selected group and week (cached)
    useEffect(() => {
        const loadWeeklyRoles = async () => {
            if (!selectedGroup || !weekStartIso) return;
            const cacheKey = `${selectedGroup}-${weekStartIso}`;
            if (weeklyRoles[cacheKey] || isLoadingWeekly[cacheKey]) return;

            const grupoId = parseInt(selectedGroup, 10);
            if (Number.isNaN(grupoId)) return;

            try {
                setIsLoadingWeekly(prev => ({ ...prev, [cacheKey]: true }));
                const data = await rolesService.getWeeklyRoles(grupoId, weekStartIso);
                setWeeklyRoles(prev => ({ ...prev, [cacheKey]: data }));
            } catch (error) {
                console.error('Error loading weekly roles', error);
                toast.error('No se pudieron cargar los roles semanales.');
            } finally {
                setIsLoadingWeekly(prev => ({ ...prev, [cacheKey]: false }));
            }
        };

        loadWeeklyRoles();
    }, [selectedGroup, weekStartIso, weeklyRoles, isLoadingWeekly]);

    const getGroupLabel = (groupId: string): string => {
        const match = currentAreaGroups.find(g => g.grupoId.toString() === groupId);
        if (!match) return `Grupo ${groupId}`;
        const index = currentAreaGroups.findIndex(g => g.grupoId === match.grupoId);
        const suffix = index >= 0 ? ` ${index + 1}` : '';
        return `${match.rol || match.nombreGeneral || 'Grupo'}${suffix}`;
    };

    const getGroupDayData = (groupId: string, date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const ausencia = ausenciasData.find(a => a.fecha === dateStr);
        const groupInfo = ausencia?.ausenciasPorGrupo.find(g => g.grupoId === parseInt(groupId, 10));

        if (groupInfo) {
            return {
                percentage: groupInfo.porcentajeAusencia ?? null,
                exceeds:
                    groupInfo.excedeLimite ||
                    (!!groupInfo.porcentajeMaximoPermitido &&
                        groupInfo.porcentajeAusencia >= groupInfo.porcentajeMaximoPermitido)
            };
        }

        const dayData = calendarData?.days.find(d => d.day === date.getDate());
        const manning = dayData?.manning.find(m => m.group === groupId);
        const percentage = manning?.percentage ?? dayData?.averagePercentage ?? null;

        return {
            percentage: percentage ?? null,
            exceeds: manningRequerido > 0 ? (percentage ?? 0) > manningRequerido : false
        };
    };

    const getWeeklyShift = (
        employee: UsuarioInfoDto,
        date: Date,
        employeeIndex: number,
        dayIndex: number
    ): string => {
        if (!selectedGroup || !weekStartIso) return getFallbackShift(employeeIndex, dayIndex);
        const cacheKey = `${selectedGroup}-${weekStartIso}`;
        const weekly = weeklyRoles[cacheKey];
        const dateStr = format(date, 'yyyy-MM-dd');

        const match = weekly?.semana?.find(item => {
            const itemDate = (item as any)?.fecha ?? (item as any)?.Fecha;
            if (itemDate !== dateStr) return false;

            const empleado = (item as any)?.empleado ?? (item as any)?.Empleado ?? {};
            const sameId = empleado.id === employee.id || empleado.Id === employee.id;

            const nominaMatch =
                empleado.nomina ?? empleado.Nomina ?? empleado.username ?? empleado.Username;
            const sameNomina =
                !!employee.nomina && (nominaMatch === employee.nomina || nominaMatch === employee.username);

            const fullName = empleado.fullName ?? empleado.FullName;
            const sameUsername = employee.username && fullName === employee.username;

            return sameId || sameNomina || sameUsername;
        });

        const rawTurno = (match as any)?.codigoTurno ?? (match as any)?.CodigoTurno;
        if (typeof rawTurno === 'string' && rawTurno.trim() !== '') {
            const turno = rawTurno.trim().toUpperCase();
            return turno === 'VA' ? 'V' : turno;
        }

        return getFallbackShift(employeeIndex, dayIndex);
    };

    const renderGroupsOverview = () => (
        <div className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
            <table className="w-full">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-r border-gray-300">
                            Grupo
                        </th>
                        {weekDays.map((date, index) => (
                            <th
                                key={index}
                                className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-r border-gray-300 last:border-r-0"
                            >
                                {format(date, 'dd/MM', { locale: es })}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {selectedGroups.length === 0 ? (
                        <tr>
                            <td colSpan={weekDays.length + 1} className="px-4 py-8 text-center text-sm text-gray-500">
                                Selecciona al menos un grupo para visualizar la semana.
                            </td>
                        </tr>
                    ) : (
                        selectedGroups.map(groupId => (
                            <tr
                                key={groupId}
                                className="hover:bg-blue-50 cursor-pointer transition-colors"
                                onClick={() => setSelectedGroup(groupId)}
                            >
                                <td className="px-4 py-3 text-left text-sm font-bold text-blue-800 border-r border-gray-300 bg-blue-50">
                                    {getGroupLabel(groupId)}
                                </td>
                                {weekDays.map((date, dayIndex) => {
                                    const { percentage, exceeds } = getGroupDayData(groupId, date);
                                    const isCritical = exceeds;
                                    return (
                                        <td
                                            key={dayIndex}
                                            className={`px-4 py-3 text-center text-sm border-r border-gray-200 last:border-r-0 ${isCritical ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-900'
                                                }`}
                                        >
                                            {percentage === null ? '—' : `${percentage.toFixed(1)}%`}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderGroupDetail = () => {
        const employees = selectedGroup ? groupEmployees[selectedGroup] : [];
        const isLoadingEmp = selectedGroup ? isLoadingEmployees[selectedGroup] : false;
        const cacheKey = selectedGroup && weekStartIso ? `${selectedGroup}-${weekStartIso}` : '';
        const loadingWeekly = cacheKey ? isLoadingWeekly[cacheKey] : false;

        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSelectedGroup(null)}
                        className="flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700 transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Volver a grupos
                    </button>
                    <div className="text-lg font-semibold text-gray-900">
                        {currentGroupLabel} {employees?.length ? `• ${employees.length} integrantes` : ''}
                    </div>
                </div>

                <div className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                    <table className="w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-r border-gray-300">
                                    No. Nomina / Nombre
                                </th>
                                {weekDays.map((date, index) => (
                                    <th
                                        key={index}
                                        className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-r border-gray-300 last:border-r-0"
                                    >
                                        {dayLabels[index]} {format(date, 'dd/MM', { locale: es })}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {isLoadingEmp ? (
                                <tr>
                                    <td colSpan={weekDays.length + 1} className="px-4 py-6 text-center text-sm text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                                            Cargando empleados del grupo...
                                        </div>
                                    </td>
                                </tr>
                            ) : !employees || employees.length === 0 ? (
                                <tr>
                                    <td colSpan={weekDays.length + 1} className="px-4 py-8 text-center text-sm text-gray-500">
                                        No hay empleados en este grupo.
                                    </td>
                                </tr>
                            ) : (
                                employees.map((employee, employeeIndex) => (
                                    <tr key={employee.id} className={employeeIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="px-4 py-3 text-left text-sm border-r border-gray-200">
                                            <div>
                                                <div className="font-medium text-gray-900">{employee.nomina || employee.username}</div>
                                                <div className="text-xs text-gray-600">{employee.fullName || employee.username}</div>
                                            </div>
                                        </td>
                                        {weekDays.map((date, dayIndex) => (
                                            <td
                                                key={`${employee.id}-${dayIndex}`}
                                                className="px-4 py-3 text-center text-sm border-r border-gray-200 last:border-r-0 text-gray-900 font-semibold"
                                            >
                                                {loadingWeekly ? (
                                                    <span className="inline-flex items-center gap-1 text-gray-500">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        ...
                                                    </span>
                                                ) : (
                                                    getWeeklyShift(employee, date, employeeIndex, dayIndex)
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="font-semibold text-gray-800">Nomenclatura:</span>
                    <span>D = Descanso</span>
                    <span>1 = Manana</span>
                    <span>2 = Tarde</span>
                    <span>3 = Noche</span>
                </div>
            </div>
        );
    };

    return (
        <div className="px-8 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onNavigateMonth('prev')}
                        className="p-2 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <span className="text-lg font-semibold text-gray-900 mx-2">
                        {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </span>
                    <button
                        onClick={() => onNavigateMonth('next')}
                        className="p-2 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                    >
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onNavigateWeek('prev')}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700 transition-colors cursor-pointer"
                    >
                        Semana anterior
                    </button>
                    <span className="text-sm font-semibold text-gray-700 min-w-[160px] text-center">
                        {weekRangeLabel}
                    </span>
                    <button
                        onClick={() => onNavigateWeek('next')}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700 transition-colors cursor-pointer"
                    >
                        Semana siguiente
                    </button>
                </div>
            </div>

            {selectedGroup ? renderGroupDetail() : renderGroupsOverview()}
        </div>
    );
};

export default TableView;

