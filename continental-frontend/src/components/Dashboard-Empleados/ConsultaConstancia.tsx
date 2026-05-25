import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, FileText, Download, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import { UserRole } from "@/interfaces/User.interface";
import { EmployeeSelector } from "./EmployeeSelector";
import type { UsuarioInfoDto } from "@/interfaces/Api.interface";
import { Button } from "../ui/button";
import { getVacacionesAsignadasPorEmpleado, vacacionesService } from "@/services/vacacionesService";
import { generateConstanciaAntiguedadPDFBlob } from "@/services/pdfService";

/**
 * Consulta de Constancia de Antigüedad para el comité sindical.
 * Permite seleccionar cualquier empleado sindicalizado y ver/descargar su
 * constancia de antigüedad. Reutiliza la generación de PDF existente
 * (pdfService) y los endpoints que el Delegado Sindical ya puede consumir.
 */
const ConsultaConstancia = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const hasRole = (roleName: string) =>
        (user?.roles || []).some((role) =>
            typeof role === "string" ? role === roleName : (role as { name?: string }).name === roleName
        );
    const isUnionCommittee = Boolean((user as { isUnionCommittee?: boolean })?.isUnionCommittee);
    const isDelegadoSindical =
        isUnionCommittee ||
        hasRole(UserRole.UNION_REPRESENTATIVE) ||
        user?.area?.nombreGeneral === "Sindicato";

    const [selectedEmployee, setSelectedEmployee] = useState<UsuarioInfoDto>({} as UsuarioInfoDto);
    const [loading, setLoading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [empleadoActual, setEmpleadoActual] = useState<UsuarioInfoDto | null>(null);

    if (!isDelegadoSindical) {
        return (
            <div className="p-8">
                <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg p-8 text-center">
                    <ShieldAlert className="mx-auto mb-3 text-continental-red" size={40} />
                    <p className="text-lg font-semibold text-gray-700">
                        Esta consulta es exclusiva del comité sindical.
                    </p>
                </div>
            </div>
        );
    }

    // Normaliza la fecha de ingreso a YYYY-MM-DD (misma lógica que DetallesEmpleado).
    const normalizarFechaIngreso = (fechaIngreso: string): string | null => {
        if (!fechaIngreso) return null;
        let fecha: Date | null = null;

        if (fechaIngreso.includes("-")) {
            fecha = new Date(fechaIngreso);
        } else if (fechaIngreso.includes("/")) {
            const partes = fechaIngreso.split("/").map((p) => parseInt(p, 10));
            if (partes.length === 3) {
                const [p1, p2, p3] = partes;
                // > 12 desambigua DD/MM vs MM/DD; ambiguo → DD/MM/YYYY (LATAM)
                if (p1 > 12) fecha = new Date(p3, p2 - 1, p1);
                else if (p2 > 12) fecha = new Date(p3, p1 - 1, p2);
                else fecha = new Date(p3, p2 - 1, p1);
            }
        } else {
            fecha = new Date(fechaIngreso);
        }

        if (!fecha || isNaN(fecha.getTime())) return null;
        const y = fecha.getFullYear();
        const m = String(fecha.getMonth() + 1).padStart(2, "0");
        const d = String(fecha.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    const limpiarPreview = () => {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
        setPdfBlob(null);
        setEmpleadoActual(null);
    };

    const handleSelectEmployee = async (emp: UsuarioInfoDto) => {
        setSelectedEmployee(emp);
        if (!emp?.id) return;

        limpiarPreview();
        setLoading(true);
        try {
            const fechaNorm = normalizarFechaIngreso(emp.fechaIngreso || "");
            if (!fechaNorm) {
                toast.error("La fecha de ingreso del empleado no es válida.");
                return;
            }

            let anioVigente = new Date().getFullYear();
            try {
                const config = await vacacionesService.getConfig();
                anioVigente = config.anioVigente;
            } catch {
                // si falla, usamos el año actual
            }

            const vac = await getVacacionesAsignadasPorEmpleado(emp.id);

            const blob = await generateConstanciaAntiguedadPDFBlob(
                {
                    nomina: emp.username || emp.nomina || "",
                    nombre: emp.fullName || "",
                    fechaIngreso: fechaNorm,
                    area: emp.area?.nombreGeneral || "",
                    grupo: emp.grupo?.rol || "",
                },
                { diasSeleccionados: [], diasAsignados: [], vacaciones: vac.vacaciones },
                anioVigente
            );

            setPdfBlob(blob);
            setPdfUrl(URL.createObjectURL(blob));
            setEmpleadoActual(emp);
        } catch (error) {
            console.error("Error generando constancia:", error);
            toast.error("No se pudo generar la constancia de este empleado.");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!pdfBlob || !empleadoActual) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `constancia_antiguedad_${empleadoActual.username || empleadoActual.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col min-h-screen w-full bg-white p-6 md:p-10 max-w-[1400px] mx-auto">
            <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2">
                        <ChevronLeft className="w-4 h-4" />
                        Regresar
                    </Button>
                    <div>
                        <p className="text-xs uppercase text-slate-500">Comité sindical</p>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <FileText size={22} />
                            Consulta de constancia de antigüedad
                        </h1>
                    </div>
                </div>
                {empleadoActual && pdfBlob && (
                    <Button variant="continental" className="cursor-pointer flex items-center gap-2" onClick={handleDownload}>
                        <Download className="w-4 h-4" />
                        Descargar PDF
                    </Button>
                )}
            </header>

            <div className="mb-5 max-w-xl">
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Selecciona un empleado
                </label>
                <EmployeeSelector
                    currentUser={(user as unknown as UsuarioInfoDto) || null}
                    selectedEmployee={selectedEmployee}
                    onSelectEmployee={handleSelectEmployee}
                    isDelegadoSindical={true}
                />
            </div>

            <div className="flex-1 border border-gray-200 rounded-lg bg-gray-50 min-h-[600px] flex items-center justify-center overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Generando constancia…</p>
                    </div>
                ) : pdfUrl ? (
                    <iframe title="Constancia de antigüedad" src={pdfUrl} className="w-full h-[800px]" />
                ) : (
                    <div className="flex flex-col items-center gap-3 text-gray-400 p-8 text-center">
                        <FileText size={40} />
                        <p className="text-sm">
                            Selecciona un empleado para ver su constancia de antigüedad.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConsultaConstancia;
