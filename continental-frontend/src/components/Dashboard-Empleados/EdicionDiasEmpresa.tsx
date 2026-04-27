import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavbarUser } from '../ui/navbar-user';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import useAuth from '@/hooks/useAuth';
import { edicionDiasEmpresaService } from '@/services/edicionDiasEmpresaService';
import { getVacacionesAsignadasPorEmpleado } from '@/services/vacacionesService';
import type {
    ConfiguracionEdicionDiasEmpresa,
    SolicitudEdicionDiaEmpresa,
} from '@/interfaces/Api.interface';
import type { VacacionAsignada, VacacionesAsignadasResponse } from '@/interfaces/Api.interface';
import type { UsuarioInfoDto } from '@/interfaces/Api.interface';
import { EmployeeSelector } from './EmployeeSelector';
import { UserRole } from '@/interfaces/User.interface';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function CalendarioRestringido({
    fechaInicio,
    fechaFin,
    fechaSeleccionada,
    onSeleccionar,
}: {
    fechaInicio: string;
    fechaFin: string;
    fechaSeleccionada: string | null;
    onSeleccionar: (fecha: string) => void;
}) {
    const inicio = parseISO(fechaInicio);
    const fin = parseISO(fechaFin);

    const year = inicio.getFullYear();
    const month = inicio.getMonth();
    const primerDia = new Date(year, month, 1).getDay();
    const diasEnMes = new Date(year, month + 1, 0).getDate();

    const estaHabilitado = (dia: number) => {
        const fecha = new Date(year, month, dia);
        return fecha >= inicio && fecha <= fin;
    };

    const formatearFechaCelda = (dia: number) => {
        const d = new Date(year, month, dia);
        return format(d, 'yyyy-MM-dd');
    };

    const celdas: (number | null)[] = Array(primerDia).fill(null);
    for (let i = 1; i <= diasEnMes; i++) celdas.push(i);
    while (celdas.length % 7 !== 0) celdas.push(null);

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-center font-semibold text-gray-800 mb-3">
                {MESES[month]} {year}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
                {DIAS_SEMANA.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {celdas.map((dia, idx) => {
                    if (!dia) return <div key={idx} />;
                    const fStr = formatearFechaCelda(dia);
                    const habilitado = estaHabilitado(dia);
                    const seleccionado = fechaSeleccionada === fStr;

                    return (
                        <button
                            key={idx}
                            disabled={!habilitado}
                            onClick={() => habilitado && onSeleccionar(fStr)}
                            className={[
                                'h-9 w-full rounded-md text-sm font-medium transition-colors',
                                seleccionado
                                    ? 'bg-continental-yellow text-black ring-2 ring-continental-yellow'
                                    : habilitado
                                        ? 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-200'
                                        : 'text-gray-300 cursor-not-allowed',
                            ].join(' ')}
                        >
                            {dia}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
                Días disponibles:{' '}
                <span className="font-medium text-green-700">
                    {format(inicio, 'dd/MM')} – {format(fin, 'dd/MM/yyyy')}
                </span>
            </p>
        </div>
    );
}

export default function EdicionDiasEmpresa() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const isDelegado = (user?.roles || []).some(r =>
        (typeof r === 'string' ? r : r.name) === UserRole.UNION_REPRESENTATIVE
    ) || (user as any)?.isUnionCommittee || user?.area?.nombreGeneral === 'Sindicato';

    const [selectedEmployee, setSelectedEmployee] = useState<UsuarioInfoDto>(() => {
        try {
            const saved = localStorage.getItem('selectedEmployee');
            return saved ? JSON.parse(saved) : (user as unknown as UsuarioInfoDto);
        } catch { return user as unknown as UsuarioInfoDto; }
    });

    const [config, setConfig] = useState<ConfiguracionEdicionDiasEmpresa | null>(null);
    const [vacacionesData, setVacacionesData] = useState<VacacionesAsignadasResponse | null>(null);
    const [solicitudes, setSolicitudes] = useState<SolicitudEdicionDiaEmpresa[]>([]);
    const [loading, setLoading] = useState(true);

    const [vacacionSeleccionada, setVacacionSeleccionada] = useState<VacacionAsignada | null>(null);
    const [fechaNueva, setFechaNueva] = useState<string | null>(null);
    const [observaciones, setObservaciones] = useState('');
    const [enviando, setEnviando] = useState(false);

    const empleadoId = selectedEmployee?.id || user?.id;

    useEffect(() => {
        const cargar = async () => {
            setLoading(true);
            try {
                const [cfg, vacsResp, sols] = await Promise.all([
                    edicionDiasEmpresaService.obtenerConfiguracion(),
                    empleadoId ? getVacacionesAsignadasPorEmpleado(empleadoId) : Promise.resolve(null),
                    empleadoId ? edicionDiasEmpresaService.obtenerMisSolicitudes(empleadoId) : Promise.resolve([]),
                ]);
                setConfig(cfg);
                setVacacionesData(vacsResp);
                setSolicitudes(sols);
            } catch (err: any) {
                toast.error('Error al cargar datos');
            } finally {
                setLoading(false);
            }
        };
        cargar();
    }, [empleadoId]);

    const handleEnviarSolicitud = async () => {
        if (!vacacionSeleccionada || !fechaNueva || !empleadoId) return;
        setEnviando(true);
        try {
            await edicionDiasEmpresaService.solicitarEdicion({
                empleadoId,
                vacacionOriginalId: vacacionSeleccionada.id,
                fechaNueva,
                observacionesEmpleado: observaciones || undefined,
            });
            toast.success('Solicitud enviada. Quedará pendiente de aprobación del jefe de área.');
            setVacacionSeleccionada(null);
            setFechaNueva(null);
            setObservaciones('');
            // Recargar solicitudes
            const sols = await edicionDiasEmpresaService.obtenerMisSolicitudes(empleadoId);
            setSolicitudes(sols);
        } catch (err: any) {
            toast.error(err?.message || 'Error al enviar solicitud');
        } finally {
            setEnviando(false);
        }
    };

    const getEstadoBadge = (estado: string) => {
        switch (estado) {
            case 'Aprobada': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium"><CheckCircle size={12} /> Aprobada</span>;
            case 'Rechazada': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium"><XCircle size={12} /> Rechazada</span>;
            default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium"><Clock size={12} /> Pendiente</span>;
        }
    };

    const vacacionesEmpresa = vacacionesData?.vacaciones?.filter(v =>
        (v.tipoVacacion === 'AsignadaAutomaticamente' || v.origenAsignacion === 'Automatica') &&
        v.estadoVacacion !== 'Cancelada'
    ) ?? [];

    const solicitudPorVacacion = (id: number) =>
        solicitudes.find(s => s.vacacionOriginalId === id);

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen bg-continental-bg">
                <NavbarUser />
                <div className="flex-1 flex items-center justify-center">
                    <div className="h-8 w-8 rounded-full border-2 border-continental-yellow border-t-transparent animate-spin" />
                </div>
            </div>
        );
    }

    if (!config?.habilitado) {
        return (
            <div className="flex flex-col min-h-screen bg-continental-bg">
                <NavbarUser />
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
                        <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">Edición no disponible</h2>
                        <p className="text-sm text-gray-500">
                            La edición de días asignados por la empresa no está habilitada en este momento.
                        </p>
                        <Button variant="outline" className="mt-6 cursor-pointer" onClick={() => navigate(-1)}>
                            <ArrowLeft size={16} className="mr-2" /> Regresar
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-continental-bg">
            <NavbarUser />

            <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Edición de días asignados por empresa</h1>
                        <p className="text-sm text-gray-500">
                            Periodo disponible:{' '}
                            <span className="font-medium text-green-700">
                                {format(parseISO(config.fechaInicioPeriodo), 'dd/MM/yyyy')} –{' '}
                                {format(parseISO(config.fechaFinPeriodo), 'dd/MM/yyyy')}
                            </span>
                        </p>
                    </div>
                </div>

                {/* Selector de empleado (solo delegado sindical) */}
                {isDelegado && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
                        <p className="text-sm font-medium text-gray-700 mb-2">Empleado</p>
                        <EmployeeSelector
                            currentUser={user as unknown as UsuarioInfoDto}
                            selectedEmployee={selectedEmployee}
                            onSelectEmployee={(emp) => {
                                setSelectedEmployee(emp);
                                localStorage.setItem('selectedEmployee', JSON.stringify(emp));
                                setVacacionSeleccionada(null);
                                setFechaNueva(null);
                            }}
                            isDelegadoSindical={isDelegado}
                        />
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Panel izquierdo: días asignados */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <h2 className="text-base font-semibold text-gray-800 mb-3">
                            Días asignados por empresa
                        </h2>

                        {vacacionesEmpresa.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-6">
                                No hay días asignados por empresa.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {vacacionesEmpresa.map(v => {
                                    const sol = solicitudPorVacacion(v.id);
                                    const yaEnviada = !!sol;
                                    const aprobada = sol?.estadoSolicitud === 'Aprobada';
                                    const seleccionado = vacacionSeleccionada?.id === v.id;

                                    return (
                                        <button
                                            key={v.id}
                                            disabled={yaEnviada}
                                            onClick={() => {
                                                if (!yaEnviada) {
                                                    setVacacionSeleccionada(v);
                                                    setFechaNueva(null);
                                                }
                                            }}
                                            className={[
                                                'w-full text-left p-3 rounded-lg border transition-colors',
                                                seleccionado
                                                    ? 'border-continental-yellow bg-yellow-50'
                                                    : aprobada
                                                        ? 'border-green-200 bg-green-50'
                                                        : yaEnviada
                                                            ? 'border-gray-200 bg-gray-50 opacity-60'
                                                            : 'border-gray-200 hover:border-continental-yellow hover:bg-yellow-50 cursor-pointer',
                                            ].join(' ')}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-800">
                                                        {format(parseISO(v.fechaVacacion), "EEEE d 'de' MMMM yyyy", { locale: es })}
                                                    </p>
                                                    {aprobada && sol && (
                                                        <p className="text-xs text-green-700 mt-0.5">
                                                            Cambiado por: {format(parseISO(sol.fechaNueva), 'dd/MM/yyyy')}
                                                        </p>
                                                    )}
                                                    {sol && sol.estadoSolicitud === 'Rechazada' && (
                                                        <p className="text-xs text-red-600 mt-0.5">
                                                            Rechazado: {sol.motivoRechazo}
                                                        </p>
                                                    )}
                                                    {sol && sol.estadoSolicitud === 'Pendiente' && (
                                                        <p className="text-xs text-yellow-700 mt-0.5">
                                                            Solicitud en espera de aprobación
                                                        </p>
                                                    )}
                                                </div>
                                                {yaEnviada && getEstadoBadge(sol!.estadoSolicitud)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Panel derecho: calendario restringido */}
                    <div className="space-y-4">
                        {vacacionSeleccionada ? (
                            <>
                                <div className="bg-white border border-gray-200 rounded-xl p-4">
                                    <h2 className="text-base font-semibold text-gray-800 mb-1">
                                        Selecciona la nueva fecha
                                    </h2>
                                    <p className="text-sm text-gray-500 mb-3">
                                        Día original:{' '}
                                        <span className="font-medium text-red-600">
                                            {format(parseISO(vacacionSeleccionada.fechaVacacion), 'dd/MM/yyyy')}
                                        </span>
                                    </p>

                                    <CalendarioRestringido
                                        fechaInicio={config.fechaInicioPeriodo}
                                        fechaFin={config.fechaFinPeriodo}
                                        fechaSeleccionada={fechaNueva}
                                        onSeleccionar={setFechaNueva}
                                    />
                                </div>

                                {fechaNueva && (
                                    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600">Día original:</span>
                                            <span className="font-medium text-red-600">
                                                {format(parseISO(vacacionSeleccionada.fechaVacacion), 'dd/MM/yyyy')}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600">Nueva fecha:</span>
                                            <span className="font-medium text-green-700">
                                                {format(parseISO(fechaNueva), 'dd/MM/yyyy')}
                                            </span>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Observaciones (opcional)
                                            </label>
                                            <textarea
                                                value={observaciones}
                                                onChange={e => setObservaciones(e.target.value)}
                                                placeholder="Motivo del cambio..."
                                                rows={3}
                                                maxLength={500}
                                                className="w-full text-sm border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-continental-yellow"
                                            />
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                className="flex-1 cursor-pointer"
                                                onClick={() => { setVacacionSeleccionada(null); setFechaNueva(null); }}
                                            >
                                                Cancelar
                                            </Button>
                                            <Button
                                                disabled={enviando}
                                                className="flex-1 cursor-pointer bg-continental-yellow text-black hover:bg-yellow-400"
                                                onClick={handleEnviarSolicitud}
                                            >
                                                {enviando ? 'Enviando...' : 'Enviar solicitud'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center h-48">
                                <Calendar className="w-10 h-10 text-gray-300 mb-3" />
                                <p className="text-sm text-gray-500">
                                    Selecciona un día asignado para elegir la nueva fecha
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Historial de solicitudes */}
                {solicitudes.length > 0 && (
                    <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
                        <h2 className="text-base font-semibold text-gray-800 mb-3">Historial de solicitudes</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Día original</th>
                                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Nueva fecha</th>
                                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Fecha solicitud</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {solicitudes.map(s => (
                                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                                            <td className="py-2 px-3 text-gray-800">{format(parseISO(s.fechaOriginal), 'dd/MM/yyyy')}</td>
                                            <td className="py-2 px-3 text-gray-800">{format(parseISO(s.fechaNueva), 'dd/MM/yyyy')}</td>
                                            <td className="py-2 px-3">{getEstadoBadge(s.estadoSolicitud)}</td>
                                            <td className="py-2 px-3 text-gray-500">{format(new Date(s.fechaSolicitud), 'dd/MM/yyyy HH:mm')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
