import { edicionDiasEmpresaService } from '@/services/edicionDiasEmpresaService';
import { reprogramacionDiaEmpresaService } from '@/services/reprogramacionDiaEmpresaService';

/**
 * Un día asignado por la empresa que ya cambió de fecha, y por cuál de los dos
 * flujos: la edición que pide el empleado/delegado, o la reprogramación que
 * hace el superusuario. Para quien consulta la lista es el mismo movimiento,
 * solo cambia quién lo hizo.
 */
export type MovimientoDiaEmpresa = { origen: string; fechaAnterior: string };

export type DiaAsignado = { date: string; origen?: string; fechaAnterior?: string };

/**
 * Tipos de vacación que cuentan como día asignado por la empresa.
 *
 * `DiaEmpresaReprogramado` es indispensable: el día que reprograma el
 * superusuario cambia de tipo, así que filtrar solo por "Automatica" lo hacía
 * desaparecer de la lista aunque en el calendario siguiera saliendo.
 */
export const TIPOS_ASIGNADOS_POR_EMPRESA = [
    'Automatica',
    'AsignadaAutomaticamente',
    'DiaEmpresaReprogramado',
];

const soloFecha = (d: string) => String(d).slice(0, 10);

/**
 * Mapa fecha nueva -> movimiento, cruzando los dos flujos que mueven un día de
 * empresa. Si alguna de las dos consultas falla se devuelve lo que se haya
 * podido cargar: perder el distintivo es preferible a dejar la vista en blanco.
 */
export async function obtenerMovimientosDiasEmpresa(
    empleadoId: number
): Promise<Map<string, MovimientoDiaEmpresa>> {
    const movimientos = new Map<string, MovimientoDiaEmpresa>();

    try {
        const ediciones = await edicionDiasEmpresaService.obtenerMisSolicitudes(empleadoId);
        (ediciones ?? [])
            .filter(s => s.estadoSolicitud === 'Aprobada')
            .forEach(s => movimientos.set(soloFecha(s.fechaNueva), {
                origen: 'Edición empresa',
                fechaAnterior: soloFecha(s.fechaOriginal),
            }));
    } catch (err) {
        console.warn('No se pudieron cargar las ediciones de días empresa:', err);
    }

    try {
        const reprogSuper = await reprogramacionDiaEmpresaService.getTodas('Aprobada');
        (reprogSuper ?? [])
            .filter(s => s.empleadoId === empleadoId)
            .forEach(s => movimientos.set(soloFecha(s.fechaNueva), {
                origen: 'Editado por superusuario',
                fechaAnterior: soloFecha(s.fechaOriginal),
            }));
    } catch (err) {
        console.warn('No se pudieron cargar las reprogramaciones de día empresa:', err);
    }

    return movimientos;
}

/**
 * Marca un día asignado con el movimiento que le corresponda, para que en la
 * lista quede constancia de que esa fecha fue alterada. Sin esto un día movido
 * es indistinguible de uno que nunca se tocó.
 */
export function marcarDiaAsignado(
    fechaVacacion: string,
    tipoVacacion: string,
    movimientos: Map<string, MovimientoDiaEmpresa>
): DiaAsignado {
    const movimiento = movimientos.get(soloFecha(fechaVacacion));
    if (movimiento) {
        return { date: fechaVacacion, origen: movimiento.origen, fechaAnterior: movimiento.fechaAnterior };
    }
    // Sin solicitud que lo respalde pero con el tipo ya cambiado: al menos
    // dejamos constancia de que fue alterado.
    if (tipoVacacion === 'DiaEmpresaReprogramado') {
        return { date: fechaVacacion, origen: 'Editado por superusuario' };
    }
    return { date: fechaVacacion };
}
