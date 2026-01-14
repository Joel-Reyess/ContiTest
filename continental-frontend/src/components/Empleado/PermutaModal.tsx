import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { permutasService, type PermutaRequest } from "@/services/permutasService";
import { empleadosService } from "@/services/empleadosService";
import type { UsuarioInfoDto } from "@/interfaces/Api.interface";
import { Search, Users, ArrowLeftRight } from "lucide-react";

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

    const TURNOS = ["Primero", "Segundo", "Tercero"];
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [empleadosDisponibles, setEmpleadosDisponibles] = useState<UsuarioInfoDto[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [esCambioIndividual, setEsCambioIndividual] = useState(false);

    // Buscar empleados del mismo grupo
    useEffect(() => {
        const fetchEmpleados = async () => {
            if (!showSearch || !empleadoOrigen.area?.areaId) return;

            try {
                const resp = await empleadosService.getEmpleadosSindicalizados({
                    AreaId: empleadoOrigen.area?.areaId,
                    PageSize: 100,
                });

                // Filtrar empleado origen
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
                fechaPermuta: fechaPermuta,
                motivo: motivo.trim(),
                solicitadoPor: solicitadoPorId,
                turnoEmpleadoOrigen: turnoOrigen,
                turnoEmpleadoDestino: esCambioIndividual ? null : turnoDestino,
            };
            //console.log("🚀 Payload a enviar:", payload);
            //console.log("📋 JSON:", JSON.stringify(payload, null, 2));
            const response = await permutasService.solicitarPermuta(payload);

            if (response.exitoso) {
                toast.success(esCambioIndividual ? "Cambio de turno registrado" : "Permuta solicitada exitosamente", {
                    description: esCambioIndividual
                        ? `${empleadoOrigen.fullName} cambia a turno ${turnoOrigen}`
                        : `${empleadoOrigen.fullName} ⇄ ${empleadoDestino!.fullName}`,
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
                                        Seleccionar empleado del mismo grupo
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
                                        onClick={() => setEmpleadoDestino(null)}
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
                        </div>

                        {/* Turno Empleado Origen */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Turno de {empleadoOrigen.fullName} *
                            </label>
                            <select
                                value={turnoOrigen}
                                onChange={(e) => setTurnoOrigen(e.target.value)}
                                disabled={loading}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Seleccionar turno...</option>
                                {TURNOS.map((turno) => (
                                    <option key={turno} value={turno}>
                                        {turno}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Turno Empleado Destino */}
                        {empleadoDestino && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Turno de {empleadoDestino.fullName} *
                                </label>
                                <select
                                    value={turnoDestino}
                                    onChange={(e) => setTurnoDestino(e.target.value)}
                                    disabled={loading}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Seleccionar turno...</option>
                                    {TURNOS.map((turno) => (
                                        <option key={turno} value={turno}>
                                            {turno}
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