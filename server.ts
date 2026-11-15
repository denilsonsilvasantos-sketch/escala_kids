import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function getSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const activeKey = serviceRoleKey || anonKey;
  return {
    configured: Boolean(url && activeKey),
    url,
    anonKey,
    serviceRoleKey,
    activeKey,
  };
}

function createSupabaseServerClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg.configured) return null;
  return createClient(cfg.url, cfg.activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
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

  // Supabase Shared Cloud Sync Routes (sem autenticação)
  app.get("/api/cloud/state", async (_req, res) => {
    try {
      const cfg = getSupabaseConfig();
      if (!cfg.configured) {
        return res.json({ configured: false });
      }
      const db = createSupabaseServerClient();
      if (!db) {
        return res.json({ configured: false });
      }

      const [entriesRes, contactsRes, templatesRes] = await Promise.all([
        db
          .from("escala_entries")
          .select(
            "id, date, shift, group_id, volunteer_name, phone, status, message_sent"
          ),
        db.from("escala_contacts").select("name_key, phone"),
        db
          .from("escala_templates")
          .select("default_noite, default_manha, group_overrides")
          .eq("id", "default")
          .maybeSingle(),
      ]);

      const firstErr =
        entriesRes.error || contactsRes.error || templatesRes.error;
      if (firstErr) {
        if (isMissingTableError(firstErr)) {
          return res.status(400).json({
            configured: true,
            needsSchemaSetup: true,
            error:
              "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor do seu projeto.",
          });
        }
        return res.status(500).json({ configured: true, error: firstErr.message });
      }

      const entries = (entriesRes.data || []).map((row) => ({
        id: row.id,
        date: row.date,
        shift: row.shift,
        groupId: row.group_id,
        volunteerName: row.volunteer_name,
        phone: row.phone || "",
        status: row.status || "pendente",
        messageSent: Boolean(row.message_sent),
      }));

      const contactBook: Record<string, string> = {};
      for (const row of contactsRes.data || []) {
        if (row.name_key && row.phone) {
          contactBook[row.name_key] = row.phone;
        }
      }

      const templates = templatesRes.data
        ? {
            defaultNoite: templatesRes.data.default_noite,
            defaultManha: templatesRes.data.default_manha,
            groupOverrides: templatesRes.data.group_overrides || {},
          }
        : null;

      return res.json({ configured: true, entries, contactBook, templates });
    } catch (err) {
      console.error("Erro ao carregar dados do Supabase:", err);
      return res
        .status(500)
        .json({ configured: true, error: "Erro ao sincronizar leitura com o Supabase." });
    }
  });

  app.put("/api/cloud/state", async (req, res) => {
    try {
      const cfg = getSupabaseConfig();
      if (!cfg.configured) {
        return res.status(503).json({
          configured: false,
          error: "Supabase não configurado em Settings > Secrets.",
        });
      }
      const db = createSupabaseServerClient();
      if (!db) {
        return res.status(503).json({ error: "Banco indisponível." });
      }

      const { entries, contactBook, templates } = req.body as {
        entries?: Array<{
          id: string;
          date: string;
          shift: "manha" | "noite";
          groupId: string;
          volunteerName: string;
          phone: string;
          status: "pendente" | "confirmado" | "recusado";
          messageSent: boolean;
        }>;
        contactBook?: Record<string, string>;
        templates?: {
          defaultNoite: string;
          defaultManha: string;
          groupOverrides: Record<string, string>;
        };
      };

      const nowIso = new Date().toISOString();

      if (Array.isArray(entries)) {
        const entryRows = entries.map((e) => ({
          id: e.id,
          date: e.date,
          shift: e.shift,
          group_id: e.groupId,
          volunteer_name: e.volunteerName,
          phone: e.phone || "",
          status: e.status || "pendente",
          message_sent: Boolean(e.messageSent),
          updated_at: nowIso,
        }));

        if (entryRows.length > 0) {
          const { error: upsertErr } = await db
            .from("escala_entries")
            .upsert(entryRows, { onConflict: "id" });
          if (upsertErr) {
            if (isMissingTableError(upsertErr)) {
              return res.status(400).json({
                needsSchemaSetup: true,
                error:
                  "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
              });
            }
            return res.status(500).json({ error: upsertErr.message });
          }
        }

        const { data: existingRows, error: existingErr } = await db
          .from("escala_entries")
          .select("id");
        if (existingErr) {
          if (isMissingTableError(existingErr)) {
            return res.status(400).json({
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            });
          }
          return res.status(500).json({ error: existingErr.message });
        }

        const incomingIds = new Set(entryRows.map((r) => r.id));
        const toDeleteIds = (existingRows || [])
          .map((r) => r.id as string)
          .filter((id) => !incomingIds.has(id));
        if (toDeleteIds.length > 0) {
          const { error: delErr } = await db
            .from("escala_entries")
            .delete()
            .in("id", toDeleteIds);
          if (delErr) {
            return res.status(500).json({ error: delErr.message });
          }
        }
      }

      if (contactBook && typeof contactBook === "object") {
        const contactRows = Object.entries(contactBook)
          .filter(([k, v]) => k.trim() && typeof v === "string" && v.trim())
          .map(([k, v]) => ({
            name_key: k.trim().toLowerCase(),
            volunteer_name: k.trim(),
            phone: v.trim(),
            updated_at: nowIso,
          }));

        if (contactRows.length > 0) {
          const { error: cUpsertErr } = await db
            .from("escala_contacts")
            .upsert(contactRows, { onConflict: "name_key" });
          if (cUpsertErr) {
            if (isMissingTableError(cUpsertErr)) {
              return res.status(400).json({
                needsSchemaSetup: true,
                error:
                  "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
              });
            }
            return res.status(500).json({ error: cUpsertErr.message });
          }
        }

        const { data: existingContacts, error: cSelectErr } = await db
          .from("escala_contacts")
          .select("name_key");
        if (cSelectErr) {
          if (isMissingTableError(cSelectErr)) {
            return res.status(400).json({
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            });
          }
          return res.status(500).json({ error: cSelectErr.message });
        }
        const incomingKeys = new Set(contactRows.map((c) => c.name_key));
        const keysToDelete = (existingContacts || [])
          .map((c) => c.name_key as string)
          .filter((k) => !incomingKeys.has(k));
        if (keysToDelete.length > 0) {
          const { error: cDelErr } = await db
            .from("escala_contacts")
            .delete()
            .in("name_key", keysToDelete);
          if (cDelErr) {
            return res.status(500).json({ error: cDelErr.message });
          }
        }
      }

      if (templates) {
        const { error: tErr } = await db.from("escala_templates").upsert(
          {
            id: "default",
            default_noite: templates.defaultNoite,
            default_manha: templates.defaultManha,
            group_overrides: templates.groupOverrides || {},
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
        if (tErr) {
          if (isMissingTableError(tErr)) {
            return res.status(400).json({
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            });
          }
          return res.status(500).json({ error: tErr.message });
        }
      }

      return res.json({ ok: true, syncedAt: nowIso });
    } catch (err) {
      console.error("Erro ao salvar dados no Supabase:", err);
      return res
        .status(500)
        .json({ error: "Erro ao salvar alterações no Supabase." });
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
