import { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  Unlock,
  Lock,
  CopyPlus,
  MessageSquare,
  X,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Eye,
} from "lucide-react";
import type {
  ContactLink,
  GroupCategory,
  MessageTemplatesState,
  ScheduleEntry,
  ShiftType,
  StatusFilterType,
  VolunteerStatus,
} from "../types/schedule";
import { SCHEDULE_GROUPS } from "../data/initialData";
import {
  buildWhatsAppUrl,
  formatDateDDMM,
  formatPhoneDisplay,
  getConfirmationWindowInfo,
  getGreetingByTime,
  getTemplateForGroup,
  getUpcomingSundays,
  renderScheduleMessage,
  snapToSunday,
} from "../utils/dateAndMessage";
import {
  exportScheduleToExcel,
  exportScheduleToPdf,
} from "../utils/exportSchedule";
import { WhatsAppPreviewCard } from "./WhatsAppPreviewCard";
import { ReplaceVolunteerModal } from "./ReplaceVolunteerModal";
import { formatVolunteerName } from "../utils/contacts";

interface ScheduleWorkspaceProps {
  sundayISO: string;
  onChangeSundayISO: (iso: string) => void;
  entries: ScheduleEntry[];
  templates: MessageTemplatesState;
  selectedIds: Record<string, boolean>;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  onClearSelection: () => void;
  onUpdateStatus: (id: string, status: VolunteerStatus) => void;
  onMarkSent: (id: string) => void;
  onUpdatePhone: (id: string, phone: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onDeleteEntry: (id: string) => void;
  onOpenAddForGroup: (shift: ShiftType, groupId: string) => void;
  onOpenBatchModal: () => void;
  onDuplicateFromDate: (sourceISO: string, targetISO: string) => void;
  earlyOverride: boolean;
  onToggleEarlyOverride: () => void;
  contactBook: Record<string, string>;
  contactLinks: ContactLink[];
  onReplaceVolunteer: (entryId: string, newName: string, newPhone: string) => void;
  onCommitName?: (entryId: string, name: string) => void;
  onCommitPhone?: (entryId: string, phone: string) => void;
}

const CATEGORY_LABELS: Record<GroupCategory, string> = {
  louvor: "Louvor",
  professor: "Professores",
  auxiliar: "Auxiliares",
  servicos: "Refeitório & Pipoca",
  apoio: "Mídia & Segurança",
  lideranca: "Pastores",
};

const CATEGORY_ORDER: GroupCategory[] = [
  "louvor",
  "professor",
  "auxiliar",
  "servicos",
  "apoio",
  "lideranca",
];

export function ScheduleWorkspace({
  sundayISO,
  onChangeSundayISO,
  entries,
  templates,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onClearSelection,
  onUpdateStatus,
  onMarkSent,
  onUpdatePhone,
  onUpdateName,
  onDeleteEntry,
  onOpenAddForGroup,
  onOpenBatchModal,
  onDuplicateFromDate,
  earlyOverride,
  onToggleEarlyOverride,
  contactBook,
  contactLinks,
  onReplaceVolunteer,
  onCommitName,
  onCommitPhone,
}: ScheduleWorkspaceProps) {
  const [shiftFilter, setShiftFilter] = useState<"todos" | ShiftType>("noite");
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [mobilePreviewEntryId, setMobilePreviewEntryId] = useState<string | null>(
    null
  );
  const [editingField, setEditingField] = useState<{
    id: string;
    field: "name" | "phone";
  } | null>(null);
  const [replacingEntryId, setReplacingEntryId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mobilePreviewEntryId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobilePreviewEntryId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobilePreviewEntryId]);

  const upcomingSundays = useMemo(
    () => getUpcomingSundays("2026-11-15", 5),
    []
  );

  const windowInfo = useMemo(
    () => getConfirmationWindowInfo(sundayISO, nowTick),
    [sundayISO, nowTick]
  );

