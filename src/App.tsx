import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Header } from "./components/Header";
import { ScheduleWorkspace } from "./components/ScheduleWorkspace";
import { TemplatesView } from "./components/TemplatesView";
import { ImageImporterView } from "./components/ImageImporterView";
import { BatchQueueModal } from "./components/BatchQueueModal";
import { QuickAddModal } from "./components/QuickAddModal";
import { CloudSyncModal } from "./components/CloudSyncModal";
import {
  DEFAULT_TEMPLATES,
  EXTRA_IMAGE_ENTRIES_15_11,
  INITIAL_ENTRIES,
  INITIAL_SCHEDULE_DATE,
  SCHEDULE_GROUPS,
} from "./data/initialData";
import type {
  AppView,
  GroupDefinition,
  MessageTemplatesState,
  ScheduleEntry,
  ShiftType,
  VolunteerStatus,
} from "./types/schedule";
import { getConfirmationWindowInfo } from "./utils/dateAndMessage";

const STORAGE_ENTRIES_KEY = "escala-kids:entries:v1";
const STORAGE_MIGRATION_V2_KEY = "escala-kids:migrated-extra-roles:v2";
const STORAGE_TEMPLATES_KEY = "escala-kids:templates:v1";
const STORAGE_CONTACTS_KEY = "escala-kids:contacts:v1";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type RawStoredEntry = Omit<ScheduleEntry, "messageSent" | "status"> & {
  status?: VolunteerStatus | "enviado";
  messageSent?: boolean;
};

function normalizeEntry(raw: RawStoredEntry): ScheduleEntry {
  const legacyStatus = raw.status;
  const messageSent =
    typeof raw.messageSent === "boolean"
      ? raw.messageSent
      : legacyStatus === "enviado" ||
        legacyStatus === "confirmado" ||
        legacyStatus === "recusado";
  const normalizedStatus: VolunteerStatus =
    legacyStatus === "confirmado" || legacyStatus === "recusado"
      ? legacyStatus
      : "pendente";

  return {
    id: raw.id,
    date: raw.date,
    shift: raw.shift,
    groupId: raw.groupId,
    volunteerName: raw.volunteerName,
    phone: raw.phone || "",
    status: normalizedStatus,
    messageSent,
  };
}

