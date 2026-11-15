import { useEffect } from "react";
import { UserCheck, UserPlus, Phone, X } from "lucide-react";
import type {
  ContactMatchCandidate,
  PendingContactMatch,
} from "../types/schedule";
import { formatPhoneDisplay } from "../utils/dateAndMessage";

interface ContactMatchModalProps {
  pendingQueue: PendingContactMatch[];
  onResolveSame: (
    pending: PendingContactMatch,
    candidate: ContactMatchCandidate
  ) => void;
  onResolveDistinct: (pending: PendingContactMatch) => void;
  onSkip: (pending: PendingContactMatch) => void;
}

export function ContactMatchModal({
  pendingQueue,
  onResolveSame,
  onResolveDistinct,
  onSkip,
}: ContactMatchModalProps) {
  const current = pendingQueue[0] || null;

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip(current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, onSkip]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-match-title"
      onClick={() => onSkip(current)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="contact-match-title"
              className="font-display text-base font-semibold text-zinc-900"
            >
              Confirmar identidade do voluntário
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {pendingQueue.length > 1
                ? `Faltam ${pendingQueue.length} confirmações para vincular contatos`
                : "Encontramos um nome parecido já cadastrado"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSkip(current)}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-zinc-600 hover:text-zinc-900 rounded-lg bg-[#F4F2EC] hover:bg-[#EAE6DC] cursor-pointer shrink-0"
            aria-label="Decidir depois"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E6DF]">
            <div className="text-[11px] font-medium text-zinc-500">
              Nome inserido na escala:
            </div>
            <div className="text-base font-semibold text-zinc-900 mt-0.5">
              {current.incomingName}
            </div>
            {current.incomingPhone && (
              <div className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-zinc-600 mt-1">
                <Phone className="w-3 h-3 text-zinc-400" />
                <span>{formatPhoneDisplay(current.incomingPhone)}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            Esse voluntário é a <strong>mesma pessoa</strong> que algum dos
            contatos abaixo ou são <strong>pessoas distintas</strong>? Ao
            vincular, o WhatsApp fica salvo automaticamente para ambos.
          </p>

          <div className="space-y-2.5">
            {current.candidates.map((candidate) => (
              <div
                key={candidate.key}
                className="p-3.5 rounded-xl border border-[#E8E6DF] bg-white space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 truncate">
                      {candidate.displayName}
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-zinc-600 mt-0.5">
                      <Phone className="w-3 h-3 text-zinc-400" />
                      <span>
                        {candidate.phone
                          ? formatPhoneDisplay(candidate.phone)
                          : "Sem WhatsApp salvo ainda"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onResolveSame(current, candidate)}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Sim, é a mesma pessoa ({candidate.displayName})
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[#EFECE4] bg-[#FAF9F5] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onResolveDistinct(current)}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium border border-[#E8E6DF] text-zinc-800 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 shrink-0 text-zinc-600" />
            <span>Não, são pessoas distintas</span>
          </button>

          <button
            type="button"
            onClick={() => onSkip(current)}
            className="min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 rounded-lg cursor-pointer"
          >
            Decidir depois
          </button>
        </div>
      </div>
    </div>
  );
}
