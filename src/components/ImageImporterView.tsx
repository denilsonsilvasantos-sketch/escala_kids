import { useRef, useState, type ChangeEvent } from "react";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { GroupDefinition, ShiftType } from "../types/schedule";
import { SCHEDULE_GROUPS } from "../data/initialData";
import { formatDateDDMM, getUpcomingSundays } from "../utils/dateAndMessage";

interface ParsedAssignment {
  groupId: string;
  volunteerName: string;
}

interface ImageImporterViewProps {
  activeSundayISO: string;
  onApplyImportedEntries: (params: {
    sundayISO: string;
    shift: ShiftType;
    assignments: ParsedAssignment[];
    replaceExistingForShiftDate: boolean;
  }) => void;
}

const MAX_UPLOAD_DIMENSION = 1600;

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Não foi possível ler o arquivo selecionado."));
      }
    };
    reader.onerror = () => {
      reject(new Error("Falha ao ler a imagem selecionada."));
    };
    reader.readAsDataURL(file);
  });
}

async function compressImageForUpload(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      const decodeTimer = window.setTimeout(
        () => reject(new Error("Decode timeout")),
        10000
      );
      imageEl.onload = () => {
        window.clearTimeout(decodeTimer);
        resolve(imageEl);
      };
      imageEl.onerror = () => {
        window.clearTimeout(decodeTimer);
        reject(new Error("Decode failed"));
      };
      imageEl.src = objectUrl;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      throw new Error("Dimensões inválidas");
    }

    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas unavailable");
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return {
      dataUrl: compressedDataUrl,
      mimeType: "image/jpeg",
    };
  } catch {
    // Fallback for formats that canvas cannot decode (e.g., some mobile HEIC files)
    const fallbackUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackUrl,
      mimeType: file.type || "image/jpeg",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ImageImporterView({
  activeSundayISO,
  onApplyImportedEntries,
}: ImageImporterViewProps) {
  const [imagePreview, setImagePreview] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [targetSundayISO, setTargetSundayISO] =
    useState<string>(activeSundayISO);
  const [shift, setShift] = useState<ShiftType>("noite");
  const [dateColumnHint, setDateColumnHint] = useState<string>(
    formatDateDDMM(activeSundayISO)
  );
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);

  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [extractedAssignments, setExtractedAssignments] = useState<
    ParsedAssignment[]
  >([]);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const upcomingSundays = getUpcomingSundays("2026-11-15", 5);
  const groupsById: Record<string, GroupDefinition> = Object.fromEntries(
    SCHEDULE_GROUPS.map((g) => [g.id, g])
  );

  const runExtraction = async (
    imgDataUrl: string,
    imgMimeType: string,
    overrideColumnHint?: string
  ) => {
    if (!imgDataUrl) {
      setErrorMsg("Selecione uma imagem da escala primeiro.");
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setAppliedSuccess(false);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch("/api/parse-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: imgDataUrl,
          mimeType: imgMimeType,
          targetDateLabel: overrideColumnHint ?? dateColumnHint,
          shift,
        }),
      });

      const rawText = await response.text();
      let data: {
        error?: string;
        detectedDateColumns?: string[];
        assignments?: ParsedAssignment[];
      } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          response.status === 413
            ? "A imagem enviada ficou muito grande. Tente aproximar ou recortar apenas a tabela."
            : "O servidor retornou uma resposta inesperada. Tente novamente."
        );
      }

      if (!response.ok) {
        throw new Error(data.error || "Erro ao ler imagem.");
      }

      setDetectedColumns(data.detectedDateColumns || []);
      const assignments = data.assignments || [];
      setExtractedAssignments(assignments);
      if (assignments.length === 0) {
        setErrorMsg(
          `Nenhum voluntário encontrado para "${overrideColumnHint ?? dateColumnHint}" no turno ${shift === "manha" ? "Manhã" : "Noite"}. Verifique a coluna selecionada.`
        );
      } else {
        window.setTimeout(() => {
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMsg(
          "A leitura demorou mais que o esperado. Verifique sua conexão e tente novamente."
        );
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : "Erro ao processar a imagem."
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsPreparingImage(true);
    setErrorMsg(null);
    setExtractedAssignments([]);
    setAppliedSuccess(false);

    try {
      const prepared = await compressImageForUpload(file);
      setImagePreview(prepared.dataUrl);
      setMimeType(prepared.mimeType);
      setIsPreparingImage(false);
      await runExtraction(prepared.dataUrl, prepared.mimeType);
    } catch (err) {
      setIsPreparingImage(false);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a imagem selecionada."
      );
    }
  };

  const handleLoadSampleImage = async () => {
    setErrorMsg(null);
    setExtractedAssignments([]);
    setAppliedSuccess(false);
    setIsPreparingImage(true);
    try {
      const response = await fetch("/assets/aistudio/image_80c6086a.png");
      if (!response.ok) throw new Error("Falha ao buscar imagem de exemplo.");
      const blob = await response.blob();
      const dataUrl = await readFileAsDataUrl(blob);
      setMimeType(blob.type || "image/png");
      setImagePreview(dataUrl);
    } catch {
      setErrorMsg("Não foi possível carregar a imagem de exemplo.");
    } finally {
      setIsPreparingImage(false);
    }
  };

  const handleExtract = async (overrideColumnHint?: string) => {
    await runExtraction(imagePreview, mimeType, overrideColumnHint);
  };

  const handleApply = () => {
    if (extractedAssignments.length === 0) return;
    setAppliedSuccess(true);
    onApplyImportedEntries({
      sundayISO: targetSundayISO,
      shift,
      assignments: extractedAssignments,
      replaceExistingForShiftDate: replaceExisting,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
          Importar Escala por Imagem
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Envie a foto ou print da planilha de escalas do mês e selecione qual domingo deseja preencher automaticamente. A escala de 15/11 já está carregada.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Upload & Extraction Controls */}
        <div className="lg:col-span-5 bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-900 mb-2">
              1. Imagem da escala
            </label>
            <label className="flex flex-col items-center justify-center border border-dashed border-[#D6D3C9] bg-[#FAF9F5] rounded-xl p-6 text-center hover:border-emerald-700 hover:bg-emerald-50/30 transition-colors cursor-pointer">
              {isPreparingImage ? (
                <>
                  <Loader2 className="w-6 h-6 text-emerald-700 animate-spin mb-2" />
                  <span className="text-sm font-medium text-zinc-700">
                    Otimizando imagem do celular...
                  </span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-zinc-400 mb-2" />
                  <span className="text-sm font-medium text-zinc-700">
                    Clique para enviar foto ou print
                  </span>
                  <span className="text-xs text-zinc-500 mt-0.5">
                    PNG, JPG ou foto da galeria/câmera
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={handleLoadSampleImage}
              disabled={isPreparingImage || isLoading}
              className="mt-2.5 w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 bg-[#F4F2EC] hover:bg-[#EAE6DC] rounded-lg transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Carregar imagem enviada (MEVAM Kids)</span>
            </button>
          </div>

          {imagePreview && (
            <div className="border border-[#E8E6DF] rounded-xl overflow-hidden bg-[#FAF9F5]">
              <img
                src={imagePreview}
                alt="Pré-visualização da tabela de escala"
                referrerPolicy="no-referrer"
                className="w-full max-h-56 object-contain"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                2. Turno
              </label>
              <div className="flex p-1 bg-[#F4F2EC] rounded-lg">
                <button
                  type="button"
                  onClick={() => setShift("noite")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    shift === "noite"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600"
                  }`}
                >
                  Noite
                </button>
                <button
                  type="button"
                  onClick={() => setShift("manha")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    shift === "manha"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600"
                  }`}
                >
                  Manhã
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                3. Domingo de destino
              </label>
              <select
                value={targetSundayISO}
                onChange={(e) => {
                  const val = e.target.value;
                  setTargetSundayISO(val);
                  setDateColumnHint(formatDateDDMM(val));
                }}
                className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono-tabular"
              >
                {upcomingSundays.map((s) => (
                  <option key={s} value={s}>
                    Domingo {formatDateDDMM(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">
              Coluna na imagem (ex: 15/nov, 22/nov, 29/nov)
            </label>
            <input
              type="text"
              value={dateColumnHint}
              onChange={(e) => setDateColumnHint(e.target.value)}
              placeholder="Ex: 22/nov ou 22/11"
              className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono-tabular"
            />
          </div>

          <button
            type="button"
            onClick={() => handleExtract()}
            disabled={isPreparingImage || isLoading || !imagePreview}
            className={`w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              isPreparingImage || isLoading || !imagePreview
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-800"
            }`}
          >
            {isPreparingImage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Preparando imagem...</span>
              </>
            ) : isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Lendo escala da imagem...</span>
              </>
            ) : (
              <span>Ler coluna {dateColumnHint} da imagem</span>
            )}
          </button>

          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Right column: Extracted preview & apply */}
        <div
          ref={resultsRef}
          className="lg:col-span-7 bg-white border border-[#E8E6DF] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6 scroll-mt-20"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#EFECE4]">
            <div>
              <h2 className="font-display text-base font-semibold text-zinc-900">
                Voluntários identificados ({extractedAssignments.length})
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Confira o mapeamento antes de salvar no domingo{" "}
                <span className="font-mono-tabular font-medium text-zinc-800">
                  {formatDateDDMM(targetSundayISO)}
                </span>
                .
              </p>
            </div>

            {detectedColumns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-zinc-500">
                  Colunas na imagem:
                </span>
                {detectedColumns.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      setDateColumnHint(col);
                      handleExtract(col);
                    }}
                    className={`px-2 py-1 text-xs font-mono-tabular rounded border transition-colors cursor-pointer ${
                      dateColumnHint === col
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-[#FAF9F5] text-zinc-700 border-[#E8E6DF] hover:bg-[#F4F2EC]"
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            )}
          </div>

          {extractedAssignments.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              Carregue uma imagem ao lado e clique em{" "}
              <span className="font-medium text-zinc-800">
                Ler coluna da imagem
              </span>{" "}
              para extrair os nomes automaticamente.
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F4F2EC] max-h-[420px] overflow-y-auto my-4">
                {extractedAssignments.map((item, idx) => (
                  <div
                    key={`${item.groupId}-${idx}`}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 text-sm"
                  >
                    <span className="text-zinc-600 font-medium">
                      {groupsById[item.groupId]?.label || item.groupId}
                    </span>
                    <input
                      type="text"
                      value={item.volunteerName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExtractedAssignments((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx ? { ...row, volunteerName: val } : row
                          )
                        );
                      }}
                      className="w-full sm:w-60 px-2.5 py-1.5 sm:py-1 text-sm text-zinc-900 border border-[#E8E6DF] rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[#EFECE4] flex flex-wrap items-center justify-between gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="rounded border-zinc-300 text-emerald-700 focus:ring-emerald-700"
                  />
                  <span>
                    Substituir escala anterior deste turno neste domingo
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleApply}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Aplicar e sincronizar escala ({formatDateDDMM(targetSundayISO)})
                  </span>
                </button>
              </div>

              {appliedSuccess && (
                <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                  Escala de {formatDateDDMM(targetSundayISO)} atualizada com sucesso! Acesse a aba "Escala e Envio" para confirmar os voluntários.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
