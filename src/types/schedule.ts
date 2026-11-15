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

export type AppView = "escala" | "modelos" | "importar";
