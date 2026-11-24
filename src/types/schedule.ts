export type ShiftType = "manha" | "noite";

export type VolunteerStatus = "pendente" | "confirmado" | "recusado";

export type StatusFilterType =
  | "todos"
  | "pendente"
  | "enviado"
  | "nao-enviado"
  | "confirmado"
  | "recusado";

export type GroupCategory =
  | "louvor"
  | "professor"
  | "auxiliar"
  | "servicos"
  | "apoio"
  | "lideranca";

export interface GroupDefinition {
  id: string;
  shift: ShiftType;
  label: string;
  category: GroupCategory;
  order: number;
}

export interface ScheduleEntry {
  id: string;
  date: string; // YYYY-MM-DD (Sunday)
  shift: ShiftType;
  groupId: string;
  volunteerName: string;
  phone: string;
  status: VolunteerStatus;
  messageSent: boolean;
}

export interface MessageTemplatesState {
  defaultNoite: string;
  defaultManha: string;
  groupOverrides: Record<string, string>;
}

export type ContactLinkRelation = "same" | "distinct";

export interface ContactLink {
  id: string;
  nameKeyA: string;
  nameKeyB: string;
  displayNameA: string;
  displayNameB: string;
  relation: ContactLinkRelation;
}

export interface ContactMatchCandidate {
  key: string;
  displayName: string;
  phone: string;
}

export interface PendingContactMatch {
  incomingName: string;
  incomingKey: string;
  incomingPhone: string;
  incomingRole?: string;
  matchType: "same-name" | "similar";
  candidates: ContactMatchCandidate[];
}

export interface ExtractedVolunteerOccurrence {
  name: string;
  role: string;
}

export type AppView = "escala" | "voluntarios" | "modelos" | "importar";

export type VolunteerRoleKey =
  | "louvor"
  | "professor"
  | "auxiliar"
  | "refeitorio"
  | "aux-refeitorio"
  | "pipoca"
  | "aux-pipoca"
  | "midia"
  | "seguranca"
  | "pastor"
  | "coordenador";

export type VolunteerAgeKey =
  | "manha:3e4"
  | "manha:5e6"
  | "manha:7e8"
  | "manha:9a12"
  | "noite:3e4"
  | "noite:5"
  | "noite:6"
  | "noite:7"
  | "noite:8"
  | "noite:9e10"
  | "noite:11e12";

export type FamilySyncMode = "same_shift" | "same_day";

export interface VolunteerProfile {
  birthDay: number | null;
  birthMonth: number | null;
  roles: VolunteerRoleKey[];
  preferredAges: VolunteerAgeKey[];
  preferredShifts: ShiftType[];
  familyGroupId: string;
  familyGroupName: string;
  familySyncMode: FamilySyncMode;
  birthdaySentYear: number | null;
}

