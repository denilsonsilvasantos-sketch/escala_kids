import { useState, useMemo } from "react";
import { RotateCcw, Check, Copy, Sparkles, Cake } from "lucide-react";
import type {
  GroupDefinition,
  MessageTemplatesState,
  ShiftType,
} from "../types/schedule";
import { DEFAULT_TEMPLATES, SCHEDULE_GROUPS } from "../data/initialData";
import {
  formatDateDDMM,
  getGreetingByTime,
  getPrayerTimeForShift,
  getTemplateForGroup,
  getUpcomingSundays,
  isFirstSundayOfMonth,
  renderScheduleMessage,
  ROLE_DEFAULT_TEMPLATES,
  ROLE_TEMPLATE_KEYS,
} from "../utils/dateAndMessage";
import {
  BIRTHDAY_TEMPLATE_KEY,
  DEFAULT_BIRTHDAY_TEMPLATE,
  renderBirthdayMessage,
} from "../utils/volunteerRoles";
import { WhatsAppPreviewCard } from "./WhatsAppPreviewCard";

interface TemplatesViewProps {
  templates: MessageTemplatesState;
  onUpdateTemplates: (next: MessageTemplatesState) => void;
  activeSundayISO: string;
}

type RoleTargetId =
  | typeof ROLE_TEMPLATE_KEYS.professor
  | typeof ROLE_TEMPLATE_KEYS.auxiliar
  | typeof ROLE_TEMPLATE_KEYS.seguranca;

type EditorTarget = "defaultNoite" | "defaultManha" | RoleTargetId | string;

const ROLE_TARGETS: {
  id: RoleTargetId;
  label: string;
  subtitle: string;
  defaultText: string;
  sampleGroupLabel: string;
}[] = [
  {
    id: ROLE_TEMPLATE_KEYS.professor,
    label: "Professor(a) (todas as turmas)",
    subtitle: "Orienta auxiliares e chegada 45min antes",
    defaultText: ROLE_DEFAULT_TEMPLATES.professor,
    sampleGroupLabel: "Professor(a) 5 anos",
  },
  {
    id: ROLE_TEMPLATE_KEYS.auxiliar,
    label: "Auxiliar (todas as turmas)",
    subtitle: "Procurar professor(a) para cooperar",
    defaultText: ROLE_DEFAULT_TEMPLATES.auxiliar,
    sampleGroupLabel: "Auxiliar 5 anos",
  },
  {
    id: ROLE_TEMPLATE_KEYS.seguranca,
    label: "Segurança",
    subtitle: "Chegada 45min antes para check-in",
    defaultText: ROLE_DEFAULT_TEMPLATES.seguranca,
    sampleGroupLabel: "Segurança",
  },
];

