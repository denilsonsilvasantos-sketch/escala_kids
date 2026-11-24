import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Upload,
  Loader2,
  Phone,
  Plus,
  Search,
  Trash2,
  Link2,
  AlertCircle,
  CheckCircle2,
  Users,
  Pencil,
  Check,
  X,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  Cake,
  ExternalLink,
  Copy,
  SlidersHorizontal,
} from "lucide-react";
import migrationFase1SqlRaw from "../../supabase/migration_fase1.sql?raw";
import type {
  ContactLink,
  ExtractedVolunteerOccurrence,
  FamilySyncMode,
  ScheduleEntry,
  VolunteerProfile,
} from "../types/schedule";
import {
  buildKnownDirectory,
  formatVolunteerName,
  getSamePersonKeys,
  isSelfConfirmedSame,
  normalizeNameKey,
  areNamesPotentialMatch,
} from "../utils/contacts";
import { compressImageForUpload } from "../utils/imageUpload";
import {
  exportVolunteersToExcel,
  exportVolunteersToPdf,
} from "../utils/exportSchedule";
import {
  buildWhatsAppUrl,
  formatPhoneDisplay,
} from "../utils/dateAndMessage";
import {
  AGE_LABEL_BY_KEY,
  EMPTY_VOLUNTEER_PROFILE,
  formatAgePreferencesLabel,
  formatBirthdayDDMM,
  formatShiftPreferenceLabel,
  getBirthdayStatus,
  MONTH_NAMES_PT,
  renderBirthdayMessage,
  ROLE_LABEL_BY_KEY,
} from "../utils/volunteerRoles";
import { VolunteerProfileModal } from "./VolunteerProfileModal";

interface VolunteersViewProps {
  entries: ScheduleEntry[];
  contactBook: Record<string, string>;
  contactNames: Record<string, string>;
  contactLinks: ContactLink[];
  volunteerProfiles: Record<string, VolunteerProfile>;
  birthdayTemplate: string;
  needsProfileSchemaUpdate?: boolean;
  onSavePersonPhone: (name: string, phone: string) => void;
  onAddVolunteer: (name: string, phone: string) => void;
  onRenameVolunteer: (oldPrimaryKey: string, newName: string) => void;
  onDeleteVolunteer: (primaryKey: string) => void;
  onImportExtractedVolunteers: (items: ExtractedVolunteerOccurrence[]) => void;
  onRemoveLink: (linkId: string) => void;
  onResetOfficialVolunteers?: () => Promise<void> | void;
  onSaveVolunteerProfile: (params: {
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
  }) => void;
  onMarkBirthdaySent: (nameKey: string, year: number | null) => void;
}

