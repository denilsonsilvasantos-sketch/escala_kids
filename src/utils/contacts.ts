import type {
  ContactLink,
  ContactMatchCandidate,
  PendingContactMatch,
  ScheduleEntry,
} from "../types/schedule";

const STOP_WORDS = new Set(["de", "da", "do", "dos", "das"]);

export function normalizeNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function makeCanonicalPairId(keyA: string, keyB: string): string {
  const [first, second] = [keyA, keyB].sort((a, b) => a.localeCompare(b));
  return `${first}::${second}`;
}

export function tokenizeName(name: string): string[] {
  const cleaned = normalizeNameKey(name).replace(
    /[.,/#!$%^&*;:{}=\-_`~()]/g,
    " "
  );
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

export function areNamesPotentialMatch(nameA: string, nameB: string): boolean {
  const keyA = normalizeNameKey(nameA);
  const keyB = normalizeNameKey(nameB);
  if (!keyA || !keyB || keyA === keyB) return false;

  const tokensA = tokenizeName(nameA);
  const tokensB = tokenizeName(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Couples like "Odivaldo e Nice" should not match a single person "Odivaldo"
  const hasCoupleA = tokensA.includes("e");
  const hasCoupleB = tokensB.includes("e");
  if (hasCoupleA !== hasCoupleB) return false;

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  // Example: "Samuel" vs "Samuel Rebouças" or "Samuel" vs "Samuel R."
  if (shorter.length === 1 && longer.length >= 2) {
    return shorter[0].length >= 3 && shorter[0] === longer[0];
  }

  // Example: "Samuel R." vs "Samuel Rebouças" or "Ana Paula" vs "Ana Paula Silva"
  if (shorter.length >= 2 && shorter.length <= longer.length) {
    if (shorter[0] !== longer[0]) return false;
    for (let i = 1; i < shorter.length; i += 1) {
      const sTok = shorter[i];
      const lTok = longer[i];
      if (sTok === lTok) continue;
      // Allow abbreviated surname initial like "R." matching "Rebouças"
      if (i === shorter.length - 1 && sTok.length === 1 && lTok.startsWith(sTok)) {
        continue;
      }
      return false;
    }
    return true;
  }

  return false;
}

export function getSamePersonKeys(
  nameKey: string,
  links: ContactLink[]
): Set<string> {
  const start = normalizeNameKey(nameKey);
  const visited = new Set<string>();
  if (!start) return visited;

  visited.add(start);
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const link of links) {
      if (link.relation !== "same") continue;
      const a = normalizeNameKey(link.nameKeyA);
      const b = normalizeNameKey(link.nameKeyB);
      if (a === current && b && !visited.has(b)) {
        visited.add(b);
        queue.push(b);
      } else if (b === current && a && !visited.has(a)) {
        visited.add(a);
        queue.push(a);
      }
    }
  }

  return visited;
}

export function areKeysLinkedSame(
  keyA: string,
  keyB: string,
  links: ContactLink[]
): boolean {
  const normA = normalizeNameKey(keyA);
  const normB = normalizeNameKey(keyB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  return getSamePersonKeys(normA, links).has(normB);
}

export function areKeysMarkedDistinct(
  keyA: string,
  keyB: string,
  links: ContactLink[]
): boolean {
  const groupA = getSamePersonKeys(keyA, links);
  const groupB = getSamePersonKeys(keyB, links);

  for (const link of links) {
    if (link.relation !== "distinct") continue;
    const a = normalizeNameKey(link.nameKeyA);
    const b = normalizeNameKey(link.nameKeyB);
    if (
      (groupA.has(a) && groupB.has(b)) ||
      (groupA.has(b) && groupB.has(a))
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeContactBookKeys(
  book: Record<string, string>,
  names?: Record<string, string>
): {
  book: Record<string, string>;
  names: Record<string, string>;
} {
  const nextBook: Record<string, string> = {};
  const nextNames: Record<string, string> = {};

  for (const [rawKey, rawPhone] of Object.entries(book || {})) {
    const norm = normalizeNameKey(rawKey);
    const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";
    if (!norm || !phone) continue;
    if (!nextBook[norm]) {
      nextBook[norm] = phone;
    }
    const candidateDisplay = names?.[rawKey] || names?.[norm] || rawKey;
    if (candidateDisplay.trim() && !nextNames[norm]) {
      nextNames[norm] = candidateDisplay.trim();
    }
  }

  for (const [rawKey, display] of Object.entries(names || {})) {
    const norm = normalizeNameKey(rawKey);
    if (norm && display.trim()) {
      nextNames[norm] = display.trim();
    }
  }

  return { book: nextBook, names: nextNames };
}

export function lookupPhoneInBook(
  name: string,
  contactBook: Record<string, string>,
  links: ContactLink[]
): string {
  const norm = normalizeNameKey(name);
  if (!norm) return "";

  const directRaw = contactBook[name.trim().toLowerCase()]?.trim();
  if (directRaw) return directRaw;

  const directNorm = contactBook[norm]?.trim();
  if (directNorm) return directNorm;

  const sameKeys = getSamePersonKeys(norm, links);
  for (const key of sameKeys) {
    const val = contactBook[key]?.trim();
    if (val) return val;
  }

  // Fallback for any legacy accented keys in contactBook
  for (const [k, val] of Object.entries(contactBook)) {
    if (sameKeys.has(normalizeNameKey(k)) && val.trim()) {
      return val.trim();
    }
  }

  return "";
}

export function hydrateEntriesWithSavedContacts(
  entries: ScheduleEntry[],
  contactBook: Record<string, string>,
  links: ContactLink[]
): { entries: ScheduleEntry[]; changed: boolean } {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.phone.trim()) return entry;
    const saved = lookupPhoneInBook(entry.volunteerName, contactBook, links);
    if (!saved) return entry;
    changed = true;
    return { ...entry, phone: saved };
  });
  return { entries: next, changed };
}

export function isSelfConfirmedSame(key: string, links: ContactLink[]): boolean {
  const norm = normalizeNameKey(key);
  if (!norm) return false;
  const selfId = makeCanonicalPairId(norm, norm);
  return links.some((l) => l.id === selfId && l.relation === "same");
}

export function buildKnownDirectory(params: {
  entries: ScheduleEntry[];
  contactBook: Record<string, string>;
  contactNames: Record<string, string>;
}): Map<string, { displayName: string; phone: string }> {
  const directory = new Map<string, { displayName: string; phone: string }>();

  for (const [rawKey, display] of Object.entries(params.contactNames)) {
    const key = normalizeNameKey(rawKey);
    if (!key || !display.trim()) continue;
    directory.set(key, {
      displayName: display.trim(),
      phone: (params.contactBook[key] || params.contactBook[rawKey] || "").trim(),
    });
  }

  for (const [rawKey, rawPhone] of Object.entries(params.contactBook)) {
    const key = normalizeNameKey(rawKey);
    if (!key) continue;
    const existing = directory.get(key);
    const displayName =
      existing?.displayName ||
      params.contactNames[key] ||
      params.contactNames[rawKey] ||
      rawKey;
    directory.set(key, {
      displayName: displayName.trim(),
      phone: rawPhone.trim() || existing?.phone || "",
    });
  }

  for (const entry of params.entries) {
    const rawName = entry.volunteerName.trim();
    const key = normalizeNameKey(rawName);
    if (!key) continue;
    const existing = directory.get(key);
    const entryPhone = entry.phone.trim();
    if (!existing) {
      directory.set(key, {
        displayName: rawName,
        phone: entryPhone,
      });
    } else {
      directory.set(key, {
        displayName:
          rawName.length >= existing.displayName.length
            ? rawName
            : existing.displayName,
        phone: existing.phone || entryPhone,
      });
    }
  }

  return directory;
}

export function findPendingMatchForName(params: {
  incomingName: string;
  incomingPhone?: string;
  incomingRole?: string;
  checkExactSameName?: boolean;
  entries: ScheduleEntry[];
  contactBook: Record<string, string>;
  contactNames: Record<string, string>;
  contactLinks: ContactLink[];
  excludeEntryId?: string;
}): PendingContactMatch | null {
  const cleanName = params.incomingName.trim();
  const incomingKey = normalizeNameKey(cleanName);
  if (!incomingKey) return null;

  const directory = buildKnownDirectory({
    entries: params.excludeEntryId
      ? params.entries.filter((e) => e.id !== params.excludeEntryId)
      : params.entries,
    contactBook: params.contactBook,
    contactNames: params.contactNames,
  });

  const candidates: ContactMatchCandidate[] = [];
  const seenKeys = new Set<string>();

  // Check if there are multiple distinct people sharing this first/exact name
  const hasDistinctSibling = params.contactLinks.some(
    (l) =>
      l.relation === "distinct" &&
      (normalizeNameKey(l.nameKeyA) === incomingKey ||
        normalizeNameKey(l.nameKeyB) === incomingKey)
  );

  for (const [candidateKey, info] of directory.entries()) {
    if (seenKeys.has(candidateKey)) continue;

    const isExactMatch = candidateKey === incomingKey;
    if (isExactMatch) {
      const shouldPromptExact =
        (params.checkExactSameName &&
          !isSelfConfirmedSame(incomingKey, params.contactLinks)) ||
        hasDistinctSibling;
      if (!shouldPromptExact) continue;
    } else {
      if (!areNamesPotentialMatch(cleanName, info.displayName || candidateKey)) {
        continue;
      }
      if (areKeysLinkedSame(incomingKey, candidateKey, params.contactLinks)) {
        continue;
      }
      if (areKeysMarkedDistinct(incomingKey, candidateKey, params.contactLinks)) {
        continue;
      }
    }

    // Group connected 'same' aliases so we show the cleanest single card per person
    const sameGroup = getSamePersonKeys(candidateKey, params.contactLinks);
    let bestDisplay = info.displayName || candidateKey;
    let bestPhone =
      info.phone ||
      lookupPhoneInBook(bestDisplay, params.contactBook, params.contactLinks);

    for (const k of sameGroup) {
      seenKeys.add(k);
      const member = directory.get(k);
      if (member) {
        if (member.displayName.length > bestDisplay.length) {
          bestDisplay = member.displayName;
        }
        if (!bestPhone && member.phone) {
          bestPhone = member.phone;
        }
      }
    }

    candidates.push({
      key: candidateKey,
      displayName: bestDisplay,
      phone: bestPhone,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (Boolean(a.phone) !== Boolean(b.phone)) {
      return a.phone ? -1 : 1;
    }
    return b.displayName.length - a.displayName.length;
  });

  const isSameNameMatch = candidates.some((c) => c.key === incomingKey);

  return {
    incomingName: cleanName,
    incomingKey,
    incomingPhone: (params.incomingPhone || "").trim(),
    incomingRole: params.incomingRole,
    matchType: isSameNameMatch ? "same-name" : "similar",
    candidates,
  };
}