function loadEntries(): ScheduleEntry[] {
  const existing = loadJson<RawStoredEntry[]>(
    STORAGE_ENTRIES_KEY,
    INITIAL_ENTRIES
  ).map(normalizeEntry);

  try {
    const alreadyMigrated = localStorage.getItem(STORAGE_MIGRATION_V2_KEY);
    if (!alreadyMigrated) {
      localStorage.setItem(STORAGE_MIGRATION_V2_KEY, "1");
      const existingIds = new Set(existing.map((e) => e.id));
      const missingExtras = EXTRA_IMAGE_ENTRIES_15_11.filter(
        (item) => !existingIds.has(item.id)
      );
      if (missingExtras.length > 0) {
        return [...existing, ...missingExtras];
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return existing;
}

function upgradeTemplateGreeting(text: string): string {
  return text.replace(/^(Bom dia!|Boa tarde!|Boa noite!)/i, "{saudacao}");
}

function loadTemplates(): MessageTemplatesState {
  const loaded = loadJson<MessageTemplatesState>(
    STORAGE_TEMPLATES_KEY,
    DEFAULT_TEMPLATES
  );
  return {
    defaultNoite: upgradeTemplateGreeting(loaded.defaultNoite),
    defaultManha: upgradeTemplateGreeting(loaded.defaultManha),
    groupOverrides: Object.fromEntries(
      Object.entries(loaded.groupOverrides || {}).map(([k, v]) => [
        k,
        upgradeTemplateGreeting(v),
      ])
    ),
  };
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("escala");
  const [sundayISO, setSundayISO] = useState<string>(INITIAL_SCHEDULE_DATE);

  const [entries, setEntries] = useState<ScheduleEntry[]>(loadEntries);
  const [templates, setTemplates] =
    useState<MessageTemplatesState>(loadTemplates);
  const [contactBook, setContactBook] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(STORAGE_CONTACTS_KEY, {})
  );

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [earlyOverrideByDate, setEarlyOverrideByDate] = useState<
    Record<string, boolean>
  >({});

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [quickAddState, setQuickAddState] = useState<{
    isOpen: boolean;
    shift: ShiftType;
    groupId?: string;
  }>({ isOpen: false, shift: "noite" });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsSchemaSetup, setNeedsSchemaSetup] = useState(false);

  const skipNextCloudPushRef = useRef(false);
  const hasHydratedCloudRef = useRef(false);
  const entriesRef = useRef(entries);
  const templatesRef = useRef(templates);
  const contactBookRef = useRef(contactBook);
  entriesRef.current = entries;
  templatesRef.current = templates;
  contactBookRef.current = contactBook;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ENTRIES_KEY, JSON.stringify(entries));
    } catch {
      // Ignore storage quota errors
    }
  }, [entries]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(templates));
    } catch {
      // Ignore storage quota errors
    }
  }, [templates]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONTACTS_KEY, JSON.stringify(contactBook));
    } catch {
      // Ignore storage quota errors
    }
  }, [contactBook]);

  const pushStateToCloud = useCallback(
    async (payload: {
      entries: ScheduleEntry[];
      contactBook: Record<string, string>;
      templates: MessageTemplatesState;
    }) => {
      const res = await fetch("/api/cloud/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsSchemaSetup) setNeedsSchemaSetup(true);
        throw new Error(data.error || "Erro ao salvar na nuvem.");
      }
      setNeedsSchemaSetup(false);
      setSyncError(null);
    },
    []
  );

  const pullStateFromCloud = useCallback(
    async (seedIfEmpty: boolean) => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch("/api/cloud/state");
        const data = await res.json();
        setSupabaseConfigured(Boolean(data.configured));

        if (!data.configured) {
          return;
        }

        if (!res.ok) {
          if (data.needsSchemaSetup) setNeedsSchemaSetup(true);
          throw new Error(data.error || "Erro ao carregar dados da nuvem.");
        }
        setNeedsSchemaSetup(false);

        const cloudEntries = Array.isArray(data.entries)
          ? (data.entries as RawStoredEntry[]).map(normalizeEntry)
          : [];
        const cloudContacts =
          data.contactBook && typeof data.contactBook === "object"
            ? (data.contactBook as Record<string, string>)
            : {};
        const cloudTemplates = data.templates as MessageTemplatesState | null;

        if (cloudEntries.length === 0 && !cloudTemplates && seedIfEmpty) {
          await pushStateToCloud({
            entries: entriesRef.current,
            contactBook: contactBookRef.current,
            templates: templatesRef.current,
          });
          hasHydratedCloudRef.current = true;
          return;
        }

        skipNextCloudPushRef.current = true;
        hasHydratedCloudRef.current = true;
        setEntries(cloudEntries);
        setContactBook((prev) => ({ ...prev, ...cloudContacts }));
        if (cloudTemplates) {
          setTemplates({
            defaultNoite: upgradeTemplateGreeting(cloudTemplates.defaultNoite),
            defaultManha: upgradeTemplateGreeting(cloudTemplates.defaultManha),
            groupOverrides: Object.fromEntries(
              Object.entries(cloudTemplates.groupOverrides || {}).map(
                ([k, v]) => [k, upgradeTemplateGreeting(v)]
              )
            ),
          });
        }
      } catch (err) {
        setSyncError(
          err instanceof Error
            ? err.message
            : "Erro ao sincronizar com o Supabase."
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [pushStateToCloud]
  );

  // Pull shared cloud data automatically on initial load (no login needed)
  useEffect(() => {
    void pullStateFromCloud(true);
  }, [pullStateFromCloud]);

  // Debounced auto-push whenever local state changes while Supabase is active
  useEffect(() => {
    if (!supabaseConfigured || !hasHydratedCloudRef.current) {
      return;
    }
    if (skipNextCloudPushRef.current) {
      skipNextCloudPushRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void pushStateToCloud({
        entries,
        contactBook,
        templates,
      }).catch((err) => {
        setSyncError(
          err instanceof Error
            ? err.message
            : "Erro ao salvar alterações na nuvem."
        );
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    entries,
    contactBook,
    templates,
    supabaseConfigured,
    pushStateToCloud,
  ]);

  // Refresh from cloud when returning to the app on another device/tab
  useEffect(() => {
    if (!supabaseConfigured) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pullStateFromCloud(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [supabaseConfigured, pullStateFromCloud]);

  const groupsById: Record<string, GroupDefinition> = useMemo(
    () => Object.fromEntries(SCHEDULE_GROUPS.map((g) => [g.id, g])),
    []
  );

  const windowInfo = useMemo(
    () => getConfirmationWindowInfo(sundayISO),
    [sundayISO]
  );
  const earlyOverride = Boolean(earlyOverrideByDate[sundayISO]);
  const canDispatch = windowInfo.isUnlocked || earlyOverride;

  const selectedEntriesForSunday = useMemo(
    () =>
      entries.filter((e) => e.date === sundayISO && Boolean(selectedIds[e.id])),
    [entries, sundayISO, selectedIds]
  );

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectMany = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds({});
  };

  const handleUpdateStatus = (id: string, status: VolunteerStatus) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status } : e))
    );
  };

  const handleMarkSent = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, messageSent: true } : e))
    );
  };

  const handleUpdatePhone = (id: string, phone: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const nameKey = e.volunteerName.trim().toLowerCase();
        if (nameKey && phone.trim()) {
          setContactBook((book) => ({ ...book, [nameKey]: phone.trim() }));
        }
        return { ...e, phone };
      })
    );
  };

  const handleUpdateName = (id: string, volunteerName: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const matchedPhone = contactBook[volunteerName.trim().toLowerCase()];
        return {
          ...e,
          volunteerName,
          phone: e.phone || matchedPhone || "",
        };
      })
    );
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAddEntry = (newEntry: {
    date: string;
    shift: ShiftType;
    groupId: string;
    volunteerName: string;
    phone: string;
  }) => {
    const id = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nameKey = newEntry.volunteerName.trim().toLowerCase();
    const resolvedPhone =
      newEntry.phone.trim() || contactBook[nameKey] || "";

    if (nameKey && resolvedPhone) {
      setContactBook((book) => ({ ...book, [nameKey]: resolvedPhone }));
    }

    setEntries((prev) => [
      ...prev,
      {
        id,
        date: newEntry.date,
        shift: newEntry.shift,
        groupId: newEntry.groupId,
        volunteerName: newEntry.volunteerName,
        phone: resolvedPhone,
        status: "pendente",
        messageSent: false,
      },
    ]);
  };

  const handleDuplicateFromDate = (sourceISO: string, targetISO: string) => {
    const sourceEntries = entries.filter((e) => e.date === sourceISO);
    const cloned: ScheduleEntry[] = sourceEntries.map((e, idx) => ({
      ...e,
      id: `clone-${Date.now()}-${idx}`,
      date: targetISO,
      status: "pendente",
      messageSent: false,
    }));
    setEntries((prev) => [...prev, ...cloned]);
  };

  const handleApplyImportedEntries = (params: {
    sundayISO: string;
    shift: ShiftType;
    assignments: { groupId: string; volunteerName: string }[];
    replaceExistingForShiftDate: boolean;
  }) => {
    const newItems: ScheduleEntry[] = params.assignments.map((item, idx) => {
      const nameKey = item.volunteerName.trim().toLowerCase();
      return {
        id: `imp-${Date.now()}-${idx}`,
        date: params.sundayISO,
        shift: params.shift,
        groupId: item.groupId,
        volunteerName: item.volunteerName.trim(),
        phone: contactBook[nameKey] || "",
        status: "pendente",
        messageSent: false,
      };
    });

    setEntries((prev) => {
      const filtered = params.replaceExistingForShiftDate
        ? prev.filter(
            (e) => !(e.date === params.sundayISO && e.shift === params.shift)
          )
        : prev;
      return [...filtered, ...newItems];
    });
    setSelectedIds({});
    setSundayISO(params.sundayISO);
    setActiveView("escala");
  };

  const handleReplaceVolunteer = (
    entryId: string,
    newName: string,
    newPhone: string
  ) => {
    const cleanName = newName.trim();
    const nameKey = cleanName.toLowerCase();
    const resolvedPhone = newPhone.trim() || contactBook[nameKey] || "";

    if (nameKey && resolvedPhone) {
      setContactBook((book) => ({ ...book, [nameKey]: resolvedPhone }));
    }

    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? {
              ...e,
              volunteerName: cleanName,
              phone: resolvedPhone,
              status: "pendente",
              messageSent: false,
            }
          : e
      )
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-zinc-900 overflow-x-hidden">
      <Header
        activeView={activeView}
        onChangeView={setActiveView}
        selectedCount={selectedEntriesForSunday.length}
        canDispatch={canDispatch}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        onOpenQuickAdd={() =>
          setQuickAddState({ isOpen: true, shift: "noite" })
        }
        onOpenSyncModal={() => {
          setIsSyncModalOpen(true);
          if (supabaseConfigured) {
            void pullStateFromCloud(false);
          }
        }}
      />

      <main className="flex-1 pb-20 md:pb-6">
        {activeView === "escala" && (
          <ScheduleWorkspace
            sundayISO={sundayISO}
            onChangeSundayISO={(iso) => {
              setSundayISO(iso);
              setSelectedIds({});
            }}
            entries={entries}
            templates={templates}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectMany={handleSelectMany}
            onClearSelection={handleClearSelection}
            onUpdateStatus={handleUpdateStatus}
            onMarkSent={handleMarkSent}
            onUpdatePhone={handleUpdatePhone}
            onUpdateName={handleUpdateName}
            onDeleteEntry={handleDeleteEntry}
            onOpenAddForGroup={(shift, groupId) =>
              setQuickAddState({ isOpen: true, shift, groupId })
            }
            onOpenBatchModal={() => setIsBatchModalOpen(true)}
            onDuplicateFromDate={handleDuplicateFromDate}
            earlyOverride={earlyOverride}
            onToggleEarlyOverride={() =>
              setEarlyOverrideByDate((prev) => ({
                ...prev,
                [sundayISO]: !prev[sundayISO],
              }))
            }
            contactBook={contactBook}
            onReplaceVolunteer={handleReplaceVolunteer}
          />
        )}

        {activeView === "modelos" && (
          <TemplatesView
            templates={templates}
            onUpdateTemplates={setTemplates}
            activeSundayISO={sundayISO}
          />
        )}

        {activeView === "importar" && (
          <ImageImporterView
            activeSundayISO={sundayISO}
            onApplyImportedEntries={handleApplyImportedEntries}
          />
        )}
      </main>

      <BatchQueueModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        entries={selectedEntriesForSunday}
        groupsById={groupsById}
        templates={templates}
        sundayISO={sundayISO}
        onMarkSent={handleMarkSent}
        onUpdatePhone={handleUpdatePhone}
      />

      <QuickAddModal
        isOpen={quickAddState.isOpen}
        onClose={() => setQuickAddState((prev) => ({ ...prev, isOpen: false }))}
        sundayISO={sundayISO}
        initialShift={quickAddState.shift}
        initialGroupId={quickAddState.groupId}
        contactBook={contactBook}
        onAddEntry={handleAddEntry}
      />

      <CloudSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        supabaseConfigured={supabaseConfigured}
        isSyncing={isSyncing}
        syncError={syncError}
        needsSchemaSetup={needsSchemaSetup}
        onRefreshFromCloud={() => pullStateFromCloud(false)}
      />
    </div>
  );
}
