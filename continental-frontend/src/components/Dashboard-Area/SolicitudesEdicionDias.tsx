import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { edicionDiasEmpresaService } from '@/services/edicionDiasEmpresaService';
import type { SolicitudEdicionDiaEmpresa } from '@/interfaces/Api.interface';

type Filtro = 'Todas' | 'Pendiente' | 'Aprobada' | 'Rechazada';

export function SolicitudesEdicionDias() {
    const [solicitudes, setSolicitudes] = useState<SolicitudEdicionDiaEmpresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState<Filtro>('Pendiente');
    const cargar = async () => {
        setLoading(true);
        try {
            const data = await edicionDiasEmpresaService.obtenerSolicitudesArea();
            setSolicitudes(data);
        } catch {
            toast.error('Error al cargar solicitudes de edición');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { cargar(); }, []);

    const solicitudesFiltradas = solicitudes.filter(s =>
        filtro === 'Todas' || s.estadoSolicitud === filtro
    );

    const pendientes = solicitudes.filter(s => s.estadoSolicitud === 'Pendiente').length;

    const getEstadoBadge = (estado: string) => {
        switch (estado) {
            case 'Aprobada': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium"><CheckCircle size={12} /> Aprobada</span>;
            case 'Rechazada': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium"><XCircle size={12} /> Rechazada</span>;
            default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium"><Clock size={12} /> Pendiente</span>;
        }
    };

    const filtros: Filtro[] = ['Pendiente', 'Todas', 'Aprobada', 'Rechazada'];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-gray-800">Edición de días asignados por empresa</h3>
                    {pendientes > 0 && (
                        <p className="text-xs text-yellow-700 mt-0.5">
                            {pendientes} solicitud{pendientes !== 1 ? 'es' : ''} pendiente{pendientes !== 1 ? 's' : ''} de revisión
                        </p>
                    )}
                </div>
                <Button variant="ghost" size="sm" onClick={cargar} className="cursor-pointer gap-1">
                    <RefreshCw size={14} /> Actualizar
                </Button>
            </div>

            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
                {filtros.map(f => (
                    <button
                        key={f}
                        onClick={() => setFiltro(f)}
                        className={[
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                            filtro === f
                                ? 'bg-continental-yellow text-black'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                        ].join(' ')}
                    >
                        {f}
                        {f === 'Pendiente' && pendientes > 0 && (
                            <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                                {pendientes}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tabla */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <div className="h-6 w-6 rounded-full border-2 border-continental-yellow border-t-transparent animate-spin" />
                </div>
            ) : solicitudesFiltradas.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                    No hay solicitudes {filtro !== 'Todas' ? `con estado "${filtro}"` : ''}.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Empleado</th>
                                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Solicitado por</th>
                                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Día original</th>
                                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Nueva fecha</th>
                                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Fecha solicitud</th>
                            </tr>
                        </thead>
                        <tbody>
                            {solicitudesFiltradas.map(s => (
                                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="py-2 px-3">
                                        <p className="font-medium text-gray-800">{s.nombreEmpleado}</p>
                                        {s.nominaEmpleado && <p className="text-xs text-gray-500">Nómina: {s.nominaEmpleado}</p>}
                                    </td>
                                    <td className="py-2 px-3 text-gray-700 text-sm">
                                        {s.nombreSolicitadoPor && s.nombreSolicitadoPor !== s.nombreEmpleado
                                            ? s.nombreSolicitadoPor
                                            : <span className="text-gray-400 italic">El mismo</span>}
                                    </td>
                                    <td className="py-2 px-3 text-red-600 font-medium">
                                        {format(parseISO(s.fechaOriginal), 'dd/MM/yyyy')}
                                        <p className="text-xs text-gray-500 font-normal">
                                            {format(parseISO(s.fechaOriginal), 'EEEE', { locale: es })}
                                        </p>
                                    </td>
                                    <td className="py-2 px-3 text-green-700 font-medium">
                                        {format(parseISO(s.fechaNueva), 'dd/MM/yyyy')}
                                        <p className="text-xs text-gray-500 font-normal">
                                            {format(parseISO(s.fechaNueva), 'EEEE', { locale: es })}
                                        </p>
                                    </td>
                                    <td className="py-2 px-3">{getEstadoBadge(s.estadoSolicitud)}</td>
                                    <td className="py-2 px-3 text-gray-500 text-xs">
                                        {format(new Date(s.fechaSolicitud), 'dd/MM/yyyy HH:mm')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
    );
}
