import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  OFFICIAL_CATALOG_VERSION,
  OFFICIAL_VOLUNTEERS,
} from "../src/data/officialVolunteers.ts";

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

function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    msg.includes("column") ||
    msg.includes("could not find the")
  );
}

const CONTACTS_BASE_SELECT = "name_key, volunteer_name, phone";
const CONTACTS_EXTENDED_SELECT =
  "name_key, volunteer_name, phone, birth_day, birth_month, roles, preferred_shifts, family_group_id, family_group_name, family_sync_mode, birthday_sent_year";

const ALLOWED_ROLE_KEYS = new Set([
  "louvor",
  "professor",
  "auxiliar",
  "refeitorio",
  "aux-refeitorio",
  "pipoca",
  "aux-pipoca",
  "midia",
  "seguranca",
  "pastor",
  "coordenador",
]);

function sanitizeProfileFromRow(row: Record<string, unknown>) {
  const birthMonth =
    typeof row.birth_month === "number" &&
    Number.isInteger(row.birth_month) &&
    row.birth_month >= 1 &&
    row.birth_month <= 12
      ? row.birth_month
      : null;
  const birthDay =
    birthMonth &&
    typeof row.birth_day === "number" &&
    Number.isInteger(row.birth_day) &&
    row.birth_day >= 1 &&
    row.birth_day <= 31
      ? row.birth_day
      : null;
  const roles = Array.isArray(row.roles)
    ? Array.from(
        new Set(
          row.roles.map((r) => String(r)).filter((r) => ALLOWED_ROLE_KEYS.has(r))
        )
      )
    : [];
  const preferredShifts = Array.isArray(row.preferred_shifts)
    ? Array.from(
        new Set(
          row.preferred_shifts
            .map((s) => String(s))
            .filter((s) => s === "manha" || s === "noite")
        )
      )
    : [];
  const familyGroupId =
    typeof row.family_group_id === "string" ? row.family_group_id.trim() : "";
  const familyGroupName =
    typeof row.family_group_name === "string" ? row.family_group_name.trim() : "";
  const familySyncMode =
    row.family_sync_mode === "same_day" ? "same_day" : "same_shift";
  const birthdaySentYear =
    typeof row.birthday_sent_year === "number" &&
    Number.isInteger(row.birthday_sent_year) &&
    row.birthday_sent_year >= 2020
      ? row.birthday_sent_year
      : null;

  return {
    birthDay,
    birthMonth,
    roles,
    preferredShifts,
    familyGroupId,
    familyGroupName,
    familySyncMode,
    birthdaySentYear,
  };
}

