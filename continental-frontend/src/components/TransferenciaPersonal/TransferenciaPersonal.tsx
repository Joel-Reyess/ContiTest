import { useState, useEffect, useCallback, type JSX } from 'react';
import { Navbar } from '@/components/Navbar/Navbar';
import { groupService, type HistorialTransferenciaDto } from '@/services/groupService';
import { httpClient } from '@/services/httpClient';
import type { ApiResponse, GrupoDetail, UsuarioInfoDto } from '@/interfaces/TransferenciaPersonal.interface';
import { toast } from 'sonner';
import { Loader2, ArrowRight, AlertTriangle, History, Users, RefreshCw } from 'lucide-react';

type Tab = 'transferencia' | 'historial';

export const TransferenciaPersonal = (): JSX.Element => {
    const [activeTab, setActiveTab] = useState<Tab>('transferencia');

    // Datos base
    const [grupos, setGrupos] = useState<GrupoDetail[]>([]);
    const [loadingGrupos, setLoadingGrupos] = useState(true);

    // Selección transferencia
    const [grupoOrigenId, setGrupoOrigenId] = useState<number | ''>('');
    const [empleados, setEmpleados] = useState<UsuarioInfoDto[]>([]);
    const [loadingEmpleados, setLoadingEmpleados] = useState(false);
    const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<UsuarioInfoDto | null>(null);
    const [grupoDestinoId, setGrupoDestinoId] = useState<number | ''>('');
    const [motivo, setMotivo] = useState('');

    // Estado de ejecución
    const [transfiriendo, setTransfiriendo] = useState(false);
    const [advertenciaManning, setAdvertenciaManning] = useState<string | null>(null);
    const [confirmandoConAdvertencia, setConfirmandoConAdvertencia] = useState(false);

    // Historial
    const [historial, setHistorial] = useState<HistorialTransferenciaDto[]>([]);
    const [loadingHistorial, setLoadingHistorial] = useState(false);

    // Cargar grupos al montar
    useEffect(() => {
        const fetchGrupos = async () => {
            try {
                const res: ApiResponse<GrupoDetail[]> = await httpClient.get<GrupoDetail[]>('/api/Grupo');
                if (res.success && res.data) {
                    setGrupos(res.data);
                }
            } catch {
                toast.error('Error al cargar grupos');
            } finally {
                setLoadingGrupos(false);
            }
        };
        fetchGrupos();
    }, []);

    // Cargar empleados al seleccionar grupo origen
    const cargarEmpleados = useCallback(async (grupoId: number) => {
        setLoadingEmpleados(true);
        setEmpleadoSeleccionado(null);
        setGrupoDestinoId('');
        setAdvertenciaManning(null);
        try {
            const res: ApiResponse<{ usuarios: UsuarioInfoDto[] }> = await httpClient.post('/api/User/empleados-sindicalizados', {
                GrupoId: grupoId,
                Page: 1,
                PageSize: 200
            });
            if (res.success && res.data) {
                setEmpleados(res.data.usuarios);
            }
        } catch {
            toast.error('Error al cargar empleados del grupo');
        } finally {
            setLoadingEmpleados(false);
        }
    }, []);

    const handleGrupoOrigenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setGrupoOrigenId(val === '' ? '' : Number(val));
        if (val !== '') cargarEmpleados(Number(val));
        else {
            setEmpleados([]);
            setEmpleadoSeleccionado(null);
            setGrupoDestinoId('');
        }
    };

    const handleSeleccionarEmpleado = (emp: UsuarioInfoDto) => {
        setEmpleadoSeleccionado(emp);
        setGrupoDestinoId('');
        setAdvertenciaManning(null);
        setConfirmandoConAdvertencia(false);
    };

    const cargarHistorial = useCallback(async () => {
        setLoadingHistorial(true);
        try {
            const data = await groupService.getHistorialTransferencias();
            setHistorial(data);
        } catch {
            toast.error('Error al cargar historial');
        } finally {
            setLoadingHistorial(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'historial') cargarHistorial();
    }, [activeTab, cargarHistorial]);

    const gruposDestino = grupos.filter(g => g.grupoId !== grupoOrigenId);

    const ejecutarTransferencia = async () => {
        if (!empleadoSeleccionado || grupoDestinoId === '') return;
        setTransfiriendo(true);
        setAdvertenciaManning(null);
        setConfirmandoConAdvertencia(false);
        try {
            const resultado = await groupService.transferirEmpleado({
                empleadoId: empleadoSeleccionado.id,
                grupoDestinoId: Number(grupoDestinoId),
                motivo: motivo.trim() || undefined
            });

            if (resultado.advertenciaManning && resultado.detallesManning) {
                setAdvertenciaManning(resultado.detallesManning);
                // La transferencia ya se realizó aunque haya advertencia
            }

            toast.success(resultado.mensaje);

            // Limpiar selección y recargar empleados del grupo origen
            setEmpleadoSeleccionado(null);
            setGrupoDestinoId('');
            setMotivo('');
            if (grupoOrigenId !== '') cargarEmpleados(Number(grupoOrigenId));
        } catch (err: any) {
            toast.error(err?.message || 'Error al transferir empleado');
        } finally {
            setTransfiriendo(false);
        }
    };

    const grupoOrigenNombre = grupos.find(g => g.grupoId === grupoOrigenId);
    const grupoDestinoNombre = grupos.find(g => g.grupoId === Number(grupoDestinoId));

    const puedeTransferir =
        empleadoSeleccionado !== null &&
        grupoDestinoId !== '' &&
        !transfiriendo;

    return (
        <div className="flex flex-col min-h-screen w-full">
            <div className="flex-1 bg-gray-50 p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Transferencia de Personal</h1>
                            <p className="text-sm text-gray-500 mt-1">Mueve empleados entre grupos de forma inmediata</p>
                        </div>
                        {/* Tabs */}
                        <div className="flex gap-2 bg-white border rounded-lg p-1">
                            <button
                                onClick={() => setActiveTab('transferencia')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'transferencia'
                                        ? 'bg-continental-yellow text-continental-black'
                                        : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <Users size={16} />
                                Transferencia
                            </button>
                            <button
                                onClick={() => setActiveTab('historial')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'historial'
                                        ? 'bg-continental-yellow text-continental-black'
                                        : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <History size={16} />
                                Historial
                            </button>
                        </div>
                    </div>

                    {/* ==================== TAB TRANSFERENCIA ==================== */}
                    {activeTab === 'transferencia' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Panel 1: Seleccionar grupo origen */}
                            <div className="bg-white rounded-lg border p-5 space-y-4">
                                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                    <span className="w-6 h-6 bg-continental-yellow text-continental-black rounded-full flex items-center justify-center text-xs font-bold">1</span>
                                    Grupo origen
                                </h2>

                                {loadingGrupos ? (
                                    <div className="flex justify-center py-4">
                                        <Loader2 className="animate-spin h-6 w-6 text-gray-400" />
                                    </div>
                                ) : (
                                    <select
                                        value={grupoOrigenId}
                                        onChange={handleGrupoOrigenChange}
                                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                                    >
                                        <option value="">Selecciona un grupo...</option>
                                        {grupos.map(g => (
                                            <option key={g.grupoId} value={g.grupoId}>
                                                {g.rol} — {g.areaNombre}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                {/* Lista empleados */}
                                {grupoOrigenId !== '' && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-2 font-medium">
                                            Empleados en este grupo ({empleados.length})
                                        </p>
                                        {loadingEmpleados ? (
                                            <div className="flex justify-center py-6">
                                                <Loader2 className="animate-spin h-5 w-5 text-gray-400" />
                                            </div>
                                        ) : empleados.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center py-4">Sin empleados en este grupo</p>
                                        ) : (
                                            <ul className="space-y-1 max-h-96 overflow-y-auto">
                                                {empleados.map(emp => (
                                                    <li key={emp.id}>
                                                        <button
                                                            onClick={() => handleSeleccionarEmpleado(emp)}
                                                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${empleadoSeleccionado?.id === emp.id
                                                                    ? 'bg-continental-yellow text-continental-black font-semibold'
                                                                    : 'hover:bg-gray-100 text-gray-700'
                                                                }`}
                                                        >
                                                            <span className="font-medium">{emp.fullName}</span>
                                                            <span className="text-xs block text-gray-500">Nómina: {emp.nomina}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Panel 2: Empleado seleccionado */}
                            <div className="bg-white rounded-lg border p-5 space-y-4">
                                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                    <span className="w-6 h-6 bg-continental-yellow text-continental-black rounded-full flex items-center justify-center text-xs font-bold">2</span>
                                    Empleado a transferir
                                </h2>

                                {!empleadoSeleccionado ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                        <Users size={40} className="mb-2 opacity-30" />
                                        <p className="text-sm">Selecciona un empleado del grupo origen</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Tarjeta empleado */}
                                        <div className="bg-gray-50 rounded-lg p-4 border">
                                            <p className="font-bold text-gray-900">{empleadoSeleccionado.fullName}</p>
                                            <p className="text-sm text-gray-500">Nómina: {empleadoSeleccionado.nomina}</p>
                                            <p className="text-sm text-gray-500">Grupo actual: <span className="font-medium">{grupoOrigenNombre?.rol}</span></p>
                                            <p className="text-sm text-gray-500">Área: {empleadoSeleccionado.area?.nombreGeneral}</p>
                                        </div>

                                        {/* Selector grupo destino */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Grupo destino</label>
                                            <select
                                                value={grupoDestinoId}
                                                onChange={e => {
                                                    setGrupoDestinoId(e.target.value === '' ? '' : Number(e.target.value));
                                                    setAdvertenciaManning(null);
                                                    setConfirmandoConAdvertencia(false);
                                                }}
                                                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                                            >
                                                <option value="">Selecciona grupo destino...</option>
                                                {gruposDestino.map(g => (
                                                    <option key={g.grupoId} value={g.grupoId}>
                                                        {g.rol} — {g.areaNombre}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Campo motivo */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Motivo <span className="text-gray-400 font-normal">(opcional)</span>
                                            </label>
                                            <textarea
                                                value={motivo}
                                                onChange={e => setMotivo(e.target.value)}
                                                rows={3}
                                                maxLength={500}
                                                placeholder="Describe el motivo de la transferencia..."
                                                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                                            />
                                            <p className="text-xs text-gray-400 text-right">{motivo.length}/500</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Panel 3: Confirmación */}
                            <div className="bg-white rounded-lg border p-5 space-y-4">
                                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                    <span className="w-6 h-6 bg-continental-yellow text-continental-black rounded-full flex items-center justify-center text-xs font-bold">3</span>
                                    Confirmar transferencia
                                </h2>

                                {!empleadoSeleccionado || grupoDestinoId === '' ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                        <ArrowRight size={40} className="mb-2 opacity-30" />
                                        <p className="text-sm text-center">Completa los pasos anteriores para confirmar</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Resumen */}
                                        <div className="bg-gray-50 rounded-lg p-4 border space-y-2 text-sm">
                                            <p className="font-semibold text-gray-800">Resumen</p>
                                            <div className="flex items-center gap-2 text-gray-700">
                                                <span className="font-medium">{empleadoSeleccionado.fullName}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <span className="bg-gray-200 px-2 py-0.5 rounded text-xs">{grupoOrigenNombre?.rol}</span>
                                                <ArrowRight size={14} />
                                                <span className="bg-continental-yellow px-2 py-0.5 rounded text-xs font-medium">{grupoDestinoNombre?.rol}</span>
                                            </div>
                                            <p className="text-gray-500 text-xs">
                                                Área destino: {grupoDestinoNombre?.areaNombre}
                                            </p>
                                            <p className="text-gray-500 text-xs">
                                                Los días de calendario futuros se actualizarán automáticamente.
                                            </p>
                                        </div>

                                        {/* Advertencia manning */}
                                        {advertenciaManning && (
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex gap-2">
                                                <AlertTriangle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                                                <p className="text-yellow-800 text-xs">{advertenciaManning}</p>
                                            </div>
                                        )}

                                        <button
                                            onClick={ejecutarTransferencia}
                                            disabled={!puedeTransferir}
                                            className="w-full bg-continental-yellow text-continental-black font-semibold py-2.5 px-4 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                                        >
                                            {transfiriendo ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    Transfiriendo...
                                                </>
                                            ) : (
                                                <>
                                                    <ArrowRight size={16} />
                                                    Confirmar transferencia
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ==================== TAB HISTORIAL ==================== */}
                    {activeTab === 'historial' && (
                        <div className="bg-white rounded-lg border">
                            <div className="flex items-center justify-between p-5 border-b">
                                <h2 className="font-semibold text-gray-800">Historial de transferencias</h2>
                                <button
                                    onClick={cargarHistorial}
                                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                                >
                                    <RefreshCw size={14} className={loadingHistorial ? 'animate-spin' : ''} />
                                    Actualizar
                                </button>
                            </div>

                            {loadingHistorial ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="animate-spin h-6 w-6 text-gray-400" />
                                </div>
                            ) : historial.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <History size={40} className="mb-2 opacity-30" />
                                    <p className="text-sm">No hay transferencias registradas</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Empleado</th>
                                                <th className="px-4 py-3 text-left">De</th>
                                                <th className="px-4 py-3 text-left">A</th>
                                                <th className="px-4 py-3 text-left">Realizado por</th>
                                                <th className="px-4 py-3 text-left">Fecha</th>
                                                <th className="px-4 py-3 text-left">Motivo</th>
                                                <th className="px-4 py-3 text-left">Manning</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {historial.map(h => (
                                                <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-gray-900">{h.nombreEmpleado}</p>
                                                        <p className="text-gray-400 text-xs">Nómina: {h.nominaEmpleado}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">{h.grupoOrigen}</span>
                                                        <p className="text-gray-400 text-xs mt-0.5">{h.areaOrigen}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="bg-continental-yellow text-continental-black px-2 py-0.5 rounded text-xs font-medium">{h.grupoDestino}</span>
                                                        <p className="text-gray-400 text-xs mt-0.5">{h.areaDestino}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{h.nombreRealizadoPor}</td>
                                                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                        {new Date(h.fechaTransferencia).toLocaleDateString('es-MX', {
                                                            day: '2-digit', month: 'short', year: 'numeric',
                                                            hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                                                        <span className="line-clamp-2">{h.motivo || <span className="text-gray-400 italic">Sin motivo</span>}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {h.huboAdvertenciaManning ? (
                                                            <span className="flex items-center gap-1 text-yellow-700 text-xs">
                                                                <AlertTriangle size={12} />
                                                                Advertencia
                                                            </span>
                                                        ) : (
                                                            <span className="text-green-600 text-xs">OK</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
