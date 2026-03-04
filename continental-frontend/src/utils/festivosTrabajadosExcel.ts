import * as XLSX from 'xlsx';
import type { SolicitudFestivoTrabajado } from '../services/festivosTrabajadosService';

export const exportarExcelFestivosTrabajados = (
    solicitudes: SolicitudFestivoTrabajado[],
    filtros?: { area?: string; fechaDesde?: string; fechaHasta?: string }
) => {
    const datos = solicitudes.map((s) => ({
        Nomina: s.nominaEmpleado,
        Nombre: s.nombreEmpleado,
        'F. Trabajado': s.festivoOriginal
            ? new Date(s.festivoOriginal + 'T00:00:00').toLocaleDateString('es-MX')
            : '',
        'F. Intercambio': s.fechaNueva
            ? new Date(s.fechaNueva + 'T00:00:00').toLocaleDateString('es-MX')
            : '',
    }));

    const hoja = XLSX.utils.json_to_sheet(datos);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Festivos Trabajados');

    const nombreArchivo = `Festivos_Trabajados_${filtros?.area ?? 'Todas'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(libro, nombreArchivo);
};