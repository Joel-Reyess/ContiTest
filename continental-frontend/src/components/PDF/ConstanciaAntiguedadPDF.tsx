import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ConstanciaAntiguedadData, EmpleadoVacacionData } from "../../services/pdfService";

const parseHireDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (trimmed.toLowerCase() === "n/a") return null;

    const native = new Date(trimmed);
    if (!Number.isNaN(native.getTime())) return native;

    const slashParts = trimmed.split("/");
    if (slashParts.length === 3) {
        const [p1, p2, p3] = slashParts.map(Number);
        if (!Number.isNaN(p1) && !Number.isNaN(p2) && !Number.isNaN(p3)) {
            const isDayFirst = p1 > 12;
            const year = p3;
            const month = (isDayFirst ? p2 : p1) - 1;
            const day = isDayFirst ? p1 : p2;
            const dt = new Date(year, month, day);
            if (!Number.isNaN(dt.getTime())) return dt;
        }
    }

    return null;
};

const calculateYearsOfService = (hireDate: Date | null, referenceYear: number, fallbackYears?: number): number => {
    if (!hireDate || Number.isNaN(hireDate.getTime())) {
        return fallbackYears ?? 0;
    }

    const referenceDate = new Date(referenceYear, 11, 31);
    let years = referenceDate.getFullYear() - hireDate.getFullYear();
    const monthDiff = referenceDate.getMonth() - hireDate.getMonth();
    const dayDiff = referenceDate.getDate() - hireDate.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        years -= 1;
    }
    return Math.max(years, 0);
};

const formatDate = (date: Date): string =>
    date.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

const getCurrentPrintDate = (): string => formatDate(new Date());

const CONTINENTAL_YELLOW = "#ffa500";
const CONTINENTAL_BLACK = "#000000";
const CONTINENTAL_WHITE = "#ffffff";
const CONTINENTAL_GREEN = "#92D050";

// Logotipo sencillo en PNG (small, valid) para evitar errores de decodificación
const CONTINENTAL_LOGO_BASE64 = 'data:image/png;base64,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';

const styles = StyleSheet.create({
    page: {
        flexDirection: "column",
        backgroundColor: CONTINENTAL_WHITE,
        padding: 30,
        paddingBottom: 70,
        fontFamily: "Helvetica"
    },
    header: {
        flexDirection: "column",
        marginBottom: 12,
        alignItems: "flex-start"
    },
    logo: {
        width: 110,
        height: 35,
        marginBottom: 10, // ✅ Reducido de 15
    },
    titleSection: {
        width: "100%",
        alignItems: "center"
    },
    mainTitle: {
        fontSize: 17,
        fontWeight: "bold",
        textAlign: "center",
        color: CONTINENTAL_BLACK,
        marginBottom: 3
    },
    subtitle: {
        fontSize: 16,
        fontWeight: "bold",
        textAlign: "center",
        color: CONTINENTAL_BLACK,
        marginBottom: 10
    },
    introText: {
        fontSize: 12,
        textAlign: "left",
        color: CONTINENTAL_BLACK,
        marginBottom: 10,
        lineHeight: 1.3
    },
    employeeInfoTable: {
        flexDirection: "row",
        marginBottom: 10,
        borderWidth: 1,
        borderColor: CONTINENTAL_BLACK
    },
    employeeInfoLeft: {
        flex: 1,
        padding: 7,
        backgroundColor: CONTINENTAL_GREEN,
        borderRightWidth: 1,
        borderRightColor: CONTINENTAL_BLACK
    },
    employeeInfoRight: {
        flex: 1,
        padding: 7,
        backgroundColor: CONTINENTAL_YELLOW
    },
    employeeNumber: {
        fontSize: 11,
        fontWeight: "bold",
        color: CONTINENTAL_BLACK
    },
    employeeArea: {
        fontSize: 11,
        color: CONTINENTAL_BLACK,
        marginTop: 2
    },
    employeeName: {
        fontSize: 11,
        color: CONTINENTAL_BLACK,
        marginTop: 2
    },
    printDate: {
        position: "absolute",
        top: 30,
        right: 30,
        fontSize: 9,
        color: CONTINENTAL_BLACK
    },
    employeeInfoText: {
        fontSize: 10,
        color: CONTINENTAL_BLACK,
        lineHeight: 1.3,
        marginBottom: 10,
        textAlign: "justify"
    },
    highlightedData: {
        backgroundColor: CONTINENTAL_YELLOW,
        padding: 2,
        fontSize: 10,
        fontWeight: "bold",
        color: CONTINENTAL_BLACK
    },
    tablesContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
        gap: 8
    },
    tableSection: {
        flex: 1
    },
    tableHeader: {
        backgroundColor: CONTINENTAL_YELLOW,
        padding: 6,
        textAlign: "center"
    },
    tableHeaderText: {
        fontSize: 11,
        fontWeight: "bold",
        color: CONTINENTAL_BLACK
    },
    tableRow: {
        flexDirection: "row"
    },
    tableCell: {
        flex: 1,
        padding: 4,
        fontSize: 9,
        textAlign: "center"
    },
    tableCellLast: {
        flex: 1,
        padding: 4,
        fontSize: 9,
        textAlign: "center"
    },
    tableTotal: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 4,
        paddingHorizontal: 6
    },
    totalText: {
        fontSize: 11,
        color: CONTINENTAL_BLACK
    },
    totalValue: {
        fontSize: 11,
        fontWeight: "bold",
        backgroundColor: CONTINENTAL_YELLOW,
        padding: 2,
        color: CONTINENTAL_BLACK
    },
    observationsSection: {
        flexDirection: "row",
        marginTop: 8,
        alignItems: "flex-start"
    },
    observationsContent: {
        flex: 1,
        paddingRight: 20
    },
    observationsTitle: {
        fontSize: 11,
        fontWeight: "bold",
        color: CONTINENTAL_BLACK,
        marginBottom: 6
    },
    observationText: {
        fontSize: 9,
        color: CONTINENTAL_BLACK,
        lineHeight: 1.3,
        marginBottom: 3
    },
    footer: {
        position: "absolute",
        bottom: 15,
        left: 30,
        right: 30,
        backgroundColor: CONTINENTAL_YELLOW,
        padding: 8,
        textAlign: "center"
    },
    footerText: {
        fontSize: 9,
        fontWeight: "bold",
        color: CONTINENTAL_BLACK
    }
});