function sanitizeIncomingProfile(raw: Record<string, unknown> | undefined | null) {
  const birthMonth =
    typeof raw?.birthMonth === "number" &&
    Number.isInteger(raw.birthMonth) &&
    raw.birthMonth >= 1 &&
    raw.birthMonth <= 12
      ? raw.birthMonth
      : null;
  const birthDay =
    birthMonth &&
    typeof raw?.birthDay === "number" &&
    Number.isInteger(raw.birthDay) &&
    raw.birthDay >= 1 &&
    raw.birthDay <= 31
      ? raw.birthDay
      : null;
  const roles = Array.isArray(raw?.roles)
    ? Array.from(
        new Set(
          raw.roles.map((r) => String(r)).filter((r) => ALLOWED_ROLE_KEYS.has(r))
        )
      )
    : [];
  const preferredShifts = Array.isArray(raw?.preferredShifts)
    ? Array.from(
        new Set(
          raw.preferredShifts
            .map((s) => String(s))
            .filter((s) => s === "manha" || s === "noite")
        )
      )
    : [];
  const familyGroupId =
    typeof raw?.familyGroupId === "string" ? raw.familyGroupId.trim() : "";
  const familyGroupName =
    typeof raw?.familyGroupName === "string" ? raw.familyGroupName.trim() : "";
  const familySyncMode =
    raw?.familySyncMode === "same_day" ? "same_day" : "same_shift";
  const birthdaySentYear =
    typeof raw?.birthdaySentYear === "number" &&
    Number.isInteger(raw.birthdaySentYear) &&
    raw.birthdaySentYear >= 2020
      ? raw.birthdaySentYear
      : null;

  return {
    birth_day: birthDay,
    birth_month: birthMonth,
    roles,
    preferred_shifts: preferredShifts,
    family_group_id: familyGroupId,
    family_group_name: familyGroupName,
    family_sync_mode: familySyncMode,
    birthday_sent_year: birthdaySentYear,
  };
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

const DEFAULT_TEMPLATE_FALLBACK = `{saudacao} 🤗
A paz do Senhor Jesus!

Passando pra confirmar nossa escala desse domingo, dia {data} no Culto da {culto}.

{grupo}

Tudo certo?

❤️🔥Lembrando tbm da nossa oração com toda equipe no templo kids as {horario_oracao}.`;

async function syncOfficialVolunteersCatalog(
  db: SupabaseClient,
  existingTemplateRow: {
    default_noite?: string;
    default_manha?: string;
    group_overrides?: Record<string, string>;
  } | null
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const officialMap = new Map<
    string,
    { name_key: string; volunteer_name: string; phone: string; updated_at: string }
  >();

  for (const vol of OFFICIAL_VOLUNTEERS) {
    const cleanName = formatVolunteerNameServer(vol.name);
    const key = normalizeNameKeyServer(cleanName);
    if (!key) continue;
    officialMap.set(key, {
      name_key: key,
      volunteer_name: cleanName,
      phone: vol.phone.trim(),
      updated_at: nowIso,
    });
  }

  const officialRows = Array.from(officialMap.values());
  const { error: upsertErr } = await db
    .from("escala_contacts")
    .upsert(officialRows, { onConflict: "name_key" });
  if (upsertErr) {
    throw upsertErr;
  }

  const { data: existingContacts, error: selectContactsErr } = await db
    .from("escala_contacts")
    .select("name_key");
  if (selectContactsErr) {
    throw selectContactsErr;
  }

  const keysToDelete = (existingContacts || [])
    .map((r) => String(r.name_key || ""))
    .filter((k) => k && !officialMap.has(k));

  if (keysToDelete.length > 0) {
    const { error: delErr } = await db
      .from("escala_contacts")
      .delete()
      .in("name_key", keysToDelete);
    if (delErr) {
      throw delErr;
    }
  }

  // Propagate clean phones to matching schedule entries
  const { data: currentEntries } = await db
    .from("escala_entries")
    .select("id, volunteer_name, phone");
  if (Array.isArray(currentEntries)) {
    const entryUpdates: Array<{ id: string; phone: string; updated_at: string }> = [];
    for (const row of currentEntries) {
      const key = normalizeNameKeyServer(String(row.volunteer_name || ""));
      const matched = officialMap.get(key);
      if (matched && matched.phone && matched.phone !== (row.phone || "").trim()) {
        entryUpdates.push({
          id: String(row.id),
          phone: matched.phone,
          updated_at: nowIso,
        });
      }
    }
    for (const upd of entryUpdates) {
      await db
        .from("escala_entries")
        .update({ phone: upd.phone, updated_at: upd.updated_at })
        .eq("id", upd.id);
    }
  }

  // Clean obsolete contact links referencing removed keys
  const { data: currentLinks } = await db
    .from("escala_contact_links")
    .select("id, name_key_a, name_key_b");
  if (Array.isArray(currentLinks)) {
    const invalidLinkIds = currentLinks
      .filter(
        (l) =>
          !officialMap.has(normalizeNameKeyServer(String(l.name_key_a || ""))) &&
          !officialMap.has(normalizeNameKeyServer(String(l.name_key_b || "")))
      )
      .map((l) => String(l.id));
    if (invalidLinkIds.length > 0) {
      await db.from("escala_contact_links").delete().in("id", invalidLinkIds);
    }
  }

  const prevOverrides =
    existingTemplateRow?.group_overrides &&
    typeof existingTemplateRow.group_overrides === "object"
      ? existingTemplateRow.group_overrides
      : {};

  const { error: tplErr } = await db.from("escala_templates").upsert(
    {
      id: "default",
      default_noite: existingTemplateRow?.default_noite || DEFAULT_TEMPLATE_FALLBACK,
      default_manha: existingTemplateRow?.default_manha || DEFAULT_TEMPLATE_FALLBACK,
      group_overrides: {
        ...prevOverrides,
        __catalog_version: OFFICIAL_CATALOG_VERSION,
      },
      updated_at: nowIso,
    },
    { onConflict: "id" }
  );
  if (tplErr) {
    throw tplErr;
  }
  return true;
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

    const [entriesRes, extendedContactsRes, linksRes, templatesRes] =
      await Promise.all([
        db
          .from("escala_entries")
          .select(
            "id, date, shift, group_id, volunteer_name, phone, status, message_sent"
          ),
        db.from("escala_contacts").select(CONTACTS_EXTENDED_SELECT),
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

    let contactsRes: { data: Array<Record<string, unknown>> | null; error: { code?: string; message?: string } | null } =
      extendedContactsRes as unknown as {
        data: Array<Record<string, unknown>> | null;
        error: { code?: string; message?: string } | null;
      };
    let needsProfileSchemaUpdate = false;

    if (contactsRes.error && !isMissingTableError(contactsRes.error) && isMissingColumnError(contactsRes.error)) {
      needsProfileSchemaUpdate = true;
      contactsRes = (await db
        .from("escala_contacts")
        .select(CONTACTS_BASE_SELECT)) as unknown as {
        data: Array<Record<string, unknown>> | null;
        error: { code?: string; message?: string } | null;
      };
    }

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

    // One-time atomic cleanup/seed of the official 145 volunteers in Supabase
    const overridesObj =
      templatesRes.data?.group_overrides &&
      typeof templatesRes.data.group_overrides === "object"
        ? (templatesRes.data.group_overrides as Record<string, string>)
        : {};
    if (overridesObj.__catalog_version !== OFFICIAL_CATALOG_VERSION) {
      await syncOfficialVolunteersCatalog(db, templatesRes.data || null);
      const [freshEntriesRes, freshContactsRes, freshLinksRes, freshTemplatesRes] =
        await Promise.all([
          db
            .from("escala_entries")
            .select(
              "id, date, shift, group_id, volunteer_name, phone, status, message_sent"
            ),
          db
            .from("escala_contacts")
            .select(needsProfileSchemaUpdate ? CONTACTS_BASE_SELECT : CONTACTS_EXTENDED_SELECT),
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

      return formatCloudStateResponse({
        entriesData: freshEntriesRes.data || [],
        contactsData:
          (freshContactsRes.data as unknown as Array<Record<string, unknown>>) ||
          [],
        linksData: freshLinksRes.data || [],
        templatesData: freshTemplatesRes.data || null,
        needsProfileSchemaUpdate,
      });
    }

    return formatCloudStateResponse({
      entriesData: entriesRes.data || [],
      contactsData: contactsRes.data || [],
      linksData: linksRes.data || [],
      templatesData: templatesRes.data || null,
      needsProfileSchemaUpdate,
    });
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

function formatCloudStateResponse(params: {
  entriesData: Array<Record<string, unknown>>;
  contactsData: Array<Record<string, unknown>>;
  linksData: Array<Record<string, unknown>>;
  templatesData: Record<string, unknown> | null;
  needsProfileSchemaUpdate?: boolean;
}): HandlerResult {
  const entries = params.entriesData.map((row) => ({
    id: row.id,
    date: row.date,
    shift: row.shift,
    groupId: row.group_id,
    volunteerName: formatVolunteerNameServer(String(row.volunteer_name || "")),
    phone: row.phone || "",
    status: row.status || "pendente",
    messageSent: Boolean(row.message_sent),
  }));

  const contactBook: Record<string, string> = {};
  const contactNames: Record<string, string> = {};
  const volunteerProfiles: Record<string, ReturnType<typeof sanitizeProfileFromRow>> = {};
  for (const row of params.contactsData) {
    const normKey = normalizeNameKeyServer(String(row.name_key || ""));
    if (!normKey) continue;
    const display = formatVolunteerNameServer(
      String(row.volunteer_name || row.name_key || "")
    );
    if (display) {
      contactNames[normKey] = display;
    }
    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    if (phone) {
      contactBook[normKey] = phone;
    }
    if (!params.needsProfileSchemaUpdate) {
      volunteerProfiles[normKey] = sanitizeProfileFromRow(row);
    }
  }

  const contactLinks = params.linksData.map((row) => ({
    id: row.id,
    nameKeyA: row.name_key_a,
    nameKeyB: row.name_key_b,
    displayNameA: formatVolunteerNameServer(
      String(row.display_name_a || row.name_key_a || "")
    ),
    displayNameB: formatVolunteerNameServer(
      String(row.display_name_b || row.name_key_b || "")
    ),
    relation: row.relation === "same" ? "same" : "distinct",
  }));

  const rawOverrides =
    params.templatesData?.group_overrides &&
    typeof params.templatesData.group_overrides === "object"
      ? { ...(params.templatesData.group_overrides as Record<string, string>) }
      : {};
  delete rawOverrides.__catalog_version;

  const templates = params.templatesData
    ? {
        defaultNoite: params.templatesData.default_noite,
        defaultManha: params.templatesData.default_manha,
        groupOverrides: rawOverrides,
      }
    : null;

  return {
    status: 200,
    body: {
      configured: true,
      needsProfileSchemaUpdate: Boolean(params.needsProfileSchemaUpdate),
      entries,
      contactBook,
      contactNames,
      volunteerProfiles,
      contactLinks,
      templates,
    },
  };
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
          group_overrides: {
            ...(templates.groupOverrides || {}),
            __catalog_version: OFFICIAL_CATALOG_VERSION,
          },
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

export async function handleCloudStatePost(rawBody: unknown): Promise<HandlerResult> {
  try {
    const cfg = getSupabaseConfig();
    if (!cfg.configured) {
      return { status: 200, body: { configured: false } };
    }
    const db = createSupabaseServerClient();
    if (!db) {
      return { status: 503, body: { error: "Banco indisponível." } };
    }

    const body = (rawBody || {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const nowIso = new Date().toISOString();

    if (action === "upsert_volunteer") {
      const cleanName = formatVolunteerNameServer(String(body.name || ""));
      const nameKey = normalizeNameKeyServer(cleanName);
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      if (!nameKey) {
        return { status: 400, body: { error: "Nome do voluntário inválido." } };
      }

      const { data: existingRow } = await db
        .from("escala_contacts")
        .select("name_key, volunteer_name, phone")
        .eq("name_key", nameKey)
        .maybeSingle();

      const finalPhone = phone !== "" || body.allowEmptyPhone ? phone : String(existingRow?.phone || "");

      const { error: upErr } = await db.from("escala_contacts").upsert(
        {
          name_key: nameKey,
          volunteer_name: cleanName,
          phone: finalPhone,
          updated_at: nowIso,
        },
        { onConflict: "name_key" }
      );
      if (upErr) return { status: 500, body: { error: upErr.message } };

      if (finalPhone) {
        const { data: allEntries } = await db
          .from("escala_entries")
          .select("id, volunteer_name");
        const matchingIds = (allEntries || [])
          .filter((r) => normalizeNameKeyServer(String(r.volunteer_name || "")) === nameKey)
          .map((r) => String(r.id));
        if (matchingIds.length > 0) {
          await db
            .from("escala_entries")
            .update({ phone: finalPhone, updated_at: nowIso })
            .in("id", matchingIds);
        }
      }
    } else if (action === "rename_volunteer") {
      const oldKey = normalizeNameKeyServer(String(body.oldKey || ""));
      const cleanNewName = formatVolunteerNameServer(String(body.newName || ""));
      const newKey = normalizeNameKeyServer(cleanNewName);
      if (!oldKey || !newKey || !cleanNewName) {
        return { status: 400, body: { error: "Nome inválido para renomeação." } };
      }

      let hasProfileCols = true;
      let oldRowRes = await db
        .from("escala_contacts")
        .select(CONTACTS_EXTENDED_SELECT)
        .eq("name_key", oldKey)
        .maybeSingle();
      if (oldRowRes.error && isMissingColumnError(oldRowRes.error)) {
        hasProfileCols = false;
        oldRowRes = (await db
          .from("escala_contacts")
          .select(CONTACTS_BASE_SELECT)
          .eq("name_key", oldKey)
          .maybeSingle()) as typeof oldRowRes;
      }

      const newRowRes = await db
        .from("escala_contacts")
        .select(hasProfileCols ? CONTACTS_EXTENDED_SELECT : CONTACTS_BASE_SELECT)
        .eq("name_key", newKey)
        .maybeSingle();

      const oldRow = oldRowRes.data as Record<string, unknown> | null;
      const newRow = newRowRes.data as Record<string, unknown> | null;

      const resolvedPhone =
        (typeof body.phone === "string" ? body.phone.trim() : "") ||
        String(newRow?.phone || "").trim() ||
        String(oldRow?.phone || "").trim();

      const upsertPayload: Record<string, unknown> = {
        name_key: newKey,
        volunteer_name: cleanNewName,
        phone: resolvedPhone,
        updated_at: nowIso,
      };
      if (hasProfileCols) {
        const sourceProfileRow = oldRow || newRow || {};
        upsertPayload.birth_day = sourceProfileRow.birth_day ?? null;
        upsertPayload.birth_month = sourceProfileRow.birth_month ?? null;
        upsertPayload.roles = Array.isArray(sourceProfileRow.roles)
          ? sourceProfileRow.roles
          : [];
        upsertPayload.preferred_shifts = Array.isArray(
          sourceProfileRow.preferred_shifts
        )
          ? sourceProfileRow.preferred_shifts
          : [];
        upsertPayload.family_group_id =
          typeof sourceProfileRow.family_group_id === "string"
            ? sourceProfileRow.family_group_id
            : "";
        upsertPayload.family_group_name =
          typeof sourceProfileRow.family_group_name === "string"
            ? sourceProfileRow.family_group_name
            : "";
        upsertPayload.family_sync_mode =
          sourceProfileRow.family_sync_mode === "same_day"
            ? "same_day"
            : "same_shift";
        upsertPayload.birthday_sent_year =
          sourceProfileRow.birthday_sent_year ?? null;
      }

      const { error: upErr } = await db
        .from("escala_contacts")
        .upsert(upsertPayload, { onConflict: "name_key" });
      if (upErr) return { status: 500, body: { error: upErr.message } };

      if (oldKey !== newKey) {
        await db.from("escala_contacts").delete().eq("name_key", oldKey);
      }

      const { data: allEntries } = await db
        .from("escala_entries")
        .select("id, volunteer_name, phone");
      const entryIdsToUpdate = (allEntries || [])
        .filter((r) => normalizeNameKeyServer(String(r.volunteer_name || "")) === oldKey)
        .map((r) => ({
          id: String(r.id),
          phone: String(r.phone || "").trim() || resolvedPhone,
        }));

      for (const item of entryIdsToUpdate) {
        await db
          .from("escala_entries")
          .update({
            volunteer_name: cleanNewName,
            phone: item.phone,
            updated_at: nowIso,
          })
          .eq("id", item.id);
      }

      if (oldKey !== newKey) {
        const { data: links } = await db
          .from("escala_contact_links")
          .select("id, name_key_a, name_key_b, display_name_a, display_name_b, relation");
        for (const l of links || []) {
          const kA = normalizeNameKeyServer(String(l.name_key_a || ""));
          const kB = normalizeNameKeyServer(String(l.name_key_b || ""));
          if (kA !== oldKey && kB !== oldKey) continue;
          const nextA = kA === oldKey ? newKey : kA;
          const nextB = kB === oldKey ? newKey : kB;
          if (nextA === nextB && l.relation === "distinct") {
            await db.from("escala_contact_links").delete().eq("id", String(l.id));
            continue;
          }
          const [first, second] = [nextA, nextB].sort((a, b) => a.localeCompare(b));
          const nextId = `${first}::${second}`;
          await db.from("escala_contact_links").delete().eq("id", String(l.id));
          await db.from("escala_contact_links").upsert(
            {
              id: nextId,
              name_key_a: nextA,
              name_key_b: nextB,
              display_name_a: nextA === newKey ? cleanNewName : String(l.display_name_a || nextA),
              display_name_b: nextB === newKey ? cleanNewName : String(l.display_name_b || nextB),
              relation: l.relation === "same" ? "same" : "distinct",
              updated_at: nowIso,
            },
            { onConflict: "id" }
          );
        }
      }
    } else if (action === "upsert_volunteer_profile") {
      const nameKey = normalizeNameKeyServer(String(body.nameKey || ""));
      const cleanName = formatVolunteerNameServer(
        String(body.volunteerName || body.nameKey || "")
      );
      if (!nameKey) {
        return { status: 400, body: { error: "Voluntário inválido." } };
      }

      const { data: existingRow } = await db
        .from("escala_contacts")
        .select("name_key, volunteer_name, phone")
        .eq("name_key", nameKey)
        .maybeSingle();

      const sanitized = sanitizeIncomingProfile(
        (body.profile || {}) as Record<string, unknown>
      );
      const { error: profErr } = await db.from("escala_contacts").upsert(
        {
          name_key: nameKey,
          volunteer_name: String(existingRow?.volunteer_name || cleanName),
          phone: String(existingRow?.phone || ""),
          ...sanitized,
          updated_at: nowIso,
        },
        { onConflict: "name_key" }
      );
      if (profErr) {
        if (isMissingColumnError(profErr)) {
          return {
            status: 400,
            body: {
              needsProfileSchemaUpdate: true,
              error:
                "Execute o script supabase/migration_fase1.sql no SQL Editor do Supabase para salvar aniversário, funções, turnos e família.",
            },
          };
        }
        return { status: 500, body: { error: profErr.message } };
      }
    } else if (action === "update_family_group") {
      const familyGroupId = String(body.familyGroupId || "").trim();
      const familyGroupName = String(body.familyGroupName || "").trim();
      const familySyncMode =
        body.familySyncMode === "same_day" ? "same_day" : "same_shift";
      const memberKeys = Array.isArray(body.memberKeys)
        ? Array.from(
            new Set(
              body.memberKeys
                .map((k) => normalizeNameKeyServer(String(k)))
                .filter(Boolean)
            )
          )
        : [];
      const removedKeys = Array.isArray(body.removedKeys)
        ? Array.from(
            new Set(
              body.removedKeys
                .map((k) => normalizeNameKeyServer(String(k)))
                .filter(Boolean)
            )
          )
        : [];

      if (memberKeys.length > 0 && familyGroupId) {
        const { error: famErr } = await db
          .from("escala_contacts")
          .update({
            family_group_id: familyGroupId,
            family_group_name: familyGroupName,
            family_sync_mode: familySyncMode,
            updated_at: nowIso,
          })
          .in("name_key", memberKeys);
        if (famErr) {
          if (isMissingColumnError(famErr)) {
            return {
              status: 400,
              body: {
                needsProfileSchemaUpdate: true,
                error:
                  "Execute o script supabase/migration_fase1.sql no SQL Editor do Supabase para salvar vínculos de parentesco.",
              },
            };
          }
          return { status: 500, body: { error: famErr.message } };
        }
      }

      if (removedKeys.length > 0) {
        const { error: remErr } = await db
          .from("escala_contacts")
          .update({
            family_group_id: "",
            family_group_name: "",
            family_sync_mode: "same_shift",
            updated_at: nowIso,
          })
          .in("name_key", removedKeys);
        if (remErr && !isMissingColumnError(remErr)) {
          return { status: 500, body: { error: remErr.message } };
        }
      }
    } else if (action === "mark_birthday_sent") {
      const nameKey = normalizeNameKeyServer(String(body.nameKey || ""));
      const year =
        typeof body.year === "number" && Number.isInteger(body.year)
          ? body.year
          : null;
      if (nameKey) {
        const { error: bErr } = await db
          .from("escala_contacts")
          .update({
            birthday_sent_year: year,
            updated_at: nowIso,
          })
          .eq("name_key", nameKey);
        if (bErr) {
          if (isMissingColumnError(bErr)) {
            return {
              status: 400,
              body: {
                needsProfileSchemaUpdate: true,
                error:
                  "Execute o script supabase/migration_fase1.sql no SQL Editor do Supabase para salvar o envio de felicitação.",
              },
            };
          }
          return { status: 500, body: { error: bErr.message } };
        }
      }
    } else if (action === "delete_volunteer") {
      const keys = Array.isArray(body.keys)
        ? body.keys.map((k) => normalizeNameKeyServer(String(k))).filter(Boolean)
        : [];
      if (keys.length > 0) {
        await db.from("escala_contacts").delete().in("name_key", keys);
        const keySet = new Set(keys);
        const { data: links } = await db
          .from("escala_contact_links")
          .select("id, name_key_a, name_key_b");
        const toDel = (links || [])
          .filter(
            (l) =>
              keySet.has(normalizeNameKeyServer(String(l.name_key_a || ""))) ||
              keySet.has(normalizeNameKeyServer(String(l.name_key_b || "")))
          )
          .map((l) => String(l.id));
        if (toDel.length > 0) {
          await db.from("escala_contact_links").delete().in("id", toDel);
        }
      }
    } else if (action === "replace_official_volunteers") {
      const { data: tplData } = await db
        .from("escala_templates")
        .select("default_noite, default_manha, group_overrides")
        .eq("id", "default")
        .maybeSingle();
      await syncOfficialVolunteersCatalog(db, tplData || null);
    } else if (action === "upsert_entry") {
      const entry = body.entry as {
        id: string;
        date: string;
        shift: "manha" | "noite";
        groupId: string;
        volunteerName: string;
        phone: string;
        status: "pendente" | "confirmado" | "recusado";
        messageSent: boolean;
      };
      if (entry && entry.id) {
        await db.from("escala_entries").upsert(
          {
            id: entry.id,
            date: entry.date,
            shift: entry.shift,
            group_id: entry.groupId,
            volunteer_name: formatVolunteerNameServer(entry.volunteerName || ""),
            phone: (entry.phone || "").trim(),
            status: entry.status || "pendente",
            message_sent: Boolean(entry.messageSent),
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
      }
    } else if (action === "update_entry") {
      const id = String(body.id || "");
      const patch = (body.patch || {}) as Record<string, unknown>;
      if (id) {
        const updatePayload: Record<string, unknown> = { updated_at: nowIso };
        if (typeof patch.status === "string") updatePayload.status = patch.status;
        if (typeof patch.messageSent === "boolean") updatePayload.message_sent = patch.messageSent;
        if (typeof patch.phone === "string") updatePayload.phone = patch.phone.trim();
        if (typeof patch.volunteerName === "string") {
          updatePayload.volunteer_name = formatVolunteerNameServer(patch.volunteerName);
        }
        await db.from("escala_entries").update(updatePayload).eq("id", id);
      }
    } else if (action === "delete_entry") {
      const id = String(body.id || "");
      if (id) {
        await db.from("escala_entries").delete().eq("id", id);
      }
    } else if (action === "add_entries") {
      const replaceDate = typeof body.replaceDate === "string" ? body.replaceDate : "";
      const replaceShift = typeof body.replaceShift === "string" ? body.replaceShift : "";
      if (replaceDate && replaceShift) {
        await db
          .from("escala_entries")
          .delete()
          .eq("date", replaceDate)
          .eq("shift", replaceShift);
      }
      const list = Array.isArray(body.entries) ? body.entries : [];
      if (list.length > 0) {
        const rows = list.map((e: Record<string, unknown>) => ({
          id: String(e.id),
          date: String(e.date),
          shift: e.shift === "manha" ? "manha" : "noite",
          group_id: String(e.groupId),
          volunteer_name: formatVolunteerNameServer(String(e.volunteerName || "")),
          phone: String(e.phone || "").trim(),
          status:
            e.status === "confirmado" || e.status === "recusado"
              ? e.status
              : "pendente",
          message_sent: Boolean(e.messageSent),
          updated_at: nowIso,
        }));
        await db.from("escala_entries").upsert(rows, { onConflict: "id" });
      }
    } else if (action === "upsert_link") {
      const link = body.link as {
        id: string;
        nameKeyA: string;
        nameKeyB: string;
        displayNameA: string;
        displayNameB: string;
        relation: "same" | "distinct";
      };
      if (link && link.id) {
        await db.from("escala_contact_links").upsert(
          {
            id: link.id,
            name_key_a: normalizeNameKeyServer(link.nameKeyA),
            name_key_b: normalizeNameKeyServer(link.nameKeyB),
            display_name_a: formatVolunteerNameServer(link.displayNameA || link.nameKeyA),
            display_name_b: formatVolunteerNameServer(link.displayNameB || link.nameKeyB),
            relation: link.relation === "same" ? "same" : "distinct",
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
      }
    } else if (action === "delete_link") {
      const id = String(body.id || "");
      if (id) {
        await db.from("escala_contact_links").delete().eq("id", id);
      }
    } else if (action === "upsert_templates") {
      const templates = body.templates as {
        defaultNoite: string;
        defaultManha: string;
        groupOverrides: Record<string, string>;
      };
      if (templates) {
        await db.from("escala_templates").upsert(
          {
            id: "default",
            default_noite: templates.defaultNoite,
            default_manha: templates.defaultManha,
            group_overrides: {
              ...(templates.groupOverrides || {}),
              __catalog_version: OFFICIAL_CATALOG_VERSION,
            },
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
      }
    } else {
      return { status: 400, body: { error: "Ação desconhecida." } };
    }

    const freshState = await handleCloudStateGet();
    if (freshState.status !== 200) return freshState;
    return {
      status: 200,
      body: { ok: true, syncedAt: nowIso, state: freshState.body },
    };
  } catch (err) {
    console.error("Erro na atualização atômica no Supabase:", err);
    return {
      status: 500,
      body: { error: "Erro ao atualizar dados compartilhados no Supabase." },
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
