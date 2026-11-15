import { useState, useMemo } from "react";
import { RotateCcw, Check, Copy } from "lucide-react";
import type {
  GroupDefinition,
  MessageTemplatesState,
  ShiftType,
} from "../types/schedule";
import { DEFAULT_TEMPLATES, SCHEDULE_GROUPS } from "../data/initialData";
import {
  formatDateDDMM,
  getGreetingByTime,
  getUpcomingSundays,
  renderScheduleMessage,
} from "../utils/dateAndMessage";
import { WhatsAppPreviewCard } from "./WhatsAppPreviewCard";

interface TemplatesViewProps {
  templates: MessageTemplatesState;
  onUpdateTemplates: (next: MessageTemplatesState) => void;
  activeSundayISO: string;
}

type EditorTarget = "defaultNoite" | "defaultManha" | string;

export function TemplatesView({
  templates,
  onUpdateTemplates,
  activeSundayISO,
}: TemplatesViewProps) {
  const [selectedTarget, setSelectedTarget] =
    useState<EditorTarget>("defaultNoite");
  const [previewShift, setPreviewShift] = useState<ShiftType>("noite");
  const [previewDateISO, setPreviewDateISO] = useState<string>(activeSundayISO);
  const [testHour, setTestHour] = useState<number>(() => new Date().getHours());
  const [copiedPreview, setCopiedPreview] = useState(false);

  const upcomingSundays = useMemo(
    () => getUpcomingSundays(activeSundayISO, 4),
    [activeSundayISO]
  );

  const activeGroup: GroupDefinition | undefined = useMemo(() => {
    if (
      selectedTarget === "defaultNoite" ||
      selectedTarget === "defaultManha"
    ) {
      return SCHEDULE_GROUPS.find(
        (g) =>
          g.shift === (selectedTarget === "defaultManha" ? "manha" : "noite")
      );
    }
    return SCHEDULE_GROUPS.find((g) => g.id === selectedTarget);
  }, [selectedTarget]);

  const currentEditorValue = useMemo(() => {
    if (selectedTarget === "defaultNoite") return templates.defaultNoite;
    if (selectedTarget === "defaultManha") return templates.defaultManha;
    const override = templates.groupOverrides[selectedTarget];
    if (override !== undefined) return override;
    return activeGroup?.shift === "manha"
      ? templates.defaultManha
      : templates.defaultNoite;
  }, [selectedTarget, templates, activeGroup]);

  const isCustomGroupOverride =
    selectedTarget !== "defaultNoite" &&
    selectedTarget !== "defaultManha" &&
    Boolean(templates.groupOverrides[selectedTarget]);

  const handleTemplateChange = (value: string) => {
    if (selectedTarget === "defaultNoite") {
      onUpdateTemplates({ ...templates, defaultNoite: value });
    } else if (selectedTarget === "defaultManha") {
      onUpdateTemplates({ ...templates, defaultManha: value });
    } else {
      onUpdateTemplates({
        ...templates,
        groupOverrides: {
          ...templates.groupOverrides,
          [selectedTarget]: value,
        },
      });
    }
  };

  const handleResetTarget = () => {
    if (selectedTarget === "defaultNoite") {
      onUpdateTemplates({
        ...templates,
        defaultNoite: DEFAULT_TEMPLATES.defaultNoite,
      });
    } else if (selectedTarget === "defaultManha") {
      onUpdateTemplates({
        ...templates,
        defaultManha: DEFAULT_TEMPLATES.defaultManha,
      });
    } else {
      const nextOverrides = { ...templates.groupOverrides };
      delete nextOverrides[selectedTarget];
      onUpdateTemplates({ ...templates, groupOverrides: nextOverrides });
    }
  };

  const insertVariable = (token: string) => {
    handleTemplateChange(
      `${currentEditorValue}${
        currentEditorValue.endsWith(" ") || currentEditorValue.endsWith("\n")
          ? ""
          : " "
      }${token}`
    );
  };

  const simulatedNow = useMemo(() => {
    const d = new Date();
    d.setHours(testHour, 0, 0, 0);
    return d;
  }, [testHour]);

  const previewText = useMemo(() => {
    const shiftToUse =
      selectedTarget === "defaultManha"
        ? "manha"
        : selectedTarget === "defaultNoite"
          ? "noite"
          : activeGroup?.shift ?? previewShift;

    const groupLabel =
      selectedTarget === "defaultNoite"
        ? "Louvor 3 a 6 anos"
        : selectedTarget === "defaultManha"
          ? "Professor(a) 5 e 6 anos"
          : activeGroup?.label ?? "Louvor 3 a 6 anos";

    return renderScheduleMessage(currentEditorValue, {
      sundayISO: previewDateISO,
      shift: shiftToUse,
      groupLabel,
      now: simulatedNow,
    });
  }, [
    currentEditorValue,
    previewDateISO,
    selectedTarget,
    activeGroup,
    previewShift,
    simulatedNow,
  ]);

  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const manhaGroups = SCHEDULE_GROUPS.filter((g) => g.shift === "manha");
  const noiteGroups = SCHEDULE_GROUPS.filter((g) => g.shift === "noite");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
          Modelos de Mensagem Padronizados
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Use{" "}
          <span className="font-mono-tabular font-medium text-zinc-900">
            {"{saudacao}"}
          </span>{" "}
          para ajustar automaticamente entre Bom dia, Boa tarde e Boa noite conforme o horário do disparo, e{" "}
          <span className="font-mono-tabular font-medium text-zinc-900">
            {"{data}"}
          </span>{" "}
          para exibir sempre no formato DD/MM.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Selector of defaults & group overrides */}
        <div className="lg:col-span-4 bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
          <div className="p-4 border-b border-[#EFECE4] bg-[#FAF9F5]">
            <div className="text-xs font-medium text-zinc-500 mb-2">
              Modelos padrão por culto
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedTarget("defaultNoite");
                  setPreviewShift("noite");
                }}
                className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  selectedTarget === "defaultNoite"
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-zinc-700 hover:bg-zinc-100/70"
                }`}
              >
                Padrão — Culto da Noite
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTarget("defaultManha");
                  setPreviewShift("manha");
                }}
                className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  selectedTarget === "defaultManha"
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-zinc-700 hover:bg-zinc-100/70"
                }`}
              >
                Padrão — Culto da Manhã
              </button>
            </div>
          </div>

          <div className="p-4 max-h-[470px] overflow-y-auto space-y-5">
            <div>
              <div className="text-xs font-medium text-zinc-500 mb-2">
                Personalizar grupo específico (Noite)
              </div>
              <div className="space-y-0.5">
                {noiteGroups.map((group) => {
                  const hasOverride = Boolean(
                    templates.groupOverrides[group.id]
                  );
                  const active = selectedTarget === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedTarget(group.id);
                        setPreviewShift("noite");
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
                        active
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-700 hover:bg-[#FAF9F5]"
                      }`}
                    >
                      <span className="truncate">{group.label}</span>
                      {hasOverride && (
                        <span
                          className={`text-[11px] font-medium shrink-0 ml-2 ${
                            active ? "text-emerald-300" : "text-emerald-700"
                          }`}
                        >
                          Customizado
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-500 mb-2">
                Personalizar grupo específico (Manhã)
              </div>
              <div className="space-y-0.5">
                {manhaGroups.map((group) => {
                  const hasOverride = Boolean(
                    templates.groupOverrides[group.id]
                  );
                  const active = selectedTarget === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedTarget(group.id);
                        setPreviewShift("manha");
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
                        active
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-700 hover:bg-[#FAF9F5]"
                      }`}
                    >
                      <span className="truncate">{group.label}</span>
                      {hasOverride && (
                        <span
                          className={`text-[11px] font-medium shrink-0 ml-2 ${
                            active ? "text-emerald-300" : "text-emerald-700"
                          }`}
                        >
                          Customizado
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Editor + Live WhatsApp Preview */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-zinc-900">
                  {selectedTarget === "defaultNoite"
                    ? "Modelo Padrão — Culto da Noite"
                    : selectedTarget === "defaultManha"
                      ? "Modelo Padrão — Culto da Manhã"
                      : `${activeGroup?.label} (${activeGroup?.shift === "manha" ? "Manhã" : "Noite"})`}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isCustomGroupOverride
                    ? "Este grupo usa uma mensagem personalizada."
                    : selectedTarget.startsWith("default")
                      ? "Usado por todos os grupos deste turno sem personalização."
                      : "Usando o modelo padrão do turno. Edite abaixo para personalizar só este grupo."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetTarget}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-[#E8E6DF] rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {selectedTarget.startsWith("default")
                    ? "Restaurar original"
                    : "Voltar ao padrão do turno"}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-zinc-500">Variáveis:</span>
              <button
                type="button"
                onClick={() => insertVariable("{saudacao}")}
                className="px-2.5 py-1 text-xs font-mono-tabular bg-[#F4F2EC] hover:bg-[#EAE6DC] text-zinc-800 rounded transition-colors cursor-pointer"
              >
                {"{saudacao}"} → {getGreetingByTime(simulatedNow)}
              </button>
              <button
                type="button"
                onClick={() => insertVariable("{data}")}
                className="px-2.5 py-1 text-xs font-mono-tabular bg-[#F4F2EC] hover:bg-[#EAE6DC] text-zinc-800 rounded transition-colors cursor-pointer"
              >
                {"{data}"} → {formatDateDDMM(previewDateISO)}
              </button>
              <button
                type="button"
                onClick={() => insertVariable("{culto}")}
                className="px-2.5 py-1 text-xs font-mono-tabular bg-[#F4F2EC] hover:bg-[#EAE6DC] text-zinc-800 rounded transition-colors cursor-pointer"
              >
                {"{culto}"}
              </button>
              <button
                type="button"
                onClick={() => insertVariable("{grupo}")}
                className="px-2.5 py-1 text-xs font-mono-tabular bg-[#F4F2EC] hover:bg-[#EAE6DC] text-zinc-800 rounded transition-colors cursor-pointer"
              >
                {"{grupo}"}
              </button>
            </div>

            <textarea
              rows={11}
              value={currentEditorValue}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full p-4 text-sm leading-relaxed text-zinc-900 bg-[#FAF9F5] border border-[#E8E6DF] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white transition-colors"
            />
          </div>

          {/* Live WhatsApp Preview with Time-of-Day & Sunday Test Controls */}
          <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-900">
                  Simulação em tempo real no WhatsApp
                </h3>
                <p className="text-xs text-zinc-500">
                  Teste a troca de data e de horário de envio:
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Time-of-day tester */}
                <div className="flex items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg">
                  {[
                    { label: "09h", hour: 9 },
                    { label: "14h", hour: 14 },
                    { label: "19h", hour: 19 },
                  ].map((slot) => (
                    <button
                      key={slot.hour}
                      type="button"
                      onClick={() => setTestHour(slot.hour)}
                      className={`px-2 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors cursor-pointer ${
                        (testHour >= 5 && testHour < 12 && slot.hour === 9) ||
                        (testHour >= 12 && testHour < 18 && slot.hour === 14) ||
                        ((testHour >= 18 || testHour < 5) && slot.hour === 19)
                          ? "bg-white text-zinc-900 shadow-xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>

                {/* Sunday tester */}
                <div className="flex items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg">
                  {upcomingSundays.map((sunday) => (
                    <button
                      key={sunday}
                      type="button"
                      onClick={() => setPreviewDateISO(sunday)}
                      className={`px-2.5 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors cursor-pointer ${
                        previewDateISO === sunday
                          ? "bg-white text-zinc-900 shadow-xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      {formatDateDDMM(sunday)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <WhatsAppPreviewCard
              recipientTitle={
                selectedTarget === "defaultNoite"
                  ? "Louvor 3 a 6 anos"
                  : selectedTarget === "defaultManha"
                    ? "Professor(a) 5 e 6 anos"
                    : activeGroup?.label || "Voluntário"
              }
              recipientSubtitle={`Simulação · ${formatDateDDMM(previewDateISO)}`}
              message={previewText}
              timeLabel={`${String(testHour).padStart(2, "0")}:00`}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCopyPreview}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-700 bg-white border border-[#E8E6DF] hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
              >
                {copiedPreview ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Mensagem copiada!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar texto de teste</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
