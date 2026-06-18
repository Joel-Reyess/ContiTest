import { useState } from "react";
import { Search, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
    festivosTrabajadosService,
    type DiagnosticoFestivoTrabajadoResponse,
} from "@/services/festivosTrabajadosService";

export const DiagnosticoFT = () => {
    const [nomina, setNomina] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DiagnosticoFestivoTrabajadoResponse | null>(null);

    const handleConsultar = async () => {
        const n = nomina.trim();
        if (!n) {
            toast.error("Ingresa una nómina.");
            return;
        }
        setLoading(true);
        try {
            const data = await festivosTrabajadosService.diagnosticar(n);
            setResult(data);
        } catch (e: any) {
            console.error("Error en diagnóstico FT:", e);
            toast.error(e?.response?.data?.errorMsg ?? e?.message ?? "Error al consultar");
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Diagnóstico Festivo Trabajado</h1>
                <p className="text-slate-600 text-sm">
                    Consulta por qué un festivo trabajado no aparece disponible para una nómina (sin acceso a SQL).
                </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex gap-3 items-end">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nómina</label>
                    <Input
                        type="text"
                        value={nomina}
                        onChange={(e) => setNomina(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleConsultar(); }}
                        placeholder="Ej. 32955876"
                        disabled={loading}
                    />
                </div>
                <Button variant="continental" onClick={handleConsultar} disabled={loading}>
                    <Search className="w-4 h-4 mr-2" />
                    {loading ? "Consultando..." : "Consultar"}
                </Button>
            </div>

            {result && (
                <div className="space-y-6">
                    {/* Empleado */}
                    <section className="bg-white border border-gray-200 rounded-lg p-4">
                        <h2 className="text-sm font-semibold text-gray-700 mb-2">Empleado</h2>
                        {result.empleado ? (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <div><span className="text-gray-500">ID:</span> {result.empleado.id}</div>
                                <div><span className="text-gray-500">Nombre:</span> {result.empleado.fullName}</div>
                                <div><span className="text-gray-500">Nómina:</span> {result.empleado.nomina ?? "—"}</div>
                                <div><span className="text-gray-500">Username:</span> {result.empleado.username}</div>
                                <div><span className="text-gray-500">Área:</span> {result.empleado.area ?? "—"}</div>
                                <div><span className="text-gray-500">Grupo:</span> {result.empleado.grupo ?? "—"}</div>
                                <div className="col-span-2 mt-1 text-xs text-gray-500">
                                    Match contra upload usando:{" "}
                                    <span className="font-mono bg-gray-100 px-1.5 rounded">
                                        {result.nominaUsadaParaMatch ?? "—"}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-red-600">No se encontró el empleado en <code>Users</code>.</p>
                        )}
                    </section>

                    {/* Notas */}
                    {result.notas.length > 0 && (
                        <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                                <ul className="text-sm text-amber-900 space-y-1 list-disc list-inside">
                                    {result.notas.map((n, i) => <li key={i}>{n}</li>)}
                                </ul>
                            </div>
                        </section>
                    )}

                    {/* Resumen */}
                    <section className="grid grid-cols-3 gap-4">
                        <StatCard label="Disponibles" value={result.totalDisponibles} tone="emerald" />
                        <StatCard label="No disponibles" value={result.totalNoDisponibles} tone="amber" />
                        <StatCard label="Solicitudes que bloquean" value={result.solicitudesQueBloquean.length} tone="rose" />
                    </section>

                    {/* Upload records */}
                    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <h2 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
                            Registros en <code>FestivosEmpleadosTrabajadosUpload</code>
                        </h2>
                        {result.uploadRecords.length === 0 ? (
                            <p className="px-4 py-6 text-sm text-gray-500">Sin registros para esta nómina.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Fecha raw</th>
                                        <th className="px-3 py-2 text-left">Parsed</th>
                                        <th className="px-3 py-2 text-center">Parseo</th>
                                        <th className="px-3 py-2 text-center">Expirado</th>
                                        <th className="px-3 py-2 text-center">Ya solicitado</th>
                                        <th className="px-3 py-2 text-center">Disponible</th>
                                        <th className="px-3 py-2 text-left">Motivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.uploadRecords.map((r, i) => (
                                        <tr key={i} className="border-t">
                                            <td className="px-3 py-2 font-mono">{r.fechaRaw || "—"}</td>
                                            <td className="px-3 py-2 font-mono">{r.fechaParsed ?? "—"}</td>
                                            <td className="px-3 py-2 text-center"><Bool ok={r.parseoExitoso} /></td>
                                            <td className="px-3 py-2 text-center"><Bool ok={!r.expirado} /></td>
                                            <td className="px-3 py-2 text-center"><Bool ok={!r.yaSolicitado} /></td>
                                            <td className="px-3 py-2 text-center"><Bool ok={r.disponible} /></td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{r.motivo ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>

                    {/* Solicitudes bloqueo */}
                    {result.solicitudesQueBloquean.length > 0 && (
                        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <h2 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
                                Solicitudes Pendientes/Aprobadas que bloquean
                            </h2>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">ID</th>
                                        <th className="px-3 py-2 text-left">Festivo Original</th>
                                        <th className="px-3 py-2 text-left">Fecha Nueva</th>
                                        <th className="px-3 py-2 text-left">Estado</th>
                                        <th className="px-3 py-2 text-left">Solicitada</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.solicitudesQueBloquean.map((s) => (
                                        <tr key={s.id} className="border-t">
                                            <td className="px-3 py-2 font-mono">{s.id}</td>
                                            <td className="px-3 py-2 font-mono">{s.festivoOriginal}</td>
                                            <td className="px-3 py-2 font-mono">{s.fechaNuevaSolicitada}</td>
                                            <td className="px-3 py-2">{s.estadoSolicitud}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{s.fechaSolicitud}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

const StatCard = ({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" }) => {
    const toneMap = {
        emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
        amber: "bg-amber-50 border-amber-200 text-amber-700",
        rose: "bg-rose-50 border-rose-200 text-rose-700",
    } as const;
    return (
        <div className={`rounded-lg border p-4 ${toneMap[tone]}`}>
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-xs">{label}</p>
        </div>
    );
};

const Bool = ({ ok }: { ok: boolean }) =>
    ok
        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
        : <XCircle className="w-4 h-4 text-rose-600 inline" />;
