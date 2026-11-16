import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Header } from "./components/Header";
import { ScheduleWorkspace } from "./components/ScheduleWorkspace";
import { TemplatesView } from "./components/TemplatesView";
import { ImageImporterView } from "./components/ImageImporterView";
import { BatchQueueModal } from "./components/BatchQueueModal";
import { QuickAddModal } from "./components/QuickAddModal";
import { CloudSyncModal } from "./components/CloudSyncModal";
import { ContactMatchModal } from "./components/ContactMatchModal";
import { VolunteersView } from "./components/VolunteersView";
import { TestSendModal } from "./components/TestSendModal";
import {
  DEFAULT_TEMPLATES,
  EXTRA_IMAGE_ENTRIES_15_11,
  INITIAL_ENTRIES,
  SCHEDULE_GROUPS,
} from "./data/initialData";
import type {
  AppView,
  ContactLink,
  ContactMatchCandidate,
  ExtractedVolunteerOccurrence,
  GroupDefinition,
  MessageTemplatesState,
  PendingContactMatch,
  ScheduleEntry,
  ShiftType,
  VolunteerStatus,
} from "./types/schedule";
import {
  getConfirmationWindowInfo,
  getCurrentOrNextSundayISO,
} from "./utils/dateAndMessage";
import {
  findPendingMatchForName,
  formatVolunteerName,
  getSamePersonKeys,
  hydrateEntriesWithSavedContacts,
  lookupPhoneInBook,
  makeCanonicalPairId,
  normalizeContactBookKeys,
  normalizeNameKey,
} from "./utils/contacts";

const STORAGE_ENTRIES_KEY = "escala-kids:entries:v1";
const STORAGE_MIGRATION_V2_KEY = "escala-kids:migrated-extra-roles:v2";
const STORAGE_TEMPLATES_KEY = "escala-kids:templates:v1";
const STORAGE_CONTACTS_KEY = "escala-kids:contacts:v1";
const STORAGE_CONTACT_NAMES_KEY = "escala-kids:contact-names:v1";
const STORAGE_CONTACT_LINKS_KEY = "escala-kids:contact-links:v1";

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
    volunteerName: formatVolunteerName(raw.volunteerName || ""),
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

function isLegacyDefaultTemplate(text: string, variant: "noite" | "manha"): boolean {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const hasCheckIn = normalized.includes("abertura do check-in");
  if (!hasCheckIn) return false;
  if (variant === "noite") {
    return normalized.includes("templo kids as 18hs");
  }
  return normalized.includes("templo kids antes do culto");
}

function upgradeTemplatesState(loaded: MessageTemplatesState): {
  templates: MessageTemplatesState;
  upgraded: boolean;
} {
  let upgraded = false;
  const rawNoite = upgradeTemplateGreeting(loaded.defaultNoite || "");
  const rawManha = upgradeTemplateGreeting(loaded.defaultManha || "");

  const nextNoite =
    !rawNoite || isLegacyDefaultTemplate(rawNoite, "noite")
      ? ((upgraded = rawNoite !== DEFAULT_TEMPLATES.defaultNoite),
        DEFAULT_TEMPLATES.defaultNoite)
      : rawNoite;

  const nextManha =
    !rawManha || isLegacyDefaultTemplate(rawManha, "manha")
      ? ((upgraded = rawManha !== DEFAULT_TEMPLATES.defaultManha),
        DEFAULT_TEMPLATES.defaultManha)
      : rawManha;

  const nextOverrides = Object.fromEntries(
    Object.entries(loaded.groupOverrides || {}).map(([k, v]) => [
      k,
      upgradeTemplateGreeting(v),
    ])
  );

  return {
    templates: {
      defaultNoite: nextNoite,
      defaultManha: nextManha,
      groupOverrides: nextOverrides,
    },
    upgraded,
  };
}

