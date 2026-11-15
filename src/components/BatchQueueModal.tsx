import { useState, useMemo, useEffect } from "react";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  SkipForward,
  CheckCircle2,
  Phone,
} from "lucide-react";
import type {
  GroupDefinition,
  MessageTemplatesState,
  ScheduleEntry,
} from "../types/schedule";
import {
  buildWhatsAppUrl,
  formatDateDDMM,
  getGreetingByTime,
  getTemplateForGroup,
  renderScheduleMessage,
} from "../utils/dateAndMessage";
import { WhatsAppPreviewCard } from "./WhatsAppPreviewCard";

interface BatchQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ScheduleEntry[];
  groupsById: Record<string, GroupDefinition>;
  templates: MessageTemplatesState;
  sundayISO: string;
  onMarkSent: (entryId: string) => void;
  onUpdatePhone: (entryId: string, phone: string) => void;
}

export function BatchQueueModal({
  isOpen,
  onClose,
  entries,
  groupsById,
  templates,
  sundayISO,
  onMarkSent,
  onUpdatePhone,
}: BatchQueueModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [processedIds, setProcessedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const safeIndex = Math.min(currentIndex, Math.max(0, entries.length - 1));
  const currentEntry = entries[safeIndex];
  const isFinished =
    entries.length > 0 && Object.keys(processedIds).length >= entries.length;

  const currentGreeting = getGreetingByTime();

  const renderedMessage = useMemo(() => {
    if (!currentEntry) return "";
    const group = groupsById[currentEntry.groupId];
    if (!group) return "";
    const tpl = getTemplateForGroup(templates, group);
    return renderScheduleMessage(tpl, {
      sundayISO,
      shift: currentEntry.shift,
      groupLabel: group.label,
    });
  }, [currentEntry, groupsById, templates, sundayISO]);

  if (!isOpen || entries.length === 0) return null;

  const currentGroup = currentEntry ? groupsById[currentEntry.groupId] : undefined;
  const waUrl = currentEntry
    ? buildWhatsAppUrl(currentEntry.phone, renderedMessage)
    : "#";

  const advanceNext = (markAsSent: boolean) => {
    if (!currentEntry) return;
    if (markAsSent) {
      onMarkSent(currentEntry.id);
    }
    setProcessedIds((prev) => ({ ...prev, [currentEntry.id]: true }));
    if (safeIndex < entries.length - 1) {
      setCurrentIndex(safeIndex + 1);
    }
  };

  const handleCopyAndAdvance = async () => {
    if (!currentEntry) return;
    try {
      await navigator.clipboard.writeText(renderedMessage);
      setCopiedId(currentEntry.id);
      setTimeout(() => setCopiedId(null), 1500);
      advanceNext(true);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Pinned Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#E8E6DF] flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0">
            <h2
              id="batch-modal-title"
              className="font-display text-base sm:text-lg font-semibold text-zinc-900 truncate"
            >
              Fila de Disparo em Lote
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono-tabular truncate">
              {formatDateDDMM(sundayISO)} · {Object.keys(processedIds).length}/{entries.length} · {currentGreeting}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-zinc-700 hover:text-zinc-900 rounded-lg bg-[#F4F2EC] hover:bg-[#EAE6DC] transition-colors shrink-0 cursor-pointer"
            aria-label="Fechar fila de disparo"
          >
            <X className="w-4 h-4" />
            <span>Fechar</span>
          </button>
        </div>

        {isFinished ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-display text-lg font-semibold text-zinc-900">
              Todos os selecionados foram processados
            </h3>
            <p className="text-sm text-zinc-600 mt-2 max-w-md mx-auto">
              As mensagens da escala do dia {formatDateDDMM(sundayISO)} foram
              abertas e atualizadas na lista.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full sm:w-auto px-5 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Voltar para a escala
            </button>
          </div>
        ) : (
          <>
            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* Step Progress Bar */}
              <div className="flex items-center gap-1.5">
                {entries.map((entry, idx) => {
                  const done = Boolean(processedIds[entry.id]);
                  const active = idx === safeIndex;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      title={`${entry.volunteerName} (${idx + 1}/${entries.length})`}
                      className={`h-2 flex-1 rounded-full transition-colors cursor-pointer ${
                        done
                          ? "bg-emerald-700"
                          : active
                            ? "bg-zinc-900"
                            : "bg-zinc-200 hover:bg-zinc-300"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Current Recipient Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EFECE4]">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500 font-mono-tabular">
                    {safeIndex + 1} de {entries.length} ·{" "}
                    {currentEntry.shift === "manha"
                      ? "Culto da Manhã"
                      : "Culto da Noite"}
                  </div>
                  <div className="text-base font-semibold text-zinc-900 mt-0.5 truncate">
                    {currentEntry.volunteerName}
                  </div>
                  <div className="text-sm text-emerald-700 font-medium truncate">
                    {currentGroup?.label}
                  </div>
                </div>

                <div className="w-full sm:w-64">
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    WhatsApp (opcional)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={currentEntry.phone}
                      onChange={(e) =>
                        onUpdatePhone(currentEntry.id, e.target.value)
                      }
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono-tabular"
                    />
                  </div>
                </div>
              </div>

              <WhatsAppPreviewCard
                recipientTitle={currentEntry.volunteerName}
                recipientSubtitle={`${currentGroup?.label || ""} · Escala ${formatDateDDMM(sundayISO)}`}
                message={renderedMessage}
              />
            </div>

            {/* Pinned Footer Actions */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-[#EFECE4] bg-[#FAF9F5] flex flex-wrap items-center justify-between gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => advanceNext(false)}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3 text-xs sm:text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-lg transition-colors cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
                <span>Pular</span>
              </button>

              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleCopyAndAdvance}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 text-xs sm:text-sm font-medium border border-[#E8E6DF] text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedId === currentEntry.id ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-700" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setTimeout(() => advanceNext(true), 120);
                  }}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 sm:px-5 text-xs sm:text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>Abrir WhatsApp e Próximo</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
