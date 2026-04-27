import useAuth from "@/hooks/useAuth";
import { PeriodLight } from "./PeriodLight";
import { NavbarUser } from "../ui/navbar-user";
import { Info } from "./Info";
import { Calendar, CalendarClock, Users2, Users, CalendarDays } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useNavigate } from "react-router-dom";
import { PeriodOptions, type Period } from "@/interfaces/Calendar.interface";
import { Notifications } from "./Notifications";
import { EmployeeSelector } from "./EmployeeSelector";
import { UserRole } from "@/interfaces/User.interface";
import { useState, useMemo, useEffect } from "react";
import { getVacacionesAsignadasPorEmpleado, vacacionesService } from "@/services/vacacionesService";
import { ReprogramacionService } from "@/services/reprogramacionService";
import type { VacacionesAsignadasResponse, UsuarioInfoDto, ConfiguracionEdicionDiasEmpresa } from "@/interfaces/Api.interface";
import { PermutaModal } from "../Empleado/PermutaModal";
import { edicionDiasEmpresaService } from "@/services/edicionDiasEmpresaService";

const EmployeeHome = ({ currentPeriod }: { currentPeriod: Period }) => {
    const { user } = useAuth();
    console.log({ user })
    const navigate = useNavigate();

    // Cargar empleado seleccionado desde localStorage al inicio
    const [selectedEmployee, setSelectedEmployee] = useState<UsuarioInfoDto>(() => {
        const saved = localStorage.getItem('selectedEmployee');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                // Si hay error al parsear, usar el usuario actual
                return user as unknown as UsuarioInfoDto || {} as UsuarioInfoDto;
            }
        }
        // Si no hay nada guardado, usar el usuario actual
        return user as unknown as UsuarioInfoDto || {} as UsuarioInfoDto;
    });

    const [vacacionesData, setVacacionesData] = useState<VacacionesAsignadasResponse | null>(null);
    const [loadingVacaciones, setLoadingVacaciones] = useState(true);

    const [showPermutaModal, setShowPermutaModal] = useState(false);
    const [configEdicion, setConfigEdicion] = useState<ConfiguracionEdicionDiasEmpresa | null>(null);

    // Estados para solicitudes de reprogramación
    const [solicitudesStats, setSolicitudesStats] = useState<{
        total: number;
        pendientes: number;
        aprobadas: number;
        rechazadas: number;
    }>({ total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 });
    const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);

    const hasRole = (roleName: string) => {
        return (user?.roles || []).some((role) => {
            if (typeof role === "string") {
                return role === roleName;
            }
            return role.name === roleName;
        });
    };

    const isUnionCommittee = Boolean((user as any)?.isUnionCommittee);
    const isUnionRepresentative = hasRole(UserRole.UNION_REPRESENTATIVE) || isUnionCommittee;
    const isDelegadoSindical =
        isUnionCommittee || hasRole(UserRole.UNION_REPRESENTATIVE) || user?.area?.nombreGeneral === "Sindicato";
    const canManageReprogramming = currentPeriod === PeriodOptions.reprogramming && isDelegadoSindical;
    console.log('¿Es delegado sindical?', isDelegadoSindical);
    console.log('Roles del usuario:', user?.roles);
    // Cargar datos de vacaciones del usuario
    useEffect(() => {
        const fetchVacaciones = async () => {
            if (!user?.id) return;

            const empleadoId = selectedEmployee?.id || user.id;

            setLoadingVacaciones(true);
            try {
                const resp = await getVacacionesAsignadasPorEmpleado(empleadoId);
                setVacacionesData(resp);
                console.log('📊 Datos de vacaciones cargados:', resp);
            } catch (error) {
                console.error('Error fetching vacaciones:', error);
                setVacacionesData(null);
            } finally {
                setLoadingVacaciones(false);
            }
        };

        fetchVacaciones();
    }, [user?.id, selectedEmployee?.id]);

    // Cargar estadisticas de solicitudes de reprogramacion
    useEffect(() => {
        const fetchSolicitudes = async () => {
            const empleadoId = selectedEmployee?.id || user?.id;

            if (!empleadoId && !isDelegadoSindical) {
                setLoadingSolicitudes(false);
                return;
            }

            if (currentPeriod !== PeriodOptions.reprogramming) {
                setLoadingSolicitudes(false);
                return;
            }

            setLoadingSolicitudes(true);
            try {
                // 🔥 OBTENER EL AÑO VIGENTE DE LA CONFIGURACIÓN (igual que Notifications)
                let anioVigente = new Date().getFullYear();
                try {
                    const config = await vacacionesService.getConfig();
                    anioVigente = config.anioVigente;
                } catch (error) {
                    console.log('Usando año actual por defecto:', anioVigente);
                }

                console.log('📅 Buscando solicitudes en el año:', anioVigente);

                const historial = isDelegadoSindical
                    ? await ReprogramacionService.obtenerCreadasPorMi(anioVigente)
                    : await ReprogramacionService.obtenerHistorial(empleadoId as number, anioVigente);

                const solicitudesListado = historial?.solicitudes ?? [];

                setSolicitudesStats({
                    total: solicitudesListado.length,
                    pendientes: solicitudesListado.filter((s: any) =>
                        s.estadoSolicitud?.toLowerCase() === 'pendiente'
                    ).length,
                    aprobadas: solicitudesListado.filter((s: any) =>
                        s.estadoSolicitud?.toLowerCase() === 'aprobada'
                    ).length,
                    rechazadas: solicitudesListado.filter((s: any) =>
                        s.estadoSolicitud?.toLowerCase() === 'rechazada'
                    ).length
                });

                console.log('✅ Estadísticas calculadas:', {
                    total: solicitudesListado.length,
                    pendientes: solicitudesListado.filter((s: any) => s.estadoSolicitud?.toLowerCase() === 'pendiente').length
                });

            } catch (error) {
                console.error('Error al cargar estadisticas de solicitudes:', error);
                setSolicitudesStats({ total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 });
            } finally {
                setLoadingSolicitudes(false);
            }
        };

        fetchSolicitudes();
    }, [selectedEmployee?.id, user?.id, currentPeriod, isDelegadoSindical]);

    // Calcular estadisticas de vacaciones
    const vacacionesStats = useMemo(() => {
        if (!vacacionesData) {
            return {
                diasPorProgramar: 0,
                diasAsignados: 0,
                automaticas: 0,
                anualesYReprogramacion: 0
            };
        }

        const automaticas = vacacionesData.vacaciones.filter(v => v.tipoVacacion === "Automatica").length;
        const anualesYReprogramacion = vacacionesData.vacaciones.filter(v =>
            v.tipoVacacion === "Anual" || v.tipoVacacion === "Reprogramacion"
        ).length;

        return {
            diasPorProgramar: (vacacionesData.resumen?.diasProgramables || 0) - (vacacionesData.resumen?.anuales || 0),
            diasAsignados: vacacionesData.vacaciones.length,
            automaticas,
            anualesYReprogramacion
        };
    }, [vacacionesData, selectedEmployee?.id]);

    // Cargar configuración de edición de días empresa
    useEffect(() => {
        edicionDiasEmpresaService.obtenerConfiguracion()
            .then(cfg => setConfigEdicion(cfg))
            .catch(() => {});
    }, []);

    const goToRequestCalendar = () => {
        navigate("/empleados/solicitar-vacaciones");
    };

    const goToMyVacations = () => {
        const targetId = selectedEmployee?.id || user?.id;
        const query = targetId ? `?empleadoId=${targetId}` : '';
        navigate(`/empleados/mis-vacaciones${query}`);
    };

    const goToMyRequests = () => {
        navigate("/empleados/mis-solicitudes");
    };

    const goToPlantilla = () => {
        navigate("/empleados/plantilla");
    };

    const goToWeeklyRoles = () => {
        navigate("/empleados/roles-semanales");
    };

    // Fecha de finalización del turno actual (ejemplo: en 2 días)
    const turnEndDate = new Date();
    turnEndDate.setDate(turnEndDate.getDate() + 2);
    turnEndDate.setHours(17, 0, 0, 0); // 5:00 PM

    return (
        <div className="flex flex-col min-h-screen w-full bg-white p-12 max-w-[2000px] mx-auto">
            <header className="flex justify-between">
                <div className="flex flex-col min-w-[200px]">
                    {
                        currentPeriod === PeriodOptions.annual || currentPeriod === PeriodOptions.closed ? (
                            <>
                                <h1 className="text-2xl font-bold  text-slate-800">
                                    Bienvenido, {user?.fullName.split(" ")[0].toUpperCase()}
                                </h1>
                                <p className="text-slate-600">Gestiona tus vacaciones aquí</p>
                            </>
                        ) : (
                            <EmployeeSelector
                                currentUser={user as unknown as UsuarioInfoDto}
                                selectedEmployee={selectedEmployee}
                                onSelectEmployee={(employee) => {
                                    setSelectedEmployee(employee);
                                    // Guardar en localStorage para persistencia
                                    if (employee?.id) {
                                        localStorage.setItem('selectedEmployee', JSON.stringify(employee));
                                    } else {
                                        localStorage.removeItem('selectedEmployee');
                                    }
                                }}
                                isDelegadoSindical={isDelegadoSindical}
                            />
                        )
                    }
                </div>
                <div>
                    <PeriodLight currenPeriod={currentPeriod} />
                </div>
                <NavbarUser />
            </header>

            {canManageReprogramming && (
                <div className="mt-6 rounded-lg border border-continental-blue-dark/20 bg-continental-blue-dark/10 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold uppercase tracking-wide text-continental-blue-dark">Panel Comite Sindical</span>
                        <Badge variant="outline" className="border-continental-blue-dark/40 text-continental-blue-dark">
                            Reprogramacion activa
                        </Badge>
                        <Badge variant="outline" className="border-emerald-400 text-emerald-700">
                            Delegado sindical
                        </Badge>
                    </div>
                    <p className="mt-2 text-sm text-continental-blue-dark">
                        Iniciaste como comite para apoyar solicitudes de reprogramacion de tus companeros sindicalizados mientras el periodo este activo.
                    </p>
                </div>
            )}


            {currentPeriod === PeriodOptions.annual ? (
                <div className="mt-8">
                    <Info
                        nomina={user?.username || ""}
                        nombre={user?.fullName || ""}
                        area={user?.area?.nombreGeneral.toString() || ""}
                        grupo={user?.grupo?.rol.toString() || ""}
                    />
                </div>
            ) : currentPeriod === PeriodOptions.reprogramming ? (
                <div className="mt-8">
                    <Notifications selectedEmployee={selectedEmployee.fullName ? selectedEmployee : user as unknown as UsuarioInfoDto} />
                </div>
            ) : null}
            <div className="mt-8 flex gap-4 justify-between h-full">
                {currentPeriod === PeriodOptions.annual ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full p-8 border border-continental-yellow bg-continental-yellow rounded-lg shadow-lg hover:shadow-xl transition-shadow">
                        <Calendar size={50} />
                        <h1 className="text-2xl font-bold">Solicitar vacaciones</h1>
                        <div className="flex items-center gap-2 flex-col">
                            <span className="text-3xl font-bold">{loadingVacaciones ? "..." : vacacionesStats.diasPorProgramar}</span>
                            <span className="text-sm">Días por programar</span>
                        </div>
                        {
                            !loadingVacaciones && (vacacionesStats.diasPorProgramar || 0) > 0 ? <Button className="cursor-pointer " onClick={goToRequestCalendar}>
                                Programar
                            </Button> : null
                        }
                    </div>
                ) : currentPeriod === PeriodOptions.reprogramming ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full p-8 border border-continental-blue-dark bg-continental-blue-dark/20 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
                        <Calendar size={50} />
                        <h1 className="text-2xl font-bold">
                            {isDelegadoSindical
                                ? "Reprogramaciones que solicitaste"
                                : selectedEmployee.fullName
                                    ? `Solicitudes de ${selectedEmployee.fullName}`
                                    : "Mis solicitudes"}
                        </h1>
                        <div className="text-sm text-center text-slate-700 max-w-md">
                            {isDelegadoSindical
                                ? 'Visualiza y da seguimiento a las reprogramaciones que has generado para tus companeros sindicalizados.'
                                : 'Consulta y da seguimiento a tus solicitudes de reprogramacion.'}
                        </div>
                        <div className="flex items-center gap-2 flex-col">
                            <span className="text-3xl font-bold">
                                {loadingSolicitudes ? "..." : solicitudesStats.pendientes}
                            </span>
                            <span className="text-sm">
                                {solicitudesStats.pendientes === 1 ? 'Solicitud' : 'Solicitudes'}
                            </span>
                        </div>
                        {!loadingSolicitudes && solicitudesStats.total > 0 && (
                            <div className="text-center">
                                <div className="flex gap-3 text-xs">
                                    {solicitudesStats.pendientes > 0 && (
                                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                                            {solicitudesStats.pendientes} Pendiente{solicitudesStats.pendientes > 1 ? 's' : ''}
                                        </span>
                                    )}
                                    {/*{solicitudesStats.aprobadas > 0 && (*/}
                                    {/*    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">*/}
                                    {/*        {solicitudesStats.aprobadas} Aprobada{solicitudesStats.aprobadas > 1 ? 's' : ''}*/}
                                    {/*    </span>*/}
                                    {/*)}*/}
                                    {solicitudesStats.rechazadas > 0 && (
                                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full">
                                            {solicitudesStats.rechazadas} Rechazada{solicitudesStats.rechazadas > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        {!loadingSolicitudes && solicitudesStats.total === 0 && (
                            <p className="text-xs text-gray-600">No hay solicitudes registradas</p>
                        )}
                        <div className="flex gap-2 w-full justify-center">
                                {isDelegadoSindical && (
                                    <>
                                        <Button
                                            className="cursor-pointer"
                                            onClick={goToMyVacations}
                                            disabled={!canManageReprogramming}
                                        >
                                            Solicitar reprogramacion
                                        </Button>

                                        {/* ✅ AGREGAR ESTE BOTÓN AQUÍ */}
                                        <Button
                                            variant="continental"
                                            className="cursor-pointer"
                                            onClick={() => setShowPermutaModal(true)}
                                        >
                                            <Users className="mr-2 h-4 w-4" />
                                            Permuta de Turno
                                        </Button>
                                    </>
                                )}
                                <Button
                                    className="cursor-pointer"
                                    variant="continentalOutline"
                                    onClick={goToMyRequests}
                                    disabled={loadingSolicitudes}
                                >
                                    {solicitudesStats.pendientes > 0 ? (
                                        <span className="flex items-center gap-2">
                                            Ver historial
                                            <span className="px-2 py-0.5 bg-yellow-500 text-white rounded-full text-xs font-semibold">
                                                {solicitudesStats.pendientes}
                                            </span>
                                        </span>
                                    ) : (
                                        'Ver historial'
                                    )}
                                </Button>
                                <Button
                                    variant="continentalOutline"
                                    className="cursor-pointer"
                                    onClick={() => navigate("mis-permutas")}
                                >
                                    Ver Permutas Registradas
                                </Button>
                        </div>
                        {isDelegadoSindical && (
                            <p className="text-xs text-slate-600 text-center">
                                Selecciona un empleado sindicalizado en el buscador superior y abre su calendario para mover el dia elegido.
                            </p>
                        )}
                    </div>
                ) : null}
                <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full p-8 border border-continental-yellow bg-continental-white rounded-lg shadow-lg hover:shadow-xl transition-shadow">
                    <CalendarClock size={50} />
                    <h1 className="text-2xl font-bold">{selectedEmployee.fullName ? `Calendario de ${selectedEmployee.fullName}` : "Mi Calendario"}</h1>
                    <div className="flex items-center gap-2 flex-col">
                        <span className="text-3xl font-bold">{loadingVacaciones ? "..." : vacacionesStats.diasAsignados}</span>
                        <div className="text-center">
                            <span className="text-sm block">Días Asignados</span>
                            {!loadingVacaciones && vacacionesStats.diasAsignados > 0 && (
                                <div className="text-xs text-gray-600 mt-1">
                                    <span className="block">Automáticas: {vacacionesStats.automaticas}</span>
                                    <span className="block">Anuales/Reprog.: {vacacionesStats.anualesYReprogramacion}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="continental"
                        className="cursor-pointer "
                        onClick={goToMyVacations}
                    >
                        Consultar
                    </Button>
                </div>
                {
                    isUnionRepresentative && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full p-8 border border-continental-yellow bg-continental-white rounded-lg shadow-lg hover:shadow-xl transition-shadow">
                            <Users2 size={50} />
                            <h1 className="text-2xl font-bold">Calendario general</h1>
                            <div className="flex flex-col gap-2 w-full items-center">
                                <Button
                                    variant="continental"
                                    className="cursor-pointer w-full"
                                    onClick={goToPlantilla}
                                >
                                    Ver calendario general
                                </Button>
                                <Button
                                    variant="continentalOutline"
                                    className="cursor-pointer w-full"
                                    onClick={goToWeeklyRoles}
                                >
                                    Roles semanales
                                </Button>
                            </div>
                        </div>
                    )
                }
            </div>
            {/* Tarjeta de edición de días empresa (cuando está habilitado) */}
            {configEdicion?.habilitado && (
                <div className="mt-4 flex gap-4">
                    <div className="flex-1 flex items-center gap-4 p-5 border border-green-300 bg-green-50 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <CalendarDays size={24} className="text-green-700" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-green-800">Edición de días asignados por empresa</h3>
                            <p className="text-xs text-green-700 mt-0.5">
                                Puedes solicitar cambiar tus días asignados al período{' '}
                                {configEdicion.fechaInicioPeriodo.slice(5).split('-').reverse().join('/')}
                                {' – '}
                                {configEdicion.fechaFinPeriodo.slice(5).split('-').reverse().join('/')}.
                            </p>
                        </div>
                        <Button
                            className="cursor-pointer bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
                            onClick={() => navigate('/empleados/edicion-dias-empresa')}
                        >
                            Solicitar
                        </Button>
                    </div>
                </div>
            )}

            <PermutaModal
                show={showPermutaModal}
                onClose={() => setShowPermutaModal(false)}
                empleadoOrigen={selectedEmployee}
                solicitadoPorId={user?.id || 0}
            />
        </div>
    );
};

export default EmployeeHome;