function loadTemplates(): MessageTemplatesState {
  const loaded = loadJson<MessageTemplatesState>(
    STORAGE_TEMPLATES_KEY,
    DEFAULT_TEMPLATES
  );
  return upgradeTemplatesState(loaded).templates;
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("escala");
  const [sundayISO, setSundayISO] = useState<string>(() =>
    getCurrentOrNextSundayISO()
  );

  const [entries, setEntries] = useState<ScheduleEntry[]>(loadEntries);
  const [templates, setTemplates] =
    useState<MessageTemplatesState>(loadTemplates);
  const [contactBook, setContactBook] = useState<Record<string, string>>(() =>
    normalizeContactBookKeys(
      loadJson<Record<string, string>>(STORAGE_CONTACTS_KEY, {})
    ).book
  );
  const [contactNames, setContactNames] = useState<Record<string, string>>(() =>
    normalizeContactBookKeys(
      loadJson<Record<string, string>>(STORAGE_CONTACTS_KEY, {}),
      loadJson<Record<string, string>>(STORAGE_CONTACT_NAMES_KEY, {})
    ).names
  );
  const [contactLinks, setContactLinks] = useState<ContactLink[]>(() =>
    loadJson<ContactLink[]>(STORAGE_CONTACT_LINKS_KEY, [])
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
  const [isTestSendOpen, setIsTestSendOpen] = useState(false);
  const [pendingContactMatches, setPendingContactMatches] = useState<
    PendingContactMatch[]
  >([]);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsSchemaSetup, setNeedsSchemaSetup] = useState(false);

  const skipNextCloudPushRef = useRef(false);
  const hasHydratedCloudRef = useRef(false);
  const entriesRef = useRef(entries);
  const templatesRef = useRef(templates);
  const contactBookRef = useRef(contactBook);
  const contactNamesRef = useRef(contactNames);
  const contactLinksRef = useRef(contactLinks);
  entriesRef.current = entries;
  templatesRef.current = templates;
  contactBookRef.current = contactBook;
  contactNamesRef.current = contactNames;
  contactLinksRef.current = contactLinks;

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

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_CONTACT_NAMES_KEY,
        JSON.stringify(contactNames)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [contactNames]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_CONTACT_LINKS_KEY,
        JSON.stringify(contactLinks)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [contactLinks]);

  const pushStateToCloud = useCallback(
    async (payload: {
      entries: ScheduleEntry[];
      contactBook: Record<string, string>;
      contactNames: Record<string, string>;
      contactLinks: ContactLink[];
      templates: MessageTemplatesState;
    }) => {
      const res = await fetch("/api/cloud/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: { needsSchemaSetup?: boolean; error?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
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
        const rawText = await res.text();
        let data: {
          configured?: boolean;
          needsSchemaSetup?: boolean;
          error?: string;
          entries?: unknown;
          contactBook?: unknown;
          contactNames?: unknown;
          contactLinks?: unknown;
          templates?: unknown;
        } = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          if (!res.ok) {
            throw new Error(`Servidor indisponível (HTTP ${res.status}).`);
          }
          throw new Error("Resposta inválida ao ler dados da nuvem.");
        }
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
        const rawCloudBook =
          data.contactBook && typeof data.contactBook === "object"
            ? (data.contactBook as Record<string, string>)
            : {};
        const rawCloudNames =
          data.contactNames && typeof data.contactNames === "object"
            ? (data.contactNames as Record<string, string>)
            : {};
        const normalizedCloud = normalizeContactBookKeys(
          rawCloudBook,
          rawCloudNames
        );
        const cloudLinks = Array.isArray(data.contactLinks)
          ? (data.contactLinks as ContactLink[])
          : [];
        const cloudTemplates = data.templates as MessageTemplatesState | null;

        if (cloudEntries.length === 0 && !cloudTemplates && seedIfEmpty) {
          await pushStateToCloud({
            entries: entriesRef.current,
            contactBook: contactBookRef.current,
            contactNames: contactNamesRef.current,
            contactLinks: contactLinksRef.current,
            templates: templatesRef.current,
          });
          hasHydratedCloudRef.current = true;
          return;
        }

        // Backfill contact book from any cloud entries that already have phones
        const mergedBook = {
          ...contactBookRef.current,
          ...normalizedCloud.book,
        };
        const mergedNames = {
          ...contactNamesRef.current,
          ...normalizedCloud.names,
        };
        for (const e of cloudEntries) {
          const formatted = formatVolunteerName(e.volunteerName);
          const key = normalizeNameKey(formatted);
          if (key) {
            if (!mergedNames[key]) mergedNames[key] = formatted;
            if (e.phone.trim() && !mergedBook[key]) {
              mergedBook[key] = e.phone.trim();
            }
          }
        }

        const hydrated = hydrateEntriesWithSavedContacts(
          cloudEntries,
          mergedBook,
          cloudLinks
        );

        const upgradedCloudTemplates = cloudTemplates
          ? upgradeTemplatesState(cloudTemplates)
          : null;

        skipNextCloudPushRef.current = !upgradedCloudTemplates?.upgraded;
        hasHydratedCloudRef.current = true;
        setEntries(hydrated.entries);
        setContactBook(mergedBook);
        setContactNames(mergedNames);
        setContactLinks(cloudLinks);
        if (upgradedCloudTemplates) {
          setTemplates(upgradedCloudTemplates.templates);
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
        contactNames,
        contactLinks,
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
    contactNames,
    contactLinks,
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

  const enqueueMatchCheck = useCallback(
    (
      incomingName: string,
      incomingPhone: string,
      currentEntries: ScheduleEntry[],
      excludeEntryId?: string
    ) => {
      const match = findPendingMatchForName({
        incomingName,
        incomingPhone,
        entries: currentEntries,
        contactBook: contactBookRef.current,
        contactNames: contactNamesRef.current,
        contactLinks: contactLinksRef.current,
        excludeEntryId,
      });
      if (!match) return;
      setPendingContactMatches((prev) => {
        if (prev.some((p) => p.incomingKey === match.incomingKey)) return prev;
        return [...prev, match];
      });
    },
    []
  );

  const bindPhoneToPerson = useCallback(
    (volunteerName: string, rawPhone: string, editedEntryId?: string) => {
      const cleanName = formatVolunteerName(volunteerName);
      const normKey = normalizeNameKey(cleanName);
      if (!normKey) return;

      const trimmedPhone = rawPhone.trim();
      const sameKeys = getSamePersonKeys(normKey, contactLinksRef.current);

      setContactNames((prev) => ({
        ...prev,
        [normKey]: cleanName,
      }));

      if (trimmedPhone) {
        setContactBook((book) => {
          const next = { ...book };
          for (const k of sameKeys) {
            next[k] = trimmedPhone;
          }
          return next;
        });
      }

      setEntries((prev) =>
        prev.map((e) => {
          if (editedEntryId && e.id === editedEntryId) {
            return { ...e, phone: rawPhone };
          }
          if (
            trimmedPhone &&
            sameKeys.has(normalizeNameKey(e.volunteerName))
          ) {
            return { ...e, phone: trimmedPhone };
          }
          return e;
        })
      );
    },
    []
  );

  const handleUpdatePhone = (id: string, phone: string) => {
    const target = entriesRef.current.find((e) => e.id === id);
    if (!target) return;
    bindPhoneToPerson(target.volunteerName, phone, id);
  };

  const handleCommitPhone = (id: string, phone: string) => {
    const target = entriesRef.current.find((e) => e.id === id);
    if (!target || phone.trim().length < 8) return;
    enqueueMatchCheck(target.volunteerName, phone, entriesRef.current, id);
  };

  const handleUpdateName = (id: string, volunteerName: string) => {
    const matchedPhone = lookupPhoneInBook(
      volunteerName,
      contactBookRef.current,
      contactLinksRef.current
    );
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          volunteerName,
          phone: matchedPhone || e.phone,
        };
      })
    );
  };

  const handleCommitName = (id: string, volunteerName: string) => {
    const formattedName = formatVolunteerName(volunteerName);
    if (!formattedName) return;
    const nextEntries = entriesRef.current.map((e) =>
      e.id === id ? { ...e, volunteerName: formattedName } : e
    );
    setEntries(nextEntries);
    const target = nextEntries.find((e) => e.id === id);
    enqueueMatchCheck(formattedName, target?.phone || "", nextEntries, id);
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
    const cleanName = formatVolunteerName(newEntry.volunteerName);
    const normKey = normalizeNameKey(cleanName);
    const resolvedPhone =
      newEntry.phone.trim() ||
      lookupPhoneInBook(cleanName, contactBookRef.current, contactLinksRef.current);

    if (normKey) {
      setContactNames((prev) => ({ ...prev, [normKey]: cleanName }));
    }
    if (normKey && resolvedPhone) {
      const sameKeys = getSamePersonKeys(normKey, contactLinksRef.current);
      setContactBook((book) => {
        const next = { ...book };
        for (const k of sameKeys) next[k] = resolvedPhone;
        return next;
      });
    }

    const createdEntry: ScheduleEntry = {
      id,
      date: newEntry.date,
      shift: newEntry.shift,
      groupId: newEntry.groupId,
      volunteerName: cleanName,
      phone: resolvedPhone,
      status: "pendente",
      messageSent: false,
    };

    const nextEntries = [...entriesRef.current, createdEntry].map((e) => {
      if (
        e.id !== id &&
        resolvedPhone &&
        getSamePersonKeys(normKey, contactLinksRef.current).has(
          normalizeNameKey(e.volunteerName)
        )
      ) {
        return { ...e, phone: resolvedPhone };
      }
      return e;
    });

    setEntries(nextEntries);
    enqueueMatchCheck(cleanName, resolvedPhone, nextEntries, id);
  };

  const handleDuplicateFromDate = (sourceISO: string, targetISO: string) => {
    const sourceEntries = entriesRef.current.filter((e) => e.date === sourceISO);
    const cloned: ScheduleEntry[] = sourceEntries.map((e, idx) => {
      const savedPhone = lookupPhoneInBook(
        e.volunteerName,
        contactBookRef.current,
        contactLinksRef.current
      );
      return {
        ...e,
        id: `clone-${Date.now()}-${idx}`,
        date: targetISO,
        volunteerName: formatVolunteerName(e.volunteerName),
        phone: savedPhone || e.phone,
        status: "pendente",
        messageSent: false,
      };
    });
    setEntries((prev) => [...prev, ...cloned]);
  };

  const handleApplyImportedEntries = (params: {
    sundayISO: string;
    shift: ShiftType;
    assignments: { groupId: string; volunteerName: string }[];
    replaceExistingForShiftDate: boolean;
  }) => {
    const newItems: ScheduleEntry[] = params.assignments.map((item, idx) => {
      const cleanName = formatVolunteerName(item.volunteerName);
      const savedPhone = lookupPhoneInBook(
        cleanName,
        contactBookRef.current,
        contactLinksRef.current
      );
      return {
        id: `imp-${Date.now()}-${idx}`,
        date: params.sundayISO,
        shift: params.shift,
        groupId: item.groupId,
        volunteerName: cleanName,
        phone: savedPhone,
        status: "pendente",
        messageSent: false,
      };
    });

    const filtered = params.replaceExistingForShiftDate
      ? entriesRef.current.filter(
          (e) => !(e.date === params.sundayISO && e.shift === params.shift)
        )
      : entriesRef.current;
    const nextEntries = [...filtered, ...newItems];

    setEntries(nextEntries);
    setSelectedIds({});
    setSundayISO(params.sundayISO);
    setActiveView("escala");

    // Check ambiguous matches for unique imported names
    const checkedKeys = new Set<string>();
    const pendingList: PendingContactMatch[] = [];
    for (const item of newItems) {
      const key = normalizeNameKey(item.volunteerName);
      if (!key || checkedKeys.has(key)) continue;
      checkedKeys.add(key);
      const match = findPendingMatchForName({
        incomingName: item.volunteerName,
        incomingPhone: item.phone,
        entries: nextEntries,
        contactBook: contactBookRef.current,
        contactNames: contactNamesRef.current,
        contactLinks: contactLinksRef.current,
      });
      if (match) pendingList.push(match);
    }
    if (pendingList.length > 0) {
      setPendingContactMatches((prev) => {
        const existingKeys = new Set(prev.map((p) => p.incomingKey));
        return [
          ...prev,
          ...pendingList.filter((m) => !existingKeys.has(m.incomingKey)),
        ];
      });
    }
  };

  const handleReplaceVolunteer = (
    entryId: string,
    newName: string,
    newPhone: string
  ) => {
    const cleanName = formatVolunteerName(newName);
    const normKey = normalizeNameKey(cleanName);
    const resolvedPhone =
      newPhone.trim() ||
      lookupPhoneInBook(cleanName, contactBookRef.current, contactLinksRef.current);

    if (normKey) {
      setContactNames((prev) => ({ ...prev, [normKey]: cleanName }));
    }
    if (normKey && resolvedPhone) {
      const sameKeys = getSamePersonKeys(normKey, contactLinksRef.current);
      setContactBook((book) => {
        const next = { ...book };
        for (const k of sameKeys) next[k] = resolvedPhone;
        return next;
      });
    }

    const nextEntries = entriesRef.current.map((e) => {
      if (e.id === entryId) {
        return {
          ...e,
          volunteerName: cleanName,
          phone: resolvedPhone,
          status: "pendente" as const,
          messageSent: false,
        };
      }
      if (
        resolvedPhone &&
        getSamePersonKeys(normKey, contactLinksRef.current).has(
          normalizeNameKey(e.volunteerName)
        )
      ) {
        return { ...e, phone: resolvedPhone };
      }
      return e;
    });

    setEntries(nextEntries);
    enqueueMatchCheck(cleanName, resolvedPhone, nextEntries, entryId);
  };

  const handleResolveSamePerson = (
    pending: PendingContactMatch,
    candidate: ContactMatchCandidate
  ) => {
    const pairId = makeCanonicalPairId(pending.incomingKey, candidate.key);
    const newLink: ContactLink = {
      id: pairId,
      nameKeyA: pending.incomingKey,
      nameKeyB: candidate.key,
      displayNameA: pending.incomingName,
      displayNameB: candidate.displayName,
      relation: "same",
    };

    const nextLinks = [
      ...contactLinksRef.current.filter((l) => l.id !== pairId),
      newLink,
    ];
    setContactLinks(nextLinks);

    const sharedPhone =
      candidate.phone ||
      pending.incomingPhone ||
      lookupPhoneInBook(candidate.displayName, contactBookRef.current, nextLinks) ||
      lookupPhoneInBook(pending.incomingName, contactBookRef.current, nextLinks);

    const sameKeys = getSamePersonKeys(pending.incomingKey, nextLinks);

    setContactNames((prev) => ({
      ...prev,
      [pending.incomingKey]: pending.incomingName,
      [candidate.key]: candidate.displayName,
    }));

    if (sharedPhone) {
      setContactBook((book) => {
        const next = { ...book };
        for (const k of sameKeys) {
          next[k] = sharedPhone;
        }
        return next;
      });

      setEntries((prev) =>
        prev.map((e) => {
          if (sameKeys.has(normalizeNameKey(e.volunteerName)) && !e.phone.trim()) {
            return { ...e, phone: sharedPhone };
          }
          return e;
        })
      );
    }

    setPendingContactMatches((prev) =>
      prev.filter(
        (p) =>
          !(
            p.incomingKey === pending.incomingKey &&
            (p.incomingRole || "") === (pending.incomingRole || "")
          )
      )
    );
  };

  const handleResolveDistinctPeople = (
    pending: PendingContactMatch,
    distinctDetails?: { newDisplayName: string; newPhone: string }
  ) => {
    const targetName = formatVolunteerName(
      distinctDetails?.newDisplayName || pending.incomingName
    );
    const targetKey = normalizeNameKey(targetName);
    const targetPhone = distinctDetails?.newPhone.trim() || pending.incomingPhone;

    const newLinks: ContactLink[] = [];
    for (const c of pending.candidates) {
      if (targetKey !== c.key) {
        newLinks.push({
          id: makeCanonicalPairId(targetKey, c.key),
          nameKeyA: targetKey,
          nameKeyB: c.key,
          displayNameA: targetName,
          displayNameB: c.displayName,
          relation: "distinct",
        });
      }
      if (pending.incomingKey !== targetKey && pending.incomingKey !== c.key) {
        newLinks.push({
          id: makeCanonicalPairId(pending.incomingKey, targetKey),
          nameKeyA: pending.incomingKey,
          nameKeyB: targetKey,
          displayNameA: pending.incomingName,
          displayNameB: targetName,
          relation: "distinct",
        });
      }
    }

    if (newLinks.length > 0) {
      setContactLinks((prev) => {
        const newIds = new Set(newLinks.map((l) => l.id));
        return [...prev.filter((l) => !newIds.has(l.id)), ...newLinks];
      });
    }

    if (targetKey) {
      setContactNames((prev) => ({ ...prev, [targetKey]: targetName }));
      if (targetPhone) {
        setContactBook((book) => ({ ...book, [targetKey]: targetPhone }));
      }
    }

    setPendingContactMatches((prev) =>
      prev.filter(
        (p) =>
          !(
            p.incomingKey === pending.incomingKey &&
            (p.incomingRole || "") === (pending.incomingRole || "")
          )
      )
    );
  };

  const handleSkipPendingMatch = (pending: PendingContactMatch) => {
    setPendingContactMatches((prev) =>
      prev.filter(
        (p) =>
          !(
            p.incomingKey === pending.incomingKey &&
            (p.incomingRole || "") === (pending.incomingRole || "")
          )
      )
    );
  };

  const handleRemoveContactLink = (linkId: string) => {
    setContactLinks((prev) => prev.filter((l) => l.id !== linkId));
  };

  const handleAddVolunteerToDirectory = (name: string, phone: string) => {
    const cleanName = formatVolunteerName(name);
    const normKey = normalizeNameKey(cleanName);
    if (!normKey) return;

    const match = findPendingMatchForName({
      incomingName: cleanName,
      incomingPhone: phone,
      checkExactSameName: true,
      entries: entriesRef.current,
      contactBook: contactBookRef.current,
      contactNames: contactNamesRef.current,
      contactLinks: contactLinksRef.current,
    });

    if (match) {
      setPendingContactMatches((prev) => [...prev, match]);
      return;
    }

    bindPhoneToPerson(cleanName, phone);
  };

  const handleDeleteVolunteerFromDirectory = (primaryKey: string) => {
    const sameKeys = getSamePersonKeys(primaryKey, contactLinksRef.current);
    setContactBook((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (sameKeys.has(normalizeNameKey(k))) delete next[k];
      }
      return next;
    });
    setContactNames((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (sameKeys.has(normalizeNameKey(k))) delete next[k];
      }
      return next;
    });
    setContactLinks((prev) =>
      prev.filter(
        (l) =>
          !sameKeys.has(normalizeNameKey(l.nameKeyA)) &&
          !sameKeys.has(normalizeNameKey(l.nameKeyB))
      )
    );
  };

  const handleRenameVolunteerInDirectory = (
    oldPrimaryKey: string,
    newName: string
  ) => {
    const formattedName = formatVolunteerName(newName);
    const oldKey = normalizeNameKey(oldPrimaryKey);
    const newKey = normalizeNameKey(formattedName);
    if (!oldKey || !newKey || !formattedName) return;

    if (oldKey === newKey) {
      setContactNames((prev) => ({
        ...prev,
        [oldKey]: formattedName,
      }));
      setEntries((prev) =>
        prev.map((e) =>
          normalizeNameKey(e.volunteerName) === oldKey
            ? { ...e, volunteerName: formattedName }
            : e
        )
      );
      setContactLinks((prev) =>
        prev.map((l) => ({
          ...l,
          displayNameA:
            normalizeNameKey(l.nameKeyA) === oldKey
              ? formattedName
              : l.displayNameA,
          displayNameB:
            normalizeNameKey(l.nameKeyB) === oldKey
              ? formattedName
              : l.displayNameB,
        }))
      );
      return;
    }

    const existingPhone =
      contactBookRef.current[newKey]?.trim() ||
      contactBookRef.current[oldKey]?.trim() ||
      "";

    setContactNames((prev) => {
      const next = { ...prev };
      delete next[oldKey];
      next[newKey] = formattedName;
      return next;
    });

    setContactBook((prev) => {
      const next = { ...prev };
      const oldPhone = next[oldKey]?.trim() || "";
      delete next[oldKey];
      if (existingPhone || oldPhone) {
        next[newKey] = next[newKey]?.trim() || existingPhone || oldPhone;
      }
      return next;
    });

    setEntries((prev) =>
      prev.map((e) =>
        normalizeNameKey(e.volunteerName) === oldKey
          ? {
              ...e,
              volunteerName: formattedName,
              phone: e.phone.trim() || existingPhone,
            }
          : e
      )
    );

    setContactLinks((prev) => {
      const updated: ContactLink[] = [];
      const seenIds = new Set<string>();
      for (const l of prev) {
        const a =
          normalizeNameKey(l.nameKeyA) === oldKey
            ? newKey
            : normalizeNameKey(l.nameKeyA);
        const b =
          normalizeNameKey(l.nameKeyB) === oldKey
            ? newKey
            : normalizeNameKey(l.nameKeyB);
        if (a === b && l.relation === "distinct") continue;
        const id = makeCanonicalPairId(a, b);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        updated.push({
          ...l,
          id,
          nameKeyA: a,
          nameKeyB: b,
          displayNameA: a === newKey ? formattedName : l.displayNameA,
          displayNameB: b === newKey ? formattedName : l.displayNameB,
        });
      }
      return updated;
    });
  };

  const handleImportExtractedVolunteers = (
    items: ExtractedVolunteerOccurrence[]
  ) => {
    const workingNames = { ...contactNamesRef.current };
    const nextLinks = [...contactLinksRef.current];
    const pendingList: PendingContactMatch[] = [];

    for (const item of items) {
      const cleanName = formatVolunteerName(item.name);
      const key = normalizeNameKey(cleanName);
      if (!key) continue;

      const match = findPendingMatchForName({
        incomingName: cleanName,
        incomingRole: item.role,
        checkExactSameName: true,
        entries: entriesRef.current,
        contactBook: contactBookRef.current,
        contactNames: workingNames,
        contactLinks: nextLinks,
      });

      if (match) {
        pendingList.push(match);
      } else {
        workingNames[key] = cleanName;
      }
    }

    setContactNames(workingNames);

    if (pendingList.length > 0) {
      setPendingContactMatches((prev) => {
        const existingTokens = new Set(
          prev.map((p) => `${p.incomingKey}::${p.incomingRole || ""}`)
        );
        return [
          ...prev,
          ...pendingList.filter(
            (m) =>
              !existingTokens.has(`${m.incomingKey}::${m.incomingRole || ""}`)
          ),
        ];
      });
    }
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
        onOpenTestSend={() => setIsTestSendOpen(true)}
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
            onCommitName={handleCommitName}
            onCommitPhone={handleCommitPhone}
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
            contactLinks={contactLinks}
            onReplaceVolunteer={handleReplaceVolunteer}
            onOpenTestSend={() => setIsTestSendOpen(true)}
          />
        )}

        {activeView === "voluntarios" && (
          <VolunteersView
            entries={entries}
            contactBook={contactBook}
            contactNames={contactNames}
            contactLinks={contactLinks}
            onSavePersonPhone={(name, phone) => bindPhoneToPerson(name, phone)}
            onAddVolunteer={handleAddVolunteerToDirectory}
            onRenameVolunteer={handleRenameVolunteerInDirectory}
            onDeleteVolunteer={handleDeleteVolunteerFromDirectory}
            onImportExtractedVolunteers={handleImportExtractedVolunteers}
            onRemoveLink={handleRemoveContactLink}
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
            contactBook={contactBook}
            contactLinks={contactLinks}
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
        contactNames={contactNames}
        contactLinks={contactLinks}
        onAddEntry={handleAddEntry}
      />

      <ContactMatchModal
        pendingQueue={pendingContactMatches}
        onResolveSame={handleResolveSamePerson}
        onResolveDistinct={handleResolveDistinctPeople}
        onSkip={handleSkipPendingMatch}
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

      <TestSendModal
        isOpen={isTestSendOpen}
        onClose={() => setIsTestSendOpen(false)}
        sundayISO={sundayISO}
        templates={templates}
      />
    </div>
  );
}
