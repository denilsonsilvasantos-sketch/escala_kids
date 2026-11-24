import { useState, useEffect, useMemo, type FormEvent } from "react";
import { X, Phone } from "lucide-react";
import type {
  ContactLink,
  GroupDefinition,
  ShiftType,
  VolunteerProfile,
} from "../types/schedule";
import { SCHEDULE_GROUPS } from "../data/initialData";
import { formatDateDDMM, formatPhoneDisplay } from "../utils/dateAndMessage";
import {
  formatVolunteerName,
  lookupPhoneInBook,
  normalizeNameKey,
} from "../utils/contacts";
import {
  formatAgePreferencesLabel,
  formatShiftPreferenceLabel,
  getRoleKeyForGroupId,
  hasAgeSensitiveRole,
  matchesAgePreference,
  ROLE_LABEL_BY_KEY,
} from "../utils/volunteerRoles";

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  sundayISO: string;
  initialShift?: ShiftType;
  initialGroupId?: string;
  contactBook: Record<string, string>;
  contactNames: Record<string, string>;
  contactLinks: ContactLink[];
  volunteerProfiles?: Record<string, VolunteerProfile>;
  onAddEntry: (entry: {
    date: string;
    shift: ShiftType;
    groupId: string;
    volunteerName: string;
    phone: string;
  }) => void;
}

