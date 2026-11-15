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

export function getTemplateForGroup(
  templates: MessageTemplatesState,
  group: GroupDefinition
): string {
  const override = templates.groupOverrides[group.id];
  if (override && override.trim().length > 0) {
    return override;
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

  const rendered = template
    .replace(/\{saudacao\}/gi, greeting)
    .replace(/\{data\}/gi, dateDDMM)
    .replace(/\{culto\}/gi, cultoLabel)
    .replace(/\{grupo\}/gi, params.groupLabel)
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
