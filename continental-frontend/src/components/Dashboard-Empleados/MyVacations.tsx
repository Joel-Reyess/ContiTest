import { NavbarUser } from "../ui/navbar-user";
import Calendar from "../Calendar/Calendar";
import { fallbackAssignedDays } from "./RequestVacations";
import { Summary } from "./RequestVacations";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus2, ChevronLeft, Download, Key, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PeriodOptions, type Period } from "@/interfaces/Calendar.interface";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import { getVacacionesAsignadasPorEmpleado } from "@/services/vacacionesService";
import { ReprogramacionService } from "@/services/reprogramacionService";
import { festivosTrabajadosService, type FestivoTrabajado } from "@/services/festivosTrabajadosService";
import { validarFestivoParaSolicitud, validarFechaDeUso, calcularFechaMaximaUso } from "@/utils/festivosTrabajadosValidation";
import type { VacacionesAsignadasResponse, VacacionAsignada } from "@/interfaces/Api.interface";
import { useSearchParams } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { VacacionesEmpleadoPDFDownloadLink } from "../PDF/VacacionesEmpleadoPDF";
import type { User } from "@/interfaces/User.interface";
import { downloadConstanciaEmpleadoActualPDF } from '@/services/pdfService';
import { Eye } from "lucide-react";
import { generateConstanciaAntiguedadPDFBlob } from '@/services/pdfService';
import { UserRole } from "@/interfaces/User.interface";
import { ChangePasswordModal } from "@/components/Empleado/ChangePasswordModal";
import { SolicitarPermisoModal } from "./SolicitarPermisoModal";

