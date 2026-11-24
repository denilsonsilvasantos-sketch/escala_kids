import type {
  ShiftType,
  VolunteerAgeKey,
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

export interface VolunteerAgeOption {
  key: VolunteerAgeKey;
  label: string;
  shortLabel: string;
  manhaHint?: string;
}

export const VOLUNTEER_AGE_OPTIONS: VolunteerAgeOption[] = [
  { key: "3e4", label: "3 e 4 anos", shortLabel: "3 e 4" },
  { key: "5", label: "5 anos", shortLabel: "5 anos", manhaHint: "Manhã: 5 e 6" },
  { key: "6", label: "6 anos", shortLabel: "6 anos", manhaHint: "Manhã: 5 e 6" },
  { key: "7", label: "7 anos", shortLabel: "7 anos", manhaHint: "Manhã: 7 e 8" },
  { key: "8", label: "8 anos", shortLabel: "8 anos", manhaHint: "Manhã: 7 e 8" },
  { key: "9e10", label: "9 e 10 anos", shortLabel: "9 e 10", manhaHint: "Manhã: 9 a 12" },
  { key: "11e12", label: "11 e 12 anos", shortLabel: "11 e 12", manhaHint: "Manhã: 9 a 12" },
];

export const AGE_LABEL_BY_KEY: Record<VolunteerAgeKey, string> = {
  "3e4": "3 e 4 anos",
  "5": "5 anos",
  "6": "6 anos",
  "7": "7 anos",
  "8": "8 anos",
  "9e10": "9 e 10 anos",
  "11e12": "11 e 12 anos",
};

export const AGE_SHORT_LABEL_BY_KEY: Record<VolunteerAgeKey, string> = {
  "3e4": "3 e 4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9e10": "9 e 10",
  "11e12": "11 e 12",
};

export const AGE_SENSITIVE_ROLES = new Set<VolunteerRoleKey>([
  "louvor",
  "professor",
  "auxiliar",
]);

export const EMPTY_VOLUNTEER_PROFILE: VolunteerProfile = {
  birthDay: null,
  birthMonth: null,
  roles: [],
  preferredAges: [],
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

export function getAgeKeysForGroupId(groupId: string): VolunteerAgeKey[] {
  if (groupId.includes("louvor-3a6")) return ["3e4", "5", "6"];
  if (groupId.endsWith("-3e4")) return ["3e4"];
  if (groupId.endsWith("-5e6")) return ["5", "6"];
  if (groupId.endsWith("-5")) return ["5"];
  if (groupId.endsWith("-6")) return ["6"];
  if (groupId.endsWith("-7e8")) return ["7", "8"];
  if (groupId.endsWith("-7")) return ["7"];
  if (groupId.endsWith("-8")) return ["8"];
  if (groupId.endsWith("-9a12")) return ["9e10", "11e12"];
  if (groupId.endsWith("-9e10")) return ["9e10"];
  if (groupId.endsWith("-11e12")) return ["11e12"];
  return [];
}

export function isAgeSensitiveGroupId(groupId: string): boolean {
  return AGE_SENSITIVE_ROLES.has(getRoleKeyForGroupId(groupId));
}

export function matchesAgePreference(
  preferredAges: VolunteerAgeKey[] | undefined,
  groupId: string
): "match" | "mismatch" | "any" {
  if (!isAgeSensitiveGroupId(groupId)) return "any";
  if (!preferredAges || preferredAges.length === 0) return "any";
  const groupAges = getAgeKeysForGroupId(groupId);
  if (groupAges.length === 0) return "any";
  return groupAges.some((a) => preferredAges.includes(a)) ? "match" : "mismatch";
}

export function formatAgePreferencesLabel(ages: VolunteerAgeKey[]): string {
  if (!ages || ages.length === 0) return "";
  return ages.map((a) => AGE_SHORT_LABEL_BY_KEY[a] || a).join(", ") + " anos";
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

export function formatBirthdayInputMask(nextRaw: string, prevValue = ""): string {
  // Support typing "5/" -> "05/"
  const explicitSlash = nextRaw.match(/^(\d{1,2})\/$/);
  if (explicitSlash && nextRaw.length > prevValue.length) {
    const paddedDay = explicitSlash[1].padStart(2, "0");
    return `${paddedDay}/`;
  }
  const digits = nextRaw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length <= 2) {
    if (nextRaw.endsWith("/") && digits.length === 2 && nextRaw.length >= prevValue.length) {
      return `${digits}/`;
    }
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
}

export function parseBirthdayInputBR(input: string): {
  empty: boolean;
  valid: boolean;
  birthDay: number | null;
  birthMonth: number | null;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { empty: true, valid: true, birthDay: null, birthMonth: null };
  }
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) {
    return { empty: false, valid: false, birthDay: null, birthMonth: null };
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { empty: false, valid: false, birthDay: null, birthMonth: null };
  }
  const maxDay = getMaxDaysInMonth(month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    return { empty: false, valid: false, birthDay: null, birthMonth: null };
  }
  return { empty: false, valid: true, birthDay: day, birthMonth: month };
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
  const validAgeSet = new Set<string>(VOLUNTEER_AGE_OPTIONS.map((a) => a.key));

  const rolesList: VolunteerRoleKey[] = [];
  const agesList: VolunteerAgeKey[] = [];

  if (Array.isArray(raw.roles)) {
    for (const item of raw.roles) {
      const str = String(item);
      if (str.startsWith("age:")) {
        const ageKey = str.slice(4);
        if (validAgeSet.has(ageKey)) {
          agesList.push(ageKey as VolunteerAgeKey);
        }
      } else if (validRoleSet.has(str)) {
        rolesList.push(str as VolunteerRoleKey);
      }
    }
  }

  if (Array.isArray(raw.preferredAges)) {
    for (const item of raw.preferredAges) {
      const str = String(item);
      if (validAgeSet.has(str)) {
        agesList.push(str as VolunteerAgeKey);
      }
    }
  }

  const roles = Array.from(new Set(rolesList));
  const preferredAges = Array.from(new Set(agesList));
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
    preferredAges,
    preferredShifts,
    familyGroupId: typeof raw.familyGroupId === "string" ? raw.familyGroupId.trim() : "",
    familyGroupName:
      typeof raw.familyGroupName === "string" ? raw.familyGroupName.trim() : "",
    familySyncMode: raw.familySyncMode === "same_day" ? "same_day" : "same_shift",
    birthdaySentYear,
  };
}
