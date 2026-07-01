import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import { areasService } from "@/services/areasService";
import type { ReglaTurno } from "@/interfaces/Api.interface";
import type { Area } from "@/interfaces/Areas.interface";

interface Props {
    regla: ReglaTurno;
    onClose: () => void;
    onAsignada?: (regla: ReglaTurno) => void;
}

export function AsignarReglaAAreaModal({ regla, onClose, onAsignada }: Props) {
    const [areas, setAreas] = useState<Area[]>([]);
    const [areaId, setAreaId] = useState<number | null>(null);
    const [identificadorSAP, setIdentificadorSAP] = useState("");
    const semanasPatron = Math.max(1, Math.floor(regla.patron.length / 7));
    const [cantidad, setCantidad] = useState<number>(semanasPatron);
    const [loadingAreas, setLoadingAreas] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancel = false;
        setLoadingAreas(true);
        areasService.getAreas()
            .then(rs => { if (!cancel) setAreas(rs || []); })
            .catch(() => { if (!cancel) toast.error("Error al cargar áreas"); })
            .finally(() => { if (!cancel) setLoadingAreas(false); });
        return () => { cancel = true; };
    }, []);

    const nombresPreview = useMemo(() => {
        const arr: string[] = [];
        for (let i = 1; i <= cantidad; i++) {
            arr.push(i === 1 ? regla.codigo : `${regla.codigo}_${String(i).padStart(2, "0")}`);
        }
        return arr;
    }, [cantidad, regla.codigo]);

    const patronVacio = regla.patron.length === 0 || regla.patron.length % 7 !== 0;

    const handleSubmit = async () => {
        if (!areaId) { toast.error("Selecciona un área."); return; }
        if (patronVacio) {
            toast.error("La regla no tiene patrón válido. Captúralo antes de asignarla.");
            return;
        }
        if (cantidad < 1 || cantidad > semanasPatron) {
            toast.error(`La cantidad de sub-grupos debe estar entre 1 y ${semanasPatron}.`);
            return;
        }

        setSaving(true);
        try {
            const resp = await reglasTurnoService.asignarAArea(regla.codigo, {
                areaId,
                cantidadSubGrupos: cantidad,
                identificadorSAP: identificadorSAP.trim() || undefined,
            });
            toast.success(`${resp.gruposCreados.length} grupo(s) creados en el área`);
            onAsignada?.({ ...regla, estado: "Activa" });
            onClose();
        } catch (e: any) {
            toast.error(e?.message ?? "Error al asignar la regla al área");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AlertDialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Building2 className="size-5 text-continental-yellow" />
                        Asignar regla {regla.codigo} a un área
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-4 text-sm">
                            <p>
                                Se crearán los grupos correspondientes en el área elegida y la regla
                                pasará a estado <strong>Activa</strong> si estaba pendiente.
                            </p>

                            {patronVacio && (
                                <div className="border-l-4 border-amber-400 bg-amber-50 p-3 text-amber-800">
                                    Esta regla no tiene patrón definido (o su longitud no es
                                    múltiplo de 7). Captúralo con el botón <em>Editar</em> antes de
                                    asignarla a un área.
                                </div>
                            )}

                            <div>
                                <Label className="text-xs">Área</Label>
                                {loadingAreas ? (
                                    <div className="flex items-center gap-2 text-continental-gray-1 text-xs py-2">
                                        <Loader2 className="size-3 animate-spin" /> Cargando áreas…
                                    </div>
                                ) : (
                                    <select
                                        value={areaId ?? ""}
                                        onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full border rounded px-2 py-2 text-sm"
                                    >
                                        <option value="">— Selecciona un área —</option>
                                        {areas.map(a => (
                                            <option key={a.areaId} value={a.areaId}>
                                                {a.nombreGeneral} ({a.unidadOrganizativaSap})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div>
                                <Label className="text-xs">
                                    Cantidad de sub-grupos <span className="text-continental-gray-1">(máx. {semanasPatron})</span>
                                </Label>
                                <input
                                    type="number"
                                    value={cantidad}
                                    min={1}
                                    max={semanasPatron}
                                    onChange={(e) => setCantidad(Math.max(1, Math.min(semanasPatron, Number(e.target.value) || 1)))}
                                    className="w-full border rounded px-2 py-2 text-sm"
                                />
                                <div className="mt-1 text-[11px] text-continental-gray-1">
                                    Se crearán: <span className="font-mono">{nombresPreview.join(", ")}</span>
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs">
                                    Identificador SAP <span className="text-continental-gray-1">(opcional; se autogenera si va vacío)</span>
                                </Label>
                                <input
                                    type="text"
                                    value={identificadorSAP}
                                    onChange={(e) => setIdentificadorSAP(e.target.value)}
                                    maxLength={100}
                                    placeholder="Ej. UNIDAD-R0500"
                                    className="w-full border rounded px-2 py-2 text-sm"
                                />
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleSubmit(); }}
                        disabled={saving || loadingAreas || !areaId || patronVacio}
                    >
                        {saving ? (
                            <><Loader2 className="size-4 animate-spin mr-1" /> Asignando…</>
                        ) : (
                            <>Asignar</>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