const MyVacations = ({ currentPeriod }: { currentPeriod: Period }) => {
    const [searchParams] = useSearchParams();
    const employeeId = searchParams.get('empleadoId');
    const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
    const { user } = useAuth();
    const { config } = useVacationConfig();
    const anioVigente = config?.anioVigente;
    const [showEditModal, setShowEditModal] = useState(false)
    const [showRequestModal, setShowRequestModal] = useState(false)
    const [selectedDay, setSelectedDay] = useState<string | null>(null)
    const [selectedVacation, setSelectedVacation] = useState<VacacionAsignada | null>(null)
    const [realAssignedDays, setRealAssignedDays] = useState<{ date: string }[]>([]);
    const [vacacionesData, setVacacionesData] = useState<VacacionesAsignadasResponse | null>(null);
    const [loadingVacations, setLoadingVacations] = useState(true);
    const [selectedDays, setSelectedDays] = useState<{ date: string }[]>([]);
    const [workedHoliday, setWorkedHoliday] = useState<{ date: string }[]>([]);
    const [selectedEmployee, setselectedEmployee] = useState<User | null>(null);
    const [showConstanciaModal, setShowConstanciaModal] = useState(false);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
    const [showSolicitarPermisoModal, setShowSolicitarPermisoModal] = useState(false);
    const navigate = useNavigate();

    const isDelegadoSindical = Boolean(
        (user?.roles || []).some(role => (typeof role === 'string' ? role === UserRole.UNION_REPRESENTATIVE : role.name === UserRole.UNION_REPRESENTATIVE)) ||
        (user as any)?.isUnionCommittee ||
        user?.area?.nombreGeneral === 'Sindicato'
    );
    const canChangePassword =
        isDelegadoSindical &&
        (user?.id === (employeeId !== 'undefined' && employeeId !== null ? parseInt(employeeId) : user?.id) ||
            user?.roles?.some(role =>
                (typeof role === 'string' ? role : role.name) === UserRole.SUPER_ADMIN
            ));
    const handleEdit = (day: string) => {
        // Buscar la vacaciÃ³n correspondiente al dÃ­a seleccionado
        const vacation = vacacionesData?.vacaciones.find(v => {
            // Convertir ambas fechas al mismo formato para comparar
            const vacationDate = new Date(v.fechaVacacion + 'T00:00:00').toDateString();
            const dayDate = new Date(day + 'T00:00:00').toDateString();
            return vacationDate === dayDate;
        });

        if (vacation) {
            setSelectedVacation(vacation);
            setSelectedDay(day);
            setShowEditModal(true);
        } else {
            toast.error("No se encontrÃ³ informaciÃ³n de la vacaciÃ³n");
        }
    }

    const handleRequestFestiveWorked = () => {
        setShowRequestModal(true)
    }

    const handleViewConstancia = () => {
        setShowConstanciaModal(true);
    };

    const handleDownloadConstancia = async () => {
        if (!user || !vacacionesData) {
            toast.error('No hay datos disponibles para generar el reporte');
            return;
        }

        try {
            console.log('ðŸ“Š Datos para PDF:', {
                user: user.username,
                selectedDays: selectedDays.length,
                realAssignedDays: realAssignedDays.length,
                vacaciones: vacacionesData.vacaciones.length
            });

            await downloadConstanciaEmpleadoActualPDF(
                {
                    nomina: user.username,
                    nombre: selectedEmployee?.fullName || user.fullName || '',
                    fechaIngreso: user.fechaIngreso || '',
                    area: user.area?.nombreGeneral || '',
                    grupo: user.grupo?.rol || ''
                },
                {
                    diasSeleccionados: selectedDays,
                    diasAsignados: realAssignedDays,
                    vacaciones: vacacionesData.vacaciones
                },
                anioVigente || new Date().getFullYear()
            );
            toast.success('PDF generado exitosamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Error al generar el PDF de constancia');
        }
    };
    const handlePasswordChanged = () => {
        toast.success("Contraseña actualizada correctamente");
    };

    // Cargar vacaciones reales del empleado al montar el componente
    useEffect(() => {
        const fetchVacaciones = async () => {
            if (!user?.id) return;

            console.log({ employeeId })
            const id = employeeId !== 'undefined' && employeeId !== null ? parseInt(employeeId) : user.id;
            console.log({ id })

            const selectedEmployeeLocalStorage = localStorage.getItem('selectedEmployee');
            setselectedEmployee(JSON.parse(selectedEmployeeLocalStorage || '{}'));

            setLoadingVacations(true);
            try {
                const resp = await getVacacionesAsignadasPorEmpleado(id);
                setVacacionesData(resp);

                // Separar vacaciones por tipo
                const automaticas = resp.vacaciones
                    .filter(v => v.tipoVacacion === "Automatica" && v.estadoVacacion === "Activa")
                    .map(v => ({ date: v.fechaVacacion }));
                const festivosTrabajados = resp.vacaciones
                    .filter(v => v.tipoVacacion === "FestivoTrabajado" && v.estadoVacacion === "Activa")
                    .map(v => ({ date: v.fechaVacacion }));
                const reprogramacionesYAnuales = resp.vacaciones
                    .filter(v =>
                        (v.tipoVacacion === "Reprogramacion" || v.tipoVacacion === "Anual") &&
                        v.estadoVacacion === "Activa"
                    )
                    .map(v => ({ date: v.fechaVacacion }));
                console.log('ðŸ“… Vacaciones automÃ¡ticas:', automaticas);
                console.log('ðŸŽ‰ Festivos trabajados:', festivosTrabajados);
                console.log('ðŸ”„ Reprogramaciones y anuales:', reprogramacionesYAnuales);

                setRealAssignedDays(automaticas);
                setWorkedHoliday(festivosTrabajados);
                setSelectedDays(reprogramacionesYAnuales);
                console.log('📊 Todas las vacaciones:', resp.vacaciones);
                console.log('🎉 Festivos trabajados filtrados:', festivosTrabajados);
                console.log('📅 Tipos de vacación únicos:', [...new Set(resp.vacaciones.map(v => v.tipoVacacion))]);

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

    // Mostrar loading mientras se cargan las vacaciones
    if (loadingVacations) {
        return (
            <div className="flex flex-col min-h-screen w-full bg-white p-12">
                <header className="flex justify-between items-center pb-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(-1)}>
                            <ChevronLeft /> Regresar
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">
                            Mi Calendario
                        </h1>
                        <p className="text-slate-600">
                            Revisa tu calendario programado y reprograma tus vacaciones.
                        </p>
                    </div>
                    <NavbarUser />
                </header>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Cargando vacaciones...</p>
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
                        Mi Calendario
                    </h1>
                    <p className="text-slate-600">Revisa tu calendario programado y reprograma tus vacaciones.</p>
                </div>
                <NavbarUser />

            </header>
            <div className="flex gap-8 justify-between">
                <div className="flex-2">
                    <Calendar
                        selectedDays={selectedDays}
                        month={currentMonth}
                        onMonthChange={setCurrentMonth}
                        isViewMode
                        groupId={user?.grupo?.grupoId}
                        userId={employeeId !== 'undefined' && employeeId !== null ? parseInt(employeeId) : user?.id}
                        key={currentPeriod}
                    />

                </div>
                <div className="flex-1 flex flex-col ">
                    {/* âœ… BotÃ³n condicional: Descargar para delegados, Ver para otros */}
                    {canChangePassword && (
                        <>
                            <Button
                                variant="continental"
                                className="cursor-pointer w-fit my-2"
                                size="lg"
                                onClick={handleDownloadConstancia}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                Constancia de Antiguedad
                            </Button>

                            <Button
                                variant="outline"
                                className="cursor-pointer w-fit my-2"
                                size="lg"
                                onClick={() => setShowChangePasswordModal(true)}
                            >
                                <Key className="mr-2 h-4 w-4" />
                                Restablecer Contraseña
                            </Button>
                        </>
                    )}

                    {!isDelegadoSindical && (
                        <Button
                            variant="continental"
                            className="cursor-pointer w-fit my-2"
                            size="lg"
                            onClick={handleViewConstancia}
                        >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver Constancia de Antiguedad
                        </Button>
                    )}
                    <VacacionesEmpleadoPDFDownloadLink
                        data={{
                            empleado: {
                                nombre: selectedEmployee?.fullName || '',
                                username: selectedEmployee?.username || '',
                                area: selectedEmployee?.area?.nombreGeneral || '',
                                grupo: user?.grupo?.rol
                            },
                            periodo: {
                                inicio: config?.periodoActual || '',
                            },
                            diasSeleccionados: selectedDays,
                            diasAsignados: realAssignedDays,
                        }}
                        className="w-fit my-2"
                    >
                        <Button variant="continentalOutline" className="cursor-pointer" size="lg">
                            <Download className="mr-2 h-4 w-4" />
                            Descargar
                        </Button>
                    </VacacionesEmpleadoPDFDownloadLink>
                    <Summary
                        assignedDays={realAssignedDays}
                        workedHoliday={workedHoliday}
                        availableDays={selectedDays.length}
                        selectedDays={selectedDays}
                        handleEdit={handleEdit}
                        isViewMode
                        period={currentPeriod}
                        isDelegadoSindicato={isDelegadoSindical}
                    />
                    {
                        currentPeriod === PeriodOptions.reprogramming && isDelegadoSindical && (
                            <Button variant="continental" className="w-full cursor-pointer" size="lg" onClick={handleRequestFestiveWorked}>
                                <CalendarPlus2 className="mr-2 h-4 w-4" />
                                Solicitar Festivo Trabajado
                            </Button>
                        )
                    }
                    {isDelegadoSindical && (
                        <Button
                            variant="outline"
                            className="w-full cursor-pointer border-purple-300 text-purple-700 hover:bg-purple-50"
                            size="lg"
                            onClick={() => setShowSolicitarPermisoModal(true)}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            Solicitar Permiso/Incapacidad
                        </Button>
                    )}
                </div>
            </div>
            <EditModal
                show={showEditModal}
                onClose={() => {
                    setShowEditModal(false);
                    setSelectedVacation(null);
                    setSelectedDay(null);
                }}
                selectedDay={selectedDay || ""}
                selectedVacation={selectedVacation}
                employeeId={parseInt(employeeId || user?.id?.toString() || "0")}
                anioVigente={anioVigente || new Date().getFullYear()}
            />
            <RequestModal
                anioVigente={anioVigente || new Date().getFullYear() + 1}
                show={showRequestModal}
                onClose={() => setShowRequestModal(false)}
                empleadoId={employeeId !== 'undefined' && employeeId !== null ? parseInt(employeeId) : user?.id}
                empleadoNombre={selectedEmployee?.fullName || user?.fullName}
            />
            <ChangePasswordModal
                show={showChangePasswordModal}
                onClose={() => setShowChangePasswordModal(false)}
                userId={employeeId !== 'undefined' && employeeId !== null ? parseInt(employeeId) : user?.id}
                userName={selectedEmployee?.fullName || user?.fullName || ''}
                onPasswordChanged={handlePasswordChanged}
            />
            <ConstanciaModal
                show={showConstanciaModal}
                onClose={() => setShowConstanciaModal(false)}
                empleadoData={{
                    nomina: user?.username || '',
                    nombre: selectedEmployee?.fullName || user?.fullName || '',
                    fechaIngreso: user?.fechaIngreso || '',
                    area: user?.area?.nombreGeneral || '',
                    grupo: user?.grupo?.rol || ''
                }}
                vacacionesData={{
                    diasSeleccionados: selectedDays,
                    diasAsignados: realAssignedDays,
                    vacaciones: vacacionesData?.vacaciones || []
                }}
                anioVigente={anioVigente || new Date().getFullYear()}
            />
            <SolicitarPermisoModal
                show={showSolicitarPermisoModal}
                onClose={() => setShowSolicitarPermisoModal(false)}
                nomina={parseInt((selectedEmployee?.username || user?.username) || "0")}
                nombreEmpleado={selectedEmployee?.fullName || user?.fullName || ''}
                onSolicitudCreada={() => {
                    toast.success("Solicitud enviada exitosamente. Pendiente de aprobación por el Jefe de Área.");
                }}
            />
        </div>
    );
}



export default MyVacations
const ConstanciaModal = ({
    show,
    onClose,
    empleadoData,
    vacacionesData,
    anioVigente
}: {
    show: boolean;
    onClose: () => void;
    empleadoData: {
        nomina: string;
        nombre: string;
        fechaIngreso: string;
        area?: string;
        grupo?: string;
    };
    vacacionesData: {
        diasSeleccionados: Array<{ date: string }>;
        diasAsignados: Array<{ date: string }>;
        vacaciones: Array<{
            fechaVacacion: string;
            tipoVacacion: string;
        }>;
    };
    anioVigente: number;
}) => {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const generatePDF = async () => {
            if (!show) return;

            setLoading(true);
            try {
                const blob = await generateConstanciaAntiguedadPDFBlob(
                    empleadoData,
                    vacacionesData,
                    anioVigente
                );
                const url = URL.createObjectURL(blob);
                setPdfUrl(url);
            } catch (error) {
                console.error('Error generating PDF preview:', error);
                toast.error('Error al generar la vista previa del PDF');
            } finally {
                setLoading(false);
            }
        };

        generatePDF();

        // Cleanup
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [show]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="fixed inset-0 -z-10" onClick={onClose} />
            <div className="relative z-50 w-full max-w-5xl h-[90vh] p-4">
                <div className="bg-white rounded-lg shadow-lg h-full flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="text-lg font-semibold">Constancia de AntigÃ¼edad</h2>
                        <Button variant="outline" onClick={onClose}>
                            Cerrar
                        </Button>
                    </div>
                    <div className="flex-1 p-4 overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                    <p className="text-gray-600">Generando vista previa...</p>
                                </div>
                            </div>
                        ) : pdfUrl ? (
                            <iframe
                                src={pdfUrl}
                                className="w-full h-full border-0 rounded"
                                title="Constancia de AntigÃ¼edad"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-gray-600">Error al cargar el documento</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const EditModal = ({
    show,
    onClose,
    selectedDay,
    selectedVacation,
    employeeId,
    anioVigente
}: {
    show: boolean;
    onClose: () => void;
    selectedDay: string;
    selectedVacation: VacacionAsignada | null;
    employeeId: number;
    anioVigente: number;
}) => {
    const [nuevaFecha, setNuevaFecha] = useState<string>('');
    const [motivo, setMotivo] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const onSubmit = async () => {
        if (!selectedVacation) {
            toast.error("No se encontrÃ³ informaciÃ³n de la vacaciÃ³n");
            return;
        }

        if (!nuevaFecha) {
            toast.error("Por favor selecciona una nueva fecha");
            return;
        }

        setLoading(true);

        try {
            const request = {
                empleadoId: employeeId,
                vacacionOriginalId: selectedVacation.id,
                fechaNueva: nuevaFecha,
                motivo: motivo.trim() || "Solicitud de cambio de vacación"
            };

            await ReprogramacionService.solicitarReprogramacion(request);

            // Siempre se requiere aprobacion del Jefe de Area
            toast.info("Solicitud enviada exitosamente", {
                description: "Tu solicitud esta en proceso de aprobacion por el Jefe de Area"
            });

            onClose();
        } catch (error: any) {
            console.error('Error al solicitar reprogramaciÃ³n:', error);
            toast.error(error.message || "Error al procesar la solicitud");
        } finally {
            setLoading(false);
        }
    }

    const onCancel = () => {
        setNuevaFecha('');
        setMotivo('');
        onClose();
    }

    // Verificar si es vacaciÃ³n automÃ¡tica
    const isAutomatica = selectedVacation?.tipoVacacion === 'Automatica';

    // Limpiar estados cuando se cierra el modal
    useEffect(() => {
        if (!show) {
            setNuevaFecha('');
            setMotivo('');
        }
    }, [show]);

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${show ? "block" : "hidden"
                }`}
        >
            <div className="fixed inset-0   -z-10" onClick={onClose} />
            <div className="relative z-50 w-full max-w-lg p-4">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-4">
                        <h2 className="text-lg font-semibold mb-2">Reprogramar Vacaciones</h2>

                        {isAutomatica && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-sm text-yellow-800">
                                    âš ï¸ Esta es una vacaciÃ³n automÃ¡tica y no puede ser reprogramada
                                </p>
                            </div>
                        )}

                        {!isAutomatica && selectedVacation?.tipoVacacion === 'FestivoTrabajado' && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm text-blue-800">
                                    â„¹ï¸ Este es un dÃ­a de festivo trabajado que serÃ¡ reprogramado
                                </p>
                            </div>
                        )}

                        <p className="text-sm text-gray-600 mb-4">
                            Selecciona un nuevo día para reprogramar tu vacación.
                        </p>

                        {selectedDay && (
                            <div className="mb-4 flex items-center gap-2">
                                <span className="text-base text-gray-600">Día actual:</span>
                                <p className="text-base text-gray-800 font-medium ">
                                    {format(new Date(selectedDay + 'T00:00:00'), "d 'de' MMMM 'de' yyyy", { locale: es })}
                                </p>
                            </div>
                        )}

                        <div className="mb-4 flex flex-col gap-2">
                            <label className="block text-sm font-medium text-gray-700" htmlFor="date">
                                Nueva Fecha *
                            </label>
                            <Input
                                type="date"
                                //restringir solo de primero del anio vigente a ultimo dia del anio vigente
                                min={new Date(anioVigente, 0, 1).toISOString().split('T')[0]}
                                max={new Date(anioVigente, 11, 31).toISOString().split('T')[0]}
                                value={nuevaFecha}
                                onChange={(e) => setNuevaFecha(e.target.value)}
                                disabled={loading || isAutomatica}
                            />
                        </div>

                        <div className="mb-4 flex flex-col gap-2">
                            <label className="block text-sm font-medium text-gray-700" htmlFor="motivo">
                                Motivo (opcional)
                            </label>
                            <Textarea
                                id="motivo"
                                placeholder="Describe el motivo del cambio..."
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                disabled={loading || isAutomatica}
                                rows={3}
                                className="resize-none"
                            />
                        </div>

                    </div>
                    <div className="p-4 flex justify-end gap-2">
                        <Button
                            className="cursor-pointer"
                            variant="outline"
                            size="lg"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="cursor-pointer"
                            variant="continental"
                            size="lg"
                            onClick={onSubmit}
                            disabled={loading || isAutomatica || !nuevaFecha}
                        >
                            {loading ? "Procesando..." : "Solicitar"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
export const RequestModal = ({
    show,
    onClose,
    empleadoId,
    anioVigente,
    empleadoNombre
}: {
    show: boolean;
    onClose: () => void;
    empleadoId?: number;
    anioVigente: number;
    empleadoNombre?: string;
}) => {
    const [festivosDisponibles, setFestivosDisponibles] = useState<FestivoTrabajado[]>([]);
    const [selectedFestivo, setSelectedFestivo] = useState<number | null>(null);
    const [fechaNueva, setFechaNueva] = useState('');
    const [motivo, setMotivo] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingFestivos, setLoadingFestivos] = useState(false);
    const [validationAlert, setValidationAlert] = useState<string | null>(null);
    const [validationWarning, setValidationWarning] = useState<string | null>(null);
    const [fechaUsoError, setFechaUsoError] = useState<string | null>(null);
    const [festivoExpired, setFestivoExpired] = useState(false);

    // Validar festivo seleccionado
    const selectedFestivoData = selectedFestivo
        ? festivosDisponibles.find(x => x.id === selectedFestivo)
        : null;

    const fechaMaxima = (() => {
        if (!selectedFestivoData) return new Date(anioVigente + 2, 11, 31).toISOString().split('T')[0];
        return calcularFechaMaximaUso(selectedFestivoData.festivoTrabajado);
    })();

    // Validar cuando se selecciona un festivo
    const handleFestivoChange = (festivoId: number | null) => {
        setSelectedFestivo(festivoId);
        setValidationAlert(null);
        setValidationWarning(null);
        setFechaUsoError(null);
        setFestivoExpired(false);
        setFechaNueva('');

        if (!festivoId) return;

        const festivo = festivosDisponibles.find(x => x.id === festivoId);
        if (!festivo) return;

        const validation = validarFestivoParaSolicitud(festivo.festivoTrabajado);

        if (validation.isExpired) {
            setValidationAlert(validation.alertMessage || null);
            setFestivoExpired(true);
        } else if (validation.isCloseToDeadline) {
            setValidationWarning(validation.warningMessage || null);
        }
    };

    // Validar cuando se selecciona fecha de uso
    const handleFechaChange = (fecha: string) => {
        setFechaNueva(fecha);
        setFechaUsoError(null);

        if (!fecha || !selectedFestivoData) return;

        const usoValidation = validarFechaDeUso(
            selectedFestivoData.festivoTrabajado,
            fecha
        );

        if (!usoValidation.isValid) {
            setFechaUsoError(usoValidation.message || null);
        }
    };

    // Cargar festivos disponibles cuando se abre el modal
    useEffect(() => {
        const loadFestivos = async () => {
            if (!show || !empleadoId) return;
            setLoadingFestivos(true);
            try {
                const response = await festivosTrabajadosService.getFestivosDisponibles(
                    empleadoId,
                    undefined,
                    anioVigente,
                    true // Solo disponibles
                );
                setFestivosDisponibles(response.festivos);

                if (response.festivosDisponibles === 0) {
                    toast.warning('No tienes festivos trabajados disponibles para intercambiar');
                }
            } catch (error) {
                console.error('Error loading festivos:', error);
                toast.error('Error al cargar festivos disponibles');
            } finally {
                setLoadingFestivos(false);
            }
        };

        loadFestivos();
    }, [show, empleadoId]);

    const onSubmit = async () => {
        if (!selectedFestivo || !fechaNueva || !empleadoId) {
            toast.error('Por favor completa todos los campos');
            return;
        }

        if (festivoExpired) {
            toast.error('Este festivo trabajado ya expiró y no puede ser solicitado.');
            return;
        }

        if (fechaUsoError) {
            toast.error('La fecha de uso seleccionada no es válida.');
            return;
        }

        setLoading(true);
        try {
            await festivosTrabajadosService.intercambiarFestivo({
                empleadoId,
                festivoTrabajadoId: selectedFestivo,
                fechaNueva,
                motivo: motivo || 'Solicitud de intercambio de festivo trabajado'
            });

            toast.success('Solicitud de festivo trabajado enviada exitosamente');
            onClose();

            // Limpiar formulario
            setSelectedFestivo(null);
            setFechaNueva('');
            setMotivo('');
            setValidationAlert(null);
            setValidationWarning(null);
            setFechaUsoError(null);
            setFestivoExpired(false);
        } catch (error: any) {
            console.error('Error submitting request:', error);
            toast.error(error.message || 'Error al enviar la solicitud');
        } finally {
            setLoading(false);
        }
    };

    const onCancel = () => {
        setSelectedFestivo(null);
        setFechaNueva('');
        setMotivo('');
        setValidationAlert(null);
        setValidationWarning(null);
        setFechaUsoError(null);
        setFestivoExpired(false);
        onClose();
    };

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${show ? "block" : "hidden"
                }`}
        >
            <div className="fixed inset-0 -z-10" onClick={onClose} />
            <div className="relative z-50 w-full max-w-lg p-4">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-6">
                        <h2 className="text-lg font-semibold mb-2">Solicitar Intercambio de Festivo Trabajado</h2>
                        {empleadoNombre && (
                            <p className="text-xs text-gray-700 mb-1">
                                Empleado seleccionado: <span className="font-semibold">{empleadoNombre}</span>
                            </p>
                        )}
                        <p className="text-sm text-gray-600 mb-4">
                            Selecciona un festivo trabajado disponible y la nueva fecha para intercambiarlo.
                        </p>

                        {loadingFestivos ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="text-gray-600">Cargando festivos disponibles...</div>
                            </div>
                        ) : festivosDisponibles.length === 0 ? (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                                <p className="text-yellow-800 text-sm">
                                    No tienes festivos trabajados disponibles para intercambiar en este momento.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="mb-4 flex flex-col gap-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Festivo Trabajado Disponible
                                    </label>
                                    <select
                                        value={selectedFestivo || ''}
                                        onChange={(e) => handleFestivoChange(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        disabled={loading}
                                    >
                                        <option value="">Selecciona un festivo trabajado</option>
                                        {festivosDisponibles.map((festivo) => {
                                            const fechaPartes = festivo.festivoTrabajado.split('-');
                                            const fecha = new Date(
                                                parseInt(fechaPartes[0]),
                                                parseInt(fechaPartes[1]) - 1,
                                                parseInt(fechaPartes[2])
                                            );

                                            return (
                                                <option key={festivo.id} value={festivo.id}>
                                                    {fecha.toLocaleDateString('es-MX', {
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                        timeZone: 'UTC'
                                                    })}
                                                    {' - '}
                                                    {festivo.nombreEmpleado}
                                                    {' ('}
                                                    {festivo.diaSemana}
                                                    {')'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {validationAlert && (
                                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm text-red-800">{validationAlert}</p>
                                    </div>
                                )}

                                {validationWarning && (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <p className="text-sm text-amber-800">{validationWarning}</p>
                                    </div>
                                )}

                                <div className="mb-4 flex flex-col gap-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Nueva Fecha de Vacación
                                    </label>
                                    <Input
                                        type="date"
                                        value={fechaNueva}
                                        onChange={(e) => handleFechaChange(e.target.value)}
                                        disabled={loading || festivoExpired}
                                        min={new Date(anioVigente, 0, 1).toISOString().split('T')[0]}
                                        max={fechaMaxima}
                                    />
                                    {fechaUsoError && (
                                        <p className="text-xs text-red-600 mt-1">{fechaUsoError}</p>
                                    )}
                                </div>

                                <div className="mb-4 flex flex-col gap-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Motivo (opcional)
                                    </label>
                                    <textarea
                                        value={motivo}
                                        onChange={(e) => setMotivo(e.target.value)}
                                        placeholder="Describe el motivo de tu solicitud..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        rows={3}
                                        disabled={loading || festivoExpired}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="p-4 flex justify-end gap-2 border-t">
                        <Button
                            className="cursor-pointer"
                            variant="outline"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="cursor-pointer"
                            variant="continental"
                            onClick={onSubmit}
                            disabled={loading || !selectedFestivo || !fechaNueva || festivosDisponibles.length === 0 || festivoExpired || !!fechaUsoError}
                        >
                            {loading ? 'Enviando...' : 'Solicitar Intercambio'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