export function QuickAddModal({
  isOpen,
  onClose,
  sundayISO,
  initialShift = "noite",
  initialGroupId,
  contactBook,
  contactNames,
  contactLinks,
  volunteerProfiles = {},
  onAddEntry,
}: QuickAddModalProps) {
  const [shift, setShift] = useState<ShiftType>(initialShift);
  const shiftGroups: GroupDefinition[] = SCHEDULE_GROUPS.filter(
    (g) => g.shift === shift
  );
  const [groupId, setGroupId] = useState<string>(
    initialGroupId && initialGroupId.startsWith(initialShift)
      ? initialGroupId
      : shiftGroups[0]?.id || ""
  );
  const [volunteerName, setVolunteerName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneWasAutoFilled, setPhoneWasAutoFilled] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShift(initialShift);
    const matching = SCHEDULE_GROUPS.filter((g) => g.shift === initialShift);
    setGroupId(
      initialGroupId && initialGroupId.startsWith(initialShift)
        ? initialGroupId
        : matching[0]?.id || ""
    );
    setPhoneWasAutoFilled(false);
  }, [isOpen, initialShift, initialGroupId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const targetRoleKey = useMemo(() => getRoleKeyForGroupId(groupId), [groupId]);

  const savedSuggestions = useMemo(() => {
    const q = normalizeNameKey(volunteerName);
    const seen = new Set<string>();
    const allKeys = new Set<string>([
      ...Object.keys(contactNames),
      ...Object.keys(contactBook),
    ]);

    const candidates: {
      key: string;
      name: string;
      phone: string;
      matchesRole: boolean;
      matchesShift: boolean;
      ageMatch: "match" | "mismatch" | "any";
      preferredAgesLabel: string;
      shiftHint: string;
      familyName: string;
      score: number;
    }[] = [];

    for (const rawKey of allKeys) {
      const norm = normalizeNameKey(rawKey);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);

      const display = formatVolunteerName(
        contactNames[norm] || contactNames[rawKey] || rawKey
      );
      if (!display) continue;

      const savedPhone = (contactBook[norm] || contactBook[rawKey] || "").trim();
      const prof = volunteerProfiles[norm];
      const matchesRole = Boolean(prof?.roles?.includes(targetRoleKey));
      const matchesShift = Boolean(prof?.preferredShifts?.includes(shift));
      const scopedAges =
        prof && hasAgeSensitiveRole(prof.roles) ? prof.preferredAges : [];
      const ageMatch = matchesAgePreference(scopedAges, groupId);
      const preferredAgesLabel = formatAgePreferencesLabel(scopedAges);

      if (q) {
        const normDisplay = normalizeNameKey(display);
        if (!normDisplay.includes(q) || normDisplay === q) continue;
      } else {
        // Without search text, exclude incompatible age brackets and require at least one match
        if (ageMatch === "mismatch") continue;
        if (!matchesRole && !matchesShift && ageMatch !== "match") continue;
      }

      const score =
        (matchesRole ? 10 : 0) +
        (ageMatch === "match" ? 8 : ageMatch === "mismatch" ? -25 : 0) +
        (matchesShift ? 5 : 0) +
        (savedPhone ? 1 : 0);

      candidates.push({
        key: norm,
        name: display,
        phone: savedPhone,
        matchesRole,
        matchesShift,
        ageMatch,
        preferredAgesLabel,
        shiftHint: formatShiftPreferenceLabel(prof?.preferredShifts || []),
        familyName: prof?.familyGroupName || "",
        score,
      });
    }

    return candidates
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name, "pt-BR");
      })
      .slice(0, 6);
  }, [volunteerName, contactBook, contactNames, volunteerProfiles, targetRoleKey, shift, groupId]);

  if (!isOpen) return null;

  const handleShiftChange = (nextShift: ShiftType) => {
    setShift(nextShift);
    const first = SCHEDULE_GROUPS.find((g) => g.shift === nextShift);
    if (first) setGroupId(first.id);
  };

  const handleNameChange = (name: string) => {
    setVolunteerName(name);
    const matchedPhone = lookupPhoneInBook(name, contactBook, contactLinks);
    if (matchedPhone) {
      if (!phone || phoneWasAutoFilled) {
        setPhone(matchedPhone);
        setPhoneWasAutoFilled(true);
      }
    } else if (phoneWasAutoFilled) {
      setPhone("");
      setPhoneWasAutoFilled(false);
    }
  };

  const handlePickSuggestion = (name: string, savedPhone: string) => {
    setVolunteerName(name);
    setPhone(savedPhone);
    setPhoneWasAutoFilled(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const formattedName = formatVolunteerName(volunteerName);
    if (!formattedName || !groupId) return;
    onAddEntry({
      date: sundayISO,
      shift,
      groupId,
      volunteerName: formattedName,
      phone: phone.trim(),
    });
    setVolunteerName("");
    setPhone("");
    setPhoneWasAutoFilled(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="quick-add-title"
              className="font-display text-base font-semibold text-zinc-900 truncate"
            >
              Adicionar voluntário
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono-tabular">
              Domingo {formatDateDDMM(sundayISO)}
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
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Culto
              </label>
              <div className="flex p-1 bg-[#F4F2EC] rounded-lg">
                <button
                  type="button"
                  onClick={() => handleShiftChange("manha")}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    shift === "manha"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600"
                  }`}
                >
                  Culto da Manhã
                </button>
                <button
                  type="button"
                  onClick={() => handleShiftChange("noite")}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    shift === "noite"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600"
                  }`}
                >
                  Culto da Noite
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-add-group"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Grupo / Turma
              </label>
              <select
                id="quick-add-group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                {shiftGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="quick-add-name"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Nome do voluntário
              </label>
              <input
                id="quick-add-name"
                type="text"
                required
                value={volunteerName}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => setVolunteerName((v) => formatVolunteerName(v))}
                placeholder="Ex: Amanda Saragoça"
                className="w-full px-3 py-2.5 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              {savedSuggestions.length > 0 && (
                <div className="mt-2.5 border border-[#E8E6DF] rounded-xl bg-[#FAF9F5] overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-[#EFECE4] text-[11px] font-medium text-zinc-500">
                    {volunteerName.trim()
                      ? `Sugestões encontradas (${ROLE_LABEL_BY_KEY[targetRoleKey]})`
                      : `Compatíveis com ${ROLE_LABEL_BY_KEY[targetRoleKey]} · ${shift === "manha" ? "Manhã" : "Noite"}`}
                  </div>
                  <div className="divide-y divide-[#EFECE4] max-h-44 overflow-y-auto bg-white">
                    {savedSuggestions.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handlePickSuggestion(item.name, item.phone)}
                        className="w-full px-3 py-2 text-left hover:bg-emerald-50/60 transition-colors cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-zinc-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-x-1.5">
                            <span className="font-mono-tabular">
                              {item.phone
                                ? formatPhoneDisplay(item.phone)
                                : "Sem WhatsApp"}
                            </span>
                            {item.ageMatch === "mismatch" ? (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-amber-700 font-medium">
                                  Outra idade (prefere {item.preferredAgesLabel})
                                </span>
                              </>
                            ) : (
                              (item.matchesRole ||
                                item.matchesShift ||
                                item.ageMatch === "match") && (
                                <>
                                  <span className="text-zinc-300" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="text-emerald-700 font-medium">
                                    {item.matchesRole &&
                                    item.matchesShift &&
                                    item.ageMatch === "match"
                                      ? "Função, turno e idade"
                                      : item.matchesRole && item.ageMatch === "match"
                                        ? "Função e idade"
                                        : item.matchesShift &&
                                            item.ageMatch === "match"
                                          ? "Turno e idade"
                                          : item.matchesRole && item.matchesShift
                                            ? "Função e turno"
                                            : item.ageMatch === "match"
                                              ? "Mesma idade"
                                              : item.matchesRole
                                                ? "Mesma função"
                                                : `Turno ${item.shiftHint}`}
                                  </span>
                                </>
                              )
                            )}
                            {item.familyName && (
                              <>
                                <span className="text-zinc-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="truncate">{item.familyName}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                          Selecionar
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="quick-add-phone"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                WhatsApp {phoneWasAutoFilled ? "(preenchido automaticamente)" : "(opcional)"}
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="quick-add-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneWasAutoFilled(false);
                  }}
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full pl-8 pr-3 py-2.5 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono-tabular"
                />
              </div>
            </div>
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
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
