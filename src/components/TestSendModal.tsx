import { useEffect, useMemo, useState } from "react";
import {
  X,
  FlaskConical,
  ExternalLink,
  Copy,
  Check,
  Phone,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type {
  GroupDefinition,
  MessageTemplatesState,
  ShiftType,
  VolunteerStatus,
} from "../types/schedule";
import { SCHEDULE_GROUPS } from "../data/initialData";
import {
  buildWhatsAppUrl,
  formatDateDDMM,
  getGreetingByTime,
  getTemplateForGroup,
  getUpcomingSundays,
  isFirstSundayOfMonth,
  renderScheduleMessage,
} from "../utils/dateAndMessage";
import { WhatsAppPreviewCard } from "./WhatsAppPreviewCard";

const TEST_PHONE_STORAGE_KEY = "escala-kids:test-phone:v1";

interface TestSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  sundayISO: string;
  templates: MessageTemplatesState;
}

export function TestSendModal({
  isOpen,
  onClose,
  sundayISO,
  templates,
}: TestSendModalProps) {
  const [shift, setShift] = useState<ShiftType>("noite");
  const shiftGroups: GroupDefinition[] = useMemo(
    () => SCHEDULE_GROUPS.filter((g) => g.shift === shift),
    [shift]
  );
  const [groupId, setGroupId] = useState<string>(
    () => SCHEDULE_GROUPS.find((g) => g.shift === "noite")?.id || ""
  );
  const [testDateISO, setTestDateISO] = useState<string>(sundayISO);
  const [testName, setTestName] = useState<string>("Voluntário Teste");
  const [testPhone, setTestPhone] = useState<string>(() => {
    try {
      return localStorage.getItem(TEST_PHONE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [testSent, setTestSent] = useState(false);
  const [testStatus, setTestStatus] = useState<VolunteerStatus>("pendente");
  const [copied, setCopied] = useState(false);

  const upcomingSundays = useMemo(
    () => getUpcomingSundays("2026-11-15", 5),
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    setTestDateISO(sundayISO);
  }, [isOpen, sundayISO]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    try {
      localStorage.setItem(TEST_PHONE_STORAGE_KEY, testPhone);
    } catch {
      // Ignore storage failure
    }
  }, [testPhone]);

  const selectedGroup = useMemo(
    () =>
      shiftGroups.find((g) => g.id === groupId) ||
      shiftGroups[0] ||
      SCHEDULE_GROUPS[0],
    [shiftGroups, groupId]
  );

  const renderedMessage = useMemo(() => {
    const tpl = getTemplateForGroup(templates, selectedGroup);
    return renderScheduleMessage(tpl, {
      sundayISO: testDateISO,
      shift: selectedGroup.shift,
      groupLabel: selectedGroup.label,
    });
  }, [templates, selectedGroup, testDateISO]);

  if (!isOpen) return null;

  const waUrl = buildWhatsAppUrl(testPhone, renderedMessage);
  const greeting = getGreetingByTime();

  const handleShiftChange = (nextShift: ShiftType) => {
    setShift(nextShift);
    const first = SCHEDULE_GROUPS.find((g) => g.shift === nextShift);
    if (first) setGroupId(first.id);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderedMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleResetPractice = () => {
    setTestSent(false);
    setTestStatus("pendente");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-send-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="test-send-title"
                className="font-display text-base sm:text-lg font-semibold text-zinc-900 truncate"
              >
                Envio Teste (Treinamento)
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">
                Liberado qualquer dia da semana, sem alterar a escala oficial.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg transition-colors shrink-0 cursor-pointer"
            aria-label="Fechar envio teste"
          >
            <X className="w-4 h-4" />
            <span>Fechar</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <strong>Como usar para aprender:</strong> coloque abaixo o seu próprio
            WhatsApp (ou deixe em branco para escolher o contato na hora), escolha
            um culto e função e clique em <strong>Enviar teste no WhatsApp</strong>.
            Você pode testar em qualquer dia, mesmo antes da janela de quinta-feira.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Culto simulado
              </label>
              <div className="flex p-1 bg-[#F4F2EC] rounded-lg">
                <button
                  type="button"
                  onClick={() => handleShiftChange("noite")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    shift === "noite"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600"
                  }`}
                >
                  Culto da Noite
                </button>
                <button
                  type="button"
                  onClick={() => handleShiftChange("manha")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    shift === "manha"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600"
                  }`}
                >
                  Culto da Manhã
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="test-date-select"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Domingo simulado
              </label>
              <select
                id="test-date-select"
                value={testDateISO}
                onChange={(e) => setTestDateISO(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                {!upcomingSundays.includes(testDateISO) && (
                  <option value={testDateISO}>
                    Domingo {formatDateDDMM(testDateISO)}
                    {isFirstSundayOfMonth(testDateISO) ? " · Santa Ceia" : ""}
                  </option>
                )}
                {upcomingSundays.map((s) => (
                  <option key={s} value={s}>
                    Domingo {formatDateDDMM(s)}
                    {isFirstSundayOfMonth(s) ? " · Santa Ceia" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="test-group-select"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Função / Turma
              </label>
              <select
                id="test-group-select"
                value={selectedGroup.id}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                htmlFor="test-phone-input"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                WhatsApp para receber o teste (opcional)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="test-phone-input"
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="Seu número: (47) 99999-9999"
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono-tabular border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="test-name-input"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Nome exibido na prévia do teste
              </label>
              <input
                id="test-name-input"
                type="text"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Ex: Voluntário Teste"
                className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Prévia exata da mensagem enviada</span>
              <span className="font-mono-tabular">
                {formatDateDDMM(testDateISO)} · {greeting}
              </span>
            </div>
            <WhatsAppPreviewCard
              recipientTitle={testName.trim() || "Voluntário Teste"}
              recipientSubtitle={`${selectedGroup.label} · Culto da ${selectedGroup.shift === "manha" ? "manhã" : "noite"}`}
              message={renderedMessage}
            />
          </div>

          {/* Interactive Learning Simulation */}
          <div className="p-4 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-800">
                Simulador de status (treino):{" "}
                {testStatus === "confirmado" ? (
                  <span className="text-emerald-700">Confirmado</span>
                ) : testStatus === "recusado" ? (
                  <span className="text-red-700">Não poderá servir</span>
                ) : testSent ? (
                  <span className="text-sky-700">
                    Enviada (aguardando resposta)
                  </span>
                ) : (
                  <span className="text-zinc-500">Não enviada</span>
                )}
              </div>

              {(testSent || testStatus !== "pendente") && (
                <button
                  type="button"
                  onClick={handleResetPractice}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reiniciar simulação</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setTestStatus((s) =>
                    s === "confirmado" ? "pendente" : "confirmado"
                  )
                }
                className={`h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  testStatus === "confirmado"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-white text-zinc-700 border-[#E8E6DF] hover:bg-emerald-50/60"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Simular Confirmado</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setTestStatus((s) =>
                    s === "recusado" ? "pendente" : "recusado"
                  )
                }
                className={`h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  testStatus === "recusado"
                    ? "bg-red-50 text-red-800 border-red-300"
                    : "bg-white text-zinc-700 border-[#E8E6DF] hover:bg-red-50/70"
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Simular Recusado</span>
              </button>
            </div>

            {testStatus === "recusado" && (
              <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Dica: na escala oficial, quando você marca{" "}
                <strong>Recusado</strong>, aparece o botão{" "}
                <strong>Trocar</strong> na linha do voluntário para escolher um
                substituto com o WhatsApp já puxado.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[#EFECE4] bg-[#FAF9F5] flex flex-wrap items-center justify-end gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 text-xs sm:text-sm font-medium border border-[#E8E6DF] text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-700" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar mensagem</span>
              </>
            )}
          </button>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setTestSent(true)}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 text-xs sm:text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Enviar teste no WhatsApp</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
