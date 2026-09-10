import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { useVacationConfig } from '@/hooks/useVacationConfig';
import { excepcionesManningService } from '@/services/excepcionesManningService';
import type { ExcepcionManning } from '@/interfaces/Api.interface';
import type { Grupo } from '@/interfaces/Grupo.interface';
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
    /** Grupos marcados en el calendario (ids como string, igual que los filtros). */
    selectedGroups?: string[];
    /** Grupos del área, para saber si están todos marcados o sólo una parte. */
    currentAreaGroups?: Grupo[];
    /** Se llama tras guardar, editar o quitar una excepción, para refrescar el calendario. */
    onExcepcionesCambiadas?: () => void;
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
    areas,
    selectedGroups,
    currentAreaGroups,
    onExcepcionesCambiadas
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

    // ─── ¿A quién le aplica el cambio? ─────────────────────────────────────
    // Antes todo ajuste se guardaba como excepción de ÁREA, así que con un solo
    // grupo marcado se movía el manning de todos. Ahora: con todos los grupos
    // del área marcados (o si esta vista no maneja grupos) es la excepción de
    // área, como siempre; con sólo una parte, una excepción por grupo marcado.
    const gruposDelArea = currentAreaGroups ?? [];
    const idsSeleccionados = (selectedGroups ?? [])
        .map(id => parseInt(id, 10))
        .filter(id => !Number.isNaN(id) && gruposDelArea.some(g => g.grupoId === id));
    const sinGruposSeleccionados = gruposDelArea.length > 0 && idsSeleccionados.length === 0;
    const alcancePorGrupo =
        gruposDelArea.length > 0 &&
        idsSeleccionados.length > 0 &&
        idsSeleccionados.length < gruposDelArea.length;
    const nombreDeGrupo = (grupoId: number) =>
        gruposDelArea.find(g => g.grupoId === grupoId)?.rol ?? `Grupo ${grupoId}`;

    const excepcionDeArea = (anio: number, mes: number) =>
        excepciones.find(e => e.anio === anio && e.mes === mes && e.activa && e.grupoId == null);
    const excepcionDeGrupo = (anio: number, mes: number, grupoId: number) =>
        excepciones.find(e => e.anio === anio && e.mes === mes && e.activa && e.grupoId === grupoId);
    // Lo que de verdad le aplica a un grupo: la suya, si no la del área, si no el base.
    const manningEfectivoDeGrupo = (anio: number, mes: number, grupoId: number) =>
        excepcionDeGrupo(anio, mes, grupoId)?.manningRequeridoExcepcion
        ?? excepcionDeArea(anio, mes)?.manningRequeridoExcepcion
        ?? actualManningBase;
    // Grupos que este mes tienen manning propio: un cambio de área NO los mueve.
    const gruposConManningPropio = gruposDelArea.filter(
        g => excepcionDeGrupo(currentYear, currentMonth, g.grupoId)
    );

    /**
     * Crea o actualiza la excepción del mes para cada destino del alcance
     * actual: la de área, o una por cada grupo marcado. Si el destino ya tenía
     * excepción ese mes se actualiza en vez de chocar con "Ya existe una
     * excepción activa". Devuelve cuántas guardó.
     */
    const guardarParaAlcance = async (
        anio: number,
        mes: number,
        manning: number,
        opciones: { motivo?: string; motivoSiEsNueva?: string } = {}
    ): Promise<number> => {
        const destinos: (number | null)[] = alcancePorGrupo ? idsSeleccionados : [null];
        const guardadas: ExcepcionManning[] = [];
        for (const grupoId of destinos) {
            const existente = grupoId == null
                ? excepcionDeArea(anio, mes)
                : excepcionDeGrupo(anio, mes, grupoId);
            if (existente) {
                guardadas.push(await excepcionesManningService.updateExcepcionManning(existente.id, {
                    areaId: areaId!,
                    anio,
                    mes,
                    manningRequeridoExcepcion: manning,
                    motivo: opciones.motivo ?? existente.motivo ?? undefined,
                }));
            } else {
                guardadas.push(await excepcionesManningService.createExcepcionManning({
                    areaId: areaId!,
                    grupoId,
                    anio,
                    mes,
                    manningRequeridoExcepcion: manning,
                    motivo: opciones.motivo ?? opciones.motivoSiEsNueva,
                }));
            }
        }
        setExcepciones(prev => {
            const porId = new Map(prev.map(e => [e.id, e]));
            guardadas.forEach(g => porId.set(g.id, g));
            return Array.from(porId.values());
        });
        onExcepcionesCambiadas?.();
        return guardadas.length;
    };

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
        // Sin grupos marcados, "guardar" caería al alcance de área y movería a
        // todos: justo lo que se está corrigiendo.
        if (sinGruposSeleccionados) {
            toast.error('Marca al menos un grupo para editar su manning');
            return;
        }
        setSavingBase(true);
        try {
            // Aislado por mes (excepción del mes mostrado, nunca el base global)
            // y ahora también por alcance: área completa o sólo los grupos
            // marcados. Los tableros resuelven grupo -> área -> base.
            const n = await guardarParaAlcance(currentYear, currentMonth, baseDraft, {
                motivoSiEsNueva: 'Ajuste de manning del mes',
            });
            setEditingBase(false);
            // El número de arriba del calendario es el del ÁREA: sólo se mueve
            // cuando el cambio fue de área.
            if (!alcancePorGrupo) onManningChange(baseDraft);
            toast.success(
                alcancePorGrupo
                    ? `Manning de ${MESES[currentMonth - 1]} ${currentYear} actualizado para ${n} grupo(s)`
                    : `Manning de ${MESES[currentMonth - 1]} ${currentYear} actualizado`
            );
        } catch (error: any) {
            console.error('Error updating month manning:', error);
            toast.error(error?.message || 'Error al actualizar el manning del mes');
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
            // Sólo la de toda el área: este valor es el número del área en el
            // calendario. La de un grupo no debe sustituirlo.
            const excepcionActual = excepciones.find(exc =>
                exc.anio === currentYear &&
                exc.mes === currentMonth &&
                exc.activa &&
                exc.grupoId == null
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
        if (sinGruposSeleccionados) {
            toast.error('Marca al menos un grupo para crear su excepción');
            return;
        }

        try {
            // Con alcance de área es la excepción de siempre; con grupos
            // marcados, una por grupo.
            const n = await guardarParaAlcance(formData.anio, formData.mes, formData.manningRequeridoExcepcion, {
                motivo: formData.motivo || undefined,
            });
            toast.success(
                alcancePorGrupo
                    ? `Excepción de manning guardada para ${n} grupo(s)`
                    : 'Excepción de manning creada correctamente'
            );
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
            onExcepcionesCambiadas?.();
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
            onExcepcionesCambiadas?.();
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
        // La de área. Sin el filtro de grupo, una de grupo aparecía aquí y al
        // editar "el manning del área" se sobreescribía la de ese grupo.
        return excepcionDeArea(currentYear, mes);
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
                {/* A quién le va a pegar el cambio. Antes no se decía, y aun con
                    un grupo marcado se estaba moviendo el manning de toda el área. */}
                <div className={`text-xs rounded p-2 border ${
                    sinGruposSeleccionados
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : alcancePorGrupo
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}>
                    {sinGruposSeleccionados ? (
                        'Marca al menos un grupo para editar su manning.'
                    ) : alcancePorGrupo ? (
                        <>Los cambios aplican sólo a: <strong>{idsSeleccionados.map(nombreDeGrupo).join(', ')}</strong></>
                    ) : (
                        <>
                            Los cambios aplican a toda el área.
                            {gruposConManningPropio.length > 0 && (
                                <span className="block mt-1 text-orange-700">
                                    Ojo: {gruposConManningPropio.map(g => g.rol).join(', ')} tiene(n) manning
                                    propio este mes y no cambia(n) con el del área.
                                </span>
                            )}
                        </>
                    )}
                </div>
                <div className="text-center">
                    {alcancePorGrupo ? (
                        // Con grupos marcados, el manning que de verdad le aplica
                        // a cada uno (propio, del área o base).
                        <div className="space-y-1 mb-1">
                            {idsSeleccionados.map(gid => {
                                const propia = excepcionDeGrupo(currentYear, currentMonth, gid);
                                return (
                                    <div key={gid} className="flex justify-between text-sm">
                                        <span className="text-gray-600">{nombreDeGrupo(gid)}</span>
                                        <span className="font-semibold text-gray-700">
                                            {manningEfectivoDeGrupo(currentYear, currentMonth, gid)}
                                            <span className={`text-xs ml-1 ${propia ? 'text-orange-600' : 'text-gray-500'}`}>
                                                {propia ? '(Grupo)' : excepcionDeArea(currentYear, currentMonth) ? '(Área)' : '(Base)'}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
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
                    )}
                    <div className="text-xs text-gray-500 mb-3">
                        {format(currentDate, "MMMM 'de' yyyy", { locale: es })}
                    </div>

                    {/* Editar manning del mes mostrado vía excepción (anio, mes) */}
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
                    ) : sinGruposSeleccionados ? null : (
                        <div className="flex justify-center mb-2">
                            <Button
                                onClick={() => {
                                    setBaseDraft(
                                        alcancePorGrupo
                                            ? manningEfectivoDeGrupo(currentYear, currentMonth, idsSeleccionados[0])
                                            : actualManningBase
                                    );
                                    setEditingBase(true);
                                }}
                                variant="outline"
                                className="text-xs py-1 px-2"
                            >
                                <Edit2 size={12} className="mr-1" />
                                Editar manning de {MESES[currentMonth - 1]}
                                {alcancePorGrupo
                                    ? ` (${idsSeleccionados.length} grupo${idsSeleccionados.length === 1 ? '' : 's'})`
                                    : ''}
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
                {!sinGruposSeleccionados && (
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
                )}
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
                        {alcancePorGrupo ? (
                            // Con grupos marcados: por mes, lo que le aplica a
                            // cada grupo, con editar/quitar sobre SU excepción.
                            MESES.map((mesNombre, index) => {
                                const mes = index + 1;
                                const isCurrentMonth = mes === currentMonth;
                                return (
                                    <div
                                        key={mes}
                                        className={`py-2 px-3 rounded border ${isCurrentMonth ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                                                {mesNombre}
                                                {isCurrentMonth && <Calendar size={12} className="text-blue-600" />}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, mes }));
                                                    setShowForm(true);
                                                }}
                                                className="p-1 text-green-600 hover:text-green-700"
                                                title="Excepción para los grupos marcados"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        {idsSeleccionados.map(gid => {
                                            const propia = excepcionDeGrupo(currentYear, mes, gid);
                                            return (
                                                <div key={gid} className="flex items-center justify-between text-xs text-gray-600 pl-2">
                                                    <span>
                                                        {nombreDeGrupo(gid)}: {manningEfectivoDeGrupo(currentYear, mes, gid)}{' '}
                                                        <span className={propia ? 'text-orange-600' : 'text-gray-400'}>
                                                            {propia ? '(Grupo)' : excepcionDeArea(currentYear, mes) ? '(Área)' : '(Base)'}
                                                        </span>
                                                    </span>
                                                    {propia && (
                                                        <span className="flex gap-1">
                                                            <button
                                                                onClick={() => startEdit(propia)}
                                                                className="p-1 text-blue-600 hover:text-blue-700"
                                                                title="Editar excepción del grupo"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteException(propia.id)}
                                                                className="p-1 text-red-600 hover:text-red-700"
                                                                title="Quitar excepción del grupo"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })
                        ) : MESES.map((mesNombre, index) => {
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