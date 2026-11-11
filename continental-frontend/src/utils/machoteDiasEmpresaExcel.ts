import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { RenglonMovimientoDiaEmpresa, ResultadoRenglonMovimiento } from '@/services/movimientoDiasEmpresaService';

/**
 * Machote para mover en lote días por la empresa (nov-2026): una hoja
 * "Machote" con Nómina, Nombre, Área, Grupo, Día por la empresa actual y Fecha
 * nueva (la que llena Sarahí), y una hoja de instrucciones. Al subirlo se leen
 * solo Nómina, Día actual y Fecha nueva; lo demás es para ubicarse.
 */

export interface RenglonMachote {
    nomina?: number | null;
    nombre?: string | null;
    area?: string | null;
    grupo?: string | null;
    /** yyyy-MM-dd */
    fechaActual: string;
    /** yyyy-MM-dd, opcional (normalmente vacía en la descarga). */
    fechaNueva?: string | null;
    nota?: string | null;
}

const COL_NOMINA = 'Nómina';
const COL_ACTUAL = 'Día por la empresa actual (dd/mm/aaaa)';
const COL_NUEVA = 'Fecha nueva (dd/mm/aaaa)';

const ddmmyyyy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const guardar = (wb: XLSX.WorkBook, nombre: string) => {
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
};

export const descargarMachoteDiasEmpresa = (renglones: RenglonMachote[], etiqueta: string): void => {
    const wb = XLSX.utils.book_new();
    const filas = renglones.map((r) => ({
        [COL_NOMINA]: r.nomina ?? '',
        Nombre: r.nombre ?? '',
        Área: r.area ?? '',
        Grupo: r.grupo ?? '',
        [COL_ACTUAL]: ddmmyyyy(r.fechaActual),
        [COL_NUEVA]: ddmmyyyy(r.fechaNueva),
        Nota: r.nota ?? '',
    }));
    const hoja = XLSX.utils.json_to_sheet(filas, {
        header: [COL_NOMINA, 'Nombre', 'Área', 'Grupo', COL_ACTUAL, COL_NUEVA, 'Nota'],
    });
    hoja['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, hoja, 'Machote');

    const instrucciones = XLSX.utils.aoa_to_sheet([
        ['Cómo llenar el machote'],
        [''],
        ['1. Un renglón por cada día por la empresa que se mueve.'],
        ['2. Llena la columna "Fecha nueva" con dd/mm/aaaa (por ejemplo 16/02/2027). Los renglones sin fecha nueva no se mueven.'],
        ['3. Si agregas renglones a mano, basta con Nómina, Día por la empresa actual y Fecha nueva.'],
        ['4. La fecha nueva debe ser del mismo año, día laborable de su rol, no inhábil, no domingo/sábado no laborable, y sin otra vacación, permiso o incapacidad.'],
        ['5. Súbelo en Vacaciones → Capacidad por periodo → Domingos → "Mover días por la empresa con machote". Antes de aplicar se ve renglón por renglón qué se mueve y por qué no.'],
        ['6. Si el grupo rebasa su % ese día, el renglón sale como advertencia: solo se mueve si marcas "aplicar también los que rebasan el %".'],
    ]);
    instrucciones['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones');

    guardar(wb, `Machote_DiasEmpresa_${etiqueta}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
};

/** El resultado de validar o aplicar, para corregir y volver a subir. */
export const descargarResultadoMachote = (renglones: ResultadoRenglonMovimiento[]): void => {
    const wb = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(
        renglones.map((r) => ({
            [COL_NOMINA]: r.nomina ?? '',
            Nombre: r.nombre ?? '',
            Área: r.area ?? '',
            Grupo: r.grupo ?? '',
            [COL_ACTUAL]: /^\d{4}-\d{2}-\d{2}$/.test(r.fechaActual ?? '') ? ddmmyyyy(r.fechaActual) : r.fechaActual ?? '',
            [COL_NUEVA]: /^\d{4}-\d{2}-\d{2}$/.test(r.fechaNueva ?? '') ? ddmmyyyy(r.fechaNueva) : r.fechaNueva ?? '',
            Estado: r.estado,
            Detalle: r.mensaje ?? '',
            'Renglón original': r.renglon,
        }))
    );
    hoja['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 70 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, hoja, 'Machote');
    guardar(wb, `Machote_DiasEmpresa_resultado_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
};

const normalizar = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

/** Fecha de una celda: número de serie de Excel, Date, "dd/mm/aaaa" o "aaaa-mm-dd". */
const leerFecha = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    const dos = (n: number) => String(n).padStart(2, '0');
    if (typeof v === 'number') {
        const p = XLSX.SSF.parse_date_code(v);
        return p ? `${p.y}-${dos(p.m)}-${dos(p.d)}` : null;
    }
    if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
    const s = String(v).trim();
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${dos(Number(m[2]))}-${dos(Number(m[1]))}`;
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${dos(Number(m[2]))}-${dos(Number(m[3]))}`;
    return s; // el backend dirá que no se pudo leer
};

export interface MachoteLeido {
    renglones: RenglonMovimientoDiaEmpresa[];
    /** Renglones con nómina y día actual pero sin fecha nueva: no se mueven. */
    sinFechaNueva: number;
}

/** Lee el machote lleno. Busca la hoja "Machote" (o la primera) y las columnas por nombre. */
export const leerMachoteDiasEmpresa = async (archivo: File): Promise<MachoteLeido> => {
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const nombreHoja = wb.SheetNames.find((n) => normalizar(n) === 'machote') ?? wb.SheetNames[0];
    if (!nombreHoja) throw new Error('El archivo no tiene hojas.');
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: '' });
    if (filas.length === 0) throw new Error('La hoja está vacía.');

    const encabezado = (filas[0] as unknown[]).map((c) => normalizar(String(c ?? '')));
    const col = (...pistas: string[]) => encabezado.findIndex((h) => pistas.some((p) => h.startsWith(p)));
    const iNomina = col('nomina');
    const iActual = col('dia por la empresa actual', 'dia actual', 'fecha actual', 'dia empresa');
    const iNueva = col('fecha nueva', 'nueva fecha', 'dia nuevo');
    if (iNomina < 0 || iActual < 0 || iNueva < 0)
        throw new Error('No se encontraron las columnas "Nómina", "Día por la empresa actual" y "Fecha nueva". Usa el machote descargado.');

    const renglones: RenglonMovimientoDiaEmpresa[] = [];
    let sinFechaNueva = 0;
    filas.slice(1).forEach((fila, i) => {
        const f = fila as unknown[];
        const nominaTxt = String(f[iNomina] ?? '').trim();
        const actual = leerFecha(f[iActual]);
        const nueva = leerFecha(f[iNueva]);
        if (!nominaTxt && !actual && !nueva) return;
        if (!nueva) {
            sinFechaNueva++;
            return;
        }
        const nomina = Number(nominaTxt.replace(/\D/g, ''));
        renglones.push({
            renglon: i + 2, // renglón de Excel (1 = encabezado)
            nomina: nominaTxt && Number.isFinite(nomina) && nomina > 0 ? nomina : null,
            fechaActual: actual,
            fechaNueva: nueva,
        });
    });
    return { renglones, sinFechaNueva };
};
