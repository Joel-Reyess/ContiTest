import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { useVacationConfig } from '@/hooks/useVacationConfig';
import { excepcionesManningService } from '@/services/excepcionesManningService';
import { areasService } from '@/services/areasService';
import type { ExcepcionManning } from '@/interfaces/Api.interface';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ManningExceptionConfigurationProps {
    currentDate: Date;
    areaId?: number;
    areaNombre?: string;
    manningBase: number;
    onManningChange: (newManning: number) => void;
    areas?: { id: string; name: string; manning?: number }[];
}

interface ExceptionFormData {
    anio: number;
    mes: number;
    manningRequeridoExcepcion: number;
    motivo: string;
}

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const ManningExceptionConfiguration: React.FC<ManningExceptionConfigurationProps> = ({
    currentDate,
    areaId,
    manningBase,
    onManningChange,
    areas
}) => {
    const { config } = useVacationConfig();
    const [excepciones, setExcepciones] = useState<ExcepcionManning[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingException, setEditingException] = useState<ExcepcionManning | null>(null);
    const [editingBase, setEditingBase] = useState(false);
    const [baseDraft, setBaseDraft] = useState<number>(0);
    const [savingBase, setSavingBase] = useState(false);
    const [baseOverride, setBaseOverride] = useState<number | null>(null);
    const [formData, setFormData] = useState<ExceptionFormData>({
        anio: config?.anioVigente || currentDate.getFullYear(),
        mes: currentDate.getMonth() + 1,
        manningRequeridoExcepcion: manningBase,
        motivo: ''
    });

    const currentYear = config?.anioVigente || currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Obtener manning base del área seleccionada
    const getManningBase = (): number => {
        if (baseOverride !== null) return baseOverride;
        if (!areaId || !areas) return manningBase;
        const selectedArea = areas.find(area => area.id === areaId.toString());
        return selectedArea?.manning || manningBase;
    };

    const actualManningBase = getManningBase();

    // Resetear el override cuando cambia el área
    useEffect(() => {
        setBaseOverride(null);
        setEditingBase(false);
    }, [areaId]);

    const handleSaveBaseManning = async () => {
        if (!areaId) return;
        if (baseDraft <= 0) {
            toast.error('El manning debe ser mayor a 0');
            return;
        }
        setSavingBase(true);
        try {
            await areasService.updateAreaManning(areaId, baseDraft);
            setBaseOverride(baseDraft);
            setEditingBase(false);
            onManningChange(baseDraft);
            toast.success('Manning base actualizado');
        } catch (error: any) {
            console.error('Error updating base manning:', error);
            toast.error(error?.message || 'Error al actualizar el manning base');
        } finally {
            setSavingBase(false);
        }
    };

    // Cargar excepciones al montar el componente y cuando cambie el área o fecha
    useEffect(() => {
        if (areaId) {
            loadExcepciones();
        }
    }, [areaId, currentYear]);

    // Actualizar año del formulario cuando cambie currentDate o config
    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            anio: currentYear,
            mes: currentMonth
        }));
    }, [currentYear, currentMonth]);

    // Actualizar manning base cuando cambie el área
    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            manningRequeridoExcepcion: actualManningBase
        }));
    }, [actualManningBase]);

    // Aplicar excepción del mes actual al manning
    useEffect(() => {
        if (areaId && excepciones.length >= 0) {
            const excepcionActual = excepciones.find(exc =>
                exc.anio === currentYear &&
                exc.mes === currentMonth &&
                exc.activa
            );

            if (excepcionActual) {
                console.log('🔧 Aplicando excepción de manning:', excepcionActual.manningRequeridoExcepcion);
                onManningChange(excepcionActual.manningRequeridoExcepcion);
            } else {
                onManningChange(actualManningBase);
            }
        }
    }, [excepciones, currentYear, currentMonth, areaId, actualManningBase, onManningChange]);

    const loadExcepciones = async () => {
        if (!areaId) return;

        setLoading(true);
        try {
            const data = await excepcionesManningService.getExcepcionesManning(
                areaId,
                currentYear,
                undefined,
                true
            );
            setExcepciones(data);
            console.log('📋 Excepciones de manning cargadas:', data);
        } catch (error: any) {
            // Manejar errores silenciosamente - si no tiene permisos, simplemente no mostrar excepciones
            if (error.response?.status !== 403) {
                console.error('Error loading manning exceptions:', error);
                toast.error('Error al cargar excepciones de manning');
            }
            setExcepciones([]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateException = async () => {
        if (!areaId || formData.manningRequeridoExcepcion <= 0) {
            toast.error('Por favor complete todos los campos requeridos');
            return;
        }

        try {
            const newException = await excepcionesManningService.createExcepcionManning({
                areaId,
                anio: formData.anio,
                mes: formData.mes,
                manningRequeridoExcepcion: formData.manningRequeridoExcepcion,
                motivo: formData.motivo || undefined
            });

            setExcepciones(prev => [...prev, newException]);
            toast.success('Excepción de manning creada correctamente');
            resetForm();
        } catch (error: any) {
            console.error('Error creating manning exception:', error);
            toast.error(error.message || 'Error al crear excepción de manning');
        }
    };

    const handleUpdateException = async () => {
        if (!editingException || !areaId) return;

        try {
            const updatedException = await excepcionesManningService.updateExcepcionManning(
                editingException.id,
                {
                    areaId,
                    anio: formData.anio,
                    mes: formData.mes,
                    manningRequeridoExcepcion: formData.manningRequeridoExcepcion,
                    motivo: formData.motivo || undefined
                }
            );

            setExcepciones(prev =>
                prev.map(exc => exc.id === editingException.id ? updatedException : exc)
            );
            toast.success('Excepción de manning actualizada correctamente');
            resetForm();
        } catch (error: any) {
            console.error('Error updating manning exception:', error);
            toast.error(error.message || 'Error al actualizar excepción de manning');
        }
    };

    const handleDeleteException = async (excepcionId: number) => {
        if (!confirm('¿Está seguro de que desea eliminar esta excepción de manning?')) return;

        try {
            await excepcionesManningService.deleteExcepcionManning(excepcionId);
            setExcepciones(prev => prev.filter(exc => exc.id !== excepcionId));
            toast.success('Excepción de manning eliminada correctamente');
        } catch (error: any) {
            console.error('Error deleting manning exception:', error);
            toast.error(error.message || 'Error al eliminar excepción de manning');
        }
    };

    const startEdit = (excepcion: ExcepcionManning) => {
        setEditingException(excepcion);
        setFormData({
            anio: excepcion.anio,
            mes: excepcion.mes,
            manningRequeridoExcepcion: excepcion.manningRequeridoExcepcion,
            motivo: excepcion.motivo || ''
        });
        setShowForm(true);
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingException(null);
        setFormData({
            anio: currentYear,
            mes: currentMonth,
            manningRequeridoExcepcion: actualManningBase,
            motivo: ''
        });
    };

    const getExcepcionParaMes = (mes: number) => {
        return excepciones.find(exc => exc.anio === currentYear && exc.mes === mes && exc.activa);
    };

    const getCurrentMonthException = () => {
        return getExcepcionParaMes(currentMonth);
    };

    const currentException = getCurrentMonthException();

    if (!areaId) {
        return (
            <div className="bg-white border border-gray-200 p-4 rounded-lg">
                <div className="text-sm font-semibold text-gray-900 mb-3">
                    Excepciones de Manning
                </div>
                <div className="text-center py-4 text-sm text-gray-500">
                    Seleccione un área para configurar excepciones de manning
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border border-gray-200 p-4 rounded-lg">
            <div className="text-sm font-semibold text-gray-900 mb-3">
                Excepciones de Manning
            </div>

            {/* Header con información del mes actual */}
            <div className="space-y-3 mb-4">
                <div className="text-center">
                    <div className="text-lg font-semibold text-gray-700 mb-1">
                        {currentException ? (
                            <>
                                Manning: {currentException.manningRequeridoExcepcion}
                                <span className="text-sm text-orange-600 ml-2">(Excepción)</span>
                            </>
                        ) : (
                            <>
                                Manning: {actualManningBase}
                                <span className="text-sm text-gray-500 ml-2">(Base)</span>
                            </>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mb-3">
                        {format(currentDate, "MMMM 'de' yyyy", { locale: es })}
                    </div>

                    {/* Editar manning base del área (PATCH /api/Area/{id}/manning) */}
                    {editingBase ? (
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <input
                                type="number"
                                min={1}
                                max={500}
                                value={baseDraft}
                                onChange={(e) => setBaseDraft(parseInt(e.target.value) || 0)}
                                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            />
                            <Button
                                onClick={handleSaveBaseManning}
                                disabled={savingBase}
                                className="text-xs py-1 px-2"
                                style={{ backgroundColor: 'var(--color-continental-yellow)' }}
                            >
                                <Save size={12} className="mr-1" />
                                Guardar
                            </Button>
                            <Button
                                onClick={() => { setEditingBase(false); }}
                                variant="outline"
                                className="text-xs py-1 px-2"
                            >
                                <X size={12} />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex justify-center mb-2">
                            <Button
                                onClick={() => {
                                    setBaseDraft(actualManningBase);
                                    setEditingBase(true);
                                }}
                                variant="outline"
                                className="text-xs py-1 px-2"
                            >
                                <Edit2 size={12} className="mr-1" />
                                Editar manning base
                            </Button>
                        </div>
                    )}

                    {currentException?.motivo && (
                        <div className="text-xs text-gray-600 bg-orange-50 p-2 rounded">
                            {currentException.motivo}
                        </div>
                    )}
                </div>

                {/* Botón para agregar nueva excepción */}
                <div className="flex justify-center">
                    <Button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 text-sm"
                        variant="outline"
                    >
                        <Plus size={16} />
                        Nueva Excepción
                    </Button>
                </div>
            </div>

            {/* Formulario de creación/edición */}
            {showForm && (
                <div className="border border-gray-300 rounded-lg p-3 mb-4 bg-gray-50">
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">
                                    Año
                                </label>
                                <select
                                    value={formData.anio}
                                    onChange={(e) => setFormData(prev => ({ ...prev, anio: parseInt(e.target.value) }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                >
                                    {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">
                                    Mes
                                </label>
                                <select
                                    value={formData.mes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, mes: parseInt(e.target.value) }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                >
                                    {MESES.map((mes, index) => (
                                        <option key={index + 1} value={index + 1}>{mes}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">
                                Manning Requerido
                            </label>
                            <input
                                type="number"
                                value={formData.manningRequeridoExcepcion}
                                onChange={(e) => setFormData(prev => ({ ...prev, manningRequeridoExcepcion: parseInt(e.target.value) }))}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                min="1"
                                max="200"
                            />
                            <div className="text-xs text-gray-500 mt-1">
                                Manning base: {actualManningBase}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">
                                Motivo (opcional)
                            </label>
                            <textarea
                                value={formData.motivo}
                                onChange={(e) => setFormData(prev => ({ ...prev, motivo: e.target.value }))}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                rows={2}
                                maxLength={500}
                                placeholder="Descripción del motivo de la excepción"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={editingException ? handleUpdateException : handleCreateException}
                                className="flex-1 text-sm py-1"
                                style={{ backgroundColor: 'var(--color-continental-yellow)' }}
                            >
                                <Save size={14} className="mr-1" />
                                {editingException ? 'Actualizar' : 'Crear'}
                            </Button>
                            <Button
                                onClick={resetForm}
                                variant="outline"
                                className="flex-1 text-sm py-1"
                            >
                                <X size={14} className="mr-1" />
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista de excepciones por mes */}
            <div className="space-y-2">
                <div className="text-xs font-medium text-gray-600 mb-2">
                    Excepciones para {currentYear}
                </div>

                {loading ? (
                    <div className="text-center py-4 text-sm text-gray-500">
                        Cargando excepciones...
                    </div>
                ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                        {MESES.map((mesNombre, index) => {
                            const mes = index + 1;
                            const excepcion = getExcepcionParaMes(mes);
                            const isCurrentMonth = mes === currentMonth;

                            return (
                                <div
                                    key={mes}
                                    className={`flex items-center justify-between py-2 px-3 rounded border ${isCurrentMonth
                                            ? 'bg-blue-50 border-blue-200'
                                            : excepcion
                                                ? 'bg-orange-50 border-orange-200'
                                                : 'bg-gray-50 border-gray-200'
                                        }`}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-medium text-gray-800">
                                                {mesNombre}
                                            </div>
                                            {isCurrentMonth && (
                                                <Calendar size={12} className="text-blue-600" />
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {excepcion
                                                ? `${excepcion.manningRequeridoExcepcion} (Excepción)`
                                                : `${actualManningBase} (Base)`
                                            }
                                        </div>
                                        {excepcion?.motivo && (
                                            <div className="text-xs text-gray-400 mt-1 truncate">
                                                {excepcion.motivo}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-1">
                                        {excepcion ? (
                                            <>
                                                <button
                                                    onClick={() => startEdit(excepcion)}
                                                    className="p-1 text-blue-600 hover:text-blue-700"
                                                    title="Editar excepción"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteException(excepcion.id)}
                                                    className="p-1 text-red-600 hover:text-red-700"
                                                    title="Eliminar excepción"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, mes }));
                                                    setShowForm(true);
                                                }}
                                                className="p-1 text-green-600 hover:text-green-700"
                                                title="Crear excepción"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};