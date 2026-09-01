import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CalendarPlus2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import type { VacacionesAsignadasResponse, AsignacionManualRequest } from '@/interfaces/Api.interface';
import { asignarVacacionesManualmente } from '@/services/vacacionesService';
import { useVacationConfig } from '@/hooks/useVacationConfig';

interface AsignacionManualModalProps {
    show: boolean;
    onClose: () => void;
    empleadoId: number;
    nomina: string;
    nombreEmpleado: string;
    vacacionesData: VacacionesAsignadasResponse;
    onAsignacionExitosa: () => void;
    preSelectedDates?: string[];
}

// ✅ Función helper para normalizar fechas a formato YYYY-MM-DD
const normalizeDateString = (dateStr: string): string | null => {
    if (!dateStr) return null;

    try {
        // Si ya está en formato YYYY-MM-DD, retornar directamente
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const testDate = new Date(dateStr + 'T00:00:00');
            if (!isNaN(testDate.getTime())) {
                return dateStr;
            }
        }

        // Intentar parsear con parseISO
        const parsed = parseISO(dateStr);
        if (isValid(parsed)) {
            const year = parsed.getFullYear();
            const month = String(parsed.getMonth() + 1).padStart(2, '0');
            const day = String(parsed.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // Intentar crear Date directamente
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        return null;
    } catch (error) {
        console.error('Error normalizando fecha:', dateStr, error);
        return null;
    }
};

export const AsignacionManualModal: React.FC<AsignacionManualModalProps> = ({
    show,
    onClose,
    empleadoId,
    nomina,
    nombreEmpleado,
    vacacionesData,
    onAsignacionExitosa,
    preSelectedDates = [],
}) => {
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [tipoVacacion, setTipoVacacion] = useState<'Automatica' | 'Anual'>('Automatica');
    const [observaciones, setObservaciones] = useState('');
    const [motivoAsignacion, setMotivoAsignacion] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dateInput, setDateInput] = useState('');

    const { config } = useVacationConfig();
    const anioVigente = config?.anioVigente;

    const diasAutomaticasDisponibles = vacacionesData.resumen.diasAsignadosAutomaticamente - vacacionesData.resumen.asignadasAutomaticamente;
    const diasAnualesDisponibles = vacacionesData.resumen.diasProgramables - vacacionesData.resumen.anuales;

    const canAssignAutomaticas = diasAutomaticasDisponibles > 0;
    const canAssignAnuales = diasAnualesDisponibles > 0;

    // ✅ useEffect que carga y normaliza fechas pre-seleccionadas
    useEffect(() => {
        if (show) {
            console.log('📥 Fechas recibidas en modal:', preSelectedDates);

            if (preSelectedDates.length > 0) {
                // Normalizar todas las fechas
                const normalizedDates = preSelectedDates
                    .map(date => normalizeDateString(date))
                    .filter((date): date is string => date !== null);

                console.log('✅ Fechas normalizadas:', normalizedDates);

                if (normalizedDates.length > 0) {
                    setSelectedDates(normalizedDates);
                    toast.success(`${normalizedDates.length} fecha(s) cargada(s) desde el calendario`, {
                        duration: 3000,
                    });
                } else {
                    toast.warning('No se pudieron cargar las fechas seleccionadas');
                    setSelectedDates([]);
                }
            } else {
                setSelectedDates([]);
            }

            setTipoVacacion(canAssignAutomaticas ? 'Automatica' : 'Anual');
            setObservaciones('');
            setMotivoAsignacion('');
            setDateInput('');
        }
    }, [show, canAssignAutomaticas, preSelectedDates]);

    const handleAddDate = () => {
        if (!dateInput) {
            toast.error('Por favor selecciona una fecha');
            return;
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateInput)) {
            toast.error('Por favor usa el selector de fecha o formato yyyy-MM-dd');
            return;
        }

        const [year, month, day] = dateInput.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        if (isNaN(date.getTime())) {
            toast.error('Fecha inválida');
            return;
        }

        if (year !== anioVigente) {
            toast.error(`La fecha debe estar en el año ${anioVigente}`);
            return;
        }

        const dateString = dateInput;

        if (selectedDates.includes(dateString)) {
            toast.error('Esta fecha ya está seleccionada');
            return;
        }

        const maxDays = tipoVacacion === 'Automatica' ? diasAutomaticasDisponibles : diasAnualesDisponibles;
        if (selectedDates.length >= maxDays) {
            toast.error(`No puedes asignar más de ${maxDays} días de tipo ${tipoVacacion}`);
            return;
        }

        setSelectedDates([...selectedDates, dateString]);
        setDateInput('');
    };

    const handleRemoveDate = (dateToRemove: string) => {
        setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
    };

    const handleSubmit = async () => {
        if (selectedDates.length === 0) {
            toast.error('Debes seleccionar al menos una fecha');
            return;
        }

        if (!motivoAsignacion.trim()) {
            toast.error('El motivo de asignación es obligatorio');
            return;
        }

        try {
            setIsSubmitting(true);

            const construirRequest = (confirmarRebase: boolean): AsignacionManualRequest => ({
                empleadoId,
                fechasVacaciones: selectedDates,
                tipoVacacion,
                origenAsignacion: 'Manual',
                estadoVacacion: 'Activa',
                observaciones: observaciones.trim() || `Asignación manual de ${selectedDates.length} días de vacaciones tipo ${tipoVacacion}`,
                motivoAsignacion: motivoAsignacion.trim(),
                ignorarRestricciones: true,
                notificarEmpleado: true,
                bloqueId: null,
                origenSolicitud: 'Ajuste',
                confirmarRebasePorcentaje: confirmarRebase,
            });

            // El backend rechaza los días que rebasan el porcentaje del grupo y
            // devuelve cuáles son. Aquí se le muestran a quien captura para que
            // decida: si continúa, se reenvía confirmado y el día queda marcado
            // en el reporte de rebases (y se le avisa al jefe del área).
            let response;
            try {
                response = await asignarVacacionesManualmente(construirRequest(false));
            } catch (posibleRebase: any) {
                const cuerpo = posibleRebase?.details?.data;
                if (!cuerpo?.requiereConfirmacionRebase) throw posibleRebase;

                const dias: { fecha: string; porcentajeResultante: number; porcentajeMaximo: number }[] =
                    cuerpo.diasConRebase ?? [];
                // El backend manda la fecha como 2026-09-17; en la alerta se lee
                // mejor en el formato con el que trabaja el área.
                const aDiaMesAnio = (iso: string) => {
                    const [anio, mes, dia] = iso.split('T')[0].split('-');
                    return dia && mes && anio ? `${dia}/${mes}/${anio}` : iso;
                };
                const detalle = dias
                    .map(d => `• ${aDiaMesAnio(d.fecha)} — quedaría en ${d.porcentajeResultante.toFixed(2)}% (máximo ${d.porcentajeMaximo.toFixed(2)}%)`)
                    .join('\n');

                const continuar = window.confirm(
                    `Estos días ya rebasan el porcentaje permitido del grupo:\n\n${detalle}\n\n` +
                    '¿Capturarlos de todas formas?\n' +
                    'Quedarán marcados en el reporte de días capturados con rebase y se le avisará al jefe del área.'
                );
                if (!continuar) {
                    setIsSubmitting(false);
                    return;
                }

                response = await asignarVacacionesManualmente(construirRequest(true));
            }

            if (response.exitoso) {
                toast.success(
                    `✅ ${response.mensaje}`,
                    {
                        description: `Se asignaron ${response.totalDiasAsignados} días a ${response.nombreEmpleado}`,
                        duration: 5000,
                    }
                );

                if (response.advertencias && response.advertencias.length > 0) {
                    response.advertencias.forEach(advertencia => {
                        toast.warning(advertencia, { duration: 4000 });
                    });
                }

                onAsignacionExitosa();
                onClose();
            } else {
                toast.error('No se pudo completar la asignación');
            }
        } catch (error) {
            console.error('Error al asignar vacaciones:', error);
            toast.error(
                'Error al asignar vacaciones',
                {
                    description: error instanceof Error ? error.message : 'Error desconocido',
                }
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderPreSelectedInfo = () => {
        if (preSelectedDates.length > 0) {
            return (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-green-800 font-medium">
                            {preSelectedDates.length} fecha(s) seleccionada(s) desde el calendario
                        </p>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                        Puedes agregar más fechas usando el selector abajo o eliminar las que no necesites.
                    </p>
                </div>
            );
        }
        return null;
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50">
            <div onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center">
            </div>
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 z-50 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-continental-black flex items-center gap-2">
                        <CalendarPlus2 className="h-5 w-5 text-blue-600" />
                        Asignar Vacaciones Manualmente
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-continental-gray-1 hover:text-continental-black transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-medium text-blue-900 mb-2">Empleado</h3>
                        <p className="text-blue-800">{nombreEmpleado}</p>
                        <p className="text-sm text-blue-600">No. Nomina: {nomina}</p>
                    </div>

                    {renderPreSelectedInfo()}

                    <div className="grid grid-cols-2 gap-4">
                        <div className={`p-4 rounded-lg border ${canAssignAutomaticas ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                            <h4 className="font-medium text-gray-900 mb-1">Vacaciones Automáticas</h4>
                            <p className="text-sm text-gray-600">
                                Disponibles: <span className="font-bold">{diasAutomaticasDisponibles}</span> días
                            </p>
                            <p className="text-xs text-gray-500">
                                ({vacacionesData.resumen.asignadasAutomaticamente} de {vacacionesData.resumen.diasAsignadosAutomaticamente} asignadas)
                            </p>
                        </div>

                        <div className={`p-4 rounded-lg border ${canAssignAnuales ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                            <h4 className="font-medium text-gray-900 mb-1">Vacaciones Anuales</h4>
                            <p className="text-sm text-gray-600">
                                Disponibles: <span className="font-bold">{diasAnualesDisponibles}</span> días
                            </p>
                            <p className="text-xs text-gray-500">
                                ({vacacionesData.resumen.anuales} de {vacacionesData.resumen.diasProgramables} asignadas)
                            </p>
                        </div>
                    </div>

                    {!canAssignAutomaticas && !canAssignAnuales && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                                <p className="text-yellow-800 font-medium">No hay días disponibles para asignar</p>
                            </div>
                            <p className="text-sm text-yellow-700 mt-1">
                                El empleado ya tiene asignados todos sus días de vacaciones disponibles.
                            </p>
                        </div>
                    )}

                    {(canAssignAutomaticas || canAssignAnuales) && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="tipoVacacion">Tipo de Vacación</Label>
                                <Select value={tipoVacacion} onValueChange={(value: 'Automatica' | 'Anual') => setTipoVacacion(value)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {canAssignAutomaticas && (
                                            <SelectItem value="Automatica">
                                                Automática ({diasAutomaticasDisponibles} disponibles)
                                            </SelectItem>
                                        )}
                                        {canAssignAnuales && (
                                            <SelectItem value="Anual">
                                                Anual ({diasAnualesDisponibles} disponibles)
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Agregar Más Fechas</Label>
                                <p className="text-xs text-gray-600">
                                    Usa el selector de fecha o formato: YYYY-MM-DD (ej: {anioVigente}-10-05 para 5 de octubre)
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        type="date"
                                        value={dateInput}
                                        onChange={(e) => setDateInput(e.target.value)}
                                        className="flex-1"
                                        min={`${anioVigente}-01-01`}
                                        max={`${anioVigente}-12-31`}
                                        placeholder={`${anioVigente}-MM-DD`}
                                    />
                                    <Button onClick={handleAddDate} variant="outline" size="sm">
                                        <Calendar className="h-4 w-4 mr-1" />
                                        Agregar
                                    </Button>
                                </div>
                            </div>

                            {selectedDates.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Fechas Seleccionadas ({selectedDates.length})</Label>
                                    <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                                        {selectedDates.map((date) => {
                                            try {
                                                const [year, month, day] = date.split('-').map(Number);
                                                if (!year || !month || !day) return null;

                                                const displayDate = new Date(year, month - 1, day);
                                                if (isNaN(displayDate.getTime())) return null;

                                                return (
                                                    <div key={date} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                                                        <span className="text-sm">
                                                            {format(displayDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                                                        </span>
                                                        <Button
                                                            onClick={() => handleRemoveDate(date)}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 text-red-600 hover:text-red-800"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                );
                                            } catch (error) {
                                                console.error('Error al renderizar fecha:', date, error);
                                                return null;
                                            }
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="motivoAsignacion">Motivo de Asignación *</Label>
                                <Input
                                    id="motivoAsignacion"
                                    value={motivoAsignacion}
                                    onChange={(e) => setMotivoAsignacion(e.target.value)}
                                    placeholder="Ej: Regularización de días pendientes, Ajuste por error, etc."
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="observaciones">Observaciones</Label>
                                <Textarea
                                    id="observaciones"
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    placeholder="Observaciones adicionales (opcional)"
                                    rows={3}
                                />
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
                                    <div>
                                        <p className="text-blue-900 font-medium text-sm">Nota Importante</p>
                                        <p className="text-blue-800 text-sm mt-1">
                                            Esta asignación manual <strong>no valida porcentajes de ausencia</strong> y se aplicará
                                            inmediatamente sin restricciones adicionales.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button onClick={onClose} variant="outline" disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    {(canAssignAutomaticas || canAssignAnuales) && (
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || selectedDates.length === 0 || !motivoAsignacion.trim()}
                            className="min-w-[120px]"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Asignando...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Asignar Vacaciones
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};