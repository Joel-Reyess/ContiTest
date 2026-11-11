import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reglasDomingoService } from "@/services/reglasDomingoService";
import {
    movimientoDiasEmpresaService,
    type RenglonMovimientoDiaEmpresa,
    type ResultadoMovimientoMasivo,
    type ResultadoRenglonMovimiento,
} from "@/services/movimientoDiasEmpresaService";
import { descargarMachoteDiasEmpresa, descargarResultadoMachote, leerMachoteDiasEmpresa } from "@/utils/machoteDiasEmpresaExcel";

const TIPOS_EMPRESA = ["Automatica", "AsignadaAutomaticamente", "DiaEmpresaReprogramado"];

const estiloEstado: Record<ResultadoRenglonMovimiento["estado"], string> = {
    Listo: "bg-green-100 text-green-800",
    Aplicado: "bg-green-100 text-green-800",
    Advertencia: "bg-amber-100 text-amber-800",
    Error: "bg-red-100 text-red-800",
    Omitido: "bg-slate-100 text-slate-700",
};

/**
 * Mover en lote días por la empresa con un machote (nov-2026, reunión con
 * Román/Maricela). Caso típico: un domingo se declara no laborable y quienes ya
 * tenían ahí su día por la empresa se reparten entre lunes, martes y miércoles.
 * 1) Descargar el machote (ya trae los días por la empresa que quedaron en días
 * no laborables, o vacío), 2) llenar "Fecha nueva", 3) subirlo: se revisa cada
 * renglón sin mover nada, 4) aplicar. Solo superusuario.
 */