export function TemplatesView({
  templates,
  onUpdateTemplates,
  activeSundayISO,
}: TemplatesViewProps) {
  const [selectedTarget, setSelectedTarget] = useState<EditorTarget>(
    ROLE_TEMPLATE_KEYS.professor
  );
  const [previewShift, setPreviewShift] = useState<ShiftType>("noite");
  const upcomingSundays = useMemo(
    () => getUpcomingSundays(undefined, 5),
    []
  );
  const [previewDateISO, setPreviewDateISO] = useState<string>(() => {
    const firstFuture = getUpcomingSundays(undefined, 1)[0];
    return activeSundayISO >= firstFuture ? activeSundayISO : firstFuture;
  });
  const [testHour, setTestHour] = useState<number>(() => new Date().getHours());
  const [copiedPreview, setCopiedPreview] = useState(false);

  const isBirthdayTarget = selectedTarget === BIRTHDAY_TEMPLATE_KEY;

  const activeRoleMeta = useMemo(
    () => ROLE_TARGETS.find((r) => r.id === selectedTarget) || null,
    [selectedTarget]
  );

  const activeGroup: GroupDefinition | undefined = useMemo(() => {
    if (
      selectedTarget === "defaultNoite" ||
      selectedTarget === "defaultManha" ||
      isBirthdayTarget ||
      activeRoleMeta
    ) {
      return undefined;
    }
    return SCHEDULE_GROUPS.find((g) => g.id === selectedTarget);
  }, [selectedTarget, isBirthdayTarget, activeRoleMeta]);

  const currentEditorValue = useMemo(() => {
    if (selectedTarget === "defaultNoite") return templates.defaultNoite;
    if (selectedTarget === "defaultManha") return templates.defaultManha;
    if (isBirthdayTarget) {
      return templates.groupOverrides[BIRTHDAY_TEMPLATE_KEY] ?? DEFAULT_BIRTHDAY_TEMPLATE;
    }
    if (activeRoleMeta) {
      return (
        templates.groupOverrides[activeRoleMeta.id] ?? activeRoleMeta.defaultText
      );
    }
    if (activeGroup) {
      return getTemplateForGroup(templates, activeGroup);
    }
    return templates.defaultNoite;
  }, [selectedTarget, templates, isBirthdayTarget, activeRoleMeta, activeGroup]);

  const isCustomGroupOverride =
    Boolean(activeGroup) &&
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

  const effectivePreviewShift: ShiftType =
    selectedTarget === "defaultManha"
      ? "manha"
      : selectedTarget === "defaultNoite"
        ? "noite"
        : activeGroup?.shift ?? previewShift;

  const previewText = useMemo(() => {
    if (isBirthdayTarget) {
      return renderBirthdayMessage(
        currentEditorValue,
        "Ana Paula Martins",
        simulatedNow
      );
    }
    const groupLabel =
      selectedTarget === "defaultNoite" || selectedTarget === "defaultManha"
        ? "Louvor 3 a 6 anos"
        : activeRoleMeta
          ? activeRoleMeta.sampleGroupLabel
          : activeGroup?.label ?? "Louvor 3 a 6 anos";

    return renderScheduleMessage(currentEditorValue, {
      sundayISO: previewDateISO,
      shift: effectivePreviewShift,
      groupLabel,
      now: simulatedNow,
    });
  }, [
    isBirthdayTarget,
    currentEditorValue,
    previewDateISO,
    selectedTarget,
    activeRoleMeta,
    activeGroup,
    effectivePreviewShift,
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
  const isPreviewSantaCeia = isFirstSundayOfMonth(previewDateISO);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
          Modelos de Mensagem Padronizados
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Use{" "}
          <span className="font-mono-tabular font-medium text-zinc-900">
            {"{horario_oracao}"}
          </span>{" "}
          para trocar automaticamente entre <strong>9:45hs</strong> (Manhã) e{" "}
          <strong>18hs</strong> (Noite). Todo{" "}
          <strong>1º domingo do mês</strong> é identificado automaticamente como{" "}
          <strong>Culto de Santa Ceia</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Selector of role standards & group overrides */}
        <div className="lg:col-span-4 bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
          <div className="p-4 border-b border-[#EFECE4] bg-[#FAF9F5] space-y-4">
            <div>
              <div className="text-xs font-medium text-zinc-500 mb-2">
                Padrão por função (Manhã e Noite automáticos)
              </div>
              <div className="space-y-1">
                {ROLE_TARGETS.map((role) => {
                  const active = selectedTarget === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedTarget(role.id)}
                      className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                        active
                          ? "bg-emerald-50 text-emerald-800"
                          : "text-zinc-700 hover:bg-zinc-100/70"
                      }`}
                    >
                      <div className="truncate">{role.label}</div>
                      <div className="text-[11px] font-normal text-zinc-500 truncate">
                        {role.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-500 mb-2">
                Padrão Geral (Refeitório, Pipoca, Mídia, Louvor, Liderança)
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
                  Geral — Culto da Noite (18hs)
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
                  Geral — Culto da Manhã (9:45hs)
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-500 mb-2">
                Mensagens especiais
              </div>
              <button
                type="button"
                onClick={() => setSelectedTarget(BIRTHDAY_TEMPLATE_KEY)}
                className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-start gap-2.5 ${
                  isBirthdayTarget
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-zinc-700 hover:bg-zinc-100/70"
                }`}
              >
                <Cake className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="truncate">Felicitação de Aniversário</div>
                  <div className="text-[11px] font-normal text-zinc-500 truncate">
                    Enviada pela lista de aniversariantes
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="p-4 max-h-[420px] overflow-y-auto space-y-5">
            <div>
              <div className="text-xs font-medium text-zinc-500 mb-2">
                Personalizar função específica (Noite)
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
                Personalizar função específica (Manhã)
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
                    ? "Padrão Geral — Culto da Noite"
                    : selectedTarget === "defaultManha"
                      ? "Padrão Geral — Culto da Manhã"
                      : isBirthdayTarget
                        ? "Mensagem de Feliz Aniversário"
                        : activeRoleMeta
                          ? activeRoleMeta.label
                          : `${activeGroup?.label} (${activeGroup?.shift === "manha" ? "Manhã" : "Noite"})`}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isBirthdayTarget
                    ? "Usada ao clicar em Enviar parabéns na aba Voluntários."
                    : activeRoleMeta
                      ? "Aplicado automaticamente para essa função na Manhã e na Noite."
                      : isCustomGroupOverride
                        ? "Este grupo usa uma mensagem personalizada."
                        : selectedTarget.startsWith("default")
                          ? "Usado por Refeitório, Pipoca, Mídia, Louvor e Liderança neste culto."
                          : "Usando o padrão da função/turno. Edite abaixo para personalizar só este grupo."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetTarget}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-[#E8E6DF] rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {selectedTarget.startsWith("default") ||
                  activeRoleMeta ||
                  isBirthdayTarget
                    ? "Restaurar padrão"
                    : "Voltar ao padrão"}
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
              {isBirthdayTarget ? (
                <>
                  <button
                    type="button"
                    onClick={() => insertVariable("{primeiro_nome}")}
                    className="px-2.5 py-1 text-xs font-mono-tabular bg-[#F4F2EC] hover:bg-[#EAE6DC] text-zinc-800 rounded transition-colors cursor-pointer"
                  >
                    {"{primeiro_nome}"} → Ana
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable("{nome}")}
                    className="px-2.5 py-1 text-xs font-mono-tabular bg-[#F4F2EC] hover:bg-[#EAE6DC] text-zinc-800 rounded transition-colors cursor-pointer"
                  >
                    {"{nome}"} → Ana Paula Martins
                  </button>
                </>
              ) : (
                <>
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
                  <button
                    type="button"
                    onClick={() => insertVariable("{horario_oracao}")}
                    className="px-2.5 py-1 text-xs font-mono-tabular bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded transition-colors cursor-pointer"
                  >
                    {"{horario_oracao}"} → {getPrayerTimeForShift(effectivePreviewShift)}
                  </button>
                </>
              )}
            </div>

            <textarea
              rows={11}
              value={currentEditorValue}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full p-4 text-sm leading-relaxed text-zinc-900 bg-[#FAF9F5] border border-[#E8E6DF] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white transition-colors"
            />
          </div>

          {/* Live WhatsApp Preview with Shift, Time-of-Day & Sunday Test Controls */}
          <div className="bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-900 flex items-center gap-2">
                  <span>Simulação em tempo real no WhatsApp</span>
                  {!isBirthdayTarget && isPreviewSantaCeia && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-md">
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      Santa Ceia (1º domingo)
                    </span>
                  )}
                </h3>
                <p className="text-xs text-zinc-500">
                  {isBirthdayTarget
                    ? "Teste a saudação de acordo com o horário do envio:"
                    : "Teste a troca de turno, data (incluindo 1º domingo = Santa Ceia) e horário:"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isBirthdayTarget && !selectedTarget.startsWith("default") && !activeGroup && (
                  <div className="flex items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewShift("noite")}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        previewShift === "noite"
                          ? "bg-white text-zinc-900 shadow-xs"
                          : "text-zinc-600"
                      }`}
                    >
                      Noite (18hs)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewShift("manha")}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        previewShift === "manha"
                          ? "bg-white text-zinc-900 shadow-xs"
                          : "text-zinc-600"
                      }`}
                    >
                      Manhã (9:45hs)
                    </button>
                  </div>
                )}

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
                {!isBirthdayTarget && (
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F2EC] rounded-lg">
                    {upcomingSundays.map((sunday) => {
                      const firstSunday = isFirstSundayOfMonth(sunday);
                      return (
                        <button
                          key={sunday}
                          type="button"
                          onClick={() => setPreviewDateISO(sunday)}
                          title={
                            firstSunday
                              ? "1º domingo do mês (Culto de Santa Ceia)"
                              : undefined
                          }
                          className={`px-2.5 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors cursor-pointer ${
                            previewDateISO === sunday
                              ? "bg-white text-zinc-900 shadow-xs"
                              : "text-zinc-600 hover:text-zinc-900"
                          }`}
                        >
                          {formatDateDDMM(sunday)}
                          {firstSunday ? " · Ceia" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <WhatsAppPreviewCard
              recipientTitle={
                isBirthdayTarget
                  ? "Ana Paula Martins"
                  : selectedTarget === "defaultNoite" ||
                      selectedTarget === "defaultManha"
                    ? "Louvor 3 a 6 anos"
                    : activeRoleMeta
                      ? activeRoleMeta.sampleGroupLabel
                      : activeGroup?.label || "Voluntário"
              }
              recipientSubtitle={
                isBirthdayTarget
                  ? "Simulação · Aniversariante"
                  : `Simulação · ${formatDateDDMM(previewDateISO)}${
                      isPreviewSantaCeia ? " · Santa Ceia" : ""
                    }`
              }
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
