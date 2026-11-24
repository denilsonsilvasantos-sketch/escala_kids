import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  X,
  Cake,
  Clock,
  Briefcase,
  Users,
  Check,
  Search,
  Trash2,
  Baby,
} from "lucide-react";
import type {
  FamilySyncMode,
  ShiftType,
  VolunteerAgeKey,
  VolunteerProfile,
  VolunteerRoleKey,
} from "../types/schedule";
import {
  EMPTY_VOLUNTEER_PROFILE,
  formatBirthdayDDMM,
  formatBirthdayInputMask,
  MONTH_NAMES_PT,
  parseBirthdayInputBR,
  VOLUNTEER_AGE_OPTIONS,
  VOLUNTEER_AGE_OPTIONS_MANHA,
  VOLUNTEER_AGE_OPTIONS_NOITE,
  VOLUNTEER_ROLE_OPTIONS,
} from "../utils/volunteerRoles";
import { normalizeNameKey } from "../utils/contacts";
import { formatPhoneDisplay } from "../utils/dateAndMessage";

interface FamilyUpdatePayload {
  familyGroupId: string;
  familyGroupName: string;
  familySyncMode: FamilySyncMode;
  memberKeys: string[];
  removedKeys: string[];
}

interface VolunteerProfileModalProps {
  isOpen: boolean;
  volunteerKey: string | null;
  volunteerName: string;
  volunteerPhone: string;
  currentProfile: VolunteerProfile;
  allPeople: { primaryKey: string; displayName: string; phone: string }[];
  volunteerProfiles: Record<string, VolunteerProfile>;
  onClose: () => void;
  onSave: (params: {
    nameKey: string;
    volunteerName: string;
    profile: VolunteerProfile;
    familyUpdate?: FamilyUpdatePayload | null;
  }) => void;
}

interface ExistingFamilyOption {
  id: string;
  name: string;
  syncMode: FamilySyncMode;
  memberKeys: string[];
}

