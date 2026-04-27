import { useState, useEffect } from 'react';
import { Calendar, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { edicionDiasEmpresaService } from '@/services/edicionDiasEmpresaService';
import type { ConfiguracionEdicionDiasEmpresa, CrearConfiguracionEdicionRequest } from '@/interfaces/Api.interface';

export function ConfigEdicionDias() {
    const [config, setConfig] = useState<ConfiguracionEdicionDiasEmpresa | null>(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const [form, setForm] = useState<CrearConfiguracionEdicionRequest>({
        fechaInicioPeriodo: '',
        fechaFinPeriodo: '',
        descripcion: '',
        habilitado: true,
    });

    useEffect(() => {
        const cargar = async () => {
            try {
                const cfg = await edicionDiasEmpresaService.obtenerConfiguracion();
                setConfig(cfg);
            } catch {
                toast.error('Error al cargar configuración');
            } finally {
                setLoading(false);
            }
        };
        cargar();
    }, []);

    const handleToggle = async () => {
        setToggling(true);
        try {
            const updated = await edicionDiasEmpresaService.toggleHabilitado();
            setConfig(updated);
            toast.success(updated.habilitado
                ? 'Edición habilitada. Los empleados ya pueden solicitar cambios.'
                : 'Edición deshabilitada.');
        } catch (err: any) {
            toast.error(err?.message || 'Error al cambiar estado');
        } finally {
            setToggling(false);
        }
    };

    const handleGuardar = async () => {
        if (!form.fechaInicioPeriodo || !form.fechaFinPeriodo) {
            toast.error('Las fechas de inicio y fin son requeridas.');
            return;
        }
        if (form.fechaFinPeriodo < form.fechaInicioPeriodo) {
            toast.error('La fecha fin debe ser posterior a la fecha inicio.');
            return;
        }
        setGuardando(true);
        try {
            const updated = await edicionDiasEmpresaService.crearConfiguracion(form);
            setConfig(updated);
            setShowForm(false);
            toast.success('Configuración guardada exitosamente.');
        } catch (err: any) {
            toast.error(err?.message || 'Error al guardar configuración');
        } finally {
            setGuardando(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 rounded-full border-2 border-continental-yellow border-t-transparent animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Estado actual */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className={[
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            config?.habilitado ? 'bg-green-100' : 'bg-gray-100',
                        ].join(' ')}>
                            <Calendar className={config?.habilitado ? 'text-green-700' : 'text-gray-400'} size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800">Edición de días empresa</h3>
                            <p className="text-sm text-gray-500">
                                {config
                                    ? config.habilitado
                                        ? `Habilitado · Periodo: ${format(parseISO(config.fechaInicioPeriodo), 'dd/MM')} – ${format(parseISO(config.fechaFinPeriodo), 'dd/MM/yyyy')}`
                                        : `Deshabilitado · Último periodo: ${format(parseISO(config.fechaInicioPeriodo), 'dd/MM')} – ${format(parseISO(config.fechaFinPeriodo), 'dd/MM/yyyy')}`
                                    : 'Sin configuración'}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                        {config && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={toggling}
                                onClick={handleToggle}
                                className={[
                                    'cursor-pointer gap-1 text-xs',
                                    config.habilitado
                                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                                        : 'border-green-200 text-green-700 hover:bg-green-50',
                                ].join(' ')}
                            >
                                {config.habilitado ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                {toggling ? 'Procesando...' : config.habilitado ? 'Deshabilitar' : 'Habilitar'}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="cursor-pointer gap-1 text-xs"
                            onClick={() => {
                                setForm({
                                    fechaInicioPeriodo: config?.fechaInicioPeriodo ?? '',
                                    fechaFinPeriodo: config?.fechaFinPeriodo ?? '',
                                    descripcion: config?.descripcion ?? '',
                                    habilitado: true,
                                });
                                setShowForm(!showForm);
                            }}
                        >
                            <Plus size={14} /> {config ? 'Nueva configuración' : 'Configurar'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Formulario */}
            {showForm && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                    <h4 className="font-medium text-gray-800">Nueva configuración de periodo</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Fecha inicio del periodo *
                            </label>
                            <input
                                type="date"
                                value={form.fechaInicioPeriodo}
                                onChange={e => setForm(f => ({ ...f, fechaInicioPeriodo: e.target.value }))}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Fecha fin del periodo *
                            </label>
                            <input
                                type="date"
                                value={form.fechaFinPeriodo}
                                onChange={e => setForm(f => ({ ...f, fechaFinPeriodo: e.target.value }))}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
                        <input
                            type="text"
                            value={form.descripcion ?? ''}
                            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                            placeholder="Ej. Semana de edición Mayo 2026"
                            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="habilitado-check"
                            checked={form.habilitado}
                            onChange={e => setForm(f => ({ ...f, habilitado: e.target.checked }))}
                            className="w-4 h-4 accent-continental-yellow"
                        />
                        <label htmlFor="habilitado-check" className="text-sm text-gray-700">
                            Habilitar inmediatamente al guardar
                        </label>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" className="cursor-pointer" onClick={() => setShowForm(false)}>
                            Cancelar
                        </Button>
                        <Button
                            disabled={guardando}
                            className="cursor-pointer bg-continental-yellow text-black hover:bg-yellow-400"
                            onClick={handleGuardar}
                        >
                            {guardando ? 'Guardando...' : 'Guardar configuración'}
                        </Button>
                    </div>
                </div>
            )}

            <p className="text-xs text-gray-400">
                Cuando la edición está habilitada, los empleados sindicalizados pueden solicitar cambiar sus días asignados por empresa
                a una fecha dentro del periodo configurado. Cada solicitud requiere aprobación del jefe de área.
            </p>
        </div>
    );
}
