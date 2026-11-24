import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  GroupDefinition,
  ScheduleEntry,
  ShiftType,
  VolunteerProfile,
  VolunteerStatus,
} from "../types/schedule";
import { formatDateDDMM, formatPhoneDisplay } from "./dateAndMessage";
import { formatVolunteerName, normalizeNameKey } from "./contacts";
import {
  formatAgePreferencesLabel,
  formatBirthdayDDMM,
  formatShiftPreferenceLabel,
  ROLE_LABEL_BY_KEY,
} from "./volunteerRoles";

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
  lideranca: "Pastor(a) & Coordenador(a)",
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

export function exportVolunteersToExcel(
  volunteers: { primaryKey?: string; displayName: string; phone: string }[],
  profiles?: Record<string, VolunteerProfile>
) {
  const sheetData = volunteers.map((v) => {
    const key = v.primaryKey || normalizeNameKey(v.displayName);
    const prof = profiles?.[key];
    return {
      Nome: formatVolunteerName(v.displayName),
      WhatsApp: v.phone ? formatPhoneDisplay(v.phone) : "",
      Aniversário: prof ? formatBirthdayDDMM(prof.birthDay, prof.birthMonth) : "",
      Turnos: prof ? formatShiftPreferenceLabel(prof.preferredShifts) : "",
      Funções: prof
        ? prof.roles.map((r) => ROLE_LABEL_BY_KEY[r] || r).join(", ")
        : "",
      "Faixas Etárias": prof
        ? formatAgePreferencesLabel(prof.preferredAges)
        : "",
      Família: prof?.familyGroupName || "",
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  worksheet["!cols"] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 13 },
    { wch: 16 },
    { wch: 34 },
    { wch: 24 },
    { wch: 22 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Voluntarios");

  XLSX.writeFile(workbook, "voluntarios-mevam-kids.xlsx");
}

export function exportVolunteersToPdf(
  volunteers: { primaryKey?: string; displayName: string; phone: string }[],
  profiles?: Record<string, VolunteerProfile>
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const total = volunteers.length;
  const comWhatsapp = volunteers.filter((v) => v.phone.trim().length > 0).length;
  const semWhatsapp = total - comWhatsapp;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text("Cadastro de Voluntários — MEVAM Kids", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(82, 82, 91);
  doc.text(
    `Total: ${total} voluntários  ·  Com WhatsApp: ${comWhatsapp}  ·  Sem WhatsApp: ${semWhatsapp}`,
    14,
    25
  );

  autoTable(doc, {
    startY: 31,
    head: [["#", "Voluntário", "WhatsApp", "Aniv.", "Turnos / Funções"]],
    body: volunteers.map((v, idx) => {
      const hasPhone = v.phone.trim().length > 0;
      const key = v.primaryKey || normalizeNameKey(v.displayName);
      const prof = profiles?.[key];
      const bday = prof ? formatBirthdayDDMM(prof.birthDay, prof.birthMonth) : "";
      const shiftsLabel = prof ? formatShiftPreferenceLabel(prof.preferredShifts) : "";
      const rolesLabel = prof
        ? prof.roles.map((r) => ROLE_LABEL_BY_KEY[r] || r).join(", ")
        : "";
      const agesLabel = prof
        ? formatAgePreferencesLabel(prof.preferredAges)
        : "";
      const summary = [shiftsLabel, rolesLabel, agesLabel, prof?.familyGroupName]
        .filter(Boolean)
        .join(" · ");
      return [
        String(idx + 1),
        formatVolunteerName(v.displayName),
        hasPhone ? formatPhoneDisplay(v.phone) : "—",
        bday || "—",
        summary || "—",
      ];
    }),
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.3,
      textColor: [24, 24, 27],
      lineColor: [232, 230, 223],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: "right", cellWidth: 10 },
      2: { cellWidth: 32 },
      3: { cellWidth: 16, halign: "center" },
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [250, 249, 245],
    },
  });

  doc.save("voluntarios-mevam-kids.pdf");
}


