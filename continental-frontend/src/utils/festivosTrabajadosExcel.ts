import * as XLSX from 'xlsx';
import type { SolicitudFestivoTrabajado } from '../services/festivosTrabajadosService';

/**
 * Convierte una fecha ISO (YYYY-MM-DD o con timestamp) al formato DDMMYYYY
 * respetando ceros al inicio (se almacena como texto para que Excel no los elimine).
 */
const formatFechaSAP = (fecha: string | undefined | null): string => {
    if (!fecha) return '';
    // Normalizar: tomar solo la parte YYYY-MM-DD
    const datePart = fecha.includes('T') ? fecha.split('T')[0] : fecha;
    const [year, month, day] = datePart.split('-');
    if (!year || !month || !day) return '';
    return `${day.padStart(2, '0')}${month.padStart(2, '0')}${year}`;
};

export const exportarExcelFestivosTrabajados = (
    solicitudes: SolicitudFestivoTrabajado[],
    filtros?: { area?: string; fechaDesde?: string; fechaHasta?: string }
) => {
    // Formato SAP: Nomina, Festivo Trabajado (DDMMYYYY), Dia Solicitado (DDMMYYYY), Clave (2310)
    const datos = solicitudes.map((s) => [
        s.nominaEmpleado,
        formatFechaSAP(s.festivoOriginal),
        formatFechaSAP(s.fechaNueva),
        formatFechaSAP(s.fechaNueva),
        '2310',
    ]);

    const hoja = XLSX.utils.aoa_to_sheet(datos);

    const range = XLSX.utils.decode_range(hoja['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (const col of [1, 2, 3]) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: col });
            if (hoja[cellRef]) {
                hoja[cellRef].t = 's';
            }
        }
    }

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Festivos Trabajados');

    const nombreArchivo = `Festivos_Trabajados_${filtros?.area ?? 'Todas'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(libro, nombreArchivo);
};