export function VolunteersView({
  entries,
  contactBook,
  contactNames,
  contactLinks,
  volunteerProfiles,
  birthdayTemplate,
  needsProfileSchemaUpdate = false,
  onSavePersonPhone,
  onAddVolunteer,
  onRenameVolunteer,
  onDeleteVolunteer,
  onImportExtractedVolunteers,
  onRemoveLink,
  onResetOfficialVolunteers,
  onSaveVolunteerProfile,
  onMarkBirthdaySent,
}: VolunteersViewProps) {
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<
    "todos" | "com-telefone" | "sem-telefone" | "aniversariantes" | "sem-perfil"
  >("todos");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState("");
  const [profileEditingKey, setProfileEditingKey] = useState<string | null>(null);
  const [copiedBirthdayKey, setCopiedBirthdayKey] = useState<string | null>(null);
  const [copiedMigrationSql, setCopiedMigrationSql] = useState(false);
  const [confirmingOfficialReset, setConfirmingOfficialReset] = useState(false);
  const [isResettingOfficial, setIsResettingOfficial] = useState(false);

  // Image extraction state
  const [imagePreview, setImagePreview] = useState("");
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedItems, setExtractedItems] = useState<
    (ExtractedVolunteerOccurrence & { selected: boolean })[]
  >([]);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const directory = useMemo(
    () =>
      buildKnownDirectory({
        entries,
        contactBook,
        contactNames,
      }),
    [entries, contactBook, contactNames]
  );

  const peopleList = useMemo(() => {
    const visited = new Set<string>();
    const list: {
      primaryKey: string;
      displayName: string;
      phone: string;
      aliases: string[];
    }[] = [];

    for (const [key, info] of directory.entries()) {
      if (visited.has(key)) continue;
      const sameGroup = getSamePersonKeys(key, contactLinks);
      let bestName = info.displayName || key;
      let bestPhone = info.phone || "";
      const aliasSet = new Set<string>();

      for (const memberKey of sameGroup) {
        visited.add(memberKey);
        const member = directory.get(memberKey);
        if (member) {
          if (member.displayName.length > bestName.length) {
            bestName = member.displayName;
          }
          if (!bestPhone && member.phone) {
            bestPhone = member.phone;
          }
          if (member.displayName) aliasSet.add(member.displayName);
        }
      }

      const aliases = Array.from(aliasSet).filter(
        (n) => normalizeNameKey(n) !== normalizeNameKey(bestName)
      );

      list.push({
        primaryKey: key,
        displayName: bestName,
        phone: bestPhone,
        aliases,
      });
    }

    return list.sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
  }, [directory, contactLinks]);

  const nowDate = useMemo(() => new Date(), []);
  const currentYear = nowDate.getFullYear();
  const currentMonthName = MONTH_NAMES_PT[nowDate.getMonth()] || "";

  const birthdayEntries = useMemo(() => {
    return peopleList
      .map((person) => {
        const profile = volunteerProfiles[person.primaryKey] || EMPTY_VOLUNTEER_PROFILE;
        const status = getBirthdayStatus(profile.birthDay, profile.birthMonth, nowDate);
        return {
          person,
          profile,
          status,
        };
      })
      .filter((item) => item.status.hasBirthday)
      .sort((a, b) => {
        if (a.status.isToday !== b.status.isToday) return a.status.isToday ? -1 : 1;
        if (a.status.isCurrentMonth !== b.status.isCurrentMonth) {
          return a.status.isCurrentMonth ? -1 : 1;
        }
        if (a.status.daysUntil !== b.status.daysUntil) {
          return a.status.daysUntil - b.status.daysUntil;
        }
        return a.person.displayName.localeCompare(b.person.displayName, "pt-BR");
      });
  }, [peopleList, volunteerProfiles, nowDate]);

  const monthOrTodayBirthdays = useMemo(
    () =>
      birthdayEntries.filter(
        (item) => item.status.isToday || item.status.isCurrentMonth
      ),
    [birthdayEntries]
  );

  const stats = useMemo(() => {
    const total = peopleList.length;
    const comTelefone = peopleList.filter((p) => p.phone.trim().length > 0).length;
    const semTelefone = total - comTelefone;
    const aniversariantes = birthdayEntries.length;
    const semPerfil = peopleList.filter((p) => {
      const prof = volunteerProfiles[p.primaryKey];
      return (
        !prof ||
        (!prof.birthDay &&
          prof.roles.length === 0 &&
          prof.preferredAges.length === 0 &&
          prof.preferredShifts.length === 0)
      );
    }).length;
    return { total, comTelefone, semTelefone, aniversariantes, semPerfil };
  }, [peopleList, birthdayEntries.length, volunteerProfiles]);

  const filteredPeople = useMemo(() => {
    const q = normalizeNameKey(search);
    const list = peopleList.filter((person) => {
      const prof = volunteerProfiles[person.primaryKey] || EMPTY_VOLUNTEER_PROFILE;
      if (filterTab === "com-telefone" && !person.phone.trim()) return false;
      if (filterTab === "sem-telefone" && person.phone.trim()) return false;
      if (filterTab === "aniversariantes" && (!prof.birthDay || !prof.birthMonth)) {
        return false;
      }
      if (
        filterTab === "sem-perfil" &&
        ((prof.birthDay && prof.birthMonth) ||
          prof.roles.length > 0 ||
          prof.preferredAges.length > 0 ||
          prof.preferredShifts.length > 0)
      ) {
        return false;
      }
      if (!q) return true;
      const roleLabels = prof.roles
        .map((r) => ROLE_LABEL_BY_KEY[r] || r)
        .join(" ");
      const ageLabels = prof.preferredAges
        .map((a) => AGE_LABEL_BY_KEY[a] || a)
        .join(" ");
      return (
        normalizeNameKey(person.displayName).includes(q) ||
        person.aliases.some((a) => normalizeNameKey(a).includes(q)) ||
        person.phone.includes(search.trim()) ||
        normalizeNameKey(roleLabels).includes(q) ||
        normalizeNameKey(ageLabels).includes(q) ||
        normalizeNameKey(prof.familyGroupName || "").includes(q)
      );
    });

    if (filterTab === "aniversariantes") {
      return [...list].sort((a, b) => {
        const profA = volunteerProfiles[a.primaryKey] || EMPTY_VOLUNTEER_PROFILE;
        const profB = volunteerProfiles[b.primaryKey] || EMPTY_VOLUNTEER_PROFILE;
        const stA = getBirthdayStatus(profA.birthDay, profA.birthMonth, nowDate);
        const stB = getBirthdayStatus(profB.birthDay, profB.birthMonth, nowDate);
        if (stA.daysUntil !== stB.daysUntil) return stA.daysUntil - stB.daysUntil;
        return a.displayName.localeCompare(b.displayName, "pt-BR");
      });
    }

    return list;
  }, [peopleList, volunteerProfiles, filterTab, search, nowDate]);

  const profileEditingPerson = useMemo(
    () =>
      profileEditingKey
        ? peopleList.find((p) => p.primaryKey === profileEditingKey) || null
        : null,
    [profileEditingKey, peopleList]
  );

  const handleCopyBirthdayMessage = async (key: string, displayName: string) => {
    const text = renderBirthdayMessage(birthdayTemplate, displayName);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBirthdayKey(key);
      window.setTimeout(() => setCopiedBirthdayKey(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyMigrationSql = async () => {
    try {
      await navigator.clipboard.writeText(migrationFase1SqlRaw);
      setCopiedMigrationSql(true);
      window.setTimeout(() => setCopiedMigrationSql(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleManualAdd = (e: FormEvent) => {
    e.preventDefault();
    const formatted = formatVolunteerName(newName);
    if (!formatted) return;
    onAddVolunteer(formatted, newPhone.trim());
    setNewName("");
    setNewPhone("");
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsPreparingImage(true);
    setExtractError(null);
    setImportFeedback(null);
    setExtractedItems([]);

    try {
      const prepared = await compressImageForUpload(file);
      setImagePreview(prepared.dataUrl);
      setIsPreparingImage(false);

      setIsExtracting(true);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);
      try {
        const res = await fetch("/api/extract-volunteers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: prepared.dataUrl,
            mimeType: prepared.mimeType,
          }),
        });
        const rawText = await res.text();
        let data: {
          error?: string;
          volunteers?: ExtractedVolunteerOccurrence[];
        } = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          if (res.status === 404) {
            throw new Error(
              "O servidor da rota /api/extract-volunteers não foi encontrado (404). Se estiver no link compartilhado/publicado, atualize a publicação; se estiver no editor, recarregue a página."
            );
          }
          if (res.status === 413) {
            throw new Error(
              "A imagem enviada ficou muito grande. Tente recortar ou aproximar apenas a tabela."
            );
          }
          throw new Error(
            "O servidor retornou uma resposta inesperada. Recarregue a página e tente novamente."
          );
        }
        if (!res.ok) {
          throw new Error(
            data.error ||
              (res.status === 404
                ? "Rota /api/extract-volunteers não encontrada (404). Recarregue ou republicar o app."
                : "Erro ao ler imagem.")
          );
        }
        const list = Array.isArray(data.volunteers) ? data.volunteers : [];
        if (list.length === 0) {
          setExtractError("Nenhum nome de voluntário foi identificado nesta imagem.");
        } else {
          setExtractedItems(
            list.map((v) => ({
              ...v,
              name: formatVolunteerName(v.name),
              selected: true,
            }))
          );
          window.setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }
      } finally {
        window.clearTimeout(timeoutId);
        setIsExtracting(false);
      }
    } catch (err) {
      setIsPreparingImage(false);
      setIsExtracting(false);
      if (err instanceof DOMException && err.name === "AbortError") {
        setExtractError("A leitura demorou mais que o esperado. Tente novamente.");
      } else {
        setExtractError(
          err instanceof Error
            ? err.message
            : "Não foi possível extrair os voluntários da imagem."
        );
      }
    }
  };

  const getExtractedStatusBadge = (
    item: ExtractedVolunteerOccurrence,
    idx: number
  ) => {
    const key = normalizeNameKey(item.name);
    const duplicateInList = extractedItems.some(
      (other, oIdx) => oIdx !== idx && normalizeNameKey(other.name) === key
    );
    const existing = directory.get(key);
    const hasSimilarExisting = Array.from(directory.entries()).some(
      ([cKey, info]) =>
        cKey !== key && areNamesPotentialMatch(item.name, info.displayName || cKey)
    );

    if (duplicateInList) {
      return {
        label: "Nome igual na imagem",
        className: "bg-amber-50 text-amber-800 border-amber-200",
      };
    }
    if (hasSimilarExisting) {
      return {
        label: "Nome parecido salvo",
        className: "bg-amber-50 text-amber-800 border-amber-200",
      };
    }
    if (existing) {
      if (existing.phone) {
        return {
          label: "Já tem WhatsApp",
          className: "bg-emerald-50 text-emerald-800 border-emerald-200",
        };
      }
      if (!isSelfConfirmedSame(key, contactLinks)) {
        return {
          label: "Mesmo nome na lista",
          className: "bg-amber-50 text-amber-800 border-amber-200",
        };
      }
      return {
        label: "Já na lista",
        className: "bg-zinc-100 text-zinc-700 border-zinc-200",
      };
    }
    return {
      label: "Novo",
      className: "bg-sky-50 text-sky-800 border-sky-200",
    };
  };

  const handleConfirmImport = () => {
    const selected = extractedItems
      .filter((i) => i.selected && i.name.trim())
      .map(({ name, role }) => ({
        name: formatVolunteerName(name),
        role: role.trim(),
      }));
    if (selected.length === 0) return;

    onImportExtractedVolunteers(selected);
    setImportFeedback(
      `${selected.length} ${selected.length === 1 ? "registro processado" : "registros processados"} na lista de voluntários.`
    );
    setExtractedItems([]);
  };

  const selectedExtractedCount = extractedItems.filter((i) => i.selected).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Header + KPI Strip */}
      <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
            Lista de Voluntários
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Cadastre os voluntários e seus números de WhatsApp ou extraia os nomes direto de uma imagem. Ao importar a escala do domingo, o telefone já entra pronto automaticamente.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#EFECE4] border border-[#EFECE4] rounded-xl bg-[#FAF9F5] py-3 px-2 shrink-0">
          <div className="px-4 text-center">
            <div className="text-[11px] font-medium text-zinc-500">Cadastrados</div>
            <div className="text-xl font-bold font-mono-tabular text-zinc-900 mt-0.5">
              {stats.total}
            </div>
          </div>
          <div className="px-4 text-center">
            <div className="text-[11px] font-medium text-zinc-500">Com WhatsApp</div>
            <div className="text-xl font-bold font-mono-tabular text-emerald-700 mt-0.5">
              {stats.comTelefone}
            </div>
          </div>
          <div className="px-4 text-center">
            <div className="text-[11px] font-medium text-zinc-500">Sem WhatsApp</div>
            <div className="text-xl font-bold font-mono-tabular text-amber-600 mt-0.5">
              {stats.semTelefone}
            </div>
          </div>
          <div className="px-4 text-center">
            <div className="text-[11px] font-medium text-zinc-500">Aniversários</div>
            <div className="text-xl font-bold font-mono-tabular text-zinc-900 mt-0.5">
              {stats.aniversariantes}
            </div>
          </div>
        </div>
      </div>

      {needsProfileSchemaUpdate && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <div className="font-semibold text-sm">
                Atualização única necessária no banco Supabase (Fase 1)
              </div>
              <p className="text-amber-900 leading-relaxed">
                Para sincronizar aniversários, funções, turnos e parentesco entre todos os navegadores, execute o script{" "}
                <code className="font-mono-tabular font-semibold">
                  supabase/migration_fase1.sql
                </code>{" "}
                no SQL Editor do Supabase (ele apenas adiciona colunas novas, sem apagar nenhum dado).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyMigrationSql}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-800 text-white hover:bg-amber-900 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            {copiedMigrationSql ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>SQL copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar SQL da Fase 1</span>
              </>
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Manual Add + Extract from Image */}
        <div className="lg:col-span-5 space-y-5">
          {/* Manual Add Card */}
          <form
            onSubmit={handleManualAdd}
            className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-700" />
              <h2 className="font-display text-base font-semibold text-zinc-900">
                Cadastrar voluntário
              </h2>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="vol-new-name"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Nome completo ou como aparece na escala
                </label>
                <input
                  id="vol-new-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => setNewName((v) => formatVolunteerName(v))}
                  placeholder="Ex: Samuel Rebouças"
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label
                  htmlFor="vol-new-phone"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  WhatsApp (opcional)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="vol-new-phone"
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono-tabular border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!newName.trim()}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar à lista</span>
            </button>
          </form>

          {/* Image Extraction Card */}
          <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-zinc-900">
                Extrair voluntários de uma imagem
              </h2>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Envie uma foto ou print da planilha/lista. Todos os nomes serão extraídos para a lista e nomes iguais ou parecidos serão confirmados com você.
              </p>
            </div>

            <label className="flex flex-col items-center justify-center border border-dashed border-[#D6D3C9] bg-[#FAF9F5] rounded-xl p-6 text-center hover:border-emerald-700 hover:bg-emerald-50/30 transition-colors cursor-pointer">
              {isPreparingImage ? (
                <>
                  <Loader2 className="w-6 h-6 text-emerald-700 animate-spin mb-2" />
                  <span className="text-sm font-medium text-zinc-700">
                    Preparando imagem...
                  </span>
                </>
              ) : isExtracting ? (
                <>
                  <Loader2 className="w-6 h-6 text-emerald-700 animate-spin mb-2" />
                  <span className="text-sm font-medium text-zinc-700">
                    Extraindo todos os nomes da imagem...
                  </span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-zinc-400 mb-2" />
                  <span className="text-sm font-medium text-zinc-700">
                    Enviar imagem para extrair nomes
                  </span>
                  <span className="text-xs text-zinc-500 mt-0.5">
                    PNG, JPG ou foto da galeria/câmera
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isPreparingImage || isExtracting}
                className="sr-only"
              />
            </label>

            {imagePreview && (
              <div className="border border-[#E8E6DF] rounded-xl overflow-hidden bg-[#FAF9F5]">
                <img
                  src={imagePreview}
                  alt="Imagem enviada para extração de voluntários"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-48 object-contain"
                />
              </div>
            )}

            {extractError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{extractError}</span>
              </div>
            )}

            {importFeedback && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importFeedback}</span>
              </div>
            )}

            {extractedItems.length > 0 && (
              <div
                ref={resultsRef}
                className="border border-[#E8E6DF] rounded-xl overflow-hidden bg-[#FAF9F5]"
              >
                <div className="px-4 py-3 border-b border-[#EFECE4] bg-white flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-900">
                    Nomes extraídos ({selectedExtractedCount}/{extractedItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtractedItems([])}
                    className="text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  >
                    Descartar
                  </button>
                </div>

                <div className="divide-y divide-[#EFECE4] max-h-80 overflow-y-auto bg-white">
                  {extractedItems.map((item, idx) => {
                    const badge = getExtractedStatusBadge(item, idx);
                    return (
                      <div
                        key={`${item.name}-${item.role}-${idx}`}
                        className="p-3 flex items-start gap-2.5 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setExtractedItems((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, selected: checked } : row
                              )
                            );
                          }}
                          className="mt-1 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-700"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setExtractedItems((prev) =>
                                  prev.map((row, rIdx) =>
                                    rIdx === idx ? { ...row, name: val } : row
                                  )
                                );
                              }}
                              onBlur={() => {
                                setExtractedItems((prev) =>
                                  prev.map((row, rIdx) =>
                                    rIdx === idx
                                      ? { ...row, name: formatVolunteerName(row.name) }
                                      : row
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 text-xs font-semibold text-zinc-900 border border-[#E8E6DF] rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                            />
                            <span
                              className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded border whitespace-nowrap ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            Função na imagem: {item.role}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 border-t border-[#EFECE4] bg-[#FAF9F5]">
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={selectedExtractedCount === 0}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Salvar na lista de voluntários ({selectedExtractedCount})
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Aniversariantes + Full Directory */}
        <div className="lg:col-span-7 space-y-5">
          {monthOrTodayBirthdays.length > 0 && (
            <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-[#EFECE4] bg-[#FAF9F5] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cake className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h2 className="font-display text-sm font-bold text-zinc-950">
                    Aniversariantes de {currentMonthName}
                  </h2>
                  <span className="text-zinc-300 text-xs" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs font-mono-tabular text-zinc-500">
                    {monthOrTodayBirthdays.length}{" "}
                    {monthOrTodayBirthdays.length === 1 ? "pessoa" : "pessoas"}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500">
                  Mensagem editável na aba Modelos
                </span>
              </div>

              <div className="divide-y divide-[#EFECE4] max-h-72 overflow-y-auto">
                {monthOrTodayBirthdays.map(({ person, profile, status }) => {
                  const message = renderBirthdayMessage(
                    birthdayTemplate,
                    person.displayName
                  );
                  const waUrl = buildWhatsAppUrl(person.phone, message);
                  const hasPhone = person.phone.trim().length > 0;
                  const alreadySentThisYear =
                    profile.birthdaySentYear === currentYear;

                  return (
                    <div
                      key={`bday-${person.primaryKey}`}
                      className={`px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        status.isToday ? "bg-emerald-50/45" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-zinc-950 truncate">
                          {person.displayName}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                          <span className="font-mono-tabular font-semibold text-zinc-800">
                            {status.ddmm}
                          </span>
                          <span className="text-zinc-300" aria-hidden="true">
                            ·
                          </span>
                          {status.isToday ? (
                            <span className="font-semibold text-emerald-700">
                              Aniversário hoje!
                            </span>
                          ) : status.daysUntil <= 31 ? (
                            <span>
                              Em {status.daysUntil}{" "}
                              {status.daysUntil === 1 ? "dia" : "dias"}
                            </span>
                          ) : (
                            <span>Neste mês</span>
                          )}
                          <span className="text-zinc-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono-tabular">
                            {hasPhone
                              ? formatPhoneDisplay(person.phone)
                              : "Sem WhatsApp"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onMarkBirthdaySent(
                              person.primaryKey,
                              alreadySentThisYear ? null : currentYear
                            )
                          }
                          title={
                            alreadySentThisYear
                              ? `Desmarcar envio de ${currentYear}`
                              : `Marcar parabéns como enviado em ${currentYear}`
                          }
                          className={`h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors cursor-pointer ${
                            alreadySentThisYear
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-white border-[#E5E3DB] text-zinc-600 hover:bg-[#FAF9F5]"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {alreadySentThisYear
                              ? `Enviado (${currentYear})`
                              : "Marcar enviado"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleCopyBirthdayMessage(
                              person.primaryKey,
                              person.displayName
                            )
                          }
                          title="Copiar mensagem de parabéns"
                          className="h-8 w-8 inline-flex items-center justify-center text-zinc-600 border border-[#E5E3DB] bg-white hover:bg-[#FAF9F5] rounded-lg transition-colors cursor-pointer"
                        >
                          {copiedBirthdayKey === person.primaryKey ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {hasPhone ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              onMarkBirthdaySent(person.primaryKey, currentYear)
                            }
                            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 transition-colors"
                          >
                            <span>Enviar parabéns</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setProfileEditingKey(person.primaryKey)}
                            className="h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <span>Sem número</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#EFECE4] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg self-start">
                  {(
                    [
                      { id: "todos", label: `Todos (${stats.total})` },
                      { id: "com-telefone", label: `Com número (${stats.comTelefone})` },
                      { id: "sem-telefone", label: `Sem número (${stats.semTelefone})` },
                      { id: "aniversariantes", label: `Aniversariantes (${stats.aniversariantes})` },
                      { id: "sem-perfil", label: `Sem perfil (${stats.semPerfil})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterTab(tab.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                        filterTab === tab.id
                          ? "bg-white text-zinc-900 shadow-xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-56 shrink-0">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nome, função ou família..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E8E6DF] rounded-lg bg-[#FAF9F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F4F2EC]">
                <span className="text-xs text-zinc-500">
                  Exibindo {filteredPeople.length} de {peopleList.length} voluntários
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {onResetOfficialVolunteers && !confirmingOfficialReset && (
                    <button
                      type="button"
                      onClick={() => setConfirmingOfficialReset(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-[#FAF9F5] hover:bg-[#F2EFE7] border border-[#E5E3DB] rounded-lg transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurar lista oficial (145)</span>
                    </button>
                  )}
                  {onResetOfficialVolunteers && confirmingOfficialReset && (
                    <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                      <span className="text-[11px] font-medium text-amber-900">
                        Substituir pelos 145 oficiais?
                      </span>
                      <button
                        type="button"
                        disabled={isResettingOfficial}
                        onClick={async () => {
                          setIsResettingOfficial(true);
                          try {
                            await onResetOfficialVolunteers();
                            setConfirmingOfficialReset(false);
                          } finally {
                            setIsResettingOfficial(false);
                          }
                        }}
                        className="px-2 py-0.5 text-[11px] font-semibold bg-amber-700 text-white hover:bg-amber-800 rounded transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isResettingOfficial ? "Restaurando..." : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        disabled={isResettingOfficial}
                        onClick={() => setConfirmingOfficialReset(false)}
                        className="px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => exportVolunteersToExcel(peopleList, volunteerProfiles)}
                    disabled={peopleList.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Exportar Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportVolunteersToPdf(peopleList, volunteerProfiles)}
                    disabled={peopleList.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-[#EFECE4] max-h-[620px] overflow-y-auto">
              {filteredPeople.length === 0 ? (
                <div className="py-12 px-4 text-center text-sm text-zinc-500">
                  Nenhum voluntário encontrado neste filtro.
                </div>
              ) : (
                filteredPeople.map((person) => {
                  const isEditingThis = editingKey === person.primaryKey;
                  const profile =
                    volunteerProfiles[person.primaryKey] || EMPTY_VOLUNTEER_PROFILE;
                  const bdayStr = formatBirthdayDDMM(
                    profile.birthDay,
                    profile.birthMonth
                  );
                  const bdayStatus = getBirthdayStatus(
                    profile.birthDay,
                    profile.birthMonth,
                    nowDate
                  );
                  const shiftLabel = formatShiftPreferenceLabel(
                    profile.preferredShifts
                  );
                  const rolesText = profile.roles
                    .map((r) => ROLE_LABEL_BY_KEY[r] || r)
                    .join(", ");
                  const agesText = formatAgePreferencesLabel(
                    profile.preferredAges
                  );
                  const hasConfiguredProfile = Boolean(
                    bdayStr ||
                      profile.roles.length > 0 ||
                      profile.preferredAges.length > 0 ||
                      profile.preferredShifts.length > 0 ||
                      profile.familyGroupId
                  );

                  const commitEdit = () => {
                    const formatted = formatVolunteerName(editingNameDraft);
                    if (formatted) {
                      onRenameVolunteer(person.primaryKey, formatted);
                    }
                    setEditingKey(null);
                    setEditingNameDraft("");
                  };

                  return (
                    <div
                      key={person.primaryKey}
                      className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF9F5] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-semibold tracking-tight shrink-0 ${
                            person.phone.trim()
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-[#F4F2EC] text-zinc-700 border-[#E5E3DB]"
                          }`}
                          aria-hidden="true"
                        >
                          {person.displayName
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase() || "")
                            .join("") || "?"}
                        </div>

                        <div className="min-w-0 flex-1">
                          {isEditingThis ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                value={editingNameDraft}
                                onChange={(e) => setEditingNameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitEdit();
                                  } else if (e.key === "Escape") {
                                    setEditingKey(null);
                                    setEditingNameDraft("");
                                  }
                                }}
                                className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-semibold text-zinc-900 bg-white border border-emerald-700 rounded-lg focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={commitEdit}
                                title="Salvar nome"
                                aria-label="Salvar nome"
                                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shrink-0"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditingNameDraft("");
                                }}
                                title="Cancelar edição"
                                aria-label="Cancelar edição"
                                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center bg-[#F4F2EC] text-zinc-700 hover:bg-[#EAE6DC] rounded-lg transition-colors cursor-pointer shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="text-[14.5px] font-semibold text-zinc-950 truncate">
                                {person.displayName}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKey(person.primaryKey);
                                  setEditingNameDraft(person.displayName);
                                }}
                                title={`Editar nome de ${person.displayName}`}
                                aria-label={`Editar nome de ${person.displayName}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:text-emerald-800 bg-[#F4F2EC] hover:bg-emerald-50 border border-[#E5E3DB] hover:border-emerald-200 rounded-md transition-colors cursor-pointer shrink-0"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Editar</span>
                              </button>
                            </div>
                          )}

                          <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-zinc-500">
                            {person.aliases.length > 0 ? (
                              <span className="text-emerald-700">
                                Também vinculado a: {person.aliases.join(", ")}
                              </span>
                            ) : person.phone.trim() ? (
                              <span>WhatsApp vinculado</span>
                            ) : (
                              <span className="text-amber-700">
                                Sem WhatsApp cadastrado
                              </span>
                            )}

                            {bdayStr && (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span
                                  className={`font-mono-tabular ${
                                    bdayStatus.isToday
                                      ? "font-semibold text-emerald-700"
                                      : "text-zinc-700"
                                  }`}
                                >
                                  Aniv. {bdayStr}
                                  {bdayStatus.isToday ? " (Hoje!)" : ""}
                                </span>
                              </>
                            )}

                            {rolesText && (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-zinc-700 truncate max-w-[240px]">
                                  {rolesText}
                                </span>
                              </>
                            )}

                            {agesText && (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-zinc-700 truncate max-w-[300px]">
                                  {agesText}
                                </span>
                              </>
                            )}

                            {shiftLabel && (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-zinc-600">{shiftLabel}</span>
                              </>
                            )}

                            {profile.familyGroupName && (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-emerald-800 font-medium">
                                  {profile.familyGroupName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto pl-12 sm:pl-0">
                        <button
                          type="button"
                          onClick={() => setProfileEditingKey(person.primaryKey)}
                          title="Configurar aniversário, funções, turnos e parentesco"
                          className={`min-h-[38px] inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            hasConfiguredProfile
                              ? "bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70"
                              : "bg-[#FAF9F5] text-zinc-700 border-[#E5E3DB] hover:bg-[#F2EFE7]"
                          }`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Perfil</span>
                        </button>
                        <VolunteerPhoneInput
                          initialPhone={person.phone}
                          onCommit={(val) =>
                            onSavePersonPhone(person.displayName, val)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => onDeleteVolunteer(person.primaryKey)}
                          title="Remover da lista de contatos"
                          className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                          aria-label={`Remover ${person.displayName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Saved identity links */}
          {contactLinks.length > 0 && (
            <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-5 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>Confirmações de nomes salvas ({contactLinks.length})</span>
              </h3>
              <div className="divide-y divide-[#EFECE4] border border-[#E8E6DF] rounded-xl overflow-hidden bg-[#FAF9F5]">
                {contactLinks.map((link) => (
                  <div
                    key={link.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 text-zinc-700">
                      {link.nameKeyA === link.nameKeyB ? (
                        <>
                          <span className="font-medium text-zinc-900">
                            {link.displayNameA}
                          </span>{" "}
                          <span className="text-emerald-700 font-medium">
                            confirmado como pessoa única
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-zinc-900">
                            {link.displayNameA}
                          </span>{" "}
                          <span
                            className={
                              link.relation === "same"
                                ? "text-emerald-700 font-medium"
                                : "text-amber-700 font-medium"
                            }
                          >
                            {link.relation === "same"
                              ? "= mesma pessoa que"
                              : "≠ distinto de"}
                          </span>{" "}
                          <span className="font-medium text-zinc-900">
                            {link.displayNameB}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveLink(link.id)}
                      title="Desfazer vínculo"
                      className="p-1.5 text-zinc-400 hover:text-red-600 rounded-md transition-colors cursor-pointer shrink-0"
                      aria-label="Desfazer vínculo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <VolunteerProfileModal
        isOpen={Boolean(profileEditingPerson)}
        volunteerKey={profileEditingPerson?.primaryKey || null}
        volunteerName={profileEditingPerson?.displayName || ""}
        volunteerPhone={profileEditingPerson?.phone || ""}
        currentProfile={
          (profileEditingPerson &&
            volunteerProfiles[profileEditingPerson.primaryKey]) ||
          EMPTY_VOLUNTEER_PROFILE
        }
        allPeople={peopleList}
        volunteerProfiles={volunteerProfiles}
        onClose={() => setProfileEditingKey(null)}
        onSave={onSaveVolunteerProfile}
      />
    </div>
  );
}

function VolunteerPhoneInput({
  initialPhone,
  onCommit,
}: {
  initialPhone: string;
  onCommit: (phone: string) => void;
}) {
  const [draft, setDraft] = useState(initialPhone);
  const isFocusedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const lastCommittedRef = useRef(initialPhone.trim());

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(initialPhone);
      lastCommittedRef.current = initialPhone.trim();
    }
  }, [initialPhone]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const flushCommit = (value: string) => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = value.trim();
    if (trimmed !== lastCommittedRef.current) {
      lastCommittedRef.current = trimmed;
      onCommit(trimmed);
    }
  };

  return (
    <div className="relative flex-1 sm:w-52">
      <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="tel"
        value={draft}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onChange={(e) => {
          const val = e.target.value;
          setDraft(val);
          if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
          }
          debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            const trimmed = val.trim();
            if (trimmed !== lastCommittedRef.current) {
              lastCommittedRef.current = trimmed;
              onCommit(trimmed);
            }
          }, 700);
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          flushCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            flushCommit(draft);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="Adicionar WhatsApp"
        className="w-full pl-8 pr-3 py-2 text-xs font-mono-tabular border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
    </div>
  );
}
