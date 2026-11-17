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
  FlaskConical,
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
  getPrayerTimeForShift,
  getTemplateForGroup,
  getUpcomingSundays,
  isFirstSundayOfMonth,
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
  onOpenTestSend: () => void;
}

const CATEGORY_LABELS: Record<GroupCategory, string> = {
  louvor: "Louvor",
  professor: "Professores",
  auxiliar: "Auxiliares",
  servicos: "Refeitório & Pipoca",
  apoio: "Mídia & Segurança",
  lideranca: "Pastor(a) & Coordenador(a)",
};

const CATEGORY_ORDER: GroupCategory[] = [
  "louvor",
  "professor",
  "auxiliar",
  "servicos",
  "apoio",
  "lideranca",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

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
  onOpenTestSend,
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

  const todayBucketKey = `${nowTick.getFullYear()}-${nowTick.getMonth()}-${nowTick.getDate()}`;
  const upcomingSundays = useMemo(
    () => getUpcomingSundays(undefined, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayBucketKey]
  );

  const latestPopulatedSourceISO = useMemo(() => {
    const datesWithEntries = Array.from(
      new Set(entries.map((e) => e.date).filter((d) => d && d !== sundayISO))
    ).sort();
    return datesWithEntries.length > 0
      ? datesWithEntries[datesWithEntries.length - 1]
      : null;
  }, [entries, sundayISO]);

  const windowInfo = useMemo(
    () => getConfirmationWindowInfo(sundayISO, nowTick),
    [sundayISO, nowTick]
  );

  const canSendNow = windowInfo.isUnlocked || earlyOverride;
  const dateDDMM = formatDateDDMM(sundayISO);
  const currentGreeting = getGreetingByTime(nowTick);
  const santaCeiaSunday = isFirstSundayOfMonth(sundayISO);

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
  const allVisibleSelected =
    visibleEntries.length > 0 && selectedVisibleCount === visibleEntries.length;

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

    const shiftEntries = dayEntries.filter((e) => e.shift === shift);
    const shiftCount = shiftEntries.length;
    const shiftConfirmed = shiftEntries.filter(
      (e) => e.status === "confirmado"
    ).length;
    const prayerTime = getPrayerTimeForShift(shift);

    const visibleCategoryCards = CATEGORY_ORDER.map((category) => {
      const catGroups = shiftGroups.filter((g) => g.category === category);
      if (catGroups.length === 0) return null;

      const hasFilterActive = Boolean(searchQuery.trim() || statusFilter !== "todos");
      const hasAnyEntries = catGroups.some(
        (g) => (entriesByGroupId[g.id] || []).length > 0
      );
      if (hasFilterActive && !hasAnyEntries) return null;

      const catGroupIds = new Set(catGroups.map((g) => g.id));
      const catEntriesAll = shiftEntries.filter((e) =>
        catGroupIds.has(e.groupId)
      );
      const catConfirmed = catEntriesAll.filter(
        (e) => e.status === "confirmado"
      ).length;

      return (
        <div
          key={category}
          className="bg-white border border-[#E5E3DB] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.025)] overflow-hidden"
        >
          {/* Category Card Header */}
          <div className="px-5 py-3 bg-[#FAF9F5] border-b border-[#E8E6DF] flex items-center justify-between gap-3">
            <h3 className="font-display text-[13px] font-bold tracking-tight text-zinc-900">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="text-xs font-mono-tabular text-zinc-500 whitespace-nowrap">
              {catEntriesAll.length > 0 ? (
                <>
                  <span>
                    {catEntriesAll.length}{" "}
                    {catEntriesAll.length === 1 ? "escalado" : "escalados"}
                  </span>
                  {catConfirmed > 0 && (
                    <>
                      <span className="mx-1.5 text-zinc-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-emerald-700 font-medium">
                        {catConfirmed} confirmado{catConfirmed === 1 ? "" : "s"}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span>{catGroups.length} funções</span>
              )}
            </div>
          </div>

          {/* Groups / Turmas inside Category */}
          <div className="divide-y divide-[#E8E6DF]">
            {catGroups.map((group) => {
              const groupEntries = entriesByGroupId[group.id] || [];
              if (groupEntries.length === 0 && hasFilterActive) {
                return null;
              }

              const template = getTemplateForGroup(templates, group);
              const message = renderScheduleMessage(template, {
                sundayISO,
                shift: group.shift,
                groupLabel: group.label,
              });

              return (
                <div key={group.id}>
                  {/* Group / Turma Header Bar */}
                  <div className="px-5 py-2 bg-[#FCFBF8] border-b border-[#F2F0E9] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-zinc-700 truncate">
                        {group.label}
                      </span>
                      <span className="text-zinc-300 text-xs" aria-hidden="true">
                        ·
                      </span>
                      {groupEntries.length === 0 ? (
                        <span className="text-xs text-zinc-400 whitespace-nowrap">
                          Vaga em aberto
                        </span>
                      ) : (
                        <span className="text-xs font-mono-tabular text-zinc-500 whitespace-nowrap">
                          {groupEntries.length}{" "}
                          {groupEntries.length === 1 ? "pessoa" : "pessoas"}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenAddForGroup(group.shift, group.id)}
                      title={`Adicionar voluntário em ${group.label}`}
                      aria-label={`Adicionar voluntário em ${group.label}`}
                      className="h-7 inline-flex items-center gap-1 px-2.5 text-[11px] font-medium text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200/90 rounded-md whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{groupEntries.length === 0 ? "Escalar" : "Adicionar"}</span>
                    </button>
                  </div>

                  {/* Volunteer Rows for this Group */}
                  {groupEntries.length > 0 && (
                    <div className="divide-y divide-[#F3F1EA]">
                      {groupEntries.map((entry) => {
                        const waUrl = buildWhatsAppUrl(entry.phone, message);
                        const isSelected = Boolean(selectedIds[entry.id]);
                        const isFocused = previewEntry?.id === entry.id;
                        const isEditingName =
                          editingField?.id === entry.id &&
                          editingField.field === "name";
                        const isEditingPhone =
                          editingField?.id === entry.id &&
                          editingField.field === "phone";
                        const hasPhone = entry.phone.trim().length > 0;

                        const avatarClass =
                          entry.status === "confirmado"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : entry.status === "recusado"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-[#F4F2EC] text-zinc-700 border-[#E5E3DB]";

                        return (
                          <div
                            key={entry.id}
                            onClick={() => setFocusedEntryId(entry.id)}
                            className={`px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors duration-150 cursor-pointer ${
                              isFocused
                                ? "bg-emerald-50/45"
                                : "hover:bg-[#FAF9F5]"
                            }`}
                          >
                            {/* Left: Checkbox + Monogram + Standardized 2-line Identity & Contact */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => onToggleSelect(entry.id)}
                                aria-label={`Selecionar ${entry.volunteerName} (${group.label})`}
                                className="w-4 h-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-700 shrink-0 cursor-pointer"
                              />

                              <div
                                className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-semibold tracking-tight shrink-0 ${avatarClass}`}
                                aria-hidden="true"
                              >
                                {getInitials(entry.volunteerName)}
                              </div>

                              {/* Standardized 2-line block: Line 1 ALWAYS Name + Edit; Line 2 ALWAYS Contact + Status */}
                              <div className="min-w-0 flex-1">
                                {/* Line 1: Name + Edit */}
                                <div className="flex items-center gap-2 min-w-0">
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
                                      className="w-full max-w-[240px] px-2 py-0.5 text-sm font-semibold text-zinc-900 bg-white border border-emerald-700 rounded-md focus:outline-none"
                                    />
                                  ) : (
                                    <>
                                      <span className="text-[14.5px] font-semibold text-zinc-950 truncate">
                                        {entry.volunteerName}
                                      </span>
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
                                        title="Editar nome do voluntário"
                                        aria-label={`Editar nome de ${entry.volunteerName}`}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:text-emerald-800 bg-[#F4F2EC] hover:bg-emerald-50 border border-[#E5E3DB] hover:border-emerald-200 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>Editar</span>
                                      </button>
                                    </>
                                  )}
                                </div>

                                {/* Line 2: Standardized WhatsApp Contact + Delivery/Confirmation Status */}
                                <div className="flex items-center gap-2 mt-0.5 min-w-0 text-xs">
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
                                      placeholder="(47) 99999-9999"
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
                                      title="Clique para editar o WhatsApp"
                                      className={`inline-flex items-center gap-1.5 font-mono-tabular whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                                        hasPhone
                                          ? "text-zinc-600 hover:text-zinc-950"
                                          : "text-amber-700 hover:text-amber-900 font-medium"
                                      }`}
                                    >
                                      <Phone
                                        className={`w-3 h-3 shrink-0 ${
                                          hasPhone ? "text-zinc-400" : "text-amber-600"
                                        }`}
                                      />
                                      <span>
                                        {hasPhone
                                          ? formatPhoneDisplay(entry.phone)
                                          : "Adicionar WhatsApp"}
                                      </span>
                                    </button>
                                  )}

                                  <span
                                    className="text-zinc-300 shrink-0"
                                    aria-hidden="true"
                                  >
                                    ·
                                  </span>

                                  {entry.status === "confirmado" ? (
                                    <span className="text-[11.5px] font-medium text-emerald-700 truncate">
                                      Confirmado
                                    </span>
                                  ) : entry.status === "recusado" ? (
                                    <span className="text-[11.5px] font-medium text-red-700 truncate">
                                      Não poderá servir
                                    </span>
                                  ) : entry.messageSent ? (
                                    <span className="text-[11.5px] font-medium text-sky-700 truncate">
                                      Enviada · aguardando
                                    </span>
                                  ) : (
                                    <span className="text-[11.5px] text-zinc-400 truncate">
                                      Não enviada
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Segmented Confirm/Decline + Trocar + Prévia(mobile) + Copy + Send + Remove */}
                            <div
                              className="flex flex-wrap sm:flex-nowrap items-center justify-start md:justify-end gap-1.5 shrink-0 pl-7 md:pl-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center rounded-lg border border-[#E5E3DB] bg-white overflow-hidden divide-x divide-[#E5E3DB]">
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
                                  className={`h-9 sm:h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                    entry.status === "confirmado"
                                      ? "bg-emerald-50 text-emerald-800 font-semibold"
                                      : "text-zinc-700 hover:bg-emerald-50/60 hover:text-emerald-800"
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
                                  className={`h-9 sm:h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                    entry.status === "recusado"
                                      ? "bg-red-50 text-red-800 font-semibold"
                                      : "text-zinc-700 hover:bg-red-50/70 hover:text-red-800"
                                  }`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Recusado</span>
                                </button>
                              </div>

                              {entry.status === "recusado" && (
                                <button
                                  type="button"
                                  onClick={() => setReplacingEntryId(entry.id)}
                                  title="Trocar por outro voluntário"
                                  className="h-9 sm:h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Trocar</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setMobilePreviewEntryId(entry.id)}
                                title="Ver prévia da mensagem"
                                className="lg:hidden h-9 w-9 inline-flex items-center justify-center text-zinc-600 border border-[#E5E3DB] bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyMessage(entry.id, message)}
                                title="Copiar mensagem"
                                className="h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center text-zinc-600 border border-[#E5E3DB] bg-white hover:bg-[#FAF9F5] rounded-lg transition-colors cursor-pointer"
                              >
                                {copiedId === entry.id ? (
                                  <Check className="w-4 h-4 text-emerald-700" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
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
                                  className="h-9 sm:h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 transition-colors shadow-xs"
                                >
                                  <span>Enviar</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : (
                                <span
                                  title={`Libera na quinta-feira (${windowInfo.unlockDateDDMM})`}
                                  className="h-9 sm:h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium bg-zinc-100 text-zinc-400 rounded-lg whitespace-nowrap shrink-0 cursor-not-allowed"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Enviar</span>
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => onDeleteEntry(entry.id)}
                                title="Remover da escala"
                                className="h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }).filter(Boolean);

    return (
      <section key={shift} className="space-y-4">
        {/* Editorial Shift Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="font-display text-lg font-bold tracking-tight text-zinc-950">
              {title}
            </h2>
            <span className="text-xs font-mono-tabular text-zinc-500">
              {shiftCount} {shiftCount === 1 ? "voluntário" : "voluntários"}
            </span>
            {shiftConfirmed > 0 && (
              <>
                <span className="text-zinc-300 text-xs" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs font-mono-tabular font-medium text-emerald-700">
                  {shiftConfirmed} confirmado{shiftConfirmed === 1 ? "" : "s"}
                </span>
              </>
            )}
            <span className="text-zinc-300 text-xs" aria-hidden="true">
              ·
            </span>
            <span className="text-xs text-zinc-500">
              Oração às <span className="font-mono-tabular font-medium text-zinc-700">{prayerTime}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenAddForGroup(shift, shiftGroups[0]?.id || "")}
            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-emerald-800 bg-white hover:bg-emerald-50 border border-[#E5E3DB] hover:border-emerald-200 rounded-lg whitespace-nowrap transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar neste culto</span>
          </button>
        </div>

        {/* Distinct Category Cards */}
        {visibleCategoryCards.length > 0 ? (
          <div className="space-y-4">{visibleCategoryCards}</div>
        ) : (
          <div className="bg-white border border-[#E5E3DB] rounded-2xl p-8 text-center text-sm text-zinc-500">
            Nenhum voluntário encontrado neste culto com os filtros atuais.
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Editorial Command Header */}
      <div className="bg-white border border-[#E5E3DB] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            {santaCeiaSunday && (
              <div className="text-xs font-semibold text-amber-800 mb-1">
                Culto de Santa Ceia · 1º domingo do mês
              </div>
            )}
            <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-zinc-950">
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
                        : "bg-[#F5F4EF] text-zinc-700 border-[#E5E3DB] hover:bg-[#ECEAE2]"
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

              <button
                type="button"
                onClick={onOpenTestSend}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-md border border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <FlaskConical className="w-3 h-3 text-amber-700" />
                <span>Envio teste (qualquer dia)</span>
              </button>

              <span className="text-zinc-300" aria-hidden="true">
                ·
              </span>

              <span className="text-zinc-600">
                Saudação atual:{" "}
                <strong className="font-semibold text-zinc-900">
                  {currentGreeting}
                </strong>
              </span>
            </div>
          </div>

          {/* Tabular KPI Strip */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-y-3 sm:gap-y-0 sm:divide-x divide-[#ECEAE2] border border-[#ECEAE2] rounded-xl bg-[#FAF9F5] py-3 px-2 shrink-0">
            <div className="px-2 sm:px-3.5 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Escalados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-zinc-950 mt-0.5">
                {stats.total}
              </div>
            </div>
            <div className="px-2 sm:px-3.5 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Pendentes
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-amber-600 mt-0.5">
                {stats.pendentes}
              </div>
            </div>
            <div className="px-2 sm:px-3.5 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Enviados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-sky-600 mt-0.5">
                {stats.enviados}
              </div>
            </div>
            <div className="px-2 sm:px-3.5 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Confirmados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-emerald-700 mt-0.5">
                {stats.confirmados}
              </div>
            </div>
            <div className="px-2 sm:px-3.5 text-center">
              <div className="text-[11px] font-medium text-zinc-500">
                Recusados
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono-tabular text-red-600 mt-0.5">
                {stats.recusados}
              </div>
            </div>
          </div>
        </div>

        {/* Sunday Switcher & Bulk Selection Bar */}
        <div className="mt-5 pt-4 border-t border-[#ECEAE2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 mr-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              Próximos domingos:
            </span>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg">
              {upcomingSundays.map((sunday) => {
                const firstSunday = isFirstSundayOfMonth(sunday);
                return (
                  <button
                    key={sunday}
                    type="button"
                    onClick={() => onChangeSundayISO(sunday)}
                    title={
                      firstSunday
                        ? "1º domingo do mês (Culto de Santa Ceia)"
                        : undefined
                    }
                    className={`px-3 py-1 text-xs font-mono-tabular font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                      sundayISO === sunday
                        ? "bg-white text-zinc-950 shadow-xs"
                        : "text-zinc-600 hover:text-zinc-950"
                    }`}
                  >
                    {formatDateDDMM(sunday)}
                    {firstSunday ? " · Ceia" : ""}
                  </button>
                );
              })}
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
              className="px-2.5 py-1.5 text-xs font-mono-tabular border border-[#E5E3DB] rounded-lg text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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
              aria-pressed={allVisibleSelected}
              title={
                allVisibleSelected
                  ? "Clique novamente para tirar a seleção de todos"
                  : "Selecionar todos os voluntários visíveis"
              }
              onClick={() => {
                if (allVisibleSelected) {
                  onClearSelection();
                } else {
                  onSelectMany(visibleEntries.map((e) => e.id));
                }
              }}
              disabled={visibleEntries.length === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                allVisibleSelected
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                  : "text-zinc-700 bg-[#F4F2EC] hover:bg-[#EAE6DC]"
              }`}
            >
              {allVisibleSelected && <Check className="w-3.5 h-3.5" />}
              <span>Selecionar todos</span>
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
                      ? "bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs"
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
        {/* Left 8 Columns: Filters + Divided Category Cards */}
        <div className="lg:col-span-8 space-y-6">
          {/* Filter Bar */}
          <div className="bg-white border border-[#E5E3DB] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
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
                        ? "bg-white text-zinc-950 shadow-xs"
                        : "text-zinc-600 hover:text-zinc-950"
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
                className="px-3 py-1.5 text-xs font-medium border border-[#E5E3DB] rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                className="pl-8 pr-3 py-1.5 text-xs border border-[#E5E3DB] rounded-lg w-full sm:w-52 bg-[#FAF9F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          {dayEntries.length === 0 && latestPopulatedSourceISO && (
            <div className="bg-white border border-[#E5E3DB] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  Domingo {dateDDMM} ainda está sem voluntários
                </h3>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Escale abaixo, importe a coluna {dateDDMM} na aba{" "}
                  <span className="font-medium">Importar Imagem</span> ou copie a última escala cadastrada.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onDuplicateFromDate(latestPopulatedSourceISO, sundayISO)
                }
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <CopyPlus className="w-4 h-4" />
                <span>Copiar última escala</span>
              </button>
            </div>
          )}

          <div className="space-y-8">
            {(shiftFilter === "todos" || shiftFilter === "noite") &&
              renderShiftSection("noite", "Culto da Noite")}
            {(shiftFilter === "todos" || shiftFilter === "manha") &&
              renderShiftSection("manha", "Culto da Manhã")}
          </div>

          {/* Export Schedule Footer */}
          <div className="bg-white border border-[#E5E3DB] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-zinc-950">
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
                className="h-10 inline-flex items-center gap-2 px-4 text-xs font-medium border border-[#E5E3DB] text-zinc-800 bg-white hover:bg-[#FAF9F5] rounded-lg whitespace-nowrap transition-colors cursor-pointer"
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
          <div className="bg-white border border-[#E5E3DB] rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-semibold text-zinc-950">
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
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 px-3 text-xs font-medium border border-[#E5E3DB] text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
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
            className="w-full max-h-[90dvh] flex flex-col bg-white border-t border-[#E5E3DB] rounded-t-2xl shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-4 py-3.5 border-b border-[#ECEAE2] flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <h2
                  id="mobile-preview-title"
                  className="font-display text-base font-semibold text-zinc-950 truncate"
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

            <div className="shrink-0 px-4 py-3.5 border-t border-[#ECEAE2] bg-[#FAF9F5] flex items-center gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() =>
                  handleCopyMessage(mobilePreviewEntry.id, mobilePreviewMessage)
                }
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-3 text-xs font-medium border border-[#E5E3DB] text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
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
