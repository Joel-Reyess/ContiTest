import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { VacationRequest } from './MyRequests';

// Estilos para el PDF
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
  },
  header: {
    marginBottom: 20,
    borderBottom: '2px solid #0A4AA3',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0A4AA3',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  infoSection: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    width: 120,
    color: '#333',
  },
  infoValue: {
    fontSize: 10,
    color: '#666',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 30,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: '#0A4AA3',
  },
  tableHeaderText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    padding: 5,
  },
  tableCell: {
    fontSize: 9,
    padding: 5,
    color: '#333',
  },
  tableCellID: {
    width: '8%',
  },
  tableCellTipo: {
    width: '15%',
  },
  tableCellFecha: {
    width: '12%',
  },
  tableCellEstado: {
    width: '10%',
  },
  tableCellMotivo: {
    width: '19%',
  },
  statusApproved: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  statusRejected: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  statusPending: {
    color: '#f59e0b',
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    fontSize: 10,
    color: '#666',
  },
});

// Componente del documento PDF
const SolicitudesDocument: React.FC<{
  solicitudes: VacationRequest[];
  empleadoNombre: string;
}> = ({ solicitudes, empleadoNombre }) => {
  const totalAprobadas = solicitudes.filter(s => s.status === 'approved').length;
  const totalRechazadas = solicitudes.filter(s => s.status === 'rejected').length;
  const totalPendientes = solicitudes.filter(s => s.status === 'pending').length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Solicitudes</Text>
          <Text style={styles.subtitle}>
            Generado el {format(new Date(), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
          </Text>
        </View>

        {/* Información del empleado y resumen */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Empleado:</Text>
            <Text style={styles.infoValue}>{empleadoNombre}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total de solicitudes:</Text>
            <Text style={styles.infoValue}>{solicitudes.length}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Aprobadas:</Text>
            <Text style={[styles.infoValue, styles.statusApproved]}>{totalAprobadas}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rechazadas:</Text>
            <Text style={[styles.infoValue, styles.statusRejected]}>{totalRechazadas}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pendientes:</Text>
            <Text style={[styles.infoValue, styles.statusPending]}>{totalPendientes}</Text>
          </View>
        </View>

        {/* Tabla de solicitudes */}
        <View style={styles.table}>
          {/* Header de la tabla */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableHeaderText, styles.tableCellID]}>ID</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellTipo]}>Tipo</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellFecha]}>F. Solicitud</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellEstado]}>Estado</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellFecha]}>F. Original</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellFecha]}>F. Nueva</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellFecha]}>F. Respuesta</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellMotivo]}>Motivo Rechazo</Text>
          </View>

          {/* Filas de datos */}
          {solicitudes.map((solicitud, index) => (
            <View key={solicitud.id} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' }]}>
              <Text style={[styles.tableCell, styles.tableCellID]}>{solicitud.id}</Text>
              <Text style={[styles.tableCell, styles.tableCellTipo]}>
                {solicitud.type === 'day_exchange' ? 'Intercambio'
                    : solicitud.type === 'permission_request' ? 'Permiso'
                        : solicitud.type === 'company_day_edit' ? 'Dia empresa'
                            : 'Festivo'}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellFecha]}>
                {format(new Date(solicitud.requestDate), "dd/MM/yy", { locale: es })}
              </Text>
              <Text style={[
                styles.tableCell,
                styles.tableCellEstado,
                solicitud.status === 'approved' ? styles.statusApproved :
                solicitud.status === 'rejected' ? styles.statusRejected :
                styles.statusPending
              ]}>
                {solicitud.status === 'approved' ? 'Aprobada' :
                 solicitud.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellFecha]}>
                {solicitud.dayToGive
                  ? format(new Date(solicitud.dayToGive), "dd/MM/yy", { locale: es })
                  : solicitud.workedHoliday
                    ? format(new Date(solicitud.workedHoliday), "dd/MM/yy", { locale: es })
                    : '-'}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellFecha]}>
                {solicitud.requestedDay
                  ? format(new Date(solicitud.requestedDay), "dd/MM/yy", { locale: es })
                  : '-'}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellFecha]}>
                {solicitud.responseDate
                  ? format(new Date(solicitud.responseDate), "dd/MM/yy", { locale: es })
                  : '-'}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellMotivo]}>
                {solicitud.rejectionReason || '-'}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Continental - Sistema de Gestión de Vacaciones
        </Text>
      </Page>
    </Document>
  );
};

// Componente para el botón de descarga PDF
export const SolicitudesPDFDownloadLink: React.FC<{
  solicitudes: VacationRequest[];
  empleadoNombre: string;
  children: React.ReactNode;
  className?: string;
}> = ({ solicitudes, empleadoNombre, children, className }) => {
  const fileName = `Solicitudes_${empleadoNombre.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;

  return (
    <PDFDownloadLink
      document={<SolicitudesDocument solicitudes={solicitudes} empleadoNombre={empleadoNombre} />}
      fileName={fileName}
      className={className}
    >
      {({  loading }) => (
        loading ? 'Generando PDF...' : children
      )}
    </PDFDownloadLink>
  );
};

export default SolicitudesDocument;