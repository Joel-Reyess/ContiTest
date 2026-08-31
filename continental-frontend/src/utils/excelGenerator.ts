import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { BloqueReservacion } from '@/interfaces/Api.interface';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ExcelBloqueRow {
  'Bloque': number;
  'Área': string;
  'Grupo': string;
  'Fecha Inicio': string;
  'Fecha Fin': string;
  'Duración (horas)': number;
  'Nómina': string;
  'Nombre': string;
  'Fecha Ingreso': string;
  'Antigüedad (años)': number;
}

/**
 * Genera y descarga un archivo Excel con los bloques de reservación
 * Una hoja por cada área
 * @param bloques - Array de bloques de reservación
 * @param anioVigente - Año de los bloques
 */
export const generarExcelBloques = (bloques: BloqueReservacion[], anioVigente: number): void => {
  try {
    // El nombre del área viene de la BD (Areas.NombreGeneral) y puede llegar
    // vacío o con espacios de sobra; sin este respaldo la hoja de esa área
    // sale sin nombre y sin la columna Área.
    const nombreDeArea = (bloque: BloqueReservacion): string =>
      (bloque.nombreArea ?? '').trim() || 'Sin área';

    // Agrupar bloques por área
    const bloquesPorArea = bloques.reduce((acc, bloque) => {
      const area = nombreDeArea(bloque);
      if (!acc[area]) {
        acc[area] = [];
      }
      acc[area].push(bloque);
      return acc;
    }, {} as Record<string, BloqueReservacion[]>);

    // Crear un nuevo libro de Excel
    const workbook = XLSX.utils.book_new();

    // Crear una hoja de resumen
    const resumenData = [
      { 'Concepto': 'Año', 'Valor': anioVigente },
      { 'Concepto': 'Total de Bloques', 'Valor': bloques.length },
      { 'Concepto': 'Total de Empleados Asignados', 'Valor': bloques.reduce((sum, b) => sum + b.empleadosAsignados.length, 0) },
      { 'Concepto': 'Total de Áreas', 'Valor': Object.keys(bloquesPorArea).length },
      { 'Concepto': 'Áreas', 'Valor': Object.keys(bloquesPorArea).join(', ') },
      { 'Concepto': 'Fecha de Generación', 'Valor': format(new Date(), "dd/MM/yyyy HH:mm", { locale: es }) }
    ];

    const resumenWorksheet = XLSX.utils.json_to_sheet(resumenData);
    resumenWorksheet['!cols'] = [{ wch: 25 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, resumenWorksheet, 'Resumen');

    // Crear una hoja por cada área
    Object.entries(bloquesPorArea).forEach(([nombreArea, bloquesArea]) => {
      const excelRows: ExcelBloqueRow[] = [];

      // Ordenar bloques por número de bloque
      bloquesArea.sort((a, b) => a.numeroBloque - b.numeroBloque);

      bloquesArea.forEach(bloque => {
        if (bloque.empleadosAsignados.length === 0) {
          // Si no hay empleados, crear una fila vacía para el bloque
          excelRows.push({
            'Bloque': bloque.numeroBloque,
            'Área': nombreArea,
            'Grupo': bloque.nombreGrupo,
            'Fecha Inicio': format(new Date(bloque.fechaHoraInicio), "dd/MM/yyyy HH:mm", { locale: es }),
            'Fecha Fin': format(new Date(bloque.fechaHoraFin), "dd/MM/yyyy HH:mm", { locale: es }),
            'Duración (horas)': bloque.duracionHoras,
            'Nómina': '',
            'Nombre': 'Sin empleados asignados',
            'Fecha Ingreso': '',
            'Antigüedad (años)': 0
          });
        } else {
          // Ordenar empleados por posición en el bloque
          const empleadosOrdenados = [...bloque.empleadosAsignados].sort((a, b) => a.posicionEnBloque - b.posicionEnBloque);

          empleadosOrdenados.forEach(empleado => {
            excelRows.push({
              'Bloque': bloque.numeroBloque,
              'Área': nombreArea,
              'Grupo': bloque.nombreGrupo,
              'Fecha Inicio': format(new Date(bloque.fechaHoraInicio), "dd/MM/yyyy HH:mm", { locale: es }),
              'Fecha Fin': format(new Date(bloque.fechaHoraFin), "dd/MM/yyyy HH:mm", { locale: es }),
              'Duración (horas)': bloque.duracionHoras,
              'Nómina': empleado.nomina,
              'Nombre': empleado.nombreCompleto,
              'Fecha Ingreso': empleado.fechaIngreso ? format(new Date(empleado.fechaIngreso), "dd/MM/yyyy", { locale: es }) : '',
              'Antigüedad (años)': empleado.antiguedadAnios
            });
          });
        }
      });

      // Crear la hoja para esta área
      const worksheet = XLSX.utils.json_to_sheet(excelRows);

      // Ajustar el ancho de las columnas
      worksheet['!cols'] = [
        { wch: 8 },   // Bloque
        { wch: 20 },  // Área
        { wch: 20 },  // Grupo
        { wch: 18 },  // Fecha Inicio
        { wch: 18 },  // Fecha Fin
        { wch: 15 },  // Duración
        { wch: 12 },  // Nómina
        { wch: 35 },  // Nombre
        { wch: 15 },  // Fecha Ingreso
        { wch: 15 },  // Antigüedad
      ];

      // Excel no acepta : \ / ? * [ ] en el nombre de la hoja, ni más de 31
      // caracteres, ni dos hojas que se llamen igual.
      let sheetName = nombreArea.replace(/[:\\/?*[\]]/g, '-').trim() || 'Sin area';
      if (sheetName.length > 31) {
        sheetName = sheetName.substring(0, 28) + '...';
      }
      const nombreBase = sheetName;
      let repetido = 2;
      while (workbook.SheetNames.includes(sheetName)) {
        const marca = ` (${repetido++})`;
        sheetName = nombreBase.substring(0, 31 - marca.length) + marca;
      }

      // Agregar la hoja al libro
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    // Generar el archivo Excel
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Descargar el archivo
    const fileName = `Bloques_Reservacion_${anioVigente}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    saveAs(blob, fileName);

    console.log(`Archivo Excel generado: ${fileName}`);
  } catch (error) {
    console.error('Error al generar el archivo Excel:', error);
    throw new Error('No se pudo generar el archivo Excel. Por favor, intente nuevamente.');
  }
};

/**
 * Genera un Excel simplificado con solo la lista de bloques (sin empleados)
 */
export const generarExcelBloquesSimplificado = (bloques: BloqueReservacion[], anioVigente: number): void => {
  try {
    const excelRows = bloques.map(bloque => ({
      'ID Bloque': bloque.id,
      'Área': (bloque.nombreArea ?? '').trim() || 'Sin área',
      'Grupo': bloque.nombreGrupo,
      'Número de Bloque': bloque.numeroBloque,
      'Fecha Inicio': format(new Date(bloque.fechaHoraInicio), "dd/MM/yyyy HH:mm", { locale: es }),
      'Fecha Fin': format(new Date(bloque.fechaHoraFin), "dd/MM/yyyy HH:mm", { locale: es }),
      'Duración (horas)': bloque.duracionHoras,
      'Empleados Asignados': bloque.empleadosAsignados.length,
      'Espacios Disponibles': bloque.espaciosDisponibles,
      'Estado': bloque.estado,
      'Es Bloque Cola': bloque.esBloqueCola ? 'Sí' : 'No'
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { wch: 10 }, // ID Bloque
      { wch: 20 }, // Área
      { wch: 15 }, // Grupo
      { wch: 15 }, // Número de Bloque
      { wch: 20 }, // Fecha Inicio
      { wch: 20 }, // Fecha Fin
      { wch: 15 }, // Duración
      { wch: 18 }, // Empleados Asignados
      { wch: 18 }, // Espacios Disponibles
      { wch: 10 }, // Estado
      { wch: 15 }, // Es Bloque Cola
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bloques');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fileName = `Bloques_Simplificado_${anioVigente}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    saveAs(blob, fileName);

    console.log(`Archivo Excel simplificado generado: ${fileName}`);
  } catch (error) {
    console.error('Error al generar el archivo Excel simplificado:', error);
    throw new Error('No se pudo generar el archivo Excel. Por favor, intente nuevamente.');
  }
};