  const canSendNow = windowInfo.isUnlocked || earlyOverride;
  const dateDDMM = formatDateDDMM(sundayISO);
  const currentGreeting = getGreetingByTime(nowTick);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === sundayISO),
    [entries, sundayISO]
  );

  const knownNames = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const formatted = formatVolunteerName(e.volunteerName);
      if (formatted) set.add(formatted);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [entries]);

  const replacingEntry = useMemo(
    () => entries.find((e) => e.id === replacingEntryId) || null,
    [entries, replacingEntryId]
  );

  const replacingGroup = useMemo(
    () =>
      replacingEntry
        ? SCHEDULE_GROUPS.find((g) => g.id === replacingEntry.groupId)
        : undefined,
    [replacingEntry]
  );

  const mobilePreviewEntry = useMemo(
    () => entries.find((e) => e.id === mobilePreviewEntryId) || null,
    [entries, mobilePreviewEntryId]
  );

  const mobilePreviewGroup = useMemo(
    () =>
      mobilePreviewEntry
        ? SCHEDULE_GROUPS.find((g) => g.id === mobilePreviewEntry.groupId)
        : undefined,
    [mobilePreviewEntry]
  );

  const mobilePreviewMessage = useMemo(() => {
    if (!mobilePreviewEntry || !mobilePreviewGroup) return "";
    return renderScheduleMessage(
      getTemplateForGroup(templates, mobilePreviewGroup),
      {
        sundayISO,
        shift: mobilePreviewEntry.shift,
        groupLabel: mobilePreviewGroup.label,
        now: nowTick,
      }
    );
  }, [mobilePreviewEntry, mobilePreviewGroup, templates, sundayISO, nowTick]);

  const stats = useMemo(() => {
    const total = dayEntries.length;
    const pendentes = dayEntries.filter((e) => e.status === "pendente").length;
    const enviados = dayEntries.filter((e) => e.messageSent).length;
    const confirmados = dayEntries.filter(
      (e) => e.status === "confirmado"
    ).length;
    const recusados = dayEntries.filter((e) => e.status === "recusado").length;
    return { total, pendentes, enviados, confirmados, recusados };
  }, [dayEntries]);

  const groupsToDisplay = useMemo(() => {
    return SCHEDULE_GROUPS.filter((g) =>
      shiftFilter === "todos" ? true : g.shift === shiftFilter
    );
  }, [shiftFilter]);

  const entriesByGroupId = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {};
    for (const entry of dayEntries) {
      if (statusFilter === "pendente" && entry.status !== "pendente") continue;
      if (statusFilter === "enviado" && !entry.messageSent) continue;
      if (statusFilter === "nao-enviado" && entry.messageSent) continue;
      if (statusFilter === "confirmado" && entry.status !== "confirmado")
        continue;
      if (statusFilter === "recusado" && entry.status !== "recusado") continue;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const groupLabel =
          SCHEDULE_GROUPS.find(
            (g) => g.id === entry.groupId
          )?.label.toLowerCase() || "";
        if (
          !entry.volunteerName.toLowerCase().includes(q) &&
          !groupLabel.includes(q)
        ) {
          continue;
        }
      }
      if (!map[entry.groupId]) map[entry.groupId] = [];
      map[entry.groupId].push(entry);
    }
    return map;
  }, [dayEntries, statusFilter, searchQuery]);

  const visibleEntries = useMemo(() => {
    const list: ScheduleEntry[] = [];
    for (const g of groupsToDisplay) {
      if (entriesByGroupId[g.id]) {
        list.push(...entriesByGroupId[g.id]);
      }
    }
    return list;
  }, [groupsToDisplay, entriesByGroupId]);

  const selectedVisibleCount = visibleEntries.filter(
    (e) => selectedIds[e.id]
  ).length;

  // Determine active entry for the sticky right-hand WhatsApp live preview
  const previewEntry = useMemo(() => {
    if (focusedEntryId) {
      const found = visibleEntries.find((e) => e.id === focusedEntryId);
      if (found) return found;
    }
    return visibleEntries[0] || null;
  }, [focusedEntryId, visibleEntries]);

  const previewGroup = useMemo(
    () =>
      previewEntry
        ? SCHEDULE_GROUPS.find((g) => g.id === previewEntry.groupId)
        : undefined,
    [previewEntry]
  );

  const previewMessage = useMemo(() => {
    if (!previewEntry || !previewGroup) {
      const fallbackGroup =
        groupsToDisplay[0] ||
        SCHEDULE_GROUPS.find((g) => g.shift === "noite")!;
      return renderScheduleMessage(
        getTemplateForGroup(templates, fallbackGroup),
        {
          sundayISO,
          shift: fallbackGroup.shift,
          groupLabel: fallbackGroup.label,
          now: nowTick,
        }
      );
    }
    return renderScheduleMessage(getTemplateForGroup(templates, previewGroup), {
      sundayISO,
      shift: previewEntry.shift,
      groupLabel: previewGroup.label,
      now: nowTick,
    });
  }, [previewEntry, previewGroup, groupsToDisplay, templates, sundayISO, nowTick]);

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const renderShiftSection = (shift: ShiftType, title: string) => {
    const shiftGroups = groupsToDisplay.filter((g) => g.shift === shift);
    if (shiftGroups.length === 0) return null;

    const shiftCount = dayEntries.filter((e) => e.shift === shift).length;

    return (
      <section
        key={shift}
        className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-4 bg-[#FAF9F5]">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-base font-bold text-zinc-900">
              {title}
            </h2>
            <span className="text-xs text-zinc-500 font-mono-tabular">
              {shiftCount} {shiftCount === 1 ? "voluntário" : "voluntários"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenAddForGroup(shift, shiftGroups[0]?.id || "")}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar neste culto</span>
          </button>
        </div>

        <div className="divide-y divide-[#EFECE4]">
          {CATEGORY_ORDER.map((category) => {
            const catGroups = shiftGroups.filter(
              (g) => g.category === category
            );
            if (catGroups.length === 0) return null;

            // Check if anything is visible when searching or filtering status
            const hasAnyEntries = catGroups.some(
              (g) => (entriesByGroupId[g.id] || []).length > 0
            );
            if (!hasAnyEntries && (searchQuery.trim() || statusFilter !== "todos")) {
              return null;
            }

            return (
              <div key={category}>
                <div className="px-6 py-2 bg-[#FCFBF8] border-b border-[#F2EFE8] text-[11px] font-semibold text-zinc-500 tracking-wide">
                  {CATEGORY_LABELS[category]}
                </div>

                <div className="divide-y divide-[#F4F2EC]">
                  {catGroups.map((group) => {
                    const groupEntries = entriesByGroupId[group.id] || [];
                    const template = getTemplateForGroup(templates, group);
                    const message = renderScheduleMessage(template, {
                      sundayISO,
                      shift: group.shift,
                      groupLabel: group.label,
                    });

                    if (groupEntries.length === 0) {
                      if (searchQuery.trim() || statusFilter !== "todos") {
                        return null;
                      }
                      return (
                        <div
                          key={group.id}
                          className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-[#FAF9F5] transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span className="w-4 shrink-0" aria-hidden="true" />
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-zinc-600">
                                {group.label}
                              </span>
                              <span className="text-xs text-zinc-400 ml-2">
                                · Vaga em aberto
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onOpenAddForGroup(group.shift, group.id)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Escalar</span>
                          </button>
                        </div>
                      );
                    }

                    return groupEntries.map((entry, idx) => {
                      const waUrl = buildWhatsAppUrl(entry.phone, message);
                      const isSelected = Boolean(selectedIds[entry.id]);
                      const isFocused = previewEntry?.id === entry.id;
                      const isEditingName =
                        editingField?.id === entry.id &&
                        editingField.field === "name";
                      const isEditingPhone =
                        editingField?.id === entry.id &&
                        editingField.field === "phone";

                      return (
                        <div
                          key={entry.id}
                          onClick={() => setFocusedEntryId(entry.id)}
                          className={`px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isFocused
                              ? "bg-emerald-50/50"
                              : "hover:bg-[#FAF9F5]"
                          }`}
                        >
                          {/* Left: Checkbox + Group + Clean Click-to-Edit Name & Phone */}
                          <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => onToggleSelect(entry.id)}
                              aria-label={`Selecionar ${entry.volunteerName} (${group.label})`}
                              className="w-4 h-4 mt-1 sm:mt-0 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-700 shrink-0 cursor-pointer"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-xs font-medium text-zinc-500">
                                  {group.label}
                                </span>
                                {idx === 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenAddForGroup(group.shift, group.id);
                                    }}
                                    title={`Adicionar outro voluntário em ${group.label}`}
                                    className="p-0.5 text-zinc-400 hover:text-zinc-800 rounded hover:bg-zinc-200/60 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                )}
                                {entry.messageSent &&
                                  entry.status === "pendente" && (
                                    <span className="text-[11px] font-medium text-sky-700">
                                      · Enviada (aguardando resposta)
                                    </span>
                                  )}
                                {!entry.messageSent &&
                                  entry.status === "pendente" && (
                                    <span className="text-[11px] font-medium text-zinc-400">
                                      · Não enviada
                                    </span>
                                  )}
                                {entry.status === "confirmado" && (
                                  <span className="text-[11px] font-medium text-emerald-700">
                                    · {entry.messageSent ? "Enviada · " : ""}
                                    Confirmado
                                  </span>
                                )}
                                {entry.status === "recusado" && (
                                  <span className="text-[11px] font-medium text-red-700">
                                    · Não poderá servir
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                                {isEditingName ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    value={entry.volunteerName}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      onUpdateName(entry.id, e.target.value)
                                    }
                                    onBlur={() => {
                                      setEditingField(null);
                                      onCommitName?.(entry.id, entry.volunteerName);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        setEditingField(null);
                                        onCommitName?.(entry.id, entry.volunteerName);
                                      }
                                    }}
                                    className="px-2 py-0.5 text-sm font-semibold text-zinc-900 bg-white border border-emerald-700 rounded-md focus:outline-none"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFocusedEntryId(entry.id);
                                      setEditingField({
                                        id: entry.id,
                                        field: "name",
                                      });
                                    }}
                                    title="Clique para editar o nome"
                                    className="group inline-flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900 hover:text-emerald-800 text-left cursor-text"
                                  >
                                    <span>{entry.volunteerName}</span>
                                    <Pencil className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                                  </button>
                                )}

                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>

                                {isEditingPhone ? (
                                  <input
                                    type="tel"
                                    autoFocus
                                    value={entry.phone}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      onUpdatePhone(entry.id, e.target.value)
                                    }
                                    onBlur={() => {
                                      setEditingField(null);
                                      onCommitPhone?.(entry.id, entry.phone);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        setEditingField(null);
                                        onCommitPhone?.(entry.id, entry.phone);
                                      }
                                    }}
                                    placeholder="(11) 99999-9999"
                                    className="w-36 px-2 py-0.5 text-xs font-mono-tabular text-zinc-800 bg-white border border-emerald-700 rounded-md focus:outline-none"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFocusedEntryId(entry.id);
                                      setEditingField({
                                        id: entry.id,
                                        field: "phone",
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-mono-tabular text-zinc-500 hover:text-zinc-900 cursor-pointer"
                                  >
                                    <Phone className="w-3 h-3 text-zinc-400" />
                                    <span>
                                      {entry.phone.trim()
                                        ? formatPhoneDisplay(entry.phone)
                                        : "Adicionar WhatsApp"}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Confirmado + Recusado + Trocar + Prévia(mobile) + Copy + Send + Remove */}
                          <div
                            className="flex flex-wrap items-center justify-start sm:justify-end gap-1.5 shrink-0 pl-7 sm:pl-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateStatus(
                                  entry.id,
                                  entry.status === "confirmado"
                                    ? "pendente"
                                    : "confirmado"
                                )
                              }
                              title="Marcar como confirmado"
                              className={`h-10 sm:h-9 inline-flex items-center gap-1 px-2.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                                entry.status === "confirmado"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : "bg-white text-zinc-700 border-[#E8E6DF] hover:bg-emerald-50/60 hover:text-emerald-800 hover:border-emerald-200"
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirmado</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onUpdateStatus(
                                  entry.id,
                                  entry.status === "recusado"
                                    ? "pendente"
                                    : "recusado"
                                )
                              }
                              title="Recusado (não poderá servir)"
                              className={`h-10 sm:h-9 inline-flex items-center gap-1 px-2.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                                entry.status === "recusado"
                                  ? "bg-red-50 text-red-800 border-red-300"
                                  : "bg-white text-zinc-700 border-[#E8E6DF] hover:bg-red-50/70 hover:text-red-800 hover:border-red-200"
                              }`}
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Recusado</span>
                            </button>

                            {entry.status === "recusado" && (
                              <button
                                type="button"
                                onClick={() => setReplacingEntryId(entry.id)}
                                title="Trocar por outro voluntário"
                                className="h-10 sm:h-9 inline-flex items-center gap-1 px-2.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Trocar</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setMobilePreviewEntryId(entry.id)}
                              title="Ver prévia da mensagem"
                              className="lg:hidden h-10 w-10 inline-flex items-center justify-center text-zinc-600 border border-[#E8E6DF] bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyMessage(entry.id, message)}
                              title="Copiar mensagem"
                              className="h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center text-zinc-600 border border-[#E8E6DF] bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                            >
                              {copiedId === entry.id ? (
                                <Check className="w-4 h-4 text-emerald-700" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>

                            {canSendNow ? (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  setFocusedEntryId(entry.id);
                                  onMarkSent(entry.id);
                                }}
                                className="h-10 sm:h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 transition-colors"
                              >
                                <span>Enviar</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span
                                title={`Libera na quinta-feira (${windowInfo.unlockDateDDMM})`}
                                className="h-10 sm:h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium bg-zinc-100 text-zinc-400 rounded-lg whitespace-nowrap shrink-0 cursor-not-allowed"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                <span>Enviar</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => onDeleteEntry(entry.id)}
                              title="Remover da escala"
                              className="h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Editorial Command Header */}
      <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
              Escala de Domingo{" "}
              <span className="font-mono-tabular text-emerald-700">
                {dateDDMM}
              </span>
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              {windowInfo.isUnlocked ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Liberado desde quinta ({windowInfo.unlockDateDDMM})
                  </span>
                </span>
              ) : (
                <div className="inline-flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>Libera na quinta ({windowInfo.unlockDateDDMM})</span>
                  </span>
                  <button
                    type="button"
                    onClick={onToggleEarlyOverride}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      earlyOverride
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-[#F7F6F2] text-zinc-700 border-[#E8E6DF] hover:bg-[#EFECE4]"
                    }`}
                  >
                    <Unlock className="w-3 h-3" />
                    <span>
                      {earlyOverride
                        ? "Envio antecipado liberado"
                        : "Liberar envio antecipado"}
                    </span>
                  </button>
                </div>
              )}

              <span className="text-zinc-300" aria-hidden="true">
                ·
              </span>

              <span className="text-zinc-600">
                Saudação automática agora:{" "}
                <strong className="font-semibold text-zinc-900">
                  {currentGreeting}
                </strong>
              </span>
            </div>
          </div>

          {/* Clean Tabular KPI Strip with responsive mobile layout */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-y-3 sm:gap-y-0 sm:divide-x divide-[#EFECE4] border border-[#EFECE4] rounded-xl bg-[#FAF9F5] py-3 px-2 shrink-0">
            <div className="px-2 sm:px-3 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Escalados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-zinc-900 mt-0.5">
                {stats.total}
              </div>
            </div>
            <div className="px-2 sm:px-3 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Pendentes
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-amber-600 mt-0.5">
                {stats.pendentes}
              </div>
            </div>
            <div className="px-2 sm:px-3 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Enviados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-sky-600 mt-0.5">
                {stats.enviados}
              </div>
            </div>
            <div className="px-2 sm:px-3 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Confirmados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-emerald-700 mt-0.5">
                {stats.confirmados}
              </div>
            </div>
            <div className="px-2 sm:px-3 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Recusados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-red-600 mt-0.5">
                {stats.recusados}
              </div>
            </div>
          </div>
        </div>

        {/* Sunday Switcher Row */}
        <div className="mt-5 pt-4 border-t border-[#EFECE4] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 mr-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              Próximos domingos:
            </span>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg">
              {upcomingSundays.map((sunday) => (
                <button
                  key={sunday}
                  type="button"
                  onClick={() => onChangeSundayISO(sunday)}
                  className={`px-3 py-1 text-xs font-mono-tabular font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    sundayISO === sunday
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {formatDateDDMM(sunday)}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={sundayISO}
              onChange={(e) => {
                if (e.target.value) {
                  onChangeSundayISO(snapToSunday(e.target.value));
                }
              }}
              aria-label="Selecionar outro domingo"
              className="px-2.5 py-1.5 text-xs font-mono-tabular border border-[#E8E6DF] rounded-lg text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onSelectMany(
                  visibleEntries
                    .filter((e) => !e.messageSent)
                    .map((e) => e.id)
                )
              }
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg whitespace-nowrap transition-colors cursor-pointer"
            >
              Selecionar não enviados
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectMany(
                  visibleEntries
                    .filter((e) => e.status === "pendente")
                    .map((e) => e.id)
                )
              }
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg whitespace-nowrap transition-colors cursor-pointer"
            >
              Selecionar pendentes
            </button>
            <button
              type="button"
              onClick={() => onSelectMany(visibleEntries.map((e) => e.id))}
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg whitespace-nowrap transition-colors cursor-pointer"
            >
              Selecionar todos
            </button>
            {selectedVisibleCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={onOpenBatchModal}
                  disabled={!canSendNow}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                    canSendNow
                      ? "bg-emerald-700 text-white hover:bg-emerald-800"
                      : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="font-mono-tabular">
                    Disparar ({selectedVisibleCount})
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Filters + Schedule List */}
        <div className="lg:col-span-8 space-y-5">
          {/* Filter Bar */}
          <div className="bg-white border border-[#E8E6DF] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center p-1 bg-[#F4F2EC] rounded-lg">
                {(
                  [
                    { id: "noite", label: "Culto da Noite" },
                    { id: "manha", label: "Culto da Manhã" },
                    { id: "todos", label: "Todos" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setShiftFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                      shiftFilter === tab.id
                        ? "bg-white text-zinc-900 shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilterType)
                }
                aria-label="Filtrar por status"
                className="px-3 py-1.5 text-xs font-medium border border-[#E8E6DF] rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                <option value="todos">Todos os status</option>
                <option value="pendente">Pendentes (sem resposta)</option>
                <option value="enviado">Enviados</option>
                <option value="nao-enviado">Não enviados</option>
                <option value="confirmado">Confirmados</option>
                <option value="recusado">Recusados (não poderá servir)</option>
              </select>
            </div>

            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nome ou turma..."
                className="pl-8 pr-3 py-1.5 text-xs border border-[#E8E6DF] rounded-lg w-full sm:w-52 bg-[#FAF9F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          {dayEntries.length === 0 && sundayISO !== "2026-11-15" && (
            <div className="bg-white border border-[#E8E6DF] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-900">
                  Domingo {dateDDMM} ainda está sem voluntários
                </h3>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Escale abaixo, importe a coluna {dateDDMM} na aba{" "}
                  <span className="font-medium">Importar Imagem</span> ou copie a escala base de 15/11.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDuplicateFromDate("2026-11-15", sundayISO)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <CopyPlus className="w-4 h-4" />
                <span>Copiar escala base de 15/11</span>
              </button>
            </div>
          )}

          <div className="space-y-5">
            {(shiftFilter === "todos" || shiftFilter === "noite") &&
              renderShiftSection("noite", "Culto da Noite")}
            {(shiftFilter === "todos" || shiftFilter === "manha") &&
              renderShiftSection("manha", "Culto da Manhã")}
          </div>

          {/* Export Schedule Footer */}
          <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-zinc-900">
                Exportar escala de {dateDDMM}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Baixe a lista atualizada com funções, voluntários e status de confirmação.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  exportScheduleToExcel({
                    sundayISO,
                    shiftFilter,
                    entries: dayEntries,
                    groups: SCHEDULE_GROUPS,
                  })
                }
                className="h-10 inline-flex items-center gap-2 px-4 text-xs font-medium border border-[#E8E6DF] text-zinc-800 bg-white hover:bg-[#FAF9F5] rounded-lg whitespace-nowrap transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span>Exportar Excel</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportScheduleToPdf({
                    sundayISO,
                    shiftFilter,
                    entries: dayEntries,
                    groups: SCHEDULE_GROUPS,
                  })
                }
                className="h-10 inline-flex items-center gap-2 px-4 text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg whitespace-nowrap transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Exportar PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Sticky Live WhatsApp Preview (Desktop) */}
        <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 space-y-4">
          <div className="bg-white border border-[#E8E6DF] rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-semibold text-zinc-900">
                  Prévia da Mensagem
                </h2>
              </div>
              <span className="text-[11px] font-mono-tabular text-zinc-500">
                {dateDDMM} · {currentGreeting}
              </span>
            </div>

            <WhatsAppPreviewCard
              recipientTitle={
                previewEntry ? previewEntry.volunteerName : "Ministério Infantil"
              }
              recipientSubtitle={
                previewGroup
                  ? `${previewGroup.label} · Culto da ${previewGroup.shift === "manha" ? "manhã" : "noite"}`
                  : "Clique em qualquer voluntário para visualizar"
              }
              message={previewMessage}
            />

            {previewEntry && previewGroup && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyMessage(previewEntry.id, previewMessage)
                    }
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 px-3 text-xs font-medium border border-[#E8E6DF] text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedId === previewEntry.id ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-700" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar texto</span>
                      </>
                    )}
                  </button>

                  {canSendNow ? (
                    <a
                      href={buildWhatsAppUrl(
                        previewEntry.phone,
                        previewMessage
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        onMarkSent(previewEntry.id);
                      }}
                      className="flex-1 h-10 inline-flex items-center justify-center gap-2 px-3 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <span>Abrir WhatsApp</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium bg-zinc-100 text-zinc-400 rounded-lg cursor-not-allowed">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Quinta ({windowInfo.unlockDateDDMM})</span>
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  A saudação muda automaticamente pelo horário do envio: manhã (05h–12h), tarde (12h–18h) e noite (18h–05h).
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <ReplaceVolunteerModal
        entry={replacingEntry}
        group={replacingGroup}
        contactBook={contactBook}
        contactLinks={contactLinks}
        knownNames={knownNames}
        onClose={() => setReplacingEntryId(null)}
        onConfirmReplace={(entryId, newName, newPhone) => {
          onReplaceVolunteer(entryId, newName, newPhone);
          setFocusedEntryId(entryId);
        }}
      />

      {/* Mobile WhatsApp Preview Sheet (scrollable with pinned header/footer) */}
      {mobilePreviewEntry && mobilePreviewGroup && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-preview-title"
          onClick={() => setMobilePreviewEntryId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[90dvh] flex flex-col bg-white border-t border-[#E8E6DF] rounded-t-2xl shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-4 py-3.5 border-b border-[#EFECE4] flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <h2
                  id="mobile-preview-title"
                  className="font-display text-base font-semibold text-zinc-900 truncate"
                >
                  Prévia da Mensagem
                </h2>
                <p className="text-xs text-zinc-500 font-mono-tabular truncate">
                  {mobilePreviewEntry.volunteerName} · {dateDDMM}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobilePreviewEntryId(null)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-zinc-700 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg shrink-0 cursor-pointer"
                aria-label="Voltar para a escala"
              >
                <X className="w-4 h-4" />
                <span>Voltar</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
              <WhatsAppPreviewCard
                recipientTitle={mobilePreviewEntry.volunteerName}
                recipientSubtitle={`${mobilePreviewGroup.label} · Culto da ${mobilePreviewGroup.shift === "manha" ? "manhã" : "noite"}`}
                message={mobilePreviewMessage}
              />
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                A saudação muda automaticamente pelo horário do envio: manhã (05h–12h), tarde (12h–18h) e noite (18h–05h).
              </p>
            </div>

            <div className="shrink-0 px-4 py-3.5 border-t border-[#EFECE4] bg-[#FAF9F5] flex items-center gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() =>
                  handleCopyMessage(mobilePreviewEntry.id, mobilePreviewMessage)
                }
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-3 text-xs font-medium border border-[#E8E6DF] text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
              >
                {copiedId === mobilePreviewEntry.id ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-700" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar texto</span>
                  </>
                )}
              </button>

              {canSendNow ? (
                <a
                  href={buildWhatsAppUrl(
                    mobilePreviewEntry.phone,
                    mobilePreviewMessage
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    onMarkSent(mobilePreviewEntry.id);
                  }}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-3 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>Abrir WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium bg-zinc-100 text-zinc-400 rounded-lg cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Quinta ({windowInfo.unlockDateDDMM})</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
