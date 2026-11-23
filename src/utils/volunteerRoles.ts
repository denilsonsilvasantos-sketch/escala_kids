import type {
  ShiftType,
  VolunteerProfile,
  VolunteerRoleKey,
} from "../types/schedule";
import { getGreetingByTime } from "./dateAndMessage";
import { formatVolunteerName } from "./contacts";

export interface VolunteerRoleOption {
  key: VolunteerRoleKey;
  label: string;
  shortLabel: string;
}

export const VOLUNTEER_ROLE_OPTIONS: VolunteerRoleOption[] = [
  { key: "louvor", label: "Louvor 3 a 6 anos", shortLabel: "Louvor" },
  { key: "professor", label: "Professor(a)", shortLabel: "Professor(a)" },
  { key: "auxiliar", label: "Auxiliar", shortLabel: "Auxiliar" },
  { key: "refeitorio", label: "Refeitório", shortLabel: "Refeitório" },
  {
    key: "aux-refeitorio",
    label: "Auxiliar de Refeitório",
    shortLabel: "Aux. Refeitório",
  },
  { key: "pipoca", label: "Pipoca", shortLabel: "Pipoca" },
  {
    key: "aux-pipoca",
    label: "Auxiliar de Pipoca",
    shortLabel: "Aux. Pipoca",
  },
  { key: "midia", label: "Mídia", shortLabel: "Mídia" },
  { key: "seguranca", label: "Segurança", shortLabel: "Segurança" },
  { key: "pastor", label: "Pastor(a)", shortLabel: "Pastor(a)" },
  { key: "coordenador", label: "Coordenador(a)", shortLabel: "Coordenador(a)" },
];

export const ROLE_LABEL_BY_KEY: Record<VolunteerRoleKey, string> = {
  louvor: "Louvor 3 a 6 anos",
  professor: "Professor(a)",
  auxiliar: "Auxiliar",
  refeitorio: "Refeitório",
  "aux-refeitorio": "Auxiliar de Refeitório",
  pipoca: "Pipoca",
  "aux-pipoca": "Auxiliar de Pipoca",
  midia: "Mídia",
  seguranca: "Segurança",
  pastor: "Pastor(a)",
  coordenador: "Coordenador(a)",
};

export const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const EMPTY_VOLUNTEER_PROFILE: VolunteerProfile = {
  birthDay: null,
  birthMonth: null,
  roles: [],
  preferredShifts: [],
  familyGroupId: "",
  familyGroupName: "",
  familySyncMode: "same_shift",
  birthdaySentYear: null,
};

export const BIRTHDAY_TEMPLATE_KEY = "__birthday_message";

export const DEFAULT_BIRTHDAY_TEMPLATE = `{saudacao} 🎉🎂
A paz do Senhor Jesus, {primeiro_nome}!

Passando em nome de toda a equipe do MEVAM Kids para desejar um feliz aniversário! Que o Senhor continue abençoando grandemente a sua vida, sua família e o seu chamado. Somos muito gratos por ter você servindo conosco! 🙏💛`;

export function getRoleKeyForGroupId(groupId: string): VolunteerRoleKey {
  if (groupId.includes("louvor")) return "louvor";
  if (groupId.includes("-prof-")) return "professor";
  if (groupId.includes("aux-refeitorio")) return "aux-refeitorio";
  if (groupId.endsWith("-refeitorio")) return "refeitorio";
  if (groupId.includes("aux-pipoca")) return "aux-pipoca";
  if (groupId.endsWith("-pipoca")) return "pipoca";
  if (groupId.includes("-aux-")) return "auxiliar";
  if (groupId.endsWith("-midia")) return "midia";
  if (groupId.endsWith("-seguranca")) return "seguranca";
  if (groupId.endsWith("-pastores")) return "pastor";
  if (groupId.endsWith("-coordenador")) return "coordenador";
  return "auxiliar";
}

export function formatBirthdayDDMM(
  birthDay?: number | null,
  birthMonth?: number | null
): string {
  if (!birthDay || !birthMonth) return "";
  return `${String(birthDay).padStart(2, "0")}/${String(birthMonth).padStart(2, "0")}`;
}

