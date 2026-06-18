import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Calendar, FileText, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { solicitudesPermisosService } from '@/services/solicitudesPermisosService';
import type { TipoPermiso } from '@/services/permisosService';

interface DiasDisponiblesInfo {
    asignados: number;
    consumidos: number;
    disponibles: number;
}

interface SolicitarPermisoModalProps {
    show: boolean;
    onClose: () => void;
    nomina: number;
    nombreEmpleado: string;
    onSolicitudCreada?: () => void;
    // Preselección desde otros flujos (ej. reprogramación de vacación consumida)
    tipoPermisoDefault?: string;
    fechaInicioDefault?: string;
    fechaFinDefault?: string;
    fechaACambiarDefault?: string;
    observacionesDefault?: string;
    diasDisponibles?: DiasDisponiblesInfo;
}

export const SolicitarPermisoModal = ({
    show,
    onClose,
    nomina,
    nombreEmpleado,
    onSolicitudCreada,
    tipoPermisoDefault,
    fechaInicioDefault,
    fechaFinDefault,
    fechaACambiarDefault,
    observacionesDefault,
    diasDisponibles,
}: SolicitarPermisoModalProps) => {
    const [loading, setLoading] = useState(false);
    const [catalogoPermisos, setCatalogoPermisos] = useState<TipoPermiso[]>([]);
    const [loadingCatalogo, setLoadingCatalogo] = useState(false);

    const [formData, setFormData] = useState({
        tipoPermiso: '',
        fechaInicio: '',
        fechaFin: '',
        fechaACambiar: '',
        observaciones: '',
    });

    useEffect(() => {
        if (show) {
            cargarCatalogo();
            resetForm();
        }
    }, [show, tipoPermisoDefault, fechaInicioDefault, fechaFinDefault, fechaACambiarDefault, observacionesDefault]);

    const cargarCatalogo = async () => {
        setLoadingCatalogo(true);
        try {
            const catalogo = await solicitudesPermisosService.obtenerCatalogoDelegado();
            setCatalogoPermisos(catalogo);
        } catch (error: any) {
            toast.error('Error al cargar tipos de permisos: ' + error.message);
        } finally {
            setLoadingCatalogo(false);
        }
    };

    const resetForm = () => {
        setFormData({
            tipoPermiso: tipoPermisoDefault ?? '',
            fechaInicio: fechaInicioDefault ?? '',
            fechaFin: fechaFinDefault ?? '',
            fechaACambiar: fechaACambiarDefault ?? '',
            observaciones: observacionesDefault ?? '',
        });
    };

    const handleSubmit = async () => {
        if (!formData.tipoPermiso || !formData.fechaInicio || !formData.fechaFin) {
            toast.error('Por favor completa todos los campos requeridos');
            return;
        }

        const fechaInicio = new Date(formData.fechaInicio);
        const fechaFin = new Date(formData.fechaFin);

        if (fechaFin < fechaInicio) {
            toast.error('La fecha fin no puede ser anterior a la fecha de inicio');
            return;
        }

        setLoading(true);

        // Si hay "Por el día" lo anexamos al inicio de observaciones para que
        // quede registrado en la solicitud (el backend no tiene campo separado).
        const observacionesFinal = [
            formData.fechaACambiar ? `Por el día: ${formData.fechaACambiar}` : null,
            formData.observaciones?.trim() || null,
        ].filter(Boolean).join(' | ');

        try {
            const response = await solicitudesPermisosService.crearSolicitud({
                Nomina: nomina,
                ClAbPre: formData.tipoPermiso,
                FechaInicio: formData.fechaInicio,
                FechaFin: formData.fechaFin,
                Observaciones: observacionesFinal || undefined,
            });

            if (response.exitoso) {
                toast.success(
                    <div className="flex items-start gap-2">
                        <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <div className="font-semibold">Solicitud enviada exitosamente</div>
                            <div className="text-sm text-gray-600 mt-1">
                                La solicitud de permiso para {nombreEmpleado} est� pendiente de aprobaci�n del jefe de �rea.
                            </div>
                        </div>
                    </div>
                );
                onSolicitudCreada?.();
                onClose();
            }
        } catch (error: any) {
            toast.error('Error al enviar solicitud: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const getTipoPermisoInfo = () => {
        return catalogoPermisos.find((p) => p.clAbPre === formData.tipoPermiso);
    };

    const tipoPermisoInfo = getTipoPermisoInfo();

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Solicitar Permiso/Incapacidad</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Empleado: <span className="font-semibold">{nombreEmpleado}</span> (N�mina: {nomina})
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md">
                            <Clock className="w-4 h-4" />
                            <span>Esta solicitud requiere aprobaci�n del jefe de �rea</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        disabled={loading}
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {diasDisponibles && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-emerald-900 mb-2">Vacaciones del empleado</p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <p className="text-2xl font-bold text-emerald-700">{diasDisponibles.asignados}</p>
                                    <p className="text-xs text-emerald-700">Asignados</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-amber-700">{diasDisponibles.consumidos}</p>
                                    <p className="text-xs text-amber-700">Consumidos</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-blue-700">{diasDisponibles.disponibles}</p>
                                    <p className="text-xs text-blue-700">Disponibles</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            Tipo de Permiso/Incapacidad <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.tipoPermiso}
                            onChange={(e) => setFormData({ ...formData, tipoPermiso: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loadingCatalogo || loading}
                        >
                            <option value="">Seleccionar tipo...</option>
                            {catalogoPermisos.map((tipo, index) => (
                                <option key={index} value={tipo.clAbPre}>
                                    [{tipo.claveVisualizacion}] {tipo.concepto}
                                </option>
                            ))}
                        </select>

                        {tipoPermisoInfo && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-medium text-blue-900">{tipoPermisoInfo.descripcion}</p>
                                        <div className="flex gap-3 mt-1 text-xs text-blue-700">
                                            <span>
                                                C�digo: <span className="font-semibold">{tipoPermisoInfo.claveVisualizacion}</span>
                                            </span>
                                            {tipoPermisoInfo.requiereAprobacion && (
                                                <span className="text-amber-700">� Requiere aprobaci�n del jefe</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            Por el día (opcional)
                        </label>
                        <Input
                            type="date"
                            value={formData.fechaACambiar}
                            onChange={(e) => setFormData({ ...formData, fechaACambiar: e.target.value })}
                            disabled={loading}
                        />
                        <p className="text-xs text-gray-500">
                            Día específico que se busca recuperar (ej. una vacación ya consumida o un día trabajado).
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Fecha Inicio <span className="text-red-500">*</span>
                            </label>
                            <Input
                                type="date"
                                value={formData.fechaInicio}
                                onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Fecha Fin <span className="text-red-500">*</span>
                            </label>
                            <Input
                                type="date"
                                value={formData.fechaFin}
                                onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value })}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            <FileText className="w-4 h-4 inline mr-1" />
                            Observaciones (opcional)
                        </label>
                        <textarea
                            value={formData.observaciones}
                            onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                            placeholder="Informaci�n adicional sobre la solicitud..."
                            disabled={loading}
                            maxLength={500}
                        />
                        <p className="text-xs text-gray-500">{formData.observaciones.length}/500 caracteres</p>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-yellow-800">
                                <p className="font-medium">Importante:</p>
                                <ul className="list-disc list-inside mt-1 space-y-1">
                                    <li>Esta solicitud ser� enviada al jefe de �rea para su aprobaci�n</li>
                                    <li>El permiso solo se registrar� despu�s de ser aprobado</li>
                                    <li>Recibir�s una notificaci�n cuando tu solicitud sea respondida</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                        className="gap-2"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="continental"
                        onClick={handleSubmit}
                        disabled={loading || !formData.tipoPermiso || !formData.fechaInicio || !formData.fechaFin}
                        className="gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Enviar Solicitud
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};