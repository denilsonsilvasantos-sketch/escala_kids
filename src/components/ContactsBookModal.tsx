import { useEffect, useMemo, useState, type FormEvent } from "react";
import { X, Search, Phone, Plus, Link2, Trash2 } from "lucide-react";
import type { ContactLink, ScheduleEntry } from "../types/schedule";
import {
  buildKnownDirectory,
  getSamePersonKeys,
  normalizeNameKey,
} from "../utils/contacts";

interface ContactsBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ScheduleEntry[];
  contactBook: Record<string, string>;
  contactNames: Record<string, string>;
  contactLinks: ContactLink[];
  onSavePersonPhone: (name: string, phone: string) => void;
  onRemoveLink: (linkId: string) => void;
}

export function ContactsBookModal({
  isOpen,
  onClose,
  entries,
  contactBook,
  contactNames,
  contactLinks,
  onSavePersonPhone,
  onRemoveLink,
}: ContactsBookModalProps) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const peopleList = useMemo(() => {
    const directory = buildKnownDirectory({
      entries,
      contactBook,
      contactNames,
    });
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

    const q = normalizeNameKey(search);
    return list
      .filter((item) => {
        if (!q) return true;
        return (
          normalizeNameKey(item.displayName).includes(q) ||
          item.aliases.some((a) => normalizeNameKey(a).includes(q)) ||
          item.phone.includes(search.trim())
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
  }, [entries, contactBook, contactNames, contactLinks, search]);

  if (!isOpen) return null;

  const handleAddContact = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    onSavePersonPhone(newName.trim(), newPhone.trim());
    setNewName("");
    setNewPhone("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contacts-book-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="contacts-book-title"
              className="font-display text-base sm:text-lg font-semibold text-zinc-900 truncate"
            >
              Contatos Vinculados ({peopleList.length})
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Todo número salvo aqui preenche automaticamente nas próximas escalas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg transition-colors shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
            <span>Fechar</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
          {/* Quick add contact */}
          <form
            onSubmit={handleAddContact}
            className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E6DF] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
          >
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                Nome do voluntário
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Samuel Rebouças"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                WhatsApp
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono-tabular"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={!newName.trim() || !newPhone.trim()}
                className="w-full min-h-[38px] inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Salvar</span>
              </button>
            </div>
          </form>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar voluntário ou número..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {/* People list */}
          <div className="divide-y divide-[#EFECE4] border border-[#E8E6DF] rounded-xl overflow-hidden">
            {peopleList.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500">
                Nenhum voluntário encontrado.
              </div>
            ) : (
              peopleList.map((person) => (
                <div
                  key={person.primaryKey}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 truncate">
                      {person.displayName}
                    </div>
                    {person.aliases.length > 0 && (
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        Vinculado também a: {person.aliases.join(", ")}
                      </div>
                    )}
                  </div>

                  <ContactPhoneInput
                    initialPhone={person.phone}
                    onCommit={(val) =>
                      onSavePersonPhone(person.displayName, val)
                    }
                  />
                </div>
              ))
            )}
          </div>

          {/* Linked / distinct decisions management */}
          {contactLinks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                <span>Vínculos de nomes salvos ({contactLinks.length})</span>
              </h3>
              <div className="divide-y divide-[#EFECE4] border border-[#E8E6DF] rounded-xl overflow-hidden bg-[#FAF9F5]">
                {contactLinks.map((link) => (
                  <div
                    key={link.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 text-zinc-700">
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
    </div>
  );
}

function ContactPhoneInput({
  initialPhone,
  onCommit,
}: {
  initialPhone: string;
  onCommit: (phone: string) => void;
}) {
  const [draft, setDraft] = useState(initialPhone);

  useEffect(() => {
    setDraft(initialPhone);
  }, [initialPhone]);

  return (
    <div className="relative w-full sm:w-52 shrink-0">
      <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="tel"
        value={draft}
        onChange={(e) => {
          const val = e.target.value;
          setDraft(val);
          if (val.trim()) {
            onCommit(val);
          }
        }}
        onBlur={() => {
          if (draft.trim() !== initialPhone.trim()) {
            onCommit(draft);
          }
        }}
        placeholder="Adicionar WhatsApp"
        className="w-full pl-8 pr-3 py-1.5 text-xs font-mono-tabular border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
    </div>
  );
}