export function getMaxDaysInMonth(month: number): number {
  if (month === 2) return 29;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function normalizeBirthdayFields(
  birthDay?: number | null,
  birthMonth?: number | null
): { birthDay: number | null; birthMonth: number | null } {
  const m =
    typeof birthMonth === "number" &&
    Number.isInteger(birthMonth) &&
    birthMonth >= 1 &&
    birthMonth <= 12
      ? birthMonth
      : null;
  if (!m) {
    return { birthDay: null, birthMonth: null };
  }
  const maxDay = getMaxDaysInMonth(m);
  const d =
    typeof birthDay === "number" &&
    Number.isInteger(birthDay) &&
    birthDay >= 1 &&
    birthDay <= maxDay
      ? birthDay
      : null;
  if (!d) {
    return { birthDay: null, birthMonth: null };
  }
  return { birthDay: d, birthMonth: m };
}

export function getBirthdayStatus(
  birthDay: number | null,
  birthMonth: number | null,
  now: Date = new Date()
): {
  hasBirthday: boolean;
  isToday: boolean;
  isCurrentMonth: boolean;
  daysUntil: number;
  ddmm: string;
} {
  if (!birthDay || !birthMonth) {
    return {
      hasBirthday: false,
      isToday: false,
      isCurrentMonth: false,
      daysUntil: 999,
      ddmm: "",
    };
  }

  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const isToday = birthDay === todayDay && birthMonth === todayMonth;
  const isCurrentMonth = birthMonth === todayMonth;

  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  let targetYear = now.getFullYear();
  let targetDate = new Date(targetYear, birthMonth - 1, birthDay, 0, 0, 0, 0);
  if (targetDate.getTime() < todayMidnight.getTime()) {
    targetYear += 1;
    targetDate = new Date(targetYear, birthMonth - 1, birthDay, 0, 0, 0, 0);
  }
  const daysUntil = Math.round(
    (targetDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    hasBirthday: true,
    isToday,
    isCurrentMonth,
    daysUntil,
    ddmm: formatBirthdayDDMM(birthDay, birthMonth),
  };
}

export function getFirstName(fullName: string): string {
  const formatted = formatVolunteerName(fullName);
  const first = formatted.split(/\s+/)[0] || formatted;
  return first;
}

export function renderBirthdayMessage(
  template: string,
  volunteerName: string,
  now: Date = new Date()
): string {
  const cleanFull = formatVolunteerName(volunteerName) || "Voluntário(a)";
  const firstName = getFirstName(cleanFull);
  const greeting = getGreetingByTime(now);

  return (template || DEFAULT_BIRTHDAY_TEMPLATE)
    .replace(/\{saudacao\}/gi, greeting)
    .replace(/\{primeiro[\s_]nome\}/gi, firstName)
    .replace(/\{nome\}/gi, cleanFull)
    .replace(/\r\n/g, "\n")
    .trim()
    .normalize("NFC");
}

export function formatShiftPreferenceLabel(shifts: ShiftType[]): string {
  if (!shifts || shifts.length === 0) return "";
  const hasManha = shifts.includes("manha");
  const hasNoite = shifts.includes("noite");
  if (hasManha && hasNoite) return "Manhã e Noite";
  if (hasManha) return "Manhã";
  if (hasNoite) return "Noite";
  return "";
}

export function normalizeVolunteerProfile(
  raw?: Partial<VolunteerProfile> | null
): VolunteerProfile {
  if (!raw) return { ...EMPTY_VOLUNTEER_PROFILE };
  const validRoleSet = new Set<string>(VOLUNTEER_ROLE_OPTIONS.map((r) => r.key));
  const roles = Array.isArray(raw.roles)
    ? (Array.from(
        new Set(raw.roles.filter((r): r is VolunteerRoleKey => validRoleSet.has(String(r))))
      ) as VolunteerRoleKey[])
    : [];
  const preferredShifts = Array.isArray(raw.preferredShifts)
    ? (Array.from(
        new Set(
          raw.preferredShifts.filter(
            (s): s is ShiftType => s === "manha" || s === "noite"
          )
        )
      ) as ShiftType[])
    : [];
  const birthday = normalizeBirthdayFields(
    raw.birthDay ?? null,
    raw.birthMonth ?? null
  );
  const birthdaySentYear =
    typeof raw.birthdaySentYear === "number" &&
    Number.isInteger(raw.birthdaySentYear) &&
    raw.birthdaySentYear >= 2020
      ? raw.birthdaySentYear
      : null;

  return {
    birthDay: birthday.birthDay,
    birthMonth: birthday.birthMonth,
    roles,
    preferredShifts,
    familyGroupId: typeof raw.familyGroupId === "string" ? raw.familyGroupId.trim() : "",
    familyGroupName:
      typeof raw.familyGroupName === "string" ? raw.familyGroupName.trim() : "",
    familySyncMode: raw.familySyncMode === "same_day" ? "same_day" : "same_shift",
    birthdaySentYear,
  };
}
