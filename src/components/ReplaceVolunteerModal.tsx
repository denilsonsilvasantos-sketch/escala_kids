import { useState, useMemo, useEffect, type FormEvent } from "react";
import { X, RefreshCw, Phone } from "lucide-react";
import type {
  ContactLink,
  GroupDefinition,
  ScheduleEntry,
  VolunteerProfile,
} from "../types/schedule";
import { formatDateDDMM, formatPhoneDisplay } from "../utils/dateAndMessage";
import {
  formatVolunteerName,
  lookupPhoneInBook,
  normalizeNameKey,
} from "../utils/contacts";
import {
  formatShiftPreferenceLabel,
  getRoleKeyForGroupId,
  ROLE_LABEL_BY_KEY,
} from "../utils/volunteerRoles";

interface ReplaceVolunteerModalProps {
  entry: ScheduleEntry | null;
  group?: GroupDefinition;
  contactBook: Record<string, string>;
  contactNames?: Record<string, string>;
  contactLinks: ContactLink[];
  volunteerProfiles?: Record<string, VolunteerProfile>;
  knownNames: string[];
  onClose: () => void;
  onConfirmReplace: (entryId: string, newName: string, newPhone: string) => void;
}

export function ReplaceVolunteerModal({
  entry,
  group,
  contactBook,
  contactNames = {},
  contactLinks,
  volunteerProfiles = {},
  knownNames,
  onClose,
  onConfirmReplace,
}: ReplaceVolunteerModalProps) {
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    if (!entry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, onClose]);

  const targetRoleKey = entry ? getRoleKeyForGroupId(entry.groupId) : "auxiliar";

  const suggestions = useMemo(() => {
    if (!entry) return [];
    const currentKey = normalizeNameKey(entry.volunteerName);
    const queryKey = normalizeNameKey(newName);

    const candidateMap = new Map<string, string>();
    for (const [k, disp] of Object.entries(contactNames)) {
      const norm = normalizeNameKey(k);
      if (norm) candidateMap.set(norm, formatVolunteerName(disp || k));
    }
    for (const k of Object.keys(contactBook)) {
      const norm = normalizeNameKey(k);
      if (norm && !candidateMap.has(norm)) {
        candidateMap.set(norm, formatVolunteerName(k));
      }
    }
    for (const n of knownNames) {
      const formatted = formatVolunteerName(n);
      const norm = normalizeNameKey(formatted);
      if (norm && !candidateMap.has(norm)) {
        candidateMap.set(norm, formatted);
      }
    }

    const list: {
      key: string;
      name: string;
      phone: string;
      matchesRole: boolean;
      matchesShift: boolean;
      shiftHint: string;
      score: number;
    }[] = [];

    for (const [normKey, displayName] of candidateMap.entries()) {
      if (!displayName || normKey === currentKey) continue;
      if (queryKey && !normKey.includes(queryKey)) continue;

      const prof = volunteerProfiles[normKey];
      const matchesRole = Boolean(prof?.roles?.includes(targetRoleKey));
      const matchesShift = Boolean(prof?.preferredShifts?.includes(entry.shift));
      const savedPhone =
        lookupPhoneInBook(displayName, contactBook, contactLinks) || "";

      const score =
        (matchesRole ? 10 : 0) +
        (matchesShift ? 5 : 0) +
        (savedPhone ? 1 : 0);

      list.push({
        key: normKey,
        name: displayName,
        phone: savedPhone,
        matchesRole,
        matchesShift,
        shiftHint: formatShiftPreferenceLabel(prof?.preferredShifts || []),
        score,
      });
    }

    return list
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name, "pt-BR");
      })
      .slice(0, 8);
  }, [
    entry,
    knownNames,
    contactNames,
    contactBook,
    contactLinks,
    volunteerProfiles,
    targetRoleKey,
    newName,
  ]);

  if (!entry) return null;

  const handlePickName = (name: string) => {
    setNewName(name);
    const savedPhone = lookupPhoneInBook(name, contactBook, contactLinks);
    if (savedPhone) {
      setNewPhone(savedPhone);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const formattedName = formatVolunteerName(newName);
    if (!formattedName) return;
    onConfirmReplace(entry.id, formattedName, newPhone.trim());
    setNewName("");
    setNewPhone("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="replace-modal-title"
              className="font-display text-base font-semibold text-zinc-900 truncate"
            >
              Trocar voluntário
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono-tabular truncate">
              Domingo {formatDateDDMM(entry.date)} · {group?.label}
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
            <div className="p-3 rounded-xl bg-red-50/70 border border-red-200 text-xs text-red-900">
              <span className="font-medium">Recusado (não poderá servir):</span>{" "}
              {entry.volunteerName}
            </div>

            <div>
              <label
                htmlFor="replace-name"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Novo voluntário para a função
              </label>
              <input
                id="replace-name"
                type="text"
                required
                value={newName}
                onChange={(e) => handlePickName(e.target.value)}
                onBlur={() => setNewName((v) => formatVolunteerName(v))}
                placeholder="Digite o nome do substituto..."
                className="w-full px-3 py-2.5 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            {suggestions.length > 0 && (
              <div className="border border-[#E8E6DF] rounded-xl bg-[#FAF9F5] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[#EFECE4] text-[11px] font-medium text-zinc-500">
                  Sugestões para {ROLE_LABEL_BY_KEY[targetRoleKey]} ·{" "}
                  {entry.shift === "manha" ? "Manhã" : "Noite"}
                </div>
                <div className="divide-y divide-[#EFECE4] max-h-44 overflow-y-auto bg-white">
                  {suggestions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handlePickName(item.name)}
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
                          {(item.matchesRole || item.matchesShift) && (
                            <>
                              <span className="text-zinc-300" aria-hidden="true">
                                ·
                              </span>
                              <span className="text-emerald-700 font-medium">
                                {item.matchesRole && item.matchesShift
                                  ? "Função e turno"
                                  : item.matchesRole
                                    ? "Mesma função"
                                    : `Turno ${item.shiftHint}`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                        Escolher
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="replace-phone"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                WhatsApp do substituto (opcional)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="replace-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
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
              className="min-h-[44px] inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Confirmar troca</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