interface ConstanciaAntiguedadPDFProps {
    data: ConstanciaAntiguedadData;
}

const EmpleadoPage: React.FC<{ empleado: EmpleadoVacacionData; area?: string; targetYear: number }> = ({
    empleado,
    area,
    targetYear
}) => {
    const parsedHireDate = parseHireDate(empleado.fechaIngreso);
    const realYearsOfService = calculateYearsOfService(parsedHireDate, targetYear, empleado.antiguedadAnios);
    const printDate = getCurrentPrintDate();

    const fechaIngresoTexto =
        empleado.fechaIngreso && empleado.fechaIngreso.toLowerCase() !== "n/a"
            ? empleado.fechaIngreso
            : "Fecha no disponible";

    const totalOtorgadosEmpresa =
        empleado.diasOtorgadosEmpresa?.reduce((sum, p) => sum + (p.dias || 0), 0) || 0;
    const totalAdicionalesEmpresa =
        empleado.diasAdicionalesEmpresa?.reduce((sum, p) => sum + (p.dias || 0), 0) || 0;
    const totalGozados = empleado.totalGozados || 0;

    return (
        <Page size="A4" style={styles.page}>
            <Text style={styles.printDate}>Fecha de impresión: {printDate}</Text>

            <View style={styles.header}>
                <Image src={CONTINENTAL_LOGO_BASE64} style={styles.logo} />
                <View style={styles.titleSection}>
                    <Text style={styles.mainTitle}>CONTINENTAL TIRE DE MÉXICO, S. de R.L. de C.V.</Text>
                    <Text style={styles.subtitle}>CONSTANCIA DE ANTIGÜEDAD{"\n"}Y VACACIONES ADICIONALES {targetYear}</Text>
                </View>
            </View>

            <Text style={styles.introText}>
                Por medio de la presente y en cumplimiento a lo indicado en el Art. 68 inciso "e" del contrato colectivo de
                trabajo vigente le hacemos saber al trabajador:
            </Text>

            <View style={styles.employeeInfoTable}>
                <View style={styles.employeeInfoLeft}>
                    <Text style={styles.employeeNumber}>{empleado.nomina}</Text>
                    {area && <Text style={styles.employeeArea}>{area}</Text>}
                </View>
                <View style={styles.employeeInfoRight}>
                    <Text style={styles.employeeName}>{empleado.nombre}</Text>
                </View>
            </View>

            <Text style={styles.employeeInfoText}>
                Por la presente se le informa que de acuerdo con su fecha de ingreso del{" "}
                <Text style={styles.highlightedData}>{fechaIngresoTexto}</Text> y a sus{" "}
                <Text style={styles.highlightedData}>{realYearsOfService}</Text> años de antigüedad al 31 de diciembre de{" "}
                {targetYear}, le corresponden <Text style={styles.highlightedData}>{totalOtorgadosEmpresa}</Text> días asignados
                por la empresa y <Text style={styles.highlightedData}>{totalAdicionalesEmpresa}</Text> días adicionales.
            </Text>

            <View style={styles.tablesContainer}>
                <View style={styles.tableSection}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableHeaderText}>DÍAS ADICIONALES</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={styles.tableCell}>DE:</Text>
                        <Text style={styles.tableCell}>AL:</Text>
                        <Text style={styles.tableCellLast}>#DÍAS</Text>
                    </View>
                    {(empleado.diasAdicionalesEmpresa || [])
                        .sort((a, b) => a.de.localeCompare(b.de))
                        .map((periodo, index) => (
                            <View key={index} style={styles.tableRow}>
                                <Text style={styles.tableCell}>{periodo.de}</Text>
                                <Text style={styles.tableCell}>{periodo.al}</Text>
                                <Text style={styles.tableCellLast}>{periodo.dias}</Text>
                            </View>
                        ))}
                    <View style={styles.tableTotal}>
                        <Text style={styles.totalText}>Total:</Text>
                        <Text style={styles.totalValue}>
                            {empleado.diasAdicionalesEmpresa?.reduce((sum, p) => sum + p.dias, 0) || 0}
                        </Text>
                    </View>
                </View>

                <View style={styles.tableSection}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableHeaderText}>DÍAS ASIGNADOS POR LA EMPRESA</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={styles.tableCell}>DE:</Text>
                        <Text style={styles.tableCell}>AL:</Text>
                        <Text style={styles.tableCellLast}>#DÍAS</Text>
                    </View>
                    {(empleado.diasOtorgadosEmpresa || [])
                        .sort((a, b) => a.de.localeCompare(b.de))
                        .map((periodo, index) => (
                            <View key={index} style={styles.tableRow}>
                                <Text style={styles.tableCell}>{periodo.de}</Text>
                                <Text style={styles.tableCell}>{periodo.al}</Text>
                                <Text style={styles.tableCellLast}>{periodo.dias}</Text>
                            </View>
                        ))}
                    <View style={styles.tableTotal}>
                        <Text style={styles.totalText}>Total:</Text>
                        <Text style={styles.totalValue}>
                            {empleado.diasOtorgadosEmpresa?.reduce((sum, p) => sum + p.dias, 0) || 0}
                        </Text>
                    </View>
                </View>

                <View style={styles.tableSection}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableHeaderText}>DÍAS GOZADOS</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={styles.tableCell}>DE:</Text>
                        <Text style={styles.tableCell}>AL:</Text>
                        <Text style={styles.tableCellLast}>#DÍAS</Text>
                    </View>
                    {(empleado.diasGozados || [])
                        .sort((a, b) => a.de.localeCompare(b.de))
                        .map((periodo, index) => (
                            <View key={index} style={styles.tableRow}>
                                <Text style={styles.tableCell}>{periodo.de}</Text>
                                <Text style={styles.tableCell}>{periodo.al}</Text>
                                <Text style={styles.tableCellLast}>{periodo.dias}</Text>
                            </View>
                        ))}
                    <View style={styles.tableTotal}>
                        <Text style={styles.totalText}>Total gozados:</Text>
                        <Text style={styles.totalValue}>{totalGozados}</Text>
                    </View>
                    <View style={styles.tableTotal}>
                        <Text style={styles.totalText}>Por gozar:</Text>
                        <Text style={styles.totalValue}>{empleado.porGozar}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.observationsSection}>
                <View style={styles.observationsContent}>
                    <Text style={styles.observationsTitle}>Observaciones</Text>
                    <Text style={styles.observationText}>
                        1. Si deseas modificar uno de los días programados, solicita el cambio con tu jefe de área o a través de tu
                        comité sindical. La solicitud se procesa de forma electrónica.
                    </Text>
                    <Text style={styles.observationText}>2. Esta información se actualiza los días 1 y 15 de cada mes.</Text>
                    <Text style={styles.observationText}>3. En caso de aclaración o duda acude a relaciones laborales.</Text>
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    NOTA: Las vacaciones adicionales aplican al personal a partir del segundo año de antigüedad cumplidos en la
                    empresa. Favor de solicitar el cambio con tu jefe de área o con el comité sindical.
                </Text>
            </View>
        </Page>
    );
};

export const ConstanciaAntiguedadPDF: React.FC<ConstanciaAntiguedadPDFProps> = ({ data }) => (
    <Document>
        {data.empleados.map((empleado, index) => (
            <EmpleadoPage key={index} empleado={empleado} area={data.area} targetYear={data.targetYear} />
        ))}
    </Document>
);