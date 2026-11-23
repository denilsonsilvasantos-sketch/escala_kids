import { useEffect, useState } from "react";
import { X, RefreshCw, Copy, Check, AlertCircle } from "lucide-react";
import schemaSqlRaw from "../../supabase/schema.sql?raw";
import migrationFase1SqlRaw from "../../supabase/migration_fase1.sql?raw";

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  supabaseConfigured: boolean;
  isSyncing: boolean;
  syncError: string | null;
  needsSchemaSetup: boolean;
  needsProfileSchemaUpdate?: boolean;
  onRefreshFromCloud: () => Promise<void>;
}

export function CloudSyncModal({
  isOpen,
  onClose,
  supabaseConfigured,
  isSyncing,
  syncError,
  needsSchemaSetup,
  needsProfileSchemaUpdate = false,
  onRefreshFromCloud,
}: CloudSyncModalProps) {
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedMigrationSql, setCopiedMigrationSql] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(schemaSqlRaw);
      setCopiedSql(true);
      window.setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyMigrationSql = async () => {
    try {
      await navigator.clipboard.writeText(migrationFase1SqlRaw);
      setCopiedMigrationSql(true);
      window.setTimeout(() => setCopiedMigrationSql(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92dvh] flex flex-col bg-white border border-[#E8E6DF] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#EFECE4] flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0">
            <h2
              id="sync-modal-title"
              className="font-display text-base sm:text-lg font-semibold text-zinc-900 truncate"
            >
              Sincronização Supabase
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Dados compartilhados automaticamente entre todos os aparelhos.
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
          {!supabaseConfigured ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E8E6DF] space-y-2.5 text-sm text-zinc-700">
                <p className="font-semibold text-zinc-900">
                  Para ativar a sincronização sem login:
                </p>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs leading-relaxed">
                  <li>
                    No painel do AI Studio, abra{" "}
                    <strong>Settings &gt; Secrets</strong> e adicione{" "}
                    <code className="font-mono-tabular">SUPABASE_URL</code> e{" "}
                    <code className="font-mono-tabular">SUPABASE_ANON_KEY</code>{" "}
                    (ou{" "}
                    <code className="font-mono-tabular">
                      SUPABASE_SERVICE_ROLE_KEY
                    </code>
                    ).
                  </li>
                  <li>
                    No painel do Supabase, abra{" "}
                    <strong>SQL Editor &gt; New query</strong>, cole e execute o
                    script das tabelas compartilhadas.
                  </li>
                  <li>
                    Depois de salvar as Secrets, recarregue o aplicativo — todos
                    que abrirem o link já verão e editarão a mesma escala.
                  </li>
                </ol>
              </div>

              <button
                type="button"
                onClick={handleCopySql}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 text-xs font-medium border border-[#E8E6DF] text-zinc-800 bg-white hover:bg-[#FAF9F5] rounded-lg transition-colors cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-700" />
                    <span>SQL das tabelas copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar SQL das tabelas (sem login)</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {syncError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{syncError}</span>
                  </div>
                  {needsSchemaSetup && (
                    <button
                      type="button"
                      onClick={handleCopySql}
                      className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 text-xs font-medium bg-white border border-red-200 text-red-900 hover:bg-red-100/50 rounded-lg transition-colors cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                          <span>SQL copiado! Execute no Supabase</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar SQL das tabelas</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {needsProfileSchemaUpdate && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <div>
                      <div className="font-semibold text-amber-950">
                        Atualização do banco para perfis (Fase 1)
                      </div>
                      <p className="mt-0.5 leading-relaxed">
                        Execute o script{" "}
                        <code className="font-mono-tabular font-semibold">
                          supabase/migration_fase1.sql
                        </code>{" "}
                        no SQL Editor do Supabase para salvar aniversários, funções, turnos e parentesco na nuvem.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyMigrationSql}
                    className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 text-xs font-medium bg-white border border-amber-300 text-amber-950 hover:bg-amber-100/60 rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedMigrationSql ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>SQL da Fase 1 copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar SQL de atualização (Fase 1)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <p className="text-xs text-zinc-600 leading-relaxed">
                As escalas, telefones, confirmações e modelos são sincronizados
                automaticamente com o Supabase. Não é necessário fazer login:
                basta abrir o aplicativo no celular ou computador para acessar os
                mesmos dados.
              </p>

              <button
                type="button"
                onClick={() => void onRefreshFromCloud()}
                disabled={isSyncing}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                />
                <span>
                  {isSyncing ? "Sincronizando..." : "Atualizar dados agora"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
