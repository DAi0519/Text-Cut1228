/**
 * Shared text-splitting primitives used by geminiService, App, and Card.
 *
 * Hierarchy (coarse → fine):
 *   paragraphs  →  sentences  →  clauses  →  nearest punctuation
 */

// ── Sentence / clause tokenisers ────────────────────────────

const SENTENCE_RE =
  /[^。！？!?.；;]+[。！？!?.；;""]*\s*/g;

/**
 * Split text by sentence boundaries.
 * Handles both CJK (。！？；) and English (.!?;) sentence-ending punctuation.
 * Fragments shorter than 3 chars that look like decimal artefacts are merged
 * back into the preceding sentence.
 */
export const splitIntoSentences = (text: string): string[] => {
  const raw = text.match(SENTENCE_RE);
  if (!raw) return [];

  const parts = raw.map((s) => s.trim()).filter(Boolean);

  // Merge tiny decimal-split artefacts (e.g. "3" from "3.14")
  const merged: string[] = [];
  for (const part of parts) {
    if (
      merged.length > 0 &&
      part.length < 3 &&
      /^\d+[。！？!?.；;""]*$/.test(part)
    ) {
      merged[merged.length - 1] += part;
    } else {
      merged.push(part);
    }
  }

  return merged;
};

const CLAUSE_RE = /[^，,、：:]+[，,、：:]?\s*/g;

export const splitIntoClauses = (text: string): string[] => {
  const matches = text.match(CLAUSE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter(Boolean);
};

// ── Ratio-based splitting ───────────────────────────────────

/**
 * Split a list of text units near a target length `ratio` (0–1).
 * A penalty discourages producing chunks smaller than 18% of the total.
 *
 * @returns `{ prefix, suffix }` joined with `joiner`, or `null` if < 2 units.
 */
export const splitPrefixNearRatio = (
  units: string[],
  ratio: number,
  joiner: string,
): { prefix: string; suffix: string } | null => {
  const trimmed = units.map((u) => u.trim()).filter(Boolean);
  if (trimmed.length < 2) return null;

  const total = trimmed.reduce((sum, u) => sum + u.length, 0);
  const target = total * ratio;
  let bestIdx = 1;
  let bestScore = Infinity;
  let running = 0;

  for (let i = 1; i < trimmed.length; i += 1) {
    running += trimmed[i - 1].length;
    const rest = total - running;
    const balance = Math.abs(target - running);
    const tiny = Math.min(running, rest) < total * 0.18 ? total : 0;
    const score = balance + tiny;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return {
    prefix: trimmed.slice(0, bestIdx).join(joiner).trim(),
    suffix: trimmed.slice(bestIdx).join(joiner).trim(),
  };
};

// ── Punctuation-level fallback ──────────────────────────────

const PUNCTUATION_RE = /[。！？!?；;，,、：:]/;

/**
 * Find the nearest punctuation mark around a target position and split there.
 * Searches up to 48 characters in both directions from the target.
 */
export const splitAtNearestPunctuation = (
  text: string,
  ratio: number,
): { prefix: string; suffix: string } => {
  const target = Math.floor(text.length * ratio);

  for (let offset = 0; offset < Math.min(48, text.length); offset += 1) {
    const right = target + offset;
    const left = target - offset;

    if (right < text.length && PUNCTUATION_RE.test(text[right])) {
      return {
        prefix: text.slice(0, right + 1).trim(),
        suffix: text.slice(right + 1).trim(),
      };
    }

    if (left > 0 && PUNCTUATION_RE.test(text[left])) {
      return {
        prefix: text.slice(0, left + 1).trim(),
        suffix: text.slice(left + 1).trim(),
      };
    }
  }

  const fallback = Math.max(1, Math.min(text.length - 1, target));
  return {
    prefix: text.slice(0, fallback).trim(),
    suffix: text.slice(fallback).trim(),
  };
};

// ── Hierarchical carve (paragraph → sentence → clause → punct) ──

/**
 * Carve a `ratio`-sized prefix from `text` using the coarsest possible unit.
 *
 * @param opts.minRatio  lower clamp for ratio (default 0.18)
 * @param opts.maxRatio  upper clamp for ratio (default 0.58)
 */
export const carvePrefixForRebalance = (
  text: string,
  ratio: number,
  opts?: { minRatio?: number; maxRatio?: number },
): { prefix: string; suffix: string } => {
  const min = opts?.minRatio ?? 0.18;
  const max = opts?.maxRatio ?? 0.58;
  const clamped = Math.min(max, Math.max(min, ratio));

  const paragraphs = text
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);
  const paraSplit = splitPrefixNearRatio(paragraphs, clamped, "\n\n");
  if (paraSplit) return paraSplit;

  const sentSplit = splitPrefixNearRatio(
    splitIntoSentences(text),
    clamped,
    " ",
  );
  if (sentSplit) return sentSplit;

  const clauseSplit = splitPrefixNearRatio(
    splitIntoClauses(text),
    clamped,
    "",
  );
  if (clauseSplit) return clauseSplit;

  return splitAtNearestPunctuation(text, clamped);
};
