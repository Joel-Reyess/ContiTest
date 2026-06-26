import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "../ui/button";
import { ArrowLeft, CalendarSync, ChevronLeft, ChevronRight, Trash } from "lucide-react";
import Calendar from "@/components/Calendar/Calendar";
import { NavbarUser } from "../ui/navbar-user";
import useAuth from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PeriodOptions, type Period } from "@/interfaces/Calendar.interface";
import { getVacacionesAsignadasPorEmpleado, getDisponibilidadVacaciones, reservarVacacionesAnuales } from '@/services/vacacionesService';
import type { VacacionesAsignadasResponse, VacacionAsignada, ResumenVacaciones, DisponibilidadVacacionesResponse, ReservaAnualRequest, ReservaAnualResponse } from '@/interfaces/Api.interface';
import { UserRole } from "@/interfaces/User.interface";
import { vacacionesService } from '@/services/vacacionesService';

// Datos de respaldo para ocupación por mes (fallback)
const fallbackOccupationData = [
    { month: 1, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 2, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 3, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 4, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 5, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 6, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 7, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 8, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 9, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 10, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 11, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
    { month: 12, availableDays: 0, preselectedDays: 0, selectedDays: 0 },
];

// Datos de respaldo en caso de error al cargar desde la API
export const fallbackAssignedDays = [];

const RequestVacations = () => {
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [selectedDays, setSelectedDays] = useState<{ date: string }[]>([]);
    const [realAssignedDays, setRealAssignedDays] = useState<{ date: string }[]>([]);
    const [vacacionesData, setVacacionesData] = useState<VacacionesAsignadasResponse | null>(null);
    const [disponibilidadData, setDisponibilidadData] = useState<DisponibilidadVacacionesResponse | null>(null);
    const [loadingVacations, setLoadingVacations] = useState(true);
    const [loadingDisponibilidad, setLoadingDisponibilidad] = useState(true);
    const [loading, setLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [reservaResponse, setReservaResponse] = useState<ReservaAnualResponse | null>(null);

    // Obtener availableDays desde los datos de la API
    const availableDays = (vacacionesData?.resumen?.diasProgramables || 0) - (vacacionesData?.resumen?.anuales || 0);

    // Función para contar vacaciones automáticas por mes
    const getAutomaticVacationsByMonth = (month: number): number => {
        if (!vacacionesData?.vacaciones) return 0;

        const automaticVacations = vacacionesData.vacaciones.filter(vacacion => {
            if (vacacion.tipoVacacion !== "Automatica") return false;

            const fechaVacacion = new Date(vacacion.fechaVacacion);
            const vacationMonth = fechaVacacion.getMonth() + 1; // getMonth() es 0-indexed
            return vacationMonth === month;
        });

        return automaticVacations.length;
    };

    // Mapear datos de disponibilidad al formato esperado por AnualView
    const occupationDataFromAPI = disponibilidadData?.mesesDelAnio.map(mes => ({
        month: mes.mes,
        availableDays: mes.diasDisponibles,
        preselectedDays: getAutomaticVacationsByMonth(mes.mes), // Vacaciones automáticas del mes
        selectedDays: 0 // Este valor se mantiene en 0 por ahora
    })) || [];

    // También aplicar la lógica de vacaciones automáticas a los datos de fallback
    const fallbackWithAutomaticVacations = fallbackOccupationData.map(fallbackMonth => ({
        ...fallbackMonth,
        preselectedDays: getAutomaticVacationsByMonth(fallbackMonth.month)
    }));

    const navigate = useNavigate();
    const hasRole = (user: any, roleName: string) => {
        return (user?.roles || []).some((role: any) => {
            if (typeof role === "string") {
                return role === roleName;
            }
            return role.name === roleName;
        });
    };
    const { user } = useAuth();

    const [currentPeriod, setCurrentPeriod] = useState<Period | null>(null);

    // ✅ Determinar si es delegado sindical
    const isUnionCommittee = Boolean((user as any)?.isUnionCommittee);
    const isUnionRepresentative = hasRole(user, UserRole.UNION_REPRESENTATIVE);
    const isDelegadoSindicato = isUnionCommittee || isUnionRepresentative || user?.area?.nombreGeneral === "Sindicato";
    console.log('🔍 Verificación Delegado Sindical:', {
        isUnionCommittee,
        isUnionRepresentative,
        areaNombre: user?.area?.nombreGeneral,
        isDelegadoSindicato,
        userRoles: user?.roles
    });

    useEffect(() => {
        const fetchPeriod = async () => {
            try {
                const config = await vacacionesService.getConfig();
                setCurrentPeriod(config.periodoActual as Period);
                console.log('📅 Periodo actual cargado:', config.periodoActual);
            } catch (error) {
                console.error('Error fetching period:', error);
            }
        };
        fetchPeriod();
    }, []);


    // Cargar vacaciones reales del empleado al montar el componente
    useEffect(() => {
        const fetchVacaciones = async () => {
            if (!user?.id) return;

            setLoadingVacations(true);
            try {
                const resp = await getVacacionesAsignadasPorEmpleado(user.id);
                setVacacionesData(resp);

                // Mapear las vacaciones para assignedDays
                const assignedFromApi = resp.vacaciones.map((v: VacacionAsignada) => ({
                    date: v.fechaVacacion
                }));
                setRealAssignedDays(assignedFromApi);
            } catch (error) {
                console.error('Error fetching vacaciones:', error);
                toast.error('Error al cargar las vacaciones asignadas');
                // Mantener datos por defecto en caso de error
                setRealAssignedDays(fallbackAssignedDays);
                setVacacionesData(null);
            } finally {
                setLoadingVacations(false);
            }
        };

        fetchVacaciones();
    }, [user?.id]);

    // Cargar datos de disponibilidad por grupo
    useEffect(() => {
        const fetchDisponibilidad = async () => {
            if (!user?.grupo?.grupoId) return;

            setLoadingDisponibilidad(true);
            try {
                const currentYear = new Date().getFullYear();
                const nextYear = currentYear + 1; // Año siguiente al actual

                const resp = await getDisponibilidadVacaciones(nextYear, user.grupo.grupoId);
                setDisponibilidadData(resp);
            } catch (error) {
                console.error('Error fetching disponibilidad:', error);
                toast.error('Error al cargar la disponibilidad de vacaciones');
                // En caso de error, mantener datos por defecto
                setDisponibilidadData(null);
            } finally {
                setLoadingDisponibilidad(false);
            }
        };

        fetchDisponibilidad();
    }, [user?.grupo?.grupoId]);

    const handleSelectDay = (day: string) => {
        //validar que el dia no exista en selectedDays
        if (selectedDays.some((d) => d.date === day)) {
            return;
        }
        if (selectedDays.length >= availableDays) {
            toast.success("Has seleccionado todos tus dias");
            return;
        }
        setSelectedDays((prev) => [...prev, { date: day }]);
    };

    const handleRemoveDay = (day: string) => {
        setSelectedDays((prev) => prev.filter((d) => d.date !== day));
    };

    const handleEdit = (day: string) => {
        console.log("🟦 Editando día:", day);
        // Aquí abrir modal, cambiar fecha, etc.
    };
    const onSubmit = async () => {
        if (availableDays !== selectedDays.length) {
            toast.error("No has seleccionado todos tus dias");
            return;
        }

        if (selectedDays.length === 0) {
            toast.error("Debe seleccionar al menos una fecha");
            return;
        }

        if (!user?.id) {
            toast.error("Error: Usuario no identificado");
            return;
        }

        setLoading(true);

        try {
            // Preparar la solicitud
            const currentYear = new Date().getFullYear();
            const anioVacaciones = currentYear + 1; // Año siguiente para programación anual

            // Formatear fechas a formato YYYY-MM-DD (DateOnly)
            const fechasFormateadas = selectedDays.map(day => {
                const fecha = day.date.includes('-') ? new Date(day.date + 'T00:00:00') : new Date(day.date);
                return fecha.toISOString().split('T')[0]; // Formato YYYY-MM-DD
            });

            console.log('📅 Fechas seleccionadas:', selectedDays);
            console.log('📅 Fechas formateadas:', fechasFormateadas);

            const requestPayload: ReservaAnualRequest = {
                empleadoId: user.id,
                anioVacaciones: anioVacaciones,
                FechasSeleccionadas: fechasFormateadas
            };

            console.log('🔄 Enviando solicitud de reserva:', requestPayload);

            // Llamar a la API
            const response = await reservarVacacionesAnuales(requestPayload);

            console.log('✅ Respuesta de reserva:', response);
            setReservaResponse(response);

            if (response.reservaExitosa) {
                toast.success("Vacaciones reservadas correctamente");
                setIsSubmitted(true);
            } else {
                // Mostrar errores específicos
                if (response.fechasNoDisponibles && response.fechasNoDisponibles.length > 0) {
                    toast.error(`Error: ${response.motivoFallo || 'Algunas fechas no están disponibles'}`);

                    // Mostrar detalles de fechas no disponibles
                    response.fechasNoDisponibles.forEach(fecha => {
                        toast.error(`${format(new Date(fecha.fecha + 'T00:00:00'), "d 'de' MMMM", { locale: es })}: ${fecha.motivo}`);
                    });
                } else {
                    toast.error(response.motivoFallo || "Error al procesar la reserva");
                }
            }
        } catch (error) {
            console.error('❌ Error en reserva:', error);
            toast.error("Error al procesar la solicitud de vacaciones");
        } finally {
            setLoading(false);
        }
    };
    console.log("AREA USER:", user?.area?.nombreGeneral);
    // Mostrar pantalla de confirmación si ya se envió la solicitud
    if (isSubmitted) {
        return (
            <ConfirmationScreen
                selectedDays={selectedDays}
                assignedDays={realAssignedDays}
                reservaResponse={reservaResponse}
            />
        );
    }

    // Mostrar loading mientras se cargan las vacaciones y disponibilidad
    if (loadingVacations || loadingDisponibilidad) {
        return (
            <div className="flex flex-col min-h-screen w-full bg-white p-12">
                <header className="flex justify-between items-center pb-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(-1)}>
                            <ChevronLeft /> Regresar
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">
                            Seleccionar Vacaciones
                        </h1>
                        <p className="text-slate-600">
                            Gestiona tus solicitudes de vacaciones
                        </p>
                    </div>
                    <NavbarUser />
                </header>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">
                            {loadingVacations && loadingDisponibilidad
                                ? "Cargando datos de vacaciones..."
                                : loadingVacations
                                    ? "Cargando vacaciones asignadas..."
                                    : "Cargando disponibilidad de vacaciones..."}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen w-full bg-white p-12">
            <header className="flex justify-between items-center pb-4">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(-1)}>
                        <ChevronLeft /> Regresar
                    </div>
                    <h1 className="text-2xl font-bold  text-slate-800">
                        Seleccionar Vacaciones
                    </h1>
                    <p className="text-slate-600">
                        Gestiona tus solicitudes de vacaciones
                    </p>
                </div>
                <NavbarUser />
            </header>
            <div className="flex gap-8 justify-between">
                <div className="flex-2">
                    {selectedMonth && (
                        <div
                            onClick={() => setSelectedMonth(null)}
                            className="flex items-center gap-2 cursor-pointer p-2 w-fit"
                        >
                            <ArrowLeft /> Vista anual
                        </div>
                    )}
                    {selectedMonth ? (
                        <Calendar
                            month={selectedMonth}
                            onMonthChange={setSelectedMonth}
                            onSelectDay={handleSelectDay}
                            onRemoveDay={handleRemoveDay}
                            selectedDays={selectedDays}
                            groupId={user?.grupo?.grupoId}
                            userId={user?.id}
                        />
                    ) : (
                        <AnualView
                            setSelectedMonth={setSelectedMonth}
                            occupation={occupationDataFromAPI.length > 0 ? occupationDataFromAPI : fallbackWithAutomaticVacations}
                        />
                    )}
                </div>
                <div className="flex-1">
                    <Summary
                        assignedDays={realAssignedDays}
                        availableDays={availableDays}
                        vacaciones={vacacionesData?.vacaciones}
                        resumenVacaciones={vacacionesData?.resumen}
                        selectedDays={selectedDays}
                        handleRemoveDay={handleRemoveDay}
                        onSubmit={onSubmit}
                        loading={loading}
                        isDelegadoSindicato={isDelegadoSindicato}
                        period={currentPeriod} 
                        handleEdit={handleEdit}
                    />
                </div>
            </div>
        </div>
    );
};

export default RequestVacations;

const AnualView = ({
    setSelectedMonth,
    occupation,
}: {
    setSelectedMonth: (month: number | null) => void;
    occupation: {
        availableDays: number;
        preselectedDays: number;
        selectedDays: number;
        month: number;
    }[];
}) => {
    const months = [
        { id: 1, name: "Enero" },
        { id: 2, name: "Febrero" },
        { id: 3, name: "Marzo" },
        { id: 4, name: "Abril" },
        { id: 5, name: "Mayo" },
        { id: 6, name: "Junio" },
        { id: 7, name: "Julio" },
        { id: 8, name: "Agosto" },
        { id: 9, name: "Septiembre" },
        { id: 10, name: "Octubre" },
        { id: 11, name: "Noviembre" },
        { id: 12, name: "Diciembre" },
    ];

    const getBorderColor = (availableDays: number) => {
        if (availableDays === 0) return "border-continental-red bg-continental-red";
        if (availableDays < 10) return "border-[#FFBD06] bg-[#FFBD06]";
        return "border-[#00A613] bg-[#00A613]";
    };

    return (
        <div>
            <div className="grid grid-cols-3 grid-rows-4 gap-4 ">
                {months.map((month) => {
                    const monthData = occupation.find((occ) => occ.month === month.id);
                    const availableDays = monthData?.availableDays || 0;

                    return (
                        <div
                            key={month.id}
                            className={`flex flex-col items-center gap-2  justify-between cursor-pointer border rounded-lg overflow-hidden h-48 w-60`}
                            onClick={() => setSelectedMonth(month.id)}
                        >
                            <span className="text-lg text-center font-bold bg-black text-white p-2 w-full">
                                {month.name}
                            </span>
                            <div className="flex flex-col gap-1 items-center">
                                {monthData?.availableDays && monthData?.availableDays > 0 ? (
                                    <span className="text-sm text-gray-600 pl-2 border-l-4 border-gray-600">
                                        {monthData?.availableDays} Días disponibles
                                    </span>
                                ) : (
                                    <span className="text-sm text-gray-600 pl-2 border-l-4 border-gray-600">
                                        No hay días disponibles
                                    </span>
                                )}
                                {monthData?.preselectedDays &&
                                    monthData?.preselectedDays > 0 ? (
                                    <span className="text-sm text-gray-600 pl-2 border-l-4 border-gray-600">
                                        Tienes Días asignados
                                    </span>
                                ) : null}
                                {monthData?.selectedDays && monthData?.selectedDays > 0 ? (
                                    <span className="text-sm text-blue-600 pl-2 border-l-4 border-blue-600">
                                        Días seleccionados
                                    </span>
                                ) : null}
                            </div>
                            <div
                                className={`w-full flex items-center justify-end p-2 ${getBorderColor(
                                    availableDays
                                )}`}
                            >
                                Ver <ChevronRight size={20} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const Summary = ({
    assignedDays,
    availableDays,
    workedHoliday,
    selectedDays,
    handleRemoveDay,
    onSubmit,
    loading,
    isViewMode,
    handleEdit,
    period,
    isDelegadoSindicato,
}: {
    assignedDays: { date: string }[];
    availableDays: number;
    workedHoliday?: { date: string }[];
    vacaciones?: VacacionAsignada[];
    resumenVacaciones?: ResumenVacaciones;
    selectedDays: { date: string }[];
    handleRemoveDay?: (day: string) => void;
    onSubmit?: () => void;
    loading?: boolean;
    isViewMode?: boolean;
    handleEdit?: (day: string) => void;
    period?: Period;
    isDelegadoSindicato?: boolean;
}) => {
    // Nota: vacaciones se pasa para uso futuro, actualmente no se usa en el render
    return (
        <div className="w-full flex flex-col p-4 border border-continental-gray-4 rounded-lg h-full overflow-y-auto max-h-max">
            {assignedDays.length > 0 ? (
                <div>
                    <h1 className="text-xl font-semibold">Vacaciones asignadas</h1>
                    <div className="h-2 w-full bg-continental-blue-light "></div>
                    <div className="flex flex-col gap-2">
                        {assignedDays.map((day) => (
                            <div
                                key={day.date}
                                className="flex items-center justify-center p-2 border border-continental-gray-4"
                            >
                                <p>
                                    {format(
                                        day.date.includes('-') ? new Date(day.date + 'T00:00:00') : new Date(day.date),
                                        "EEE, d 'de' MMMM 'de' yyyy",
                                        { locale: es }
                                    )}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="flex flex-col gap-2 mt-4">
                {!isViewMode ? (
                    <>
                        <h1 className="text-xl font-semibold">Resumen de vacaciones</h1>
                        <h2 className="text-lg font-normal text-continental-gray-1">Revisa tu selección antes de continuar</h2>
                        <div className="flex justify-between items-center text-base">
                            <p className="text-continental-gray-1">Dias capturados</p>
                            <p className="text-gray-800 text-xl font-bold">
                                {selectedDays.length}
                            </p>
                        </div>
                        <div className="flex justify-between items-center text-base">
                            <p className="text-continental-gray-1">Dias por capturar</p>
                            <p className="text-gray-800 text-xl font-bold">
                                {availableDays - selectedDays.length}
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        <h1 className="text-xl font-semibold">Vacaciones Seleccionadas</h1>
                        <div className="h-2 w-full bg-continental-yellow "></div>
                    </>
                )}
                <div className="flex flex-col gap-2">
                    {(() => {
                        const now = new Date();
                        const hoyStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        return selectedDays.map((day) => {
                            const isoDate = day.date.includes('-') ? day.date : day.date;
                            const consumida = isDelegadoSindicato && isoDate <= hoyStr;
                            return (
                                <div
                                    key={day.date}
                                    className={`flex items-center p-2 border border-continental-gray-4 ${period === PeriodOptions.reprogramming ? "justify-between" : "justify-between"}`}
                                >
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p>
                                            {format(
                                                day.date.includes('-') ? new Date(day.date + 'T00:00:00') : new Date(day.date),
                                                "EEE, d 'de' MMMM 'de' yyyy",
                                                { locale: es }
                                            )}
                                        </p>
                                        {consumida && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">
                                                Vacación consumida
                                            </span>
                                        )}
                                    </div>
                                    {handleRemoveDay && !isViewMode ? (
                                        <Trash
                                            onClick={() => handleRemoveDay(day.date)}
                                            color="#FF0000"
                                            size={20}
                                        />
                                    ) : period === PeriodOptions.reprogramming && isDelegadoSindicato && handleEdit ? (
                                        <CalendarSync onClick={() => handleEdit(day.date)} className="cursor-pointer" color="#004eaf" size={20} />
                                    ) : null}
                                </div>
                            );
                        });
                    })()}
                </div>
                {workedHoliday && workedHoliday?.length > 0 ? (
                    <div>
                        <h1 className="text-xl font-semibold">Vacaciones/Festivos Trabajados </h1>
                        <div className="h-2 w-full bg-continental-green-light "></div>
                        <div className="flex flex-col gap-2">
                            {workedHoliday.map((day) => (
                                <div
                                    key={day.date}
                                    className="flex items-center justify-center p-2 border border-continental-gray-4"
                                >
                                    <p>
                                        {format(
                                            day.date.includes('-') ? new Date(day.date + 'T00:00:00') : new Date(day.date),
                                            "EEE, d 'de' MMMM 'de' yyyy",
                                            { locale: es }
                                        )}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
            {onSubmit ? (
                <div className="flex flex-col gap-2 mt-auto">
                    <p>Revisa tu selección antes de continuar</p>

                    <Button
                        onClick={() => onSubmit()}
                        className={`w-fit ml-auto ${availableDays === selectedDays.length
                                ? "cursor-pointer"
                                : "cursor-not-allowed"
                            }`}
                        variant="continental"
                        size="lg"
                        disabled={availableDays !== selectedDays.length || loading}
                    >
                        Continuar
                    </Button>
                </div>
            ) : null}
        </div>
    );
};

// Componente de pantalla de confirmación
const ConfirmationScreen = ({
    selectedDays,
    assignedDays,
    reservaResponse,
}: {
    selectedDays: { date: string }[];
    assignedDays: { date: string }[];
    reservaResponse?: ReservaAnualResponse | null;
}) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    //Despues de 1 min de inactividad, redirigir a la pantalla de inicio
    useEffect(() => {
        const timer = setTimeout(() => {
            logout();
            navigate("/login-vacaciones");
        }, 120000); //2 min
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col min-h-screen w-full bg-white p-12">
            <header className="flex justify-between items-center pb-4">
                <div className="flex items-center gap-2">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center ">
                        <svg
                            className="w-12 h-12 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-bold text-slate-800">
                            Programación enviada
                        </h1>
                        <p className="text-slate-600">
                            Tu solicitud de vacaciones ha sido procesada exitosamente
                        </p>
                    </div>
                </div>
                <NavbarUser />
            </header>

            <div className="flex flex-col gap-4" id="user-info">
                <p>{user?.fullName}</p>
                <p>{user?.username}</p>
            </div>

            <div className="flex flex-col w-full mx-auto max-w-[1200px]">
                <div className="w-full bg-gray-50 rounded-lg p-6 mb-8">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                        Resumen de tu solicitud:
                    </h3>
                    {reservaResponse && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-sm font-semibold text-blue-800 mb-2">
                                Información de la reserva:
                            </h4>
                            <div className="text-sm text-blue-700 space-y-1">
                                <p><strong>Empleado:</strong> {reservaResponse.nombreEmpleado}</p>
                                <p><strong>Año de vacaciones:</strong> {reservaResponse.anioVacaciones}</p>
                                <p><strong>Días programables disponibles:</strong> {reservaResponse.diasProgramablesDisponibles}</p>
                                <p><strong>Días programados:</strong> {reservaResponse.diasProgramados}</p>
                                <p><strong>Fecha de reserva:</strong> {format(new Date(reservaResponse.fechaReserva), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}</p>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-between gap-8">
                        <div className="space-y-2 flex-1">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Días solicitados:</span>
                                <span className="font-semibold text-continental-blue">
                                    {selectedDays.length}
                                </span>
                            </div>
                            <div className="border-t-4 border-continental-yellow pt-2">
                                <p className="text-sm text-gray-600 mb-2">
                                    Fechas seleccionadas:
                                </p>
                                <div className="space-y-1 overflow-y-auto">
                                    {selectedDays.map((day) => (
                                        <div
                                            key={day.date}
                                            className="text-sm bg-white p-2 rounded border"
                                        >
                                            {format(
                                                day.date.includes('-') ? new Date(day.date + 'T00:00:00') : new Date(day.date),
                                                "EEEE, d 'de' MMMM 'de' yyyy",
                                                { locale: es }
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 flex-1">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Días asignados:</span>
                                <span className="font-semibold text-continental-blue">
                                    {assignedDays.length}
                                </span>
                            </div>
                            <div className="border-t-4 border-continental-blue-light pt-2">
                                <p className="text-sm text-gray-600 mb-2">Fechas asignadas:</p>
                                <div className="space-y-1 overflow-y-auto">
                                    {assignedDays.map((day) => (
                                        <div
                                            key={day.date}
                                            className="text-sm bg-white p-2 rounded border"
                                        >
                                            {format(
                                                day.date.includes('-') ? new Date(day.date + 'T00:00:00') : new Date(day.date),
                                                "EEEE, d 'de' MMMM 'de' yyyy",
                                                { locale: es }
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-4 ml-auto">
                    <Button
                        onClick={() => { logout(); navigate("/login-vacaciones") }}
                        variant="outline"
                        size="lg"
                        className="px-8"
                    >
                        Cerrar Sesión
                    </Button>
                    <Button
                        onClick={() => navigate("/empleados")}
                        variant="continental"
                        size="lg"
                        className="px-8"
                    >
                        Volver al Inicio
                    </Button>
                </div>
            </div>
        </div>
    );
};
