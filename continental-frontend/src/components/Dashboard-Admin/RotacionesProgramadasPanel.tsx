import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, X } from "lucide-react";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import type { RotacionProgramada, EstadoRotacionProgramada } from "@/interfaces/Api.interface";
import { AgendarRotacionModal } from "./AgendarRotacionModal";

const badgeClasses: Record<EstadoRotacionProgramada, string> = {
    Pendiente: "bg-blue-100 text-blue-800 border-blue-200",
    Ejecutada: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Cancelada: "bg-continental-gray-4 text-continental-gray-1 border-continental-gray-3",
    Fallida: "bg-red-100 text-red-800 border-red-200",
};

function formatDate(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function RotacionesProgramadasPanel() {
    const [items, setItems] = useState<RotacionProgramada[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [cancelando, setCancelando] = useState<number | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const anio = new Date().getFullYear();
            const desde = `${anio}-01-01`;
            const hasta = `${anio + 1}-12-31`;
            const rows = await reglasTurnoService.listarRotacionesProgramadas(desde, hasta);
            setItems(rows);
        } catch (e: any) {
            toast.error(e?.message ?? "Error al cargar rotaciones programadas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleCancelar = async (id: number) => {
        if (!confirm("¿Cancelar esta rotación programada?")) return;
        setCancelando(id);
        try {
            await reglasTurnoService.cancelarRotacionProgramada(id);
            toast.success("Rotación cancelada");
            await load();
        } catch (e: any) {
            toast.error(e?.message ?? "Error al cancelar");
        } finally {
            setCancelando(null);
        }
    };

    const pendientes = items.filter(i => i.estado === "Pendiente");
    const otras = items.filter(i => i.estado !== "Pendiente");

    return (
        <div className="mt-6 border border-continental-gray-3 rounded-lg bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b border-continental-gray-3">
                <div className="flex items-center gap-2">
                    <CalendarClock className="size-5 text-continental-yellow" />
                    <h3 className="font-semibold text-continental-black">
                        Rotaciones programadas de reglas
                    </h3>
                    <span className="text-xs text-continental-gray-1">
                        (independiente de <em>Reglas de turnos</em>)
                    </span>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-1 bg-continental-yellow hover:bg-continental-yellow/90 text-black text-sm font-semibold px-3 py-1.5 rounded"
                >
                    <Plus className="size-4" />
                    Agendar rotación
                </button>
            </div>

            <div className="p-4">
                <p className="text-xs text-continental-gray-1 mb-3">
                    Cada rotación programada desliza el patrón de la regla en la fecha indicada
                    (7, 14 o 21 días). No mueve empleados de grupo ni cambia SAP.
                </p>

                {loading ? (
                    <div className="flex items-center gap-2 text-continental-gray-1 text-sm py-4">
                        <Loader2 className="size-4 animate-spin" /> Cargando…
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-continental-gray-1 py-4">
                        No hay rotaciones programadas.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-continental-gray-1 border-b border-continental-gray-3">
                                    <th className="py-2 pr-3">Fecha</th>
                                    <th className="py-2 pr-3">Regla</th>
                                    <th className="py-2 pr-3">Días</th>
                                    <th className="py-2 pr-3">Estado</th>
                                    <th className="py-2 pr-3">Creada por</th>
                                    <th className="py-2 pr-3">Notas</th>
                                    <th className="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...pendientes, ...otras].map(r => (
                                    <tr key={r.id} className="border-b border-continental-gray-3 last:border-0">
                                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.fechaEjecucion)}</td>
                                        <td className="py-2 pr-3 font-mono">{r.codigoRegla}</td>
                                        <td className="py-2 pr-3">{r.diasRotacion}</td>
                                        <td className="py-2 pr-3">
                                            <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${badgeClasses[r.estado]}`}>
                                                {r.estado}
                                            </span>
                                            {r.estado === "Fallida" && r.mensajeError && (
                                                <div className="text-[10px] text-red-700 max-w-[240px] truncate" title={r.mensajeError}>
                                                    {r.mensajeError}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2 pr-3 text-xs">{r.createdByUserNombre ?? "—"}</td>
                                        <td className="py-2 pr-3 text-xs text-continental-gray-1 max-w-[220px] truncate" title={r.notas ?? ""}>
                                            {r.notas ?? "—"}
                                        </td>
                                        <td className="py-2 text-right">
                                            {r.estado === "Pendiente" && (
                                                <button
                                                    onClick={() => handleCancelar(r.id)}
                                                    disabled={cancelando === r.id}
                                                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                                    title="Cancelar"
                                                >
                                                    {cancelando === r.id
                                                        ? <Loader2 className="size-4 animate-spin" />
                                                        : <X className="size-4" />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showModal && (
                <AgendarRotacionModal
                    onClose={() => setShowModal(false)}
                    onCreada={() => load()}
                />
            )}
        </div>
    );
}
