// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Full-Text Search Utilities
// Fuzzy search, Prisma query building, relevance scoring,
// text normalization, highlight matching, pagination, sorting.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Text Normalization
// ══════════════════════════════════════════════════════════════

/**
 * Normalize text for search: lowercase, remove accents, trim whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ══════════════════════════════════════════════════════════════
// Tokenization
// ══════════════════════════════════════════════════════════════

/**
 * Split text into searchable tokens (words).
 * Removes stop words and short tokens.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  const STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to",
    "for", "of", "with", "by", "from", "is", "it", "this", "that",
    "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may",
    "might", "shall", "can", "not", "no", "so", "if", "then",
  ]);

  const normalized = normalizeText(text);
  return normalized
    .split(/[\s,;:.!?()[\]{}<>'"\/\\|@#$%^&*+=~`]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

// ══════════════════════════════════════════════════════════════
// Fuzzy Search
// ══════════════════════════════════════════════════════════════

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Fuzzy search across items using specified keys.
 * Returns items sorted by relevance score (higher = better match).
 */
export function fuzzySearch<T extends Record<string, any>>(
  query: string,
  items: T[],
  keys: (keyof T)[],
  options: { threshold?: number; maxResults?: number } = {},
): Array<T & { _score: number }> {
  const { threshold = 0.4, maxResults = 50 } = options;
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);

  if (!normalizedQuery || queryTokens.length === 0) return [];

  const scored: Array<T & { _score: number }> = [];

  for (const item of items) {
    let bestScore = 0;

    for (const key of keys) {
      const value = item[key];
      if (typeof value !== "string") continue;

      const normalizedValue = normalizeText(value);

      // Exact substring match (highest weight)
      if (normalizedValue.includes(normalizedQuery)) {
        bestScore = Math.max(bestScore, 1.0);
        continue;
      }

      // Token-level matching
      const valueTokens = tokenize(value);
      let tokenMatchScore = 0;

      for (const qt of queryTokens) {
        let bestTokenScore = 0;
        for (const vt of valueTokens) {
          // Starts-with bonus
          if (vt.startsWith(qt)) {
            bestTokenScore = Math.max(bestTokenScore, 0.9);
            continue;
          }

          // Contains
          if (vt.includes(qt)) {
            bestTokenScore = Math.max(bestTokenScore, 0.7);
            continue;
          }

          // Levenshtein distance
          const maxLen = Math.max(qt.length, vt.length);
          const dist = levenshteinDistance(qt, vt);
          const similarity = 1 - dist / maxLen;
          if (similarity >= threshold) {
            bestTokenScore = Math.max(bestTokenScore, similarity * 0.6);
          }
        }
        tokenMatchScore += bestTokenScore;
      }

      const normalizedTokenScore = queryTokens.length > 0
        ? tokenMatchScore / queryTokens.length
        : 0;

      bestScore = Math.max(bestScore, normalizedTokenScore);
    }

    if (bestScore > 0) {
      scored.push({ ...item, _score: Math.round(bestScore * 1000) / 1000 });
    }
  }

  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, maxResults);
}

// ══════════════════════════════════════════════════════════════
// Prisma Search Query Builder
// ══════════════════════════════════════════════════════════════

/**
 * Build a Prisma-compatible where clause for text search across fields.
 */
export function buildSearchQuery(
  searchTerm: string,
  fields: string[],
): Record<string, any> {
  if (!searchTerm || !searchTerm.trim() || fields.length === 0) {
    return {};
  }

  const term = searchTerm.trim();

  if (fields.length === 1) {
    return {
      [fields[0]]: { contains: term, mode: "insensitive" },
    };
  }

  return {
    OR: fields.map((field) => ({
      [field]: { contains: term, mode: "insensitive" },
    })),
  };
}

// ══════════════════════════════════════════════════════════════
// Highlight Matches
// ══════════════════════════════════════════════════════════════

/**
 * Wrap matched text in <mark> tags for highlighting.
 */
export function highlightMatches(text: string, query: string): string {
  if (!text || !query) return text || "";

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;

  // Escape regex special chars in query
  const escaped = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

// ══════════════════════════════════════════════════════════════
// Relevance Scoring (TF-IDF style)
// ══════════════════════════════════════════════════════════════

/**
 * Calculate TF-IDF-style relevance between a query and a document.
 */
export function calculateRelevance(query: string, document: string): number {
  const queryTokens = tokenize(query);
  const docTokens = tokenize(document);

  if (queryTokens.length === 0 || docTokens.length === 0) return 0;

  // Term frequency in document
  const termFreq = new Map<string, number>();
  for (const token of docTokens) {
    termFreq.set(token, (termFreq.get(token) || 0) + 1);
  }

  let score = 0;
  for (const qt of queryTokens) {
    const tf = termFreq.get(qt) || 0;
    if (tf > 0) {
      // TF normalization: 1 + log(tf)
      score += 1 + Math.log(tf);
    }
  }

  // Normalize by document length
  const lengthNorm = 1 / Math.sqrt(docTokens.length);
  return Math.round(score * lengthNorm * 1000) / 1000;
}

// ══════════════════════════════════════════════════════════════
// Filter Query Builder
// ══════════════════════════════════════════════════════════════

/**
 * Convert UI filter objects to Prisma where clause.
 * Supports: eq, contains, in, gte, lte, boolean filters.
 */
export function buildFilterQuery(
  filters: Record<string, any>,
): Record<string, any> {
  const where: Record<string, any> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "boolean") {
      where[key] = value;
    } else if (Array.isArray(value)) {
      if (value.length > 0) {
        where[key] = { in: value };
      }
    } else if (typeof value === "object" && value !== null) {
      // Range filters: { min, max }
      const range: any = {};
      if (value.min !== undefined) range.gte = value.min;
      if (value.max !== undefined) range.lte = value.max;
      if (Object.keys(range).length > 0) {
        where[key] = range;
      }
    } else if (typeof value === "string") {
      // String filters: exact match by default, use * for contains
      if (value.includes("*")) {
        where[key] = { contains: value.replace(/\*/g, ""), mode: "insensitive" };
      } else {
        where[key] = value;
      }
    } else {
      where[key] = value;
    }
  }

  return where;
}

// ══════════════════════════════════════════════════════════════
// Pagination
// ══════════════════════════════════════════════════════════════

/**
 * Standard pagination helper. Returns skip, take, and metadata.
 */
export function paginateResults(
  page: number = 1,
  limit: number = 20,
  total?: number,
): {
  skip: number;
  take: number;
  meta: { page: number; limit: number; total?: number; totalPages?: number };
} {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const skip = (safePage - 1) * safeLimit;

  const meta: any = { page: safePage, limit: safeLimit };
  if (total !== undefined) {
    meta.total = total;
    meta.totalPages = Math.ceil(total / safeLimit);
  }

  return { skip, take: safeLimit, meta };
}

// ══════════════════════════════════════════════════════════════
// Sorting
// ══════════════════════════════════════════════════════════════

/**
 * Sort an array of objects by a key.
 */
export function sortResults<T extends Record<string, any>>(
  items: T[],
  sortBy: string,
  sortOrder: "asc" | "desc" = "asc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return sortOrder === "asc" ? -1 : 1;
    if (bVal == null) return sortOrder === "asc" ? 1 : -1;

    let comparison: number;
    if (typeof aVal === "string" && typeof bVal === "string") {
      comparison = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
    } else if (aVal instanceof Date && bVal instanceof Date) {
      comparison = aVal.getTime() - bVal.getTime();
    } else {
      comparison = Number(aVal) - Number(bVal);
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });
}