export const MovimientoMasivoDiasEmpresa = ({ anio, onAplicado }: { anio: number; onAplicado?: () => void }) => {
    const archivoRef = useRef<HTMLInputElement>(null);
    const [descargando, setDescargando] = useState(false);
    const [renglones, setRenglones] = useState<RenglonMovimientoDiaEmpresa[] | null>(null);
    const [nombreArchivo, setNombreArchivo] = useState("");
    const [sinFechaNueva, setSinFechaNueva] = useState(0);
    const [revision, setRevision] = useState<ResultadoMovimientoMasivo | null>(null);
    const [aplicado, setAplicado] = useState(false);
    const [revisando, setRevisando] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [motivo, setMotivo] = useState("");
    const [incluirAdvertencias, setIncluirAdvertencias] = useState(false);
    const [verSoloProblemas, setVerSoloProblemas] = useState(false);

    const descargarConDias = async () => {
        setDescargando(true);
        try {
            const afectadas = (await reglasDomingoService.vacacionesAfectadas(anio)).filter((v) => TIPOS_EMPRESA.includes(v.tipoVacacion));
            if (afectadas.length === 0) {
                toast.info(`No hay días por la empresa en días no laborables en ${anio}`, {
                    description: "Puedes descargar el machote vacío y llenarlo a mano.",
                });
                return;
            }
            descargarMachoteDiasEmpresa(
                afectadas.map((v) => ({
                    nomina: v.nomina,
                    nombre: v.nombre,
                    area: v.area,
                    grupo: v.grupo,
                    fechaActual: v.fecha.slice(0, 10),
                    nota: v.motivo,
                })),
                `no_laborables_${anio}`
            );
            toast.success(`Machote con ${afectadas.length} día(s) por la empresa`, { description: "Llena la columna Fecha nueva y súbelo aquí." });
        } catch (e) {
            toast.error("No se pudo generar el machote", { description: (e as Error).message });
        } finally {
            setDescargando(false);
        }
    };

    const revisar = async (lista: RenglonMovimientoDiaEmpresa[]) => {
        setRevisando(true);
        try {
            setRevision(await movimientoDiasEmpresaService.validar({ renglones: lista }));
            setAplicado(false);
        } catch (e) {
            setRevision(null);
            toast.error("No se pudo revisar el machote", { description: (e as Error).message, duration: 10000 });
        } finally {
            setRevisando(false);
        }
    };

    const subir = async (archivo: File | undefined) => {
        if (!archivo) return;
        try {
            const leido = await leerMachoteDiasEmpresa(archivo);
            setNombreArchivo(archivo.name);
            setSinFechaNueva(leido.sinFechaNueva);
            setRenglones(leido.renglones);
            setRevision(null);
            setAplicado(false);
            if (leido.renglones.length === 0) {
                toast.error("El machote no trae ningún renglón con fecha nueva");
                return;
            }
            await revisar(leido.renglones);
        } catch (e) {
            toast.error("No se pudo leer el archivo", { description: (e as Error).message, duration: 10000 });
        } finally {
            if (archivoRef.current) archivoRef.current.value = "";
        }
    };

    const aMover = revision ? revision.listos + (incluirAdvertencias ? revision.advertencias : 0) : 0;

    const aplicar = async () => {
        if (!renglones || !revision) return;
        if (!motivo.trim()) {
            toast.error("Escribe el motivo (queda en el historial de cada empleado)");
            return;
        }
        if (!window.confirm(`¿Mover ${aMover} día(s) por la empresa? Se aplica directo, sin aprobación del jefe, y queda en el historial.`)) return;
        setAplicando(true);
        try {
            const r = await movimientoDiasEmpresaService.aplicar({ renglones, motivo: motivo.trim(), incluirAdvertencias });
            setRevision(r);
            setAplicado(true);
            toast.success(`${r.aplicados} día(s) por la empresa movido(s)`, {
                description: r.aplicados < renglones.length ? "Los demás quedaron sin mover; descarga el resultado para ver por qué." : undefined,
                duration: 10000,
            });
            onAplicado?.();
        } catch (e) {
            toast.error("No se movió nada", { description: (e as Error).message, duration: 10000 });
        } finally {
            setAplicando(false);
        }
    };

    const fechaCorta = (s?: string | null) => {
        if (!s) return "—";
        try {
            return /^\d{4}-\d{2}-\d{2}$/.test(s) ? format(parseISO(s), "EEE dd/MM/yyyy", { locale: es }) : s;
        } catch {
            return s;
        }
    };

    const visibles = (revision?.renglones ?? []).filter((r) => !verSoloProblemas || !["Listo", "Aplicado"].includes(r.estado));

    return (
        <section className="rounded-lg border p-4 space-y-4 text-sm">
            <div>
                <h3 className="font-semibold flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Mover días por la empresa con machote
                </h3>
                <p className="text-xs text-continental-gray-1 mt-1">
                    Para mover muchos de una vez (por ejemplo, un domingo que se declaró no laborable y esos días se reparten
                    entre lunes, martes y miércoles): descarga el machote, llena "Fecha nueva" y súbelo. Antes de mover se
                    revisa cada renglón (que sea día laborable de su rol, no inhábil ni no laborable, sin otra vacación, permiso o
                    incapacidad, y el % del grupo). Se aplica directo, sin aprobación del jefe, y queda en el historial de
                    reprogramaciones de día empresa como "C" en el rol semanal.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={descargarConDias} disabled={descargando}>
                    <Download className="w-4 h-4 mr-1" />
                    {descargando ? "Generando…" : `Machote con los días en no laborables (${anio})`}
                </Button>
                <Button variant="outline" onClick={() => descargarMachoteDiasEmpresa([], "vacio")}>
                    <Download className="w-4 h-4 mr-1" /> Machote vacío
                </Button>
                <input
                    ref={archivoRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => subir(e.target.files?.[0])}
                />
                <Button variant="continental" onClick={() => archivoRef.current?.click()} disabled={revisando || aplicando}>
                    <Upload className="w-4 h-4 mr-1" /> {revisando ? "Revisando…" : "Subir machote lleno"}
                </Button>
            </div>

            {revision && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="font-medium">{nombreArchivo}</span>
                        {aplicado ? (
                            <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">{revision.aplicados} movido(s)</span>
                        ) : (
                            <>
                                <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">{revision.listos} listo(s)</span>
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{revision.advertencias} rebasan el %</span>
                                <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">{revision.errores} con error</span>
                            </>
                        )}
                        {sinFechaNueva > 0 && (
                            <span className="text-xs text-continental-gray-1">{sinFechaNueva} renglón(es) sin fecha nueva: no se mueven.</span>
                        )}
                        <label className="flex items-center gap-2 text-xs ml-auto">
                            <input type="checkbox" checked={verSoloProblemas} onChange={(e) => setVerSoloProblemas(e.target.checked)} />
                            Ver solo los que no están listos
                        </label>
                        <Button size="sm" variant="ghost" onClick={() => descargarResultadoMachote(revision.renglones)}>
                            <Download className="w-4 h-4 mr-1" /> Descargar resultado
                        </Button>
                    </div>

                    <div className="max-h-96 overflow-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Renglón</th>
                                    <th className="px-3 py-2 font-medium">Nómina</th>
                                    <th className="px-3 py-2 font-medium">Nombre</th>
                                    <th className="px-3 py-2 font-medium">Grupo</th>
                                    <th className="px-3 py-2 font-medium">Día actual → fecha nueva</th>
                                    <th className="px-3 py-2 font-medium">Estado</th>
                                    <th className="px-3 py-2 font-medium">Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.map((r) => (
                                    <tr key={r.renglon} className="border-t align-top">
                                        <td className="px-3 py-1.5 tabular-nums">{r.renglon}</td>
                                        <td className="px-3 py-1.5 tabular-nums">{r.nomina ?? "—"}</td>
                                        <td className="px-3 py-1.5">{r.nombre ?? "—"}</td>
                                        <td className="px-3 py-1.5 text-continental-gray-1">{r.grupo ?? "—"}</td>
                                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                                            {fechaCorta(r.fechaActual)} → {fechaCorta(r.fechaNueva)}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <span className={`rounded px-2 py-0.5 text-xs ${estiloEstado[r.estado]}`}>
                                                {r.estado === "Advertencia" ? "Rebasa %" : r.estado}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-xs">{r.mensaje ?? ""}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!aplicado && (
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1 grow min-w-[260px]">
                                <span className="text-xs font-medium text-continental-gray-1">Motivo (queda en el historial de cada empleado)</span>
                                <input
                                    className="h-9 rounded-md border px-2"
                                    maxLength={300}
                                    placeholder="Ej. Domingo 14/02 no laborable por paro de luz"
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                />
                            </label>
                            {revision.advertencias > 0 && (
                                <label className="flex items-center gap-2 text-xs">
                                    <input type="checkbox" checked={incluirAdvertencias} onChange={(e) => setIncluirAdvertencias(e.target.checked)} />
                                    Aplicar también los {revision.advertencias} que rebasan el %
                                </label>
                            )}
                            <Button variant="outline" onClick={() => renglones && revisar(renglones)} disabled={revisando || aplicando}>
                                Volver a revisar
                            </Button>
                            <Button variant="continental" onClick={aplicar} disabled={aplicando || aMover === 0}>
                                {aplicando ? "Moviendo…" : `Mover ${aMover} día(s)`}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
