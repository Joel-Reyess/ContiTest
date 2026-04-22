import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { permutasService, type PermutaRequest } from "@/services/permutasService";
import { empleadosService } from "@/services/empleadosService";
import { rolesService } from "@/services/rolesService"; // ✅ IMPORT CORRECTO
import type { UsuarioInfoDto } from "@/interfaces/Api.interface";
import { Search, Users, ArrowLeftRight, RefreshCw, Info } from "lucide-react";

const TURNOS_DISPLAY = [
    { label: "Turno 1 (Primero)", value: "1" },
    { label: "Turno 2 (Segundo)", value: "2" },
    { label: "Turno 3 (Tercero)", value: "3" },
    { label: "Descanso", value: "D" }
];

const TURNOS_VALIDOS = ["1", "2", "3", "D"];

const formatTurnoLabel = (codigo: string) =>
    codigo === "D" ? "Descanso" : `Turno ${codigo}`;

interface PermutaModalProps {
    show: boolean;
    onClose: () => void;
    empleadoOrigen: UsuarioInfoDto;
    solicitadoPorId: number;
}

export const PermutaModal = ({
    show,
    onClose,
    empleadoOrigen,
    solicitadoPorId,
}: PermutaModalProps) => {
    const [empleadoDestino, setEmpleadoDestino] = useState<UsuarioInfoDto | null>(null);
    const [fechaPermuta, setFechaPermuta] = useState("");
    const [motivo, setMotivo] = useState("");
    const [turnoOrigen, setTurnoOrigen] = useState<string>("");
    const [turnoDestino, setTurnoDestino] = useState<string>("");
    const [turnoOrigenDetectado, setTurnoOrigenDetectado] = useState<string>("");
    const [turnoDestinoDetectado, setTurnoDestinoDetectado] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [empleadosDisponibles, setEmpleadosDisponibles] = useState<UsuarioInfoDto[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [esCambioIndividual, setEsCambioIndividual] = useState(false);
    const [loadingTurnos, setLoadingTurnos] = useState(false);

    // Buscar empleados del mismo área
    useEffect(() => {
        const fetchEmpleados = async () => {
            if (!showSearch || !empleadoOrigen.area?.areaId) return;

            try {
                const resp = await empleadosService.getEmpleadosSindicalizados({
                    AreaId: empleadoOrigen.area?.areaId,
                    PageSize: 100,
                });

                const filtered = resp.usuarios.filter(
                    (emp) => emp.id !== empleadoOrigen.id
                );
                setEmpleadosDisponibles(filtered);
            } catch (error) {
                console.error("Error cargando empleados:", error);
                toast.error("Error al cargar empleados disponibles");
            }
        };

        fetchEmpleados();
    }, [showSearch, empleadoOrigen]);

    /// ✅ AUTO-DETECTAR turnos cuando cambia la fecha O el empleado destino
    useEffect(() => {
        const detectarTurnos = async () => {
            console.log('🔍 Detectando turnos...', {
                fechaPermuta,
                grupoOrigenId: empleadoOrigen.grupo?.grupoId,
                grupoDestinoId: empleadoDestino?.grupo?.grupoId,
                empleadoOrigenId: empleadoOrigen.id,
                empleadoDestinoId: empleadoDestino?.id
            });

            if (!fechaPermuta || !empleadoOrigen.grupo?.grupoId) {
                setTurnoOrigenDetectado("");
                setTurnoDestinoDetectado("");
                return;
            }

            setLoadingTurnos(true);
            try {
                // ✅ Consultar roles del grupo del empleado ORIGEN
                const responseOrigen = await rolesService.getWeeklyRoles(
                    empleadoOrigen.grupo.grupoId,
                    fechaPermuta
                );

                console.log('📅 Respuesta roles grupo origen:', responseOrigen);
                console.log('📊 Total de entradas:', responseOrigen.semana?.length);

                // Turno del empleado origen
                const entryOrigen = responseOrigen.semana.find(
                    entry => entry.empleado.id === empleadoOrigen.id &&
                        entry.fecha === fechaPermuta
                );

                console.log('👤 Turno origen encontrado:', entryOrigen);

                if (entryOrigen?.codigoTurno && TURNOS_VALIDOS.includes(entryOrigen.codigoTurno)) {
                    setTurnoOrigenDetectado(entryOrigen.codigoTurno);
                    setTurnoOrigen(entryOrigen.codigoTurno);
                    console.log('✅ Turno origen asignado:', entryOrigen.codigoTurno);
                } else {
                    setTurnoOrigenDetectado("");
                    console.log('⚠️ Turno origen no válido o no encontrado');
                }

                // ✅ Turno del empleado DESTINO (puede estar en otro grupo)
                if (empleadoDestino) {
                    console.log('🔎 Buscando turno para empleado destino:', empleadoDestino.id);

                    let entryDestino = responseOrigen.semana.find(
                        entry => entry.empleado.id === empleadoDestino.id &&
                            entry.fecha === fechaPermuta
                    );

                    console.log('🔍 Búsqueda en grupo origen:', entryDestino ? 'ENCONTRADO' : 'NO ENCONTRADO');

                    // ✅ Si no se encuentra en el grupo origen, buscar en su propio grupo
                    if (!entryDestino && empleadoDestino.grupo?.grupoId &&
                        empleadoDestino.grupo.grupoId !== empleadoOrigen.grupo.grupoId) {

                        console.log('🔄 Buscando en grupo destino:', empleadoDestino.grupo.grupoId);

                        try {
                            const responseDestino = await rolesService.getWeeklyRoles(
                                empleadoDestino.grupo.grupoId,
                                fechaPermuta
                            );

                            entryDestino = responseDestino.semana.find(
                                entry => entry.empleado.id === empleadoDestino.id &&
                                    entry.fecha === fechaPermuta
                            );

                            console.log('🔍 Búsqueda en grupo destino:', entryDestino ? 'ENCONTRADO' : 'NO ENCONTRADO');
                        } catch (error) {
                            console.error('❌ Error consultando grupo destino:', error);
                        }
                    }

                    console.log('👥 Turno destino final:', entryDestino);

                    if (entryDestino?.codigoTurno && TURNOS_VALIDOS.includes(entryDestino.codigoTurno)) {
                        setTurnoDestinoDetectado(entryDestino.codigoTurno);
                        setTurnoDestino(entryDestino.codigoTurno);
                        console.log('✅ Turno destino asignado:', entryDestino.codigoTurno);
                    } else {
                        setTurnoDestinoDetectado("");
                        console.log('⚠️ Turno destino no válido o no encontrado');
                    }
                } else {
                    console.log('ℹ️ No hay empleado destino seleccionado aún');
                }
            } catch (error) {
                console.error('❌ Error detectando turnos:', error);
                setTurnoOrigenDetectado("");
                setTurnoDestinoDetectado("");
            } finally {
                setLoadingTurnos(false);
            }
        };

        detectarTurnos();
    }, [fechaPermuta, empleadoOrigen, empleadoDestino]);

    const empleadosFiltrados = empleadosDisponibles.filter((emp) => {
        const term = searchTerm.toLowerCase();
        return (
            emp.fullName.toLowerCase().includes(term) ||
            emp.nomina?.toString().includes(term) ||
            emp.username.toLowerCase().includes(term)
        );
    });

    const handleSubmit = async () => {
        if (!fechaPermuta || !motivo.trim() || !turnoOrigen) {
            toast.error("Por favor completa todos los campos obligatorios");
            return;
        }

        if (!esCambioIndividual && (!empleadoDestino || !turnoDestino)) {
            toast.error("Por favor selecciona el empleado destino y su turno");
            return;
        }

        setLoading(true);
        try {
            const payload: PermutaRequest = {
                empleadoOrigenId: empleadoOrigen.id,
                empleadoDestinoId: esCambioIndividual ? null : empleadoDestino!.id,
                fechaPermuta: (fechaPermuta),
                motivo: motivo.trim(),
                solicitadoPor: solicitadoPorId,
                turnoEmpleadoOrigen: turnoOrigen,
                turnoEmpleadoDestino: esCambioIndividual ? null : turnoDestino,
            };

            const response = await permutasService.solicitarPermuta(payload);

            if (response.exitoso) {
                toast.success(esCambioIndividual ? "Cambio de turno registrado" : "Permuta solicitada exitosamente", {
                    description: esCambioIndividual
                        ? `${empleadoOrigen.fullName} cambia a ${formatTurnoLabel(turnoOrigen)}`
                        : `${empleadoOrigen.fullName} (${formatTurnoLabel(turnoOrigen)}) ⇄ ${empleadoDestino!.fullName} (${formatTurnoLabel(turnoDestino)})`,
                });
                handleClose();
            } else {
                toast.error(response.mensaje || "Error al procesar la permuta");
            }
        } catch (error: any) {
            console.error("Error en permuta:", error);
            toast.error(error.message || "Error al solicitar la permuta");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setEmpleadoDestino(null);
        setFechaPermuta("");
        setMotivo("");
        setSearchTerm("");
        setShowSearch(false);
        setTurnoOrigen("");
        setTurnoDestino("");
        setTurnoOrigenDetectado("");
        setTurnoDestinoDetectado("");
        setEsCambioIndividual(false);
        onClose();
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="fixed inset-0 -z-10" onClick={handleClose} />
            <div className="relative z-50 w-full max-w-2xl p-4">
                <div className="bg-white rounded-lg shadow-lg max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                            Solicitar Permuta de Turno
                        </h2>

                        <div className="mb-4 flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                            <input
                                type="checkbox"
                                id="cambioIndividual"
                                checked={esCambioIndividual}
                                onChange={(e) => {
                                    setEsCambioIndividual(e.target.checked);
                                    if (e.target.checked) {
                                        setEmpleadoDestino(null);
                                        setTurnoDestino("");
                                        setTurnoDestinoDetectado("");
                                    }
                                }}
                                className="w-4 h-4"
                            />
                            <label htmlFor="cambioIndividual" className="text-sm font-medium text-gray-700 cursor-pointer">
                                Cambio individual (sin intercambio con otro empleado)
                            </label>
                        </div>

                        <p className="text-sm text-gray-600 mb-6">
                            Intercambia el turno entre dos empleados de la misma área
                        </p>

                        {/* Empleado Origen */}
                        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs font-medium text-blue-800 mb-1">Empleado Origen:</p>
                            <p className="text-sm font-semibold text-blue-900">{empleadoOrigen.fullName}</p>
                            <p className="text-xs text-blue-700">
                                Nómina: {empleadoOrigen.nomina} • Grupo: {empleadoOrigen.grupo?.rol}
                            </p>
                        </div>

                        {/* Selección de Empleado Destino */}
                        {!esCambioIndividual && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Empleado Destino *
                                </label>

                                {!empleadoDestino ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            className="w-full mb-2"
                                            onClick={() => setShowSearch(!showSearch)}
                                        >
                                            <Users className="w-4 h-4 mr-2" />
                                            Seleccionar empleado
                                        </Button>

                                        {showSearch && (
                                            <div className="border border-gray-300 rounded-lg p-3 max-h-64 overflow-y-auto">
                                                <div className="relative mb-2">
                                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                                                    <Input
                                                        placeholder="Buscar por nombre o nómina..."
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                        className="pl-8"
                                                    />
                                                </div>

                                                {empleadosFiltrados.length === 0 ? (
                                                    <p className="text-sm text-gray-500 text-center py-4">
                                                        No hay empleados disponibles
                                                    </p>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {empleadosFiltrados.map((emp) => (
                                                            <button
                                                                key={emp.id}
                                                                onClick={() => {
                                                                    setEmpleadoDestino(emp);
                                                                    setShowSearch(false);
                                                                }}
                                                                className="w-full text-left p-2 hover:bg-gray-100 rounded text-sm"
                                                            >
                                                                <p className="font-medium">{emp.fullName}</p>
                                                                <p className="text-xs text-gray-600">
                                                                    Nómina: {emp.nomina}
                                                                </p>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                                        <div>
                                            <p className="text-sm font-semibold text-green-900">
                                                {empleadoDestino.fullName}
                                            </p>
                                            <p className="text-xs text-green-700">
                                                Nómina: {empleadoDestino.nomina}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setEmpleadoDestino(null);
                                                setTurnoDestino("");
                                                setTurnoDestinoDetectado("");
                                            }}
                                        >
                                            Cambiar
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Fecha de Permuta */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Fecha del Turno a Permutar *
                            </label>
                            <Input
                                type="date"
                                value={fechaPermuta}
                                onChange={(e) => setFechaPermuta(e.target.value)}
                                disabled={loading}
                                min={new Date().toISOString().split("T")[0]}
                            />
                            {loadingTurnos && (
                                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Detectando turnos...
                                </p>
                            )}
                        </div>

                        {/* Turno Empleado Origen */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Turno de {empleadoOrigen.fullName} *
                            </label>
                            {turnoOrigenDetectado && (
                                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs flex items-start gap-2">
                                    <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <span className="text-blue-700">
                                        Turno actual detectado: <strong>{formatTurnoLabel(turnoOrigenDetectado)}</strong> para esta fecha
                                    </span>
                                </div>
                            )}
                            <select
                                value={turnoOrigen}
                                onChange={(e) => setTurnoOrigen(e.target.value)}
                                disabled={loading}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Seleccionar turno...</option>
                                {TURNOS_DISPLAY.map((turno) => (
                                    <option key={turno.value} value={turno.value}>
                                        {turno.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Turno Empleado Destino */}
                        {empleadoDestino && !esCambioIndividual && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Turno de {empleadoDestino.fullName} *
                                </label>
                                {turnoDestinoDetectado && (
                                    <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-xs flex items-start gap-2">
                                        <Info className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                        <span className="text-green-700">
                                            Turno actual detectado: <strong>{formatTurnoLabel(turnoDestinoDetectado)}</strong> para esta fecha
                                        </span>
                                    </div>
                                )}
                                <select
                                    value={turnoDestino}
                                    onChange={(e) => setTurnoDestino(e.target.value)}
                                    disabled={loading}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Seleccionar turno...</option>
                                    {TURNOS_DISPLAY.map((turno) => (
                                        <option key={turno.value} value={turno.value}>
                                            {turno.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Motivo */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Motivo de la Permuta *
                            </label>
                            <Textarea
                                placeholder="Describe el motivo del cambio de turno..."
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                disabled={loading}
                                rows={3}
                                className="resize-none"
                            />
                        </div>
                    </div>

                    {/* Botones */}
                    <div className="p-4 flex justify-end gap-2 border-t">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="continental"
                            onClick={handleSubmit}
                            disabled={loading || !fechaPermuta || !motivo.trim() || !turnoOrigen ||
                                (!esCambioIndividual && (!empleadoDestino || !turnoDestino))}
                        >
                            {loading ? "Procesando..." : "Solicitar Permuta"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};