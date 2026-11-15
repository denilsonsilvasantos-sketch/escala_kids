import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const GROUP_IDS_MANHA = [
  "manha-prof-3e4",
  "manha-prof-5e6",
  "manha-prof-7e8",
  "manha-prof-9a12",
  "manha-aux-3e4",
  "manha-aux-5e6",
  "manha-aux-7e8",
  "manha-aux-9a12",
  "manha-refeitorio",
  "manha-aux-refeitorio",
  "manha-pipoca",
  "manha-aux-pipoca",
  "manha-midia",
  "manha-seguranca",
  "manha-pastores",
];

const GROUP_IDS_NOITE = [
  "noite-louvor-3a6",
  "noite-prof-3e4",
  "noite-prof-5",
  "noite-prof-6",
  "noite-prof-7",
  "noite-prof-8",
  "noite-prof-9e10",
  "noite-prof-11e12",
  "noite-aux-3e4",
  "noite-aux-5",
  "noite-aux-6",
  "noite-aux-7",
  "noite-aux-8",
  "noite-aux-9e10",
  "noite-aux-11e12",
  "noite-refeitorio",
  "noite-aux-refeitorio",
  "noite-pipoca",
  "noite-aux-pipoca",
  "noite-midia",
  "noite-seguranca",
  "noite-pastores",
];

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.post("/api/parse-schedule", async (req, res) => {
    try {
      const { imageBase64, mimeType, targetDateLabel, shift } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        targetDateLabel?: string;
        shift?: "manha" | "noite";
      };

      if (!imageBase64 || !mimeType) {
        return res.status(400).json({
          error: "Envie uma imagem válida da escala para fazer a leitura.",
        });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          error: "Chave da API Gemini não configurada no servidor.",
        });
      }

      const targetShift = shift === "manha" ? "manha" : "noite";
      const allowedGroupIds =
        targetShift === "manha" ? GROUP_IDS_MANHA : GROUP_IDS_NOITE;

      const dateInstruction = targetDateLabel
        ? `Foque exclusivamente na coluna correspondente à data "${targetDateLabel}" (ou formato equivalente como "${targetDateLabel.replace("/11", "/nov")}").`
        : "Escolha a primeira coluna de data encontrada ou a mais próxima.";

      const prompt = `Você é um extrator preciso de escalas do Ministério Infantil (MEVAM Kids).
Analise a tabela da imagem enviada.
${dateInstruction}
Turno selecionado: ${targetShift === "manha" ? "Culto da Manhã" : "Culto da Noite"}.

Mapeie cada voluntário encontrado na coluna selecionada exatamente para um destes groupId permitidos:
${allowedGroupIds.join(", ")}

Regras importantes:
1. Se uma turma tiver Professor e Auxiliar 1 / Auxiliar 2 / Auxiliar 3, coloque o Professor no groupId "prof" correspondente e TODOS os auxiliares daquela faixa etária no groupId "aux" correspondente (cada pessoa como um item separado ou mantendo duplas como "Pr. William e Liara" quando estiverem juntos na mesma célula).
2. Para "REFEITORIO", use "${targetShift}-refeitorio", e para a linha "Auxiliar" logo abaixo de REFEITORIO, use "${targetShift}-aux-refeitorio".
3. Para "PIPOCA", use "${targetShift}-pipoca", e para a linha "Auxiliar" logo abaixo de PIPOCA, use "${targetShift}-aux-pipoca".
4. Para "SEGURANÇAS" / "Segurança", crie um item para cada nome listado na coluna daquela data usando o groupId "${targetShift}-seguranca".
5. Para "MIDIA", use "${targetShift}-midia".
6. Para "PASTORES", use "${targetShift}-pastores".
7. Para "LOUVOR 3 a 6 anos", use "noite-louvor-3a6".
8. Ignore linhas que não estão nos groupIds permitidos (como Coordenação).
9. Se uma célula estiver vazia, não invente nomes; apenas omita ou não adicione item.
10. Também liste todas as colunas de datas visíveis no cabeçalho da tabela (ex: ["1/nov", "8/nov", "15/nov", "22/nov", "29/nov"]).`;

      const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const resolvedMimeType =
        dataUrlMatch?.[1] ||
        (mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg");

      const cleanBase64 = imageBase64.includes(",")
        ? imageBase64.split(",")[1]
        : imageBase64;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: resolvedMimeType,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedDateColumns: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Cabeçalhos de datas encontrados na tabela.",
              },
              extractedDateUsed: {
                type: Type.STRING,
                description: "A coluna de data que foi extraída.",
              },
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    groupId: {
                      type: Type.STRING,
                      description: "Um dos groupIds permitidos.",
                    },
                    volunteerName: {
                      type: Type.STRING,
                      description: "Nome do voluntário exatamente como aparece na imagem.",
                    },
                  },
                  required: ["groupId", "volunteerName"],
                },
              },
            },
            required: ["detectedDateColumns", "extractedDateUsed", "assignments"],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText);
      const validSet = new Set(allowedGroupIds);
      const sanitizedAssignments = Array.isArray(parsed.assignments)
        ? parsed.assignments.filter(
            (item: { groupId?: string; volunteerName?: string }) =>
              item &&
              typeof item.groupId === "string" &&
              validSet.has(item.groupId) &&
              typeof item.volunteerName === "string" &&
              item.volunteerName.trim().length > 0
          )
        : [];

      return res.json({
        detectedDateColumns: Array.isArray(parsed.detectedDateColumns)
          ? parsed.detectedDateColumns
          : [],
        extractedDateUsed: parsed.extractedDateUsed || targetDateLabel || "",
        assignments: sanitizedAssignments,
      });
    } catch (err) {
      console.error("Erro ao ler imagem da escala:", err);
      const message =
        err instanceof Error ? err.message : "Erro ao processar a imagem.";
      return res.status(500).json({
        error: `Não foi possível interpretar a imagem da escala: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Escala Kids rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