export function VolunteerProfileModal({
  isOpen,
  volunteerKey,
  volunteerName,
  volunteerPhone,
  currentProfile,
  allPeople,
  volunteerProfiles,
  onClose,
  onSave,
}: VolunteerProfileModalProps) {
  const [birthDateInput, setBirthDateInput] = useState("");
  const [birthError, setBirthError] = useState<string | null>(null);
  const [roles, setRoles] = useState<VolunteerRoleKey[]>([]);
  const [preferredAges, setPreferredAges] = useState<VolunteerAgeKey[]>([]);
  const [preferredShifts, setPreferredShifts] = useState<ShiftType[]>([]);
  const [familySelection, setFamilySelection] = useState<string>("none"); // "none" | "new" | existing familyGroupId
  const [familyGroupName, setFamilyGroupName] = useState("");
  const [familySyncMode, setFamilySyncMode] =
    useState<FamilySyncMode>("same_shift");
  const [selectedRelativeKeys, setSelectedRelativeKeys] = useState<string[]>(
    []
  );
  const [relativeSearch, setRelativeSearch] = useState("");

  // Track which volunteerKey the open modal was initialized for so background cloud syncs NEVER wipe user edits
  const initializedForKeyRef = useRef<string | null>(null);

  const existingFamilies = useMemo<ExistingFamilyOption[]>(() => {
    const map = new Map<string, ExistingFamilyOption>();
    for (const person of allPeople) {
      const prof = volunteerProfiles[person.primaryKey];
      if (!prof?.familyGroupId) continue;
      const existing = map.get(prof.familyGroupId);
      if (existing) {
        existing.memberKeys.push(person.primaryKey);
        if (!existing.name && prof.familyGroupName) {
          existing.name = prof.familyGroupName;
        }
      } else {
        map.set(prof.familyGroupId, {
          id: prof.familyGroupId,
          name: prof.familyGroupName || "Família sem nome",
          syncMode: prof.familySyncMode || "same_shift",
          memberKeys: [person.primaryKey],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [allPeople, volunteerProfiles]);

  useEffect(() => {
    if (!isOpen || !volunteerKey) {
      initializedForKeyRef.current = null;
      return;
    }
    if (initializedForKeyRef.current === volunteerKey) {
      return;
    }
    initializedForKeyRef.current = volunteerKey;

    setBirthDateInput(
      formatBirthdayDDMM(currentProfile.birthDay, currentProfile.birthMonth)
    );
    setBirthError(null);
    setRoles(currentProfile.roles || []);
    setPreferredAges(currentProfile.preferredAges || []);
    setPreferredShifts(currentProfile.preferredShifts || []);
    setRelativeSearch("");

    if (currentProfile.familyGroupId) {
      setFamilySelection(currentProfile.familyGroupId);
      setFamilyGroupName(currentProfile.familyGroupName || "");
      setFamilySyncMode(currentProfile.familySyncMode || "same_shift");
      const fam = existingFamilies.find(
        (f) => f.id === currentProfile.familyGroupId
      );
      setSelectedRelativeKeys(
        (fam?.memberKeys || []).filter((k) => k !== volunteerKey)
      );
    } else {
      setFamilySelection("none");
      setFamilyGroupName("");
      setFamilySyncMode("same_shift");
      setSelectedRelativeKeys([]);
    }
  }, [isOpen, volunteerKey, currentProfile, existingFamilies]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const parsedBirthdayPreview = useMemo(
    () => parseBirthdayInputBR(birthDateInput),
    [birthDateInput]
  );

  const filteredOtherPeople = useMemo(() => {
    if (!volunteerKey) return [];
    const q = normalizeNameKey(relativeSearch);
    const selectedSet = new Set(selectedRelativeKeys);
    return allPeople
      .filter((p) => p.primaryKey !== volunteerKey)
      .filter((p) => {
        if (!q) return true;
        return (
          normalizeNameKey(p.displayName).includes(q) ||
          p.phone.includes(relativeSearch.trim())
        );
      })
      .sort((a, b) => {
        const aSel = selectedSet.has(a.primaryKey) ? 0 : 1;
        const bSel = selectedSet.has(b.primaryKey) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return a.displayName.localeCompare(b.displayName, "pt-BR");
      });
  }, [allPeople, volunteerKey, relativeSearch, selectedRelativeKeys]);

  if (!isOpen || !volunteerKey) return null;

  const toggleRole = (roleKey: VolunteerRoleKey) => {
    setRoles((prev) =>
      prev.includes(roleKey)
        ? prev.filter((r) => r !== roleKey)
        : [...prev, roleKey]
    );
  };

  const toggleAge = (ageKey: VolunteerAgeKey) => {
    setPreferredAges((prev) =>
      prev.includes(ageKey)
        ? prev.filter((a) => a !== ageKey)
        : [...prev, ageKey]
    );
  };

  const toggleShift = (shift: ShiftType) => {
    setPreferredShifts((prev) =>
      prev.includes(shift)
        ? prev.filter((s) => s !== shift)
        : [...prev, shift]
    );
  };

  const toggleRelative = (key: string) => {
    setSelectedRelativeKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleFamilySelectionChange = (val: string) => {
    setFamilySelection(val);
    if (val === "none") {
      setFamilyGroupName("");
      setSelectedRelativeKeys([]);
      return;
    }
    if (val === "new") {
      const surnameParts = volunteerName.trim().split(/\s+/);
      const lastWord =
        surnameParts.length > 1 ? surnameParts[surnameParts.length - 1] : "";
      setFamilyGroupName(lastWord ? `Família ${lastWord}` : "");
      setFamilySyncMode("same_shift");
      setSelectedRelativeKeys([]);
      return;
    }
    const chosen = existingFamilies.find((f) => f.id === val);
    if (chosen) {
      setFamilyGroupName(chosen.name);
      setFamilySyncMode(chosen.syncMode);
      setSelectedRelativeKeys(
        chosen.memberKeys.filter((k) => k !== volunteerKey)
      );
    }
  };

  const handleBirthdayInputChange = (raw: string) => {
    const masked = formatBirthdayInputMask(raw, birthDateInput);
    setBirthDateInput(masked);
    if (birthError) setBirthError(null);
  };

  const handleBirthdayBlur = () => {
    const parsed = parseBirthdayInputBR(birthDateInput);
    if (!parsed.empty && parsed.valid && parsed.birthDay && parsed.birthMonth) {
      setBirthDateInput(
        formatBirthdayDDMM(parsed.birthDay, parsed.birthMonth)
      );
      setBirthError(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsedBirthday = parseBirthdayInputBR(birthDateInput);
    if (!parsedBirthday.valid) {
      setBirthError("Digite uma data válida no formato DD/MM (ex: 24/11).");
      return;
    }

    const hasFamily = familySelection !== "none";
    const resolvedFamilyId = !hasFamily
      ? ""
      : familySelection === "new"
        ? `fam-${Date.now().toString(36)}`
        : familySelection;
    const resolvedFamilyName = hasFamily
      ? familyGroupName.trim() || `Família de ${volunteerName.split(" ")[0]}`
      : "";

    const nextProfile: VolunteerProfile = {
      ...EMPTY_VOLUNTEER_PROFILE,
      birthDay: parsedBirthday.birthDay,
      birthMonth: parsedBirthday.birthMonth,
      roles,
      preferredAges,
      preferredShifts,
      familyGroupId: resolvedFamilyId,
      familyGroupName: resolvedFamilyName,
      familySyncMode: hasFamily ? familySyncMode : "same_shift",
      birthdaySentYear: currentProfile.birthdaySentYear ?? null,
    };

    let familyUpdate: FamilyUpdatePayload | null = null;
    if (hasFamily && resolvedFamilyId) {
      const targetExisting = existingFamilies.find(
        (f) => f.id === resolvedFamilyId
      );
      const previousMembers = targetExisting ? targetExisting.memberKeys : [];
      const memberKeys = Array.from(
        new Set([volunteerKey, ...selectedRelativeKeys])
      );
      const memberSet = new Set(memberKeys);
      const removedKeys = previousMembers.filter((k) => !memberSet.has(k));

      familyUpdate = {
        familyGroupId: resolvedFamilyId,
        familyGroupName: resolvedFamilyName,
        familySyncMode,
        memberKeys,
        removedKeys,
      };
    } else if (!hasFamily && currentProfile.familyGroupId) {
      familyUpdate = {
        familyGroupId: currentProfile.familyGroupId,
        familyGroupName: currentProfile.familyGroupName,
        familySyncMode: currentProfile.familySyncMode,
        memberKeys: [],
        removedKeys: [volunteerKey],
      };
    }

    onSave({
      nameKey: volunteerKey,
      volunteerName,
      profile: nextProfile,
      familyUpdate,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vol-profile-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0">
            <h2
              id="vol-profile-modal-title"
              className="font-display text-base sm:text-lg font-semibold text-zinc-950 truncate"
            >
              Perfil de {volunteerName}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono-tabular truncate">
              {volunteerPhone
                ? formatPhoneDisplay(volunteerPhone)
                : "Sem WhatsApp cadastrado"}{" "}
              · Aniversário, funções, idades, turnos e parentesco
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-zinc-600 hover:text-zinc-900 rounded-lg bg-[#F4F2EC] hover:bg-[#EAE6DC] cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-6">
            {/* 1. Aniversário (estilo BR DD/MM) */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cake className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Aniversário (dia e mês)
                  </h3>
                </div>
                {birthDateInput.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      setBirthDateInput("");
                      setBirthError(null);
                    }}
                    className="text-xs font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                  >
                    Limpar data
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <input
                  id="profile-birth-br"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={birthDateInput}
                  onChange={(e) => handleBirthdayInputChange(e.target.value)}
                  onBlur={handleBirthdayBlur}
                  placeholder="Ex: 24/11"
                  className={`w-full sm:w-44 px-3.5 py-2 text-sm font-mono-tabular border rounded-lg bg-white focus:outline-none focus:ring-2 ${
                    birthError
                      ? "border-red-400 focus:ring-red-500"
                      : "border-[#E8E6DF] focus:ring-emerald-700"
                  }`}
                />

                {!birthError &&
                  !parsedBirthdayPreview.empty &&
                  parsedBirthdayPreview.valid &&
                  parsedBirthdayPreview.birthDay &&
                  parsedBirthdayPreview.birthMonth && (
                    <span className="text-xs font-medium text-emerald-700">
                      {String(parsedBirthdayPreview.birthDay).padStart(2, "0")} de{" "}
                      {MONTH_NAMES_PT[parsedBirthdayPreview.birthMonth - 1]}
                    </span>
                  )}

                {!birthError && birthDateInput.trim() === "" && (
                  <span className="text-xs text-zinc-500">
                    Digite no padrão brasileiro DD/MM (não precisa do ano).
                  </span>
                )}
              </div>

              {birthError && (
                <p className="text-xs font-medium text-red-600">{birthError}</p>
              )}
            </section>

            <hr className="border-[#EFECE4]" />

            {/* 2. Turnos Preferidos */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-zinc-900">
                  Turnos em que deseja servir
                </h3>
              </div>
              <p className="text-xs text-zinc-500">
                Pode marcar apenas um turno ou os dois cultos de domingo.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      key: "manha" as const,
                      title: "Culto da Manhã",
                      subtitle: "Oração às 9:45hs",
                    },
                    {
                      key: "noite" as const,
                      title: "Culto da Noite",
                      subtitle: "Oração às 18hs",
                    },
                  ]
                ).map((item) => {
                  const active = preferredShifts.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleShift(item.key)}
                      className={`px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        active
                          ? "bg-emerald-50 border-emerald-600 text-emerald-950"
                          : "bg-[#FAF9F5] border-[#E8E6DF] text-zinc-700 hover:bg-white"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{item.title}</div>
                        <div className="text-[11px] text-zinc-500">
                          {item.subtitle}
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          active
                            ? "bg-emerald-700 border-emerald-700 text-white"
                            : "bg-white border-zinc-300"
                        }`}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <hr className="border-[#EFECE4]" />

            {/* 3. Funções que exerce */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Funções que exerce ({roles.length})
                  </h3>
                </div>
                {roles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRoles([])}
                    className="text-xs font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                  >
                    Limpar funções
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Selecione uma ou mais funções em que o voluntário atua.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOLUNTEER_ROLE_OPTIONS.map((opt) => {
                  const active = roles.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleRole(opt.key)}
                      className={`px-3 py-2 rounded-lg border text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        active
                          ? "bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold"
                          : "bg-white border-[#E8E6DF] text-zinc-700 hover:bg-[#FAF9F5]"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {active && (
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <hr className="border-[#EFECE4]" />

            {/* 4. Faixas Etárias Preferidas (Manhã e Noite separados) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Baby className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Faixas etárias que aceita servir ({preferredAges.length})
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPreferredAges(VOLUNTEER_AGE_OPTIONS.map((a) => a.key))
                    }
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    Marcar todas
                  </button>
                  {preferredAges.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreferredAges([])}
                      className="text-xs font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                    >
                      Limpar tudo
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Para Professor(a), Auxiliar e Louvor: selecione separadamente as turmas da <strong>Manhã</strong> e da <strong>Noite</strong> (ex.: na Noite apenas <strong>11 e 12 anos</strong>). Se deixar tudo desmarcado, poderá atuar em qualquer idade.
              </p>

              <div className="space-y-3">
                {/* Bloco Manhã */}
                {(() => {
                  const manhaKeys = VOLUNTEER_AGE_OPTIONS_MANHA.map((a) => a.key);
                  const manhaSelectedCount = manhaKeys.filter((k) =>
                    preferredAges.includes(k)
                  ).length;
                  return (
                    <div className="p-3.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-800">
                          Culto da Manhã ({manhaSelectedCount}/
                          {VOLUNTEER_AGE_OPTIONS_MANHA.length})
                        </span>
                        <div className="flex items-center gap-2.5">
                          {manhaSelectedCount <
                            VOLUNTEER_AGE_OPTIONS_MANHA.length && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreferredAges((prev) =>
                                  Array.from(new Set([...prev, ...manhaKeys]))
                                )
                              }
                              className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
                            >
                              Todas da manhã
                            </button>
                          )}
                          {manhaSelectedCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreferredAges((prev) =>
                                  prev.filter((k) => !k.startsWith("manha:"))
                                )
                              }
                              className="text-[11px] font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {VOLUNTEER_AGE_OPTIONS_MANHA.map((ageOpt) => {
                          const active = preferredAges.includes(ageOpt.key);
                          return (
                            <button
                              key={ageOpt.key}
                              type="button"
                              onClick={() => toggleAge(ageOpt.key)}
                              className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                                active
                                  ? "bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold"
                                  : "bg-white border-[#E8E6DF] text-zinc-700 hover:bg-zinc-50 font-medium"
                              }`}
                            >
                              <span className="text-xs truncate">
                                {ageOpt.label}
                              </span>
                              {active && (
                                <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Bloco Noite */}
                {(() => {
                  const noiteKeys = VOLUNTEER_AGE_OPTIONS_NOITE.map((a) => a.key);
                  const noiteSelectedCount = noiteKeys.filter((k) =>
                    preferredAges.includes(k)
                  ).length;
                  return (
                    <div className="p-3.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-800">
                          Culto da Noite ({noiteSelectedCount}/
                          {VOLUNTEER_AGE_OPTIONS_NOITE.length})
                        </span>
                        <div className="flex items-center gap-2.5">
                          {noiteSelectedCount <
                            VOLUNTEER_AGE_OPTIONS_NOITE.length && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreferredAges((prev) =>
                                  Array.from(new Set([...prev, ...noiteKeys]))
                                )
                              }
                              className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
                            >
                              Todas da noite
                            </button>
                          )}
                          {noiteSelectedCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreferredAges((prev) =>
                                  prev.filter((k) => !k.startsWith("noite:"))
                                )
                              }
                              className="text-[11px] font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {VOLUNTEER_AGE_OPTIONS_NOITE.map((ageOpt) => {
                          const active = preferredAges.includes(ageOpt.key);
                          return (
                            <button
                              key={ageOpt.key}
                              type="button"
                              onClick={() => toggleAge(ageOpt.key)}
                              className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                                active
                                  ? "bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold"
                                  : "bg-white border-[#E8E6DF] text-zinc-700 hover:bg-zinc-50 font-medium"
                              }`}
                            >
                              <span className="text-xs truncate">
                                {ageOpt.label}
                              </span>
                              {active && (
                                <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>

            <hr className="border-[#EFECE4]" />

            {/* 5. Parentesco / Família */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Parentesco / Grupo familiar
                  </h3>
                </div>
                {familySelection !== "none" && (
                  <button
                    type="button"
                    onClick={() => handleFamilySelectionChange("none")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Desvincular família</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Parentes vinculados no mesmo grupo familiar serão priorizados para servir no mesmo domingo.
              </p>

              <div>
                <label
                  htmlFor="profile-family-select"
                  className="block text-xs font-medium text-zinc-600 mb-1"
                >
                  Grupo familiar
                </label>
                <select
                  id="profile-family-select"
                  value={familySelection}
                  onChange={(e) => handleFamilySelectionChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="none">Sem vínculo de parentesco</option>
                  <option value="new">+ Criar novo grupo familiar</option>
                  {existingFamilies.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.name} ({fam.memberKeys.length}{" "}
                      {fam.memberKeys.length === 1 ? "membro" : "membros"})
                    </option>
                  ))}
                </select>
              </div>

              {familySelection !== "none" && (
                <div className="p-4 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="profile-family-name"
                        className="block text-xs font-medium text-zinc-700 mb-1"
                      >
                        Nome da família / grupo
                      </label>
                      <input
                        id="profile-family-name"
                        type="text"
                        value={familyGroupName}
                        onChange={(e) => setFamilyGroupName(e.target.value)}
                        placeholder="Ex: Família Martins"
                        className="w-full px-3 py-2 text-xs border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="profile-family-mode"
                        className="block text-xs font-medium text-zinc-700 mb-1"
                      >
                        Regra ao escalar parentes
                      </label>
                      <select
                        id="profile-family-mode"
                        value={familySyncMode}
                        onChange={(e) =>
                          setFamilySyncMode(
                            e.target.value === "same_day"
                              ? "same_day"
                              : "same_shift"
                          )
                        }
                        className="w-full px-3 py-2 text-xs border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      >
                        <option value="same_shift">
                          Mesmo domingo e mesmo culto
                        </option>
                        <option value="same_day">
                          Mesmo domingo (qualquer culto)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-700">
                        Parentes neste grupo ({selectedRelativeKeys.length + 1}{" "}
                        incluindo {volunteerName.split(" ")[0]})
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={relativeSearch}
                        onChange={(e) => setRelativeSearch(e.target.value)}
                        placeholder="Buscar voluntário para vincular como parente..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto border border-[#E8E6DF] rounded-lg bg-white divide-y divide-[#EFECE4]">
                      {filteredOtherPeople.length === 0 ? (
                        <div className="p-3 text-xs text-zinc-500 text-center">
                          Nenhum voluntário encontrado.
                        </div>
                      ) : (
                        filteredOtherPeople.map((person) => {
                          const checked = selectedRelativeKeys.includes(
                            person.primaryKey
                          );
                          const otherFam =
                            volunteerProfiles[person.primaryKey]?.familyGroupName;
                          const otherFamId =
                            volunteerProfiles[person.primaryKey]?.familyGroupId;
                          return (
                            <label
                              key={person.primaryKey}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[#FAF9F5] cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleRelative(person.primaryKey)
                                  }
                                  className="rounded border-zinc-300 text-emerald-700 focus:ring-emerald-700 shrink-0"
                                />
                                <span className="font-medium text-zinc-900 truncate">
                                  {person.displayName}
                                </span>
                              </div>
                              {otherFam && otherFamId !== familySelection && (
                                <span className="text-[11px] text-zinc-400 shrink-0 truncate max-w-[140px]">
                                  {otherFam}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[#EFECE4] bg-[#FAF9F5] flex items-center justify-end gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200/50 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg cursor-pointer"
            >
              Salvar perfil
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
