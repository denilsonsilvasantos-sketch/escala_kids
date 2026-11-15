import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  GroupDefinition,
  ScheduleEntry,
  ShiftType,
  VolunteerStatus,
} from "../types/schedule";
import { formatDateDDMM, formatPhoneDisplay } from "./dateAndMessage";
import { formatVolunteerName } from "./contacts";

function getExportStatusLabel(entry: ScheduleEntry): string {
  if (entry.status === "confirmado") return "Confirmado";
  if (entry.status === "recusado") return "Recusado (não poderá servir)";
  return entry.messageSent
    ? "Pendente (msg enviada)"
    : "Pendente (não enviada)";
}

const CATEGORY_LABELS: Record<string, string> = {
  louvor: "Louvor",
  professor: "Professores",
  auxiliar: "Auxiliares",
  servicos: "Refeitório & Pipoca",
  apoio: "Mídia & Segurança",
  lideranca: "Pastores",
};

interface ExportParams {
  sundayISO: string;
  shiftFilter: "todos" | ShiftType;
  entries: ScheduleEntry[];
  groups: GroupDefinition[];
}

function buildExportRows({
  shiftFilter,
  entries,
  groups,
}: Omit<ExportParams, "sundayISO">) {
  const filteredGroups = groups.filter((g) =>
    shiftFilter === "todos" ? true : g.shift === shiftFilter
  );

  const entriesByGroup: Record<string, ScheduleEntry[]> = {};
  for (const e of entries) {
    if (!entriesByGroup[e.groupId]) entriesByGroup[e.groupId] = [];
    entriesByGroup[e.groupId].push(e);
  }

  const rows: {
    culto: string;
    categoria: string;
    funcao: string;
    voluntario: string;
    whatsapp: string;
    status: string;
    rawStatus: VolunteerStatus | "vazio";
    messageSent: boolean;
  }[] = [];

  for (const group of filteredGroups) {
    const groupEntries = entriesByGroup[group.id] || [];
    const shiftLabel = group.shift === "manha" ? "Manhã" : "Noite";
    const catLabel = CATEGORY_LABELS[group.category] || "Geral";

    if (groupEntries.length === 0) {
      rows.push({
        culto: shiftLabel,
        categoria: catLabel,
        funcao: group.label,
        voluntario: "— Vaga em aberto —",
        whatsapp: "",
        status: "Sem voluntário",
        rawStatus: "vazio",
        messageSent: false,
      });
    } else {
      for (const entry of groupEntries) {
        rows.push({
          culto: shiftLabel,
          categoria: catLabel,
          funcao: group.label,
          voluntario: formatVolunteerName(entry.volunteerName),
          whatsapp: entry.phone ? formatPhoneDisplay(entry.phone) : "",
          status: getExportStatusLabel(entry),
          rawStatus: entry.status,
          messageSent: entry.messageSent,
        });
      }
    }
  }

  return rows;
}

export function exportScheduleToExcel({
  sundayISO,
  shiftFilter,
  entries,
  groups,
}: ExportParams) {
  const dateDDMM = formatDateDDMM(sundayISO);
  const rows = buildExportRows({ shiftFilter, entries, groups });

  const sheetData = rows.map((r) => ({
    Culto: r.culto,
    Categoria: r.categoria,
    "Função / Turma": r.funcao,
    Voluntário: r.voluntario,
    WhatsApp: r.whatsapp,
    Status: r.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  worksheet["!cols"] = [
    { wch: 10 },
    { wch: 22 },
    { wch: 26 },
    { wch: 26 },
    { wch: 18 },
    { wch: 28 },
  ];

  const workbook = XLSX.utils.book_new();
  const safeSheetName = `Escala ${dateDDMM.replace("/", "-")}`;
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const fileDate = dateDDMM.replace("/", "-");
  const shiftSuffix = shiftFilter === "todos" ? "completa" : shiftFilter;
  XLSX.writeFile(workbook, `escala-kids-${fileDate}-${shiftSuffix}.xlsx`);
}

export function exportScheduleToPdf({
  sundayISO,
  shiftFilter,
  entries,
  groups,
}: ExportParams) {
  const dateDDMM = formatDateDDMM(sundayISO);
  const rows = buildExportRows({ shiftFilter, entries, groups });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const shiftTitle =
    shiftFilter === "todos"
      ? "Culto da Manhã e Noite"
      : shiftFilter === "manha"
        ? "Culto da Manhã"
        : "Culto da Noite";

  const scopedEntries = entries.filter((e) =>
    shiftFilter === "todos" ? true : e.shift === shiftFilter
  );
  const enviados = scopedEntries.filter((e) => e.messageSent).length;
  const confirmados = scopedEntries.filter(
    (e) => e.status === "confirmado"
  ).length;
  const pendentes = scopedEntries.filter(
    (e) => e.status === "pendente"
  ).length;
  const recusados = scopedEntries.filter(
    (e) => e.status === "recusado"
  ).length;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text(`Escala Kids — Domingo ${dateDDMM}`, 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(82, 82, 91);
  doc.text(
    `${shiftTitle}  ·  Escalados: ${scopedEntries.length}  ·  Enviados: ${enviados}  ·  Confirmados: ${confirmados}  ·  Pendentes: ${pendentes}  ·  Recusados: ${recusados}`,
    14,
    25
  );

  autoTable(doc, {
    startY: 31,
    head: [["Culto", "Função / Turma", "Voluntário", "WhatsApp", "Status"]],
    body: rows.map((r) => [
      r.culto,
      r.funcao,
      r.voluntario,
      r.whatsapp || "—",
      r.status,
    ]),
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      textColor: [24, 24, 27],
      lineColor: [232, 230, 223],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [250, 249, 245],
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const row = rows[data.row.index];
        if (!row) return;
        if (row.rawStatus === "confirmado") {
          data.cell.styles.textColor = [4, 120, 87];
          data.cell.styles.fontStyle = "bold";
        } else if (row.rawStatus === "recusado") {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        } else if (row.rawStatus === "pendente") {
          data.cell.styles.textColor = row.messageSent
            ? [3, 105, 161]
            : [180, 83, 9];
        } else {
          data.cell.styles.textColor = [161, 161, 170];
        }
      }
    },
  });

  const fileDate = dateDDMM.replace("/", "-");
  const shiftSuffix = shiftFilter === "todos" ? "completa" : shiftFilter;
  doc.save(`escala-kids-${fileDate}-${shiftSuffix}.pdf`);
}
