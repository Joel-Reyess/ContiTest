import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    reprogramacionDiaEmpresaService,
    MOTIVO_LABEL,
    MOTIVO_NOMENCLATURA,
    type MotivoTipo,
    type VacacionAsignada,
} from '@/services/reprogramacionDiaEmpresaService'

interface Props {
    show: boolean
    onClose: () => void
    empleadoId?: number
    empleadoNombre?: string
    onSolicitudCreada?: () => void
}

const MOTIVOS: MotivoTipo[] = ['Incapacidad', 'PermisoDefuncion', 'Paternidad', 'Maternidad']

export function SolicitarReprogramacionDiaEmpresaModal({
    show, onClose, empleadoId, empleadoNombre, onSolicitudCreada,
}: Props) {
    const [vacaciones, setVacaciones] = useState<VacacionAsignada[]>([])
    const [vacacionId, setVacacionId] = useState<number | null>(null)
    const [fechaNueva, setFechaNueva] = useState('')
    const [motivoTipo, setMotivoTipo] = useState<MotivoTipo | ''>('')
    const [justificacion, setJustificacion] = useState('')
    const [loadingData, setLoadingData] = useState(false)
    const [loadingSubmit, setLoadingSubmit] = useState(false)

    const vacacionSel = vacacionId ? vacaciones.find(v => v.id === vacacionId) : null

    useEffect(() => {
        if (!show || !empleadoId) return
        let cancel = false
        setLoadingData(true)
        reprogramacionDiaEmpresaService.getVacacionesAsignadasNoConsumidas(empleadoId)
            .then(vacs => {
                if (cancel) return
                // Defensa cliente: aún si el backend regresa otros tipos (cache/legacy),
                // mostramos sólo días asignados por empresa.
                const soloAsignadas = (vacs || []).filter(v =>
                    v.tipoVacacion === 'Automatica' ||
                    v.tipoVacacion === 'AsignadaAutomaticamente'
                )
                if (vacs && vacs.length !== soloAsignadas.length) {
                    console.warn('[ReprogDiaEmpresa] El backend regresó tipos no asignados; filtrando en cliente:',
                        vacs.map(v => v.tipoVacacion))
                }
                setVacaciones(soloAsignadas)
                if (!soloAsignadas.length) toast.info('El empleado no tiene días asignados por la empresa pendientes.')
            })
            .catch((e: any) => {
                if (!cancel) toast.error(e?.message || 'Error al cargar vacaciones asignadas')
            })
            .finally(() => { if (!cancel) setLoadingData(false) })
        return () => { cancel = true }
    }, [show, empleadoId])

    const limpiar = () => {
        setVacacionId(null)
        setFechaNueva('')
        setMotivoTipo('')
        setJustificacion('')
    }

    const handleClose = () => {
        limpiar()
        onClose()
    }

    const handleSubmit = async () => {
        if (!empleadoId || !vacacionId || !fechaNueva || !motivoTipo) {
            toast.error('Completa vacación, fecha nueva y motivo.')
            return
        }
        setLoadingSubmit(true)
        try {
            await reprogramacionDiaEmpresaService.solicitar({
                empleadoId,
                vacacionOriginalId: vacacionId,
                fechaNueva,
                motivoTipo,
                justificacion: justificacion.trim() || undefined,
            })
            toast.success('Solicitud enviada. Pendiente de aprobación del jefe de área.')
            onSolicitudCreada?.()
            handleClose()
        } catch (e: any) {
            toast.error(e?.message || 'Error al enviar la solicitud')
        } finally {
            setLoadingSubmit(false)
        }
    }

    if (!show) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="fixed inset-0 -z-10" onClick={handleClose} />
            <div className="relative z-50 w-full max-w-lg p-4">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-6">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-continental-yellow" />
                                    Reprogramación día empresa
                                </h2>
                                {empleadoNombre && (
                                    <p className="text-xs text-gray-700 mt-1">
                                        Empleado: <span className="font-semibold">{empleadoNombre}</span>
                                    </p>
                                )}
                            </div>
                            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="Cerrar">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            Selecciona el día asignado por la empresa a reprogramar y su nueva fecha.
                            Solo se permite con motivo de catálogo, y va a aprobación del jefe de área.
                            Al aprobarse se reflejará como <span className="font-semibold">"C"</span> en el rol.
                        </p>

                        {loadingData ? (
                            <div className="py-8 text-center text-gray-500 text-sm">Cargando…</div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Día asignado por empresa a reprogramar
                                    </label>
                                    <select
                                        value={vacacionId ?? ''}
                                        onChange={e => setVacacionId(e.target.value ? Number(e.target.value) : null)}
                                        disabled={vacaciones.length === 0}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                    >
                                        <option value="">— Selecciona —</option>
                                        {vacaciones.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {format(parseISO(v.fecha), 'EEEE dd/MM/yyyy', { locale: es })} · Asignada por empresa
                                            </option>
                                        ))}
                                    </select>
                                    {vacacionSel && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Día original: <span className="font-medium text-red-600">
                                                {format(parseISO(vacacionSel.fecha), 'dd/MM/yyyy')}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Motivo (obligatorio) <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={motivoTipo}
                                        onChange={e => setMotivoTipo(e.target.value as MotivoTipo | '')}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                    >
                                        <option value="">— Selecciona —</option>
                                        {MOTIVOS.map(m => (
                                            <option key={m} value={m}>
                                                [{MOTIVO_NOMENCLATURA[m]}] {MOTIVO_LABEL[m]}
                                            </option>
                                        ))}
                                    </select>
                                    {motivoTipo && (
                                        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 font-mono font-bold text-base bg-amber-100 text-amber-800">
                                                    {MOTIVO_NOMENCLATURA[motivoTipo]}
                                                </span>
                                                <span className="font-medium text-blue-900">
                                                    {MOTIVO_LABEL[motivoTipo]}
                                                </span>
                                            </div>
                                            <p className="text-xs text-blue-700 mt-2">
                                                Código SAP: <span className="font-semibold">{MOTIVO_NOMENCLATURA[motivoTipo]}</span>.
                                                El día reprogramado se reflejará como <span className="font-mono font-semibold">C</span> en el rol semanal.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Fecha nueva
                                    </label>
                                    <input
                                        type="date"
                                        value={fechaNueva}
                                        onChange={e => setFechaNueva(e.target.value)}
                                        min={format(new Date(), 'yyyy-MM-dd')}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                        disabled={!vacacionSel}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Justificación (opcional)
                                    </label>
                                    <textarea
                                        value={justificacion}
                                        onChange={e => setJustificacion(e.target.value)}
                                        rows={3}
                                        maxLength={500}
                                        placeholder="Detalles adicionales…"
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm resize-none"
                                    />
                                    <p className="text-xs text-gray-400 mt-1 text-right">
                                        {justificacion.length}/500
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-6">
                            <Button variant="ghost" onClick={handleClose} disabled={loadingSubmit}>
                                Cancelar
                            </Button>
                            <Button
                                variant="continental"
                                onClick={handleSubmit}
                                disabled={loadingSubmit || loadingData || !vacacionId || !fechaNueva || !motivoTipo}
                            >
                                {loadingSubmit ? 'Enviando…' : 'Enviar solicitud'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
