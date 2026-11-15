import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const GROUP_IDS_MANHA = [
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
  "manha-coordenador",
];

export const GROUP_IDS_NOITE = [
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
  "noite-coordenador",
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

const LOWERCASE_NAME_CONNECTORS = new Set([
  "e",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "di",
  "del",
]);

export function formatVolunteerNameServer(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      if (index > 0 && LOWERCASE_NAME_CONNECTORS.has(lower)) {
        return lower;
      }
      return lower.replace(
        /(^|[-(/])(\p{L})/gu,
        (_match, prefix: string, ch: string) =>
          `${prefix}${ch.toLocaleUpperCase("pt-BR")}`
      );
    })
    .join(" ");
}

export function normalizeNameKeyServer(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleParseSchedule(rawBody: unknown): Promise<HandlerResult> {
  try {
    const { imageBase64, mimeType, targetDateLabel, shift } = (rawBody || {}) as {
      imageBase64?: string;
      mimeType?: string;
      targetDateLabel?: string;
      shift?: "manha" | "noite";
    };

    if (!imageBase64 || !mimeType) {
      return {
        status: 400,
        body: { error: "Envie uma imagem válida da escala para fazer a leitura." },
      };
    }

    const ai = getGeminiClient();
    if (!ai) {
      return {
        status: 500,
        body: { error: "Chave da API Gemini não configurada no servidor." },
      };
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
6. Para "PASTORES" / "Pastor(a)", use "${targetShift}-pastores".
7. Para "LOUVOR 3 a 6 anos", use "noite-louvor-3a6".
8. Para "COORDENAÇÃO" / "Coordenador(a)", use "${targetShift}-coordenador".
9. Ignore linhas que não estão nos groupIds permitidos.
10. Se uma célula estiver vazia, não invente nomes; apenas omita ou não adicione item.
11. Também liste todas as colunas de datas visíveis no cabeçalho da tabela (ex: ["1/nov", "8/nov", "15/nov", "22/nov", "29/nov"]).`;

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
      ? parsed.assignments
          .filter(
            (item: { groupId?: string; volunteerName?: string }) =>
              item &&
              typeof item.groupId === "string" &&
              validSet.has(item.groupId) &&
              typeof item.volunteerName === "string" &&
              item.volunteerName.trim().length > 0
          )
          .map((item: { groupId: string; volunteerName: string }) => ({
            groupId: item.groupId,
            volunteerName: formatVolunteerNameServer(item.volunteerName),
          }))
      : [];

    return {
      status: 200,
      body: {
        detectedDateColumns: Array.isArray(parsed.detectedDateColumns)
          ? parsed.detectedDateColumns
          : [],
        extractedDateUsed: parsed.extractedDateUsed || targetDateLabel || "",
        assignments: sanitizedAssignments,
      },
    };
  } catch (err) {
    console.error("Erro ao ler imagem da escala:", err);
    const message =
      err instanceof Error ? err.message : "Erro ao processar a imagem.";
    return {
      status: 500,
      body: {
        error: `Não foi possível interpretar a imagem da escala: ${message}`,
      },
    };
  }
}

export async function handleExtractVolunteers(rawBody: unknown): Promise<HandlerResult> {
  try {
    const { imageBase64, mimeType } = (rawBody || {}) as {
      imageBase64?: string;
      mimeType?: string;
    };

    if (!imageBase64 || !mimeType) {
      return {
        status: 400,
        body: {
          error: "Envie uma imagem válida para extrair os nomes dos voluntários.",
        },
      };
    }

    const ai = getGeminiClient();
    if (!ai) {
      return {
        status: 500,
        body: { error: "Chave da API Gemini não configurada no servidor." },
      };
    }

    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const resolvedMimeType =
      dataUrlMatch?.[1] ||
      (mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg");

    const cleanBase64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const prompt = `Você é um extrator preciso de nomes de voluntários do Ministério Infantil (MEVAM Kids).
Analise TODA a imagem enviada (todas as colunas de datas, todas as turmas, manhã e noite, ou lista de nomes).
Extraia TODOS os nomes de voluntários encontrados na imagem, junto com a função/turma em que aparecem (ex: "Louvor 3 a 6 anos", "Professor(a) 5 anos", "Auxiliar 5 anos", "Refeitório", "Pipoca", "Segurança", "Mídia", "Pastor(a)", "Coordenador(a)", ou "Voluntário" se for uma lista simples sem função).

Regras importantes:
1. Leia TODAS as colunas e TODAS as linhas da imagem, sem pular nenhum domingo ou turma.
2. NÃO inclua cabeçalhos de datas (ex: "1/nov", "15/11"), horários, títulos de colunas ou rótulos vazios ("-", "X", "vago").
3. Se uma célula tiver dois ou mais nomes separados por "/" ou "," ou quebra de linha, retorne cada pessoa como um item separado.
4. Mantenha duplas escritas juntas com "e" (como "Pr. William e Liara" ou "Odivaldo e Nice") exatamente como aparecem na célula.
5. Preserve a grafia exata e acentuação de cada nome encontrado na imagem.`;

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
            volunteers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: "Nome do voluntário exatamente como aparece na imagem.",
                  },
                  role: {
                    type: Type.STRING,
                    description: "Função, turma ou contexto em que esse nome aparece na imagem.",
                  },
                },
                required: ["name", "role"],
              },
            },
          },
          required: ["volunteers"],
        },
      },
    });

    const rawText = (response.text ?? "{}").trim();
    const parsed = JSON.parse(rawText);
    const rawList = Array.isArray(parsed.volunteers) ? parsed.volunteers : [];

    const seenPairs = new Set<string>();
    const volunteers: { name: string; role: string }[] = [];

    for (const item of rawList) {
      if (!item || typeof item.name !== "string") continue;
      const cleanName = formatVolunteerNameServer(item.name);
      if (!cleanName || cleanName.length < 2) continue;
      const cleanRole =
        typeof item.role === "string" && item.role.trim()
          ? item.role.trim()
          : "Voluntário";
      const pairKey = `${normalizeNameKeyServer(cleanName)}::${normalizeNameKeyServer(cleanRole)}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      volunteers.push({ name: cleanName, role: cleanRole });
    }

    return {
      status: 200,
      body: { volunteers },
    };
  } catch (err) {
    console.error("Erro ao extrair lista de voluntários:", err);
    const message =
      err instanceof Error ? err.message : "Erro ao processar a imagem.";
    return {
      status: 500,
      body: {
        error: `Não foi possível extrair os voluntários da imagem: ${message}`,
      },
    };
  }
}

export async function handleCloudStateGet(): Promise<HandlerResult> {
  try {
    const cfg = getSupabaseConfig();
    if (!cfg.configured) {
      return { status: 200, body: { configured: false } };
    }
    const db = createSupabaseServerClient();
    if (!db) {
      return { status: 200, body: { configured: false } };
    }

    const [entriesRes, contactsRes, linksRes, templatesRes] = await Promise.all([
      db
        .from("escala_entries")
        .select(
          "id, date, shift, group_id, volunteer_name, phone, status, message_sent"
        ),
      db.from("escala_contacts").select("name_key, volunteer_name, phone"),
      db
        .from("escala_contact_links")
        .select(
          "id, name_key_a, name_key_b, display_name_a, display_name_b, relation"
        ),
      db
        .from("escala_templates")
        .select("default_noite, default_manha, group_overrides")
        .eq("id", "default")
        .maybeSingle(),
    ]);

    const firstErr =
      entriesRes.error ||
      contactsRes.error ||
      linksRes.error ||
      templatesRes.error;
    if (firstErr) {
      if (isMissingTableError(firstErr)) {
        return {
          status: 400,
          body: {
            configured: true,
            needsSchemaSetup: true,
            error:
              "As tabelas ainda não foram criadas ou estão desatualizadas no Supabase. Execute o script supabase/schema.sql no SQL Editor do seu projeto.",
          },
        };
      }
      return {
        status: 500,
        body: { configured: true, error: firstErr.message },
      };
    }

    const entries = (entriesRes.data || []).map((row) => ({
      id: row.id,
      date: row.date,
      shift: row.shift,
      groupId: row.group_id,
      volunteerName: formatVolunteerNameServer(row.volunteer_name || ""),
      phone: row.phone || "",
      status: row.status || "pendente",
      messageSent: Boolean(row.message_sent),
    }));

    const contactBook: Record<string, string> = {};
    const contactNames: Record<string, string> = {};
    for (const row of contactsRes.data || []) {
      const normKey = normalizeNameKeyServer(row.name_key || "");
      if (!normKey) continue;
      if (row.phone) {
        contactBook[normKey] = row.phone;
      }
      if (row.volunteer_name) {
        contactNames[normKey] = formatVolunteerNameServer(row.volunteer_name);
      }
    }

    const contactLinks = (linksRes.data || []).map((row) => ({
      id: row.id,
      nameKeyA: row.name_key_a,
      nameKeyB: row.name_key_b,
      displayNameA: formatVolunteerNameServer(row.display_name_a || row.name_key_a),
      displayNameB: formatVolunteerNameServer(row.display_name_b || row.name_key_b),
      relation: row.relation === "same" ? "same" : "distinct",
    }));

    const templates = templatesRes.data
      ? {
          defaultNoite: templatesRes.data.default_noite,
          defaultManha: templatesRes.data.default_manha,
          groupOverrides: templatesRes.data.group_overrides || {},
        }
      : null;

    return {
      status: 200,
      body: {
        configured: true,
        entries,
        contactBook,
        contactNames,
        contactLinks,
        templates,
      },
    };
  } catch (err) {
    console.error("Erro ao carregar dados do Supabase:", err);
    return {
      status: 500,
      body: {
        configured: true,
        error: "Erro ao sincronizar leitura com o Supabase.",
      },
    };
  }
}

export async function handleCloudStatePut(rawBody: unknown): Promise<HandlerResult> {
  try {
    const cfg = getSupabaseConfig();
    if (!cfg.configured) {
      return {
        status: 503,
        body: {
          configured: false,
          error: "Supabase não configurado em Settings > Secrets.",
        },
      };
    }
    const db = createSupabaseServerClient();
    if (!db) {
      return { status: 503, body: { error: "Banco indisponível." } };
    }

    const { entries, contactBook, contactNames, contactLinks, templates } =
      (rawBody || {}) as {
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
        contactNames?: Record<string, string>;
        contactLinks?: Array<{
          id: string;
          nameKeyA: string;
          nameKeyB: string;
          displayNameA: string;
          displayNameB: string;
          relation: "same" | "distinct";
        }>;
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
        volunteer_name: formatVolunteerNameServer(e.volunteerName),
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
            return {
              status: 400,
              body: {
                needsSchemaSetup: true,
                error:
                  "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
              },
            };
          }
          return { status: 500, body: { error: upsertErr.message } };
        }
      }

      const { data: existingRows, error: existingErr } = await db
        .from("escala_entries")
        .select("id");
      if (existingErr) {
        if (isMissingTableError(existingErr)) {
          return {
            status: 400,
            body: {
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            },
          };
        }
        return { status: 500, body: { error: existingErr.message } };
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
          return { status: 500, body: { error: delErr.message } };
        }
      }
    }

    if (
      (contactBook && typeof contactBook === "object") ||
      (contactNames && typeof contactNames === "object")
    ) {
      const dedupContacts = new Map<
        string,
        { name_key: string; volunteer_name: string; phone: string; updated_at: string }
      >();
      const allKeys = new Set<string>([
        ...Object.keys(contactBook || {}),
        ...Object.keys(contactNames || {}),
      ]);

      for (const k of allKeys) {
        const normKey = normalizeNameKeyServer(k);
        if (!normKey) continue;
        const rawPhone = contactBook?.[normKey] ?? contactBook?.[k] ?? "";
        const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";
        const displayName = formatVolunteerNameServer(
          contactNames?.[normKey]?.trim() ||
            contactNames?.[k]?.trim() ||
            k.trim()
        );
        const prev = dedupContacts.get(normKey);
        dedupContacts.set(normKey, {
          name_key: normKey,
          volunteer_name:
            prev && prev.volunteer_name.length > displayName.length
              ? prev.volunteer_name
              : displayName,
          phone: phone || prev?.phone || "",
          updated_at: nowIso,
        });
      }
      const contactRows = Array.from(dedupContacts.values());

      if (contactRows.length > 0) {
        const { error: cUpsertErr } = await db
          .from("escala_contacts")
          .upsert(contactRows, { onConflict: "name_key" });
        if (cUpsertErr) {
          if (isMissingTableError(cUpsertErr)) {
            return {
              status: 400,
              body: {
                needsSchemaSetup: true,
                error:
                  "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
              },
            };
          }
          return { status: 500, body: { error: cUpsertErr.message } };
        }
      }

      const { data: existingContacts, error: cSelectErr } = await db
        .from("escala_contacts")
        .select("name_key");
      if (cSelectErr) {
        if (isMissingTableError(cSelectErr)) {
          return {
            status: 400,
            body: {
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            },
          };
        }
        return { status: 500, body: { error: cSelectErr.message } };
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
          return { status: 500, body: { error: cDelErr.message } };
        }
      }
    }

    if (Array.isArray(contactLinks)) {
      const linkRows = contactLinks
        .filter((l) => l && l.id && l.nameKeyA && l.nameKeyB)
        .map((l) => ({
          id: l.id,
          name_key_a: normalizeNameKeyServer(l.nameKeyA),
          name_key_b: normalizeNameKeyServer(l.nameKeyB),
          display_name_a: l.displayNameA || l.nameKeyA,
          display_name_b: l.displayNameB || l.nameKeyB,
          relation: l.relation === "same" ? "same" : "distinct",
          updated_at: nowIso,
        }));

      if (linkRows.length > 0) {
        const { error: lUpsertErr } = await db
          .from("escala_contact_links")
          .upsert(linkRows, { onConflict: "id" });
        if (lUpsertErr) {
          if (isMissingTableError(lUpsertErr)) {
            return {
              status: 400,
              body: {
                needsSchemaSetup: true,
                error:
                  "As tabelas ainda não foram criadas ou estão desatualizadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
              },
            };
          }
          return { status: 500, body: { error: lUpsertErr.message } };
        }
      }

      const { data: existingLinks, error: lSelectErr } = await db
        .from("escala_contact_links")
        .select("id");
      if (lSelectErr) {
        if (isMissingTableError(lSelectErr)) {
          return {
            status: 400,
            body: {
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas ou estão desatualizadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            },
          };
        }
        return { status: 500, body: { error: lSelectErr.message } };
      }
      const incomingLinkIds = new Set(linkRows.map((l) => l.id));
      const linkIdsToDelete = (existingLinks || [])
        .map((l) => l.id as string)
        .filter((id) => !incomingLinkIds.has(id));
      if (linkIdsToDelete.length > 0) {
        const { error: lDelErr } = await db
          .from("escala_contact_links")
          .delete()
          .in("id", linkIdsToDelete);
        if (lDelErr) {
          return { status: 500, body: { error: lDelErr.message } };
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
          return {
            status: 400,
            body: {
              needsSchemaSetup: true,
              error:
                "As tabelas ainda não foram criadas no Supabase. Execute o script supabase/schema.sql no SQL Editor.",
            },
          };
        }
        return { status: 500, body: { error: tErr.message } };
      }
    }

    return { status: 200, body: { ok: true, syncedAt: nowIso } };
  } catch (err) {
    console.error("Erro ao salvar dados no Supabase:", err);
    return {
      status: 500,
      body: { error: "Erro ao salvar alterações no Supabase." },
    };
  }
}

export interface NodeLikeRequest {
  method?: string;
  body?: unknown;
  on?: (event: string, cb: (chunk: Uint8Array | string) => void) => void;
}

export interface NodeLikeResponse {
  status: (code: number) => NodeLikeResponse;
  json: (data: unknown) => void;
}

export async function readRequestJsonBody(req: NodeLikeRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
    return req.body;
  }
  if (!req.on) return {};
  return new Promise((resolve) => {
    const chunks: string[] = [];
    req.on!("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    });
    req.on!("end", () => {
      const joined = chunks.join("").trim();
      if (!joined) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(joined));
      } catch {
        resolve({});
      }
    });
  });
}
