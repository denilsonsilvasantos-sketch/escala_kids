import { useState, useEffect, useMemo, type FormEvent } from "react";
import { X, Phone } from "lucide-react";
import type {
  ContactLink,
  GroupDefinition,
  ShiftType,
} from "../types/schedule";
import { SCHEDULE_GROUPS } from "../data/initialData";
import { formatDateDDMM, formatPhoneDisplay } from "../utils/dateAndMessage";
import { lookupPhoneInBook, normalizeNameKey } from "../utils/contacts";

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  sundayISO: string;
  initialShift?: ShiftType;
  initialGroupId?: string;
  contactBook: Record<string, string>;
  contactNames: Record<string, string>;
  contactLinks: ContactLink[];
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

  const savedSuggestions = useMemo(() => {
    const q = normalizeNameKey(volunteerName);
    if (!q) return [];
    const seen = new Set<string>();
    const results: { name: string; phone: string }[] = [];
    for (const [key, savedPhone] of Object.entries(contactBook)) {
      const norm = normalizeNameKey(key);
      if (!norm || !savedPhone.trim() || seen.has(norm)) continue;
      const display = contactNames[norm] || contactNames[key] || key;
      if (normalizeNameKey(display).includes(q) && normalizeNameKey(display) !== q) {
        seen.add(norm);
        results.push({ name: display, phone: savedPhone.trim() });
      }
    }
    return results.slice(0, 4);
  }, [volunteerName, contactBook, contactNames]);

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
    if (!volunteerName.trim() || !groupId) return;
    onAddEntry({
      date: sundayISO,
      shift,
      groupId,
      volunteerName: volunteerName.trim(),
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
                placeholder="Ex: Amanda Saragoça"
                className="w-full px-3 py-2.5 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              {savedSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {savedSuggestions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handlePickSuggestion(item.name, item.phone)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer"
                    >
                      <span>{item.name}</span>
                      <span className="font-mono-tabular text-[11px] text-emerald-700">
                        {formatPhoneDisplay(item.phone)}
                      </span>
                    </button>
                  ))}
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
