import type { GroupDefinition, MessageTemplatesState, ShiftType } from "../types/schedule";

/**
 * Parses YYYY-MM-DD strictly in local time to avoid UTC off-by-one shifts.
 */
export function parseLocalISODate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Formats YYYY-MM-DD strictly as DD/MM (e.g., 15/11, 22/11),
 * never adding "domingo" or month names.
 */
export function formatDateDDMM(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  if (!m || !d) return isoDate;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}`;
}

/**
 * Returns automatic greeting ("Bom dia!", "Boa tarde!", "Boa noite!")
 * based on the current local hour when the message is being sent.
 */
export function getGreetingByTime(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) {
    return "Bom dia!";
  }
  if (hour >= 12 && hour < 18) {
    return "Boa tarde!";
  }
  return "Boa noite!";
}

/**
 * Ensures any picked date snaps to the corresponding Sunday (or stays Sunday if already Sunday).
 */
export function snapToSunday(isoDate: string): string {
  const date = parseLocalISODate(isoDate);
  const day = date.getDay(); // 0 = Sunday
  if (day !== 0) {
    const daysUntilSunday = 7 - day;
    date.setDate(date.getDate() + daysUntilSunday);
  }
  return toLocalISODate(date);
}

export function addDaysISO(isoDate: string, days: number): string {
  const date = parseLocalISODate(isoDate);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

/**
 * Returns upcoming Sundays starting from a reference Sunday (default 2026-11-15).
 */
export function getUpcomingSundays(startSundayISO = "2026-11-15", count = 5): string[] {
  const list: string[] = [];
  const base = snapToSunday(startSundayISO);
  for (let i = 0; i < count; i++) {
    list.push(addDaysISO(base, i * 7));
  }
  return list;
}

export interface ConfirmationWindowInfo {
  isUnlocked: boolean;
  unlockDateISO: string;
  unlockDateDDMM: string;
  daysUntilUnlock: number;
}

/**
 * Confirmation opens on the Thursday before the Sunday schedule (Sunday - 3 days).
 */
export function getConfirmationWindowInfo(
  sundayISO: string,
  now: Date = new Date()
): ConfirmationWindowInfo {
  const unlockDateISO = addDaysISO(sundayISO, -3); // Thursday before Sunday
  const unlockDate = parseLocalISODate(unlockDateISO);
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  const diffMs = unlockDate.getTime() - todayMidnight.getTime();
  const daysUntilUnlock = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isUnlocked: todayMidnight.getTime() >= unlockDate.getTime(),
    unlockDateISO,
    unlockDateDDMM: formatDateDDMM(unlockDateISO),
    daysUntilUnlock: Math.max(0, daysUntilUnlock),
  };
}

/**
 * Returns true if the given Sunday (YYYY-MM-DD) is the first Sunday of the month (Santa Ceia).
 */
export function isFirstSundayOfMonth(sundayISO: string): boolean {
  const date = parseLocalISODate(sundayISO);
  return date.getDay() === 0 && date.getDate() <= 7;
}

/**
 * Returns the team prayer time by shift: 9:45hs (manhã) or 18hs (noite).
 */
export function getPrayerTimeForShift(shift: ShiftType): string {
  return shift === "manha" ? "9:45hs" : "18hs";
}

export const ROLE_TEMPLATE_KEYS = {
  professor: "__role_professor",
  auxiliar: "__role_auxiliar",
  seguranca: "__role_seguranca",
} as const;

export const ROLE_DEFAULT_TEMPLATES: Record<
  keyof typeof ROLE_TEMPLATE_KEYS,
  string
> = {
  professor: `{saudacao} 🤗
A paz do Senhor Jesus!

Passando pra confirmar nossa escala desse domingo, dia {data} no Culto da {culto}.

{grupo}

Tudo certo?

💡Procure seus auxiliares de sala e oriente eles sobre como podem cooperar com a ministração.

❤️🔥Lembrando que nosso horário de chegada é 45min antes do início do culto, para preparação da sala, oração com a equipe e alinhamento com auxiliares. 
Nossa oração com toda equipe acontece no templo kids as {horario_oracao}.`,
  auxiliar: `{saudacao} 🤗
A paz do Senhor Jesus!

Passando pra confirmar nossa escala desse domingo, dia {data} no Culto da {culto}.

{grupo}

Tudo certo?

💡Procure seu professor (a) para saber qual será a ministração do dia e como poderá ajudar.
❤️🔥Lembrando tbm da nossa oração com toda equipe no templo kids as {horario_oracao}.`,
  seguranca: `{saudacao} 🤗
A paz do Senhor Jesus!

Passando pra confirmar nossa escala desse domingo, dia {data} no Culto da {culto}.

{grupo}

Tudo certo?

💡Procure chegar com 45 min de antecedência para a abertura do check-in.

❤️🔥Lembrando tbm da nossa oração com toda equipe no templo kids as {horario_oracao}.`,
};

export function getRoleTemplateKeyForGroup(
  group: GroupDefinition
): keyof typeof ROLE_TEMPLATE_KEYS | null {
  if (group.category === "professor") return "professor";
  if (group.category === "auxiliar") return "auxiliar";
  if (group.id.endsWith("-seguranca")) return "seguranca";
  return null;
}

export function getTemplateForGroup(
  templates: MessageTemplatesState,
  group: GroupDefinition
): string {
  const override = templates.groupOverrides[group.id];
  if (override && override.trim().length > 0) {
    return override;
  }

  const roleKey = getRoleTemplateKeyForGroup(group);
  if (roleKey) {
    const roleOverride = templates.groupOverrides[ROLE_TEMPLATE_KEYS[roleKey]];
    if (roleOverride && roleOverride.trim().length > 0) {
      return roleOverride;
    }
    return ROLE_DEFAULT_TEMPLATES[roleKey];
  }

  return group.shift === "manha"
    ? templates.defaultManha
    : templates.defaultNoite;
}

export function renderScheduleMessage(
  template: string,
  params: {
    sundayISO: string;
    shift: ShiftType;
    groupLabel: string;
    now?: Date;
  }
): string {
  const dateDDMM = formatDateDDMM(params.sundayISO);
  const cultoLabel = params.shift === "manha" ? "manhã" : "noite";
  const greeting = getGreetingByTime(params.now ?? new Date());
  const prayerTime = getPrayerTimeForShift(params.shift);
  const santaCeia = isFirstSundayOfMonth(params.sundayISO);

  let rendered = template;
  if (santaCeia) {
    rendered = rendered.replace(
      /no\s+Culto\s+da\s+\{culto\}/gi,
      `no Culto de Santa Ceia - ${cultoLabel}`
    );
  }

  rendered = rendered
    .replace(/\{saudacao\}/gi, greeting)
    .replace(/\{data\}/gi, dateDDMM)
    .replace(/\{culto\}/gi, cultoLabel)
    .replace(/\{grupo\}/gi, params.groupLabel)
    .replace(/\{hor[aá]rio[\s_]ora[cç][aã]o\}/gi, prayerTime)
    .replace(/\r\n/g, "\n")
    .trim();

  return rendered.normalize("NFC");
}

export function sanitizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const local =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}

/**
 * Builds a WhatsApp Web/App URL preserving UTF-8 emojis cleanly via api.whatsapp.com/send.
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanMessage = message.replace(/\r\n/g, "\n").normalize("NFC");
  const encodedText = encodeURIComponent(cleanMessage);
  const cleanPhone = sanitizePhoneDigits(phone);

  if (cleanPhone.length >= 10) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}
