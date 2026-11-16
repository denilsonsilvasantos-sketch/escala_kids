import {
  Send,
  Plus,
  CalendarCheck,
  MessageSquareText,
  ImageUp,
  RefreshCw,
  Users,
  FlaskConical,
} from "lucide-react";
import type { AppView } from "../types/schedule";

interface HeaderProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  selectedCount: number;
  canDispatch: boolean;
  onOpenBatchModal: () => void;
  onOpenQuickAdd: () => void;
  onOpenSyncModal: () => void;
  onOpenTestSend: () => void;
}

export function Header({
  activeView,
  onChangeView,
  selectedCount,
  canDispatch,
  onOpenBatchModal,
  onOpenQuickAdd,
  onOpenSyncModal,
  onOpenTestSend,
}: HeaderProps) {
  const navItems: {
    id: AppView;
    label: string;
    mobileLabel: string;
    icon: typeof CalendarCheck;
  }[] = [
    {
      id: "escala",
      label: "Escala e Envio",
      mobileLabel: "Escala",
      icon: CalendarCheck,
    },
    {
      id: "voluntarios",
      label: "Voluntários",
      mobileLabel: "Voluntários",
      icon: Users,
    },
    {
      id: "modelos",
      label: "Modelos",
      mobileLabel: "Modelos",
      icon: MessageSquareText,
    },
    {
      id: "importar",
      label: "Importar Imagem",
      mobileLabel: "Importar",
      icon: ImageUp,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 md:gap-8">
          <button
            type="button"
            onClick={() => onChangeView("escala")}
            aria-label="MEVAM Kids Sede — Ir para Escala"
            className="inline-flex items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-md py-1"
          >
            <img
              src="/assets/aistudio/Logo_Mevam_Kids_9ca1d5e7.png"
              alt="MEVAM Kids Sede"
              className="h-8 sm:h-9 w-auto object-contain select-none"
            />
          </button>

          {/* Desktop 4-link Navigation */}
          <nav
            className="hidden md:flex items-center gap-7 h-full"
            aria-label="Navegação principal"
          >
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeView(item.id)}
                  className={`relative h-full inline-flex items-center text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    isActive
                      ? "text-zinc-950 font-semibold"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-emerald-700 rounded-t-full"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Actions: Test Send + Sync + Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenTestSend}
              title="Envio teste para aprender e testar qualquer dia"
              className="h-9 min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 text-xs font-medium border border-amber-200/90 text-amber-900 bg-amber-50/80 hover:bg-amber-100/90 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              <FlaskConical className="w-3.5 h-3.5 shrink-0 text-amber-700" />
              <span className="hidden sm:inline">Envio teste</span>
            </button>

            <button
              type="button"
              onClick={onOpenSyncModal}
              title="Sincronização Supabase"
              className="h-9 min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 text-xs font-medium border border-[#E5E3DB] text-zinc-700 bg-white hover:bg-[#FAF9F5] rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            {selectedCount > 0 ? (
              <button
                type="button"
                onClick={onOpenBatchModal}
                disabled={!canDispatch}
                className={`h-9 inline-flex items-center gap-2 px-3.5 sm:px-4 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  canDispatch
                    ? "bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs"
                    : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                }`}
              >
                <Send className="w-4 h-4 shrink-0" />
                <span className="font-mono-tabular">
                  Disparar ({selectedCount})
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenQuickAdd}
                className="h-9 inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 text-xs sm:text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 shadow-xs"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Voluntário</span>
                <span className="hidden sm:inline">Novo voluntário</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Navegação inferior"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E3DB] grid grid-cols-4 h-14 pb-[env(safe-area-inset-bottom)]"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors cursor-pointer ${
                isActive
                  ? "text-emerald-700 font-semibold"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-[11px] leading-none whitespace-nowrap">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
