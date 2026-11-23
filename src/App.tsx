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
import { OFFICIAL_VOLUNTEERS } from "./data/officialVolunteers";
import type {
  AppView,
  ContactLink,
  ContactMatchCandidate,
  ExtractedVolunteerOccurrence,
  FamilySyncMode,
  GroupDefinition,
  MessageTemplatesState,
  PendingContactMatch,
  ScheduleEntry,
  ShiftType,
  VolunteerProfile,
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
import {
  BIRTHDAY_TEMPLATE_KEY,
  DEFAULT_BIRTHDAY_TEMPLATE,
  EMPTY_VOLUNTEER_PROFILE,
  normalizeVolunteerProfile,
} from "./utils/volunteerRoles";

const STORAGE_ENTRIES_KEY = "escala-kids:entries:v1";
const STORAGE_MIGRATION_V2_KEY = "escala-kids:migrated-extra-roles:v2";
const STORAGE_TEMPLATES_KEY = "escala-kids:templates:v1";
const STORAGE_CONTACTS_KEY = "escala-kids:contacts:v2";
const STORAGE_CONTACT_NAMES_KEY = "escala-kids:contact-names:v2";
const STORAGE_CONTACT_LINKS_KEY = "escala-kids:contact-links:v1";
const STORAGE_PROFILES_KEY = "escala-kids:profiles:v1";
const STORAGE_CLOUD_ENTRIES_SEEDED_KEY = "escala-kids:cloud-entries-seeded:v1";

function buildOfficialInitialContacts(): {
  book: Record<string, string>;
  names: Record<string, string>;
} {
  const book: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const vol of OFFICIAL_VOLUNTEERS) {
    const cleanName = formatVolunteerName(vol.name);
    const key = normalizeNameKey(cleanName);
    if (!key) continue;
    names[key] = cleanName;
    if (vol.phone.trim()) {
      book[key] = vol.phone.trim();
    }
  }
  return { book, names };
}

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
  const [contactBook, setContactBook] = useState<Record<string, string>>(() => {
    const storedBook = loadJson<Record<string, string>>(STORAGE_CONTACTS_KEY, {});
    const storedNames = loadJson<Record<string, string>>(
      STORAGE_CONTACT_NAMES_KEY,
      {}
    );
    if (
      Object.keys(storedBook).length === 0 &&
      Object.keys(storedNames).length === 0
    ) {
      return buildOfficialInitialContacts().book;
    }
    return normalizeContactBookKeys(storedBook, storedNames).book;
  });
  const [contactNames, setContactNames] = useState<Record<string, string>>(() => {
    const storedBook = loadJson<Record<string, string>>(STORAGE_CONTACTS_KEY, {});
    const storedNames = loadJson<Record<string, string>>(
      STORAGE_CONTACT_NAMES_KEY,
      {}
    );
    if (
      Object.keys(storedBook).length === 0 &&
      Object.keys(storedNames).length === 0
    ) {
      return buildOfficialInitialContacts().names;
    }
    return normalizeContactBookKeys(storedBook, storedNames).names;
  });
  const [contactLinks, setContactLinks] = useState<ContactLink[]>(() =>
    loadJson<ContactLink[]>(STORAGE_CONTACT_LINKS_KEY, [])
  );
  const [volunteerProfiles, setVolunteerProfiles] = useState<
    Record<string, VolunteerProfile>
  >(() => {
    const raw = loadJson<Record<string, Partial<VolunteerProfile>>>(
      STORAGE_PROFILES_KEY,
      {}
    );
    const out: Record<string, VolunteerProfile> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      const norm = normalizeNameKey(k);
      if (norm) out[norm] = normalizeVolunteerProfile(v);
    }
    return out;
  });

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
  const [needsProfileSchemaUpdate, setNeedsProfileSchemaUpdate] =
    useState(false);

  const pendingMutationsRef = useRef(0);
  const phoneDebounceTimersRef = useRef<Record<string, number>>({});
  const templateDebounceTimerRef = useRef<number | null>(null);
  const entriesRef = useRef(entries);
  const templatesRef = useRef(templates);
  const contactBookRef = useRef(contactBook);
  const contactNamesRef = useRef(contactNames);
  const contactLinksRef = useRef(contactLinks);
  const supabaseConfiguredRef = useRef(supabaseConfigured);
  entriesRef.current = entries;
  templatesRef.current = templates;
  contactBookRef.current = contactBook;
  contactNamesRef.current = contactNames;
  contactLinksRef.current = contactLinks;
  supabaseConfiguredRef.current = supabaseConfigured;

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

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_PROFILES_KEY,
        JSON.stringify(volunteerProfiles)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [volunteerProfiles]);

  const applyAuthoritativeCloudState = useCallback(
    (data: {
      entries?: unknown;
      contactBook?: unknown;
      contactNames?: unknown;
      contactLinks?: unknown;
      volunteerProfiles?: unknown;
      needsProfileSchemaUpdate?: boolean;
      templates?: unknown;
    }) => {
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

      // Authoritative directory from Supabase: NEVER merge localStorage or resurrect historical entry names
      const hydrated = hydrateEntriesWithSavedContacts(
        cloudEntries,
        normalizedCloud.book,
        cloudLinks
      );

      const upgradedCloudTemplates = cloudTemplates
        ? upgradeTemplatesState(cloudTemplates)
        : null;

      setEntries(hydrated.entries);
      setContactBook(normalizedCloud.book);
      setContactNames(normalizedCloud.names);
      setContactLinks(cloudLinks);

      if (typeof data.needsProfileSchemaUpdate === "boolean") {
        setNeedsProfileSchemaUpdate(data.needsProfileSchemaUpdate);
      }

      if (
        !data.needsProfileSchemaUpdate &&
        data.volunteerProfiles &&
        typeof data.volunteerProfiles === "object"
      ) {
        const nextProfiles: Record<string, VolunteerProfile> = {};
        for (const [k, rawProf] of Object.entries(
          data.volunteerProfiles as Record<string, Partial<VolunteerProfile>>
        )) {
          const norm = normalizeNameKey(k);
          if (norm) nextProfiles[norm] = normalizeVolunteerProfile(rawProf);
        }
        setVolunteerProfiles(nextProfiles);
      }

      if (upgradedCloudTemplates) {
        setTemplates(upgradedCloudTemplates.templates);
      }

      return {
        cloudEntries,
        upgradedTemplates: upgradedCloudTemplates?.upgraded
          ? upgradedCloudTemplates.templates
          : null,
      };
    },
    []
  );

  const postCloudAction = useCallback(
    async (
      actionBody: Record<string, unknown>,
      options?: { silentError?: boolean; applyReturnedState?: boolean }
    ) => {
      if (!supabaseConfiguredRef.current) return null;
      pendingMutationsRef.current += 1;
      try {
        const res = await fetch("/api/cloud/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(actionBody),
        });
        const rawText = await res.text();
        let data: {
          configured?: boolean;
          needsSchemaSetup?: boolean;
          needsProfileSchemaUpdate?: boolean;
          error?: string;
          state?: Record<string, unknown>;
        } = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = {};
        }
        if (!res.ok) {
          if (data.needsSchemaSetup) setNeedsSchemaSetup(true);
          if (data.needsProfileSchemaUpdate) {
            setNeedsProfileSchemaUpdate(true);
          }
          throw new Error(data.error || "Erro ao salvar alteração na nuvem.");
        }
        setNeedsSchemaSetup(false);
        if (
          actionBody.action === "upsert_volunteer_profile" ||
          actionBody.action === "update_family_group" ||
          actionBody.action === "mark_birthday_sent"
        ) {
          setNeedsProfileSchemaUpdate(false);
        }
        setSyncError(null);
        return data;
      } catch (err) {
        if (!options?.silentError) {
          setSyncError(
            err instanceof Error
              ? err.message
              : "Erro ao salvar alteração na nuvem."
          );
        }
        return null;
      } finally {
        pendingMutationsRef.current = Math.max(
          0,
          pendingMutationsRef.current - 1
        );
      }
    },
    []
  );

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
    async (seedIfEmpty: boolean, options?: { silent?: boolean }) => {
      if (options?.silent && pendingMutationsRef.current > 0) {
        return;
      }
      if (!options?.silent) {
        setIsSyncing(true);
        setSyncError(null);
      }
      try {
        const res = await fetch("/api/cloud/state", { cache: "no-store" });
        const rawText = await res.text();
        let data: {
          configured?: boolean;
          needsSchemaSetup?: boolean;
          needsProfileSchemaUpdate?: boolean;
          error?: string;
          entries?: unknown;
          contactBook?: unknown;
          contactNames?: unknown;
          contactLinks?: unknown;
          volunteerProfiles?: unknown;
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
        supabaseConfiguredRef.current = Boolean(data.configured);

        if (!data.configured) {
          return;
        }

        if (!res.ok) {
          if (data.needsSchemaSetup) setNeedsSchemaSetup(true);
          throw new Error(data.error || "Erro ao carregar dados da nuvem.");
        }
        setNeedsSchemaSetup(false);
        setNeedsProfileSchemaUpdate(Boolean(data.needsProfileSchemaUpdate));

        const cloudEntries = Array.isArray(data.entries)
          ? (data.entries as RawStoredEntry[]).map(normalizeEntry)
          : [];
        const cloudTemplates = data.templates as MessageTemplatesState | null;

        // If the Supabase project has never been seeded with initial entries yet, seed entries once
        let alreadySeededEntries = false;
        try {
          alreadySeededEntries = Boolean(
            localStorage.getItem(STORAGE_CLOUD_ENTRIES_SEEDED_KEY)
          );
        } catch {
          alreadySeededEntries = false;
        }

        if (cloudEntries.length === 0 && !cloudTemplates && seedIfEmpty) {
          await pushStateToCloud({
            entries: entriesRef.current,
            contactBook: contactBookRef.current,
            contactNames: contactNamesRef.current,
            contactLinks: contactLinksRef.current,
            templates: templatesRef.current,
          });
          try {
            localStorage.setItem(STORAGE_CLOUD_ENTRIES_SEEDED_KEY, "1");
          } catch {
            // Ignore storage errors
          }
          return;
        }

        if (
          cloudEntries.length === 0 &&
          seedIfEmpty &&
          !alreadySeededEntries &&
          entriesRef.current.length > 0
        ) {
          await postCloudAction({
            action: "add_entries",
            entries: entriesRef.current,
          });
          try {
            localStorage.setItem(STORAGE_CLOUD_ENTRIES_SEEDED_KEY, "1");
          } catch {
            // Ignore storage errors
          }
        } else if (cloudEntries.length > 0) {
          try {
            localStorage.setItem(STORAGE_CLOUD_ENTRIES_SEEDED_KEY, "1");
          } catch {
            // Ignore storage errors
          }
        }

        if (options?.silent) {
          if (pendingMutationsRef.current > 0) return;
          const activeTag = document.activeElement?.tagName;
          if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
            return;
          }
        }

        const result = applyAuthoritativeCloudState(data);
        if (result.upgradedTemplates) {
          void postCloudAction({
            action: "upsert_templates",
            templates: result.upgradedTemplates,
          });
        }
      } catch (err) {
        if (!options?.silent) {
          setSyncError(
            err instanceof Error
              ? err.message
              : "Erro ao sincronizar com o Supabase."
          );
        }
      } finally {
        if (!options?.silent) {
          setIsSyncing(false);
        }
      }
    },
    [applyAuthoritativeCloudState, postCloudAction, pushStateToCloud]
  );

  // Pull shared cloud data automatically on initial load (no login needed)
  useEffect(() => {
    void pullStateFromCloud(true);
  }, [pullStateFromCloud]);

  // Keep multiple browsers & devices synchronized cleanly in the background
  useEffect(() => {
    if (!supabaseConfigured) return;

    const refreshQuietly = () => {
      if (document.visibilityState !== "visible") return;
      if (pendingMutationsRef.current > 0) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }
      void pullStateFromCloud(false, { silent: true });
    };

    const intervalId = window.setInterval(refreshQuietly, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pullStateFromCloud(false, { silent: true });
      }
    };
    const onFocus = () => {
      void pullStateFromCloud(false, { silent: true });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
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
    void postCloudAction({
      action: "update_entry",
      id,
      patch: { status },
    });
  };

  const handleMarkSent = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, messageSent: true } : e))
    );
    void postCloudAction({
      action: "update_entry",
      id,
      patch: { messageSent: true },
    });
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
    (
      volunteerName: string,
      rawPhone: string,
      editedEntryId?: string,
      options?: { allowEmptyPhone?: boolean; skipCloud?: boolean }
    ) => {
      const cleanName = formatVolunteerName(volunteerName);
      const normKey = normalizeNameKey(cleanName);
      if (!normKey) return;

      const trimmedPhone = rawPhone.trim();
      const sameKeys = getSamePersonKeys(normKey, contactLinksRef.current);

      setContactNames((prev) => ({
        ...prev,
        [normKey]: cleanName,
      }));

      if (trimmedPhone || options?.allowEmptyPhone) {
        setContactBook((book) => {
          const next = { ...book };
          for (const k of sameKeys) {
            if (trimmedPhone) {
              next[k] = trimmedPhone;
            } else if (options?.allowEmptyPhone) {
              delete next[k];
            }
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

      if (!options?.skipCloud) {
        void postCloudAction({
          action: "upsert_volunteer",
          name: cleanName,
          phone: trimmedPhone,
          allowEmptyPhone: Boolean(options?.allowEmptyPhone),
        });
      }
    },
    [postCloudAction]
  );

  const handleUpdatePhone = (id: string, phone: string) => {
    const target = entriesRef.current.find((e) => e.id === id);
    if (!target) return;
    bindPhoneToPerson(target.volunteerName, phone, id, { skipCloud: true });

    if (phoneDebounceTimersRef.current[id]) {
      window.clearTimeout(phoneDebounceTimersRef.current[id]);
    }
    const capturedName = target.volunteerName;
    phoneDebounceTimersRef.current[id] = window.setTimeout(() => {
      delete phoneDebounceTimersRef.current[id];
      const trimmed = phone.trim();
      void postCloudAction({
        action: "update_entry",
        id,
        patch: { phone: trimmed },
      });
      if (trimmed.length >= 8) {
        void postCloudAction({
          action: "upsert_volunteer",
          name: capturedName,
          phone: trimmed,
        });
      }
    }, 700);
  };

  const handleCommitPhone = (id: string, phone: string) => {
    const target = entriesRef.current.find((e) => e.id === id);
    if (!target) return;
    if (phoneDebounceTimersRef.current[id]) {
      window.clearTimeout(phoneDebounceTimersRef.current[id]);
      delete phoneDebounceTimersRef.current[id];
    }
    const trimmed = phone.trim();
    void postCloudAction({
      action: "update_entry",
      id,
      patch: { phone: trimmed },
    });
    if (trimmed.length >= 8) {
      void postCloudAction({
        action: "upsert_volunteer",
        name: target.volunteerName,
        phone: trimmed,
      });
      enqueueMatchCheck(target.volunteerName, trimmed, entriesRef.current, id);
    }
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
    const matchedPhone = lookupPhoneInBook(
      formattedName,
      contactBookRef.current,
      contactLinksRef.current
    );
    const nextEntries = entriesRef.current.map((e) =>
      e.id === id
        ? {
            ...e,
            volunteerName: formattedName,
            phone: e.phone.trim() || matchedPhone || "",
          }
        : e
    );
    setEntries(nextEntries);
    const target = nextEntries.find((e) => e.id === id);
    void postCloudAction({
      action: "update_entry",
      id,
      patch: {
        volunteerName: formattedName,
        ...(target?.phone ? { phone: target.phone } : {}),
      },
    });
    enqueueMatchCheck(formattedName, target?.phone || "", nextEntries, id);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void postCloudAction({ action: "delete_entry", id });
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
    void postCloudAction({ action: "upsert_entry", entry: createdEntry });
    if (normKey) {
      void postCloudAction({
        action: "upsert_volunteer",
        name: cleanName,
        phone: resolvedPhone,
      });
    }
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
    if (cloned.length > 0) {
      void postCloudAction({ action: "add_entries", entries: cloned });
    }
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

    void postCloudAction({
      action: "add_entries",
      replaceDate: params.replaceExistingForShiftDate ? params.sundayISO : "",
      replaceShift: params.replaceExistingForShiftDate ? params.shift : "",
      entries: newItems,
    });

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
    void postCloudAction({
      action: "update_entry",
      id: entryId,
      patch: {
        volunteerName: cleanName,
        phone: resolvedPhone,
        status: "pendente",
        messageSent: false,
      },
    });
    if (normKey) {
      void postCloudAction({
        action: "upsert_volunteer",
        name: cleanName,
        phone: resolvedPhone,
      });
    }
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

    void postCloudAction({ action: "upsert_link", link: newLink });
    if (sharedPhone) {
      void postCloudAction({
        action: "upsert_volunteer",
        name: candidate.displayName,
        phone: sharedPhone,
      });
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
      for (const l of newLinks) {
        void postCloudAction({ action: "upsert_link", link: l });
      }
    }

    if (targetKey) {
      setContactNames((prev) => ({ ...prev, [targetKey]: targetName }));
      if (targetPhone) {
        setContactBook((book) => ({ ...book, [targetKey]: targetPhone }));
      }
      void postCloudAction({
        action: "upsert_volunteer",
        name: targetName,
        phone: targetPhone,
      });
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
    void postCloudAction({ action: "delete_link", id: linkId });
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

    bindPhoneToPerson(cleanName, phone, undefined, { allowEmptyPhone: true });
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
    setVolunteerProfiles((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (sameKeys.has(normalizeNameKey(k))) delete next[k];
      }
      return next;
    });
    void postCloudAction({
      action: "delete_volunteer",
      keys: Array.from(sameKeys),
    });
  };

  const handleRenameVolunteerInDirectory = (
    oldPrimaryKey: string,
    newName: string
  ) => {
    const formattedName = formatVolunteerName(newName);
    const oldKey = normalizeNameKey(oldPrimaryKey);
    const newKey = normalizeNameKey(formattedName);
    if (!oldKey || !newKey || !formattedName) return;

    const existingPhone =
      contactBookRef.current[newKey]?.trim() ||
      contactBookRef.current[oldKey]?.trim() ||
      "";

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
      void postCloudAction({
        action: "rename_volunteer",
        oldKey,
        newName: formattedName,
        phone: existingPhone,
      });
      return;
    }

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

    setVolunteerProfiles((prev) => {
      if (!prev[oldKey]) return prev;
      const next = { ...prev };
      next[newKey] = next[newKey] || next[oldKey];
      delete next[oldKey];
      return next;
    });

    void postCloudAction({
      action: "rename_volunteer",
      oldKey,
      newName: formattedName,
      phone: existingPhone,
    });
  };

  const handleImportExtractedVolunteers = (
    items: ExtractedVolunteerOccurrence[]
  ) => {
    const workingNames = { ...contactNamesRef.current };
    const nextLinks = [...contactLinksRef.current];
    const pendingList: PendingContactMatch[] = [];
    const addedNames: string[] = [];

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
        if (!workingNames[key]) {
          addedNames.push(cleanName);
        }
        workingNames[key] = cleanName;
      }
    }

    setContactNames(workingNames);

    for (const nameToSave of addedNames) {
      void postCloudAction({
        action: "upsert_volunteer",
        name: nameToSave,
        phone: "",
      });
    }

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

  const handleResetOfficialVolunteers = async () => {
    const official = buildOfficialInitialContacts();
    setContactBook(official.book);
    setContactNames(official.names);
    if (supabaseConfiguredRef.current) {
      const res = await postCloudAction({
        action: "replace_official_volunteers",
      });
      if (res?.state) {
        applyAuthoritativeCloudState(res.state);
      }
    }
  };

  const handleUpdateTemplates = (nextTemplates: MessageTemplatesState) => {
    setTemplates(nextTemplates);
    if (templateDebounceTimerRef.current !== null) {
      window.clearTimeout(templateDebounceTimerRef.current);
    }
    templateDebounceTimerRef.current = window.setTimeout(() => {
      templateDebounceTimerRef.current = null;
      void postCloudAction({
        action: "upsert_templates",
        templates: nextTemplates,
      });
    }, 700);
  };

  const handleSaveVolunteerProfile = ({
    nameKey,
    volunteerName,
    profile,
    familyUpdate,
  }: {
    nameKey: string;
    volunteerName: string;
    profile: VolunteerProfile;
    familyUpdate?: {
      familyGroupId: string;
      familyGroupName: string;
      familySyncMode: FamilySyncMode;
      memberKeys: string[];
      removedKeys: string[];
    } | null;
  }) => {
    const normKey = normalizeNameKey(nameKey);
    if (!normKey) return;
    const cleanProfile = normalizeVolunteerProfile(profile);

    setVolunteerProfiles((prev) => {
      const next = { ...prev, [normKey]: cleanProfile };
      if (familyUpdate) {
        if (familyUpdate.familyGroupId && familyUpdate.memberKeys.length > 0) {
          for (const mKey of familyUpdate.memberKeys) {
            const normMember = normalizeNameKey(mKey);
            if (!normMember) continue;
            const existingProf =
              normMember === normKey
                ? cleanProfile
                : next[normMember] || EMPTY_VOLUNTEER_PROFILE;
            next[normMember] = {
              ...existingProf,
              familyGroupId: familyUpdate.familyGroupId,
              familyGroupName: familyUpdate.familyGroupName,
              familySyncMode: familyUpdate.familySyncMode,
            };
          }
        }
        for (const rKey of familyUpdate.removedKeys) {
          const normRemoved = normalizeNameKey(rKey);
          if (!normRemoved || !next[normRemoved]) continue;
          next[normRemoved] = {
            ...next[normRemoved],
            familyGroupId: "",
            familyGroupName: "",
            familySyncMode: "same_shift",
          };
        }
      }
      return next;
    });

    void (async () => {
      await postCloudAction({
        action: "upsert_volunteer_profile",
        nameKey: normKey,
        volunteerName,
        profile: cleanProfile,
      });
      if (familyUpdate) {
        await postCloudAction({
          action: "update_family_group",
          ...familyUpdate,
        });
      }
    })();
  };

  const handleMarkBirthdaySent = (nameKey: string, year: number | null) => {
    const normKey = normalizeNameKey(nameKey);
    if (!normKey) return;
    setVolunteerProfiles((prev) => {
      const existing = prev[normKey] || EMPTY_VOLUNTEER_PROFILE;
      return {
        ...prev,
        [normKey]: {
          ...existing,
          birthdaySentYear: year,
        },
      };
    });
    void postCloudAction({
      action: "mark_birthday_sent",
      nameKey: normKey,
      year,
    });
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
            contactNames={contactNames}
            contactLinks={contactLinks}
            volunteerProfiles={volunteerProfiles}
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
            volunteerProfiles={volunteerProfiles}
            birthdayTemplate={
              templates.groupOverrides[BIRTHDAY_TEMPLATE_KEY] ??
              DEFAULT_BIRTHDAY_TEMPLATE
            }
            needsProfileSchemaUpdate={needsProfileSchemaUpdate}
            onSavePersonPhone={(name, phone) =>
              bindPhoneToPerson(name, phone, undefined, {
                allowEmptyPhone: true,
              })
            }
            onAddVolunteer={handleAddVolunteerToDirectory}
            onRenameVolunteer={handleRenameVolunteerInDirectory}
            onDeleteVolunteer={handleDeleteVolunteerFromDirectory}
            onImportExtractedVolunteers={handleImportExtractedVolunteers}
            onRemoveLink={handleRemoveContactLink}
            onResetOfficialVolunteers={handleResetOfficialVolunteers}
            onSaveVolunteerProfile={handleSaveVolunteerProfile}
            onMarkBirthdaySent={handleMarkBirthdaySent}
          />
        )}

        {activeView === "modelos" && (
          <TemplatesView
            templates={templates}
            onUpdateTemplates={handleUpdateTemplates}
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
        volunteerProfiles={volunteerProfiles}
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
        needsProfileSchemaUpdate={needsProfileSchemaUpdate}
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
