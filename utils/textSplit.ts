/**
 * [INPUT]: 无外部依赖（纯函数模块，零副作用）
 * [OUTPUT]: 对外提供 splitIntoSentences / splitIntoClauses / splitAtNearestPunctuation /
 *           splitFencedMarkdownBlock / isAtomicMarkdownBlock / hasAtomicMarkdownSyntax /
 *           carvePrefixForRebalance / splitIntoMarkdownBlocks
 * [POS]: utils/ 的文字解析引擎；被 services/geminiService 和 components/Card 双重消费；
 *        切分层次：段落 → 句子 → 子句 → 最近标点，内建 CJK 标点识别与 Markdown 原子块保护
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
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
const MARKDOWN_LIST_ITEM_RE =
  /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/;
const BLOCKQUOTE_RE = /^\s*>/;
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type FencedMarkdownBlock = {
  openingLine: string;
  closingLine: string;
  contentLines: string[];
};

const parseFencedMarkdownBlock = (
  text: string,
): FencedMarkdownBlock | null => {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;

  const lines = normalized.split("\n");
  if (lines.length < 3) return null;

  const openingMatch = lines[0].match(FENCE_RE);
  if (!openingMatch) return null;

  const fenceToken = openingMatch[2];
  const closingMatcher = new RegExp(`^\\s*${escapeRegExp(fenceToken)}\\s*$`);
  const closingLine = lines[lines.length - 1];
  if (!closingMatcher.test(closingLine)) return null;

  return {
    openingLine: lines[0],
    closingLine,
    contentLines: lines.slice(1, -1),
  };
};

export const splitIntoClauses = (text: string): string[] => {
  const matches = text.match(CLAUSE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter(Boolean);
};

const splitMarkdownListItems = (text: string): string[] => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const items: string[] = [];
  let current: string[] = [];
  let rootIndent: number | null = null;

  const flushCurrent = () => {
    const nextItem = current.join("\n").trim();
    if (nextItem) items.push(nextItem);
    current = [];
  };

  for (const line of lines) {
    const match = line.match(MARKDOWN_LIST_ITEM_RE);

    if (!match) {
      if (current.length === 0) {
        if (line.trim() === "") continue;
        return [];
      }

      current.push(line);
      continue;
    }

    const indent = match[1]?.length ?? 0;
    if (rootIndent === null) {
      rootIndent = indent;
    }

    if (indent <= rootIndent) {
      flushCurrent();
      current = [line];
      rootIndent = indent;
      continue;
    }

    // Nested list items stay attached to the current top-level item.
    current.push(line);
  }

  flushCurrent();
  return items.length >= 2 ? items : [];
};

export const splitIntoMarkdownBlocks = (text: string): string[] => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let index = 0;

  const flushCurrent = () => {
    const block = current.join("\n").trim();
    if (block) blocks.push(block);
    current = [];
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      flushCurrent();
      index += 1;
      continue;
    }

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      flushCurrent();
      const fenceToken = fenceMatch[2];
      const blockLines = [line];
      index += 1;

      while (index < lines.length) {
        blockLines.push(lines[index]);
        if (new RegExp(`^\\s*${fenceToken}`).test(lines[index])) {
          index += 1;
          break;
        }
        index += 1;
      }

      const fencedBlock = blockLines.join("\n").trim();
      if (fencedBlock) blocks.push(fencedBlock);
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      flushCurrent();
      const blockLines = [line];
      index += 1;

      while (
        index < lines.length &&
        (lines[index].trim() === "" || BLOCKQUOTE_RE.test(lines[index]))
      ) {
        blockLines.push(lines[index]);
        index += 1;
      }

      const quoteBlock = blockLines.join("\n").trim();
      if (quoteBlock) blocks.push(quoteBlock);
      continue;
    }

    current.push(line);
    index += 1;
  }

  flushCurrent();
  return blocks.filter(Boolean);
};

export const isAtomicMarkdownBlock = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (FENCE_RE.test(trimmed)) {
    return true;
  }

  return trimmed
    .split("\n")
    .every((line) => line.trim() === "" || BLOCKQUOTE_RE.test(line));
};

export const hasAtomicMarkdownSyntax = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .some((line) => FENCE_RE.test(line) || BLOCKQUOTE_RE.test(line));

export const splitFencedMarkdownBlock = (
  text: string,
  ratio: number,
  opts?: { minRatio?: number; maxRatio?: number },
): { prefix: string; suffix: string } | null => {
  const parsed = parseFencedMarkdownBlock(text);
  if (!parsed) return null;

  const { openingLine, closingLine, contentLines } = parsed;
  if (contentLines.length < 2) return null;

  const min = opts?.minRatio ?? 0.18;
  const max = opts?.maxRatio ?? 0.58;
  const clamped = Math.min(max, Math.max(min, ratio));
  const totalWeight = contentLines.reduce(
    (sum, line) => sum + Math.max(line.trim().length, 1),
    0,
  );

  if (totalWeight < 2) return null;

  const target = totalWeight * clamped;
  let bestIndex = 1;
  let bestScore = Infinity;
  let runningWeight = 0;

  for (let index = 1; index < contentLines.length; index += 1) {
    runningWeight += Math.max(contentLines[index - 1].trim().length, 1);
    const remainingWeight = totalWeight - runningWeight;
    const balance = Math.abs(target - runningWeight);
    const tinyPenalty =
      Math.min(runningWeight, remainingWeight) < totalWeight * min
        ? totalWeight
        : 0;
    const score = balance + tinyPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  const prefixLines = contentLines.slice(0, bestIndex);
  const suffixLines = contentLines.slice(bestIndex);
  if (prefixLines.length === 0 || suffixLines.length === 0) return null;

  return {
    prefix: [openingLine, ...prefixLines, closingLine].join("\n").trim(),
    suffix: [openingLine, ...suffixLines, closingLine].join("\n").trim(),
  };
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

  const markdownBlocks = splitIntoMarkdownBlocks(text);
  const blockSplit = splitPrefixNearRatio(markdownBlocks, clamped, "\n\n");
  if (blockSplit) return blockSplit;

  const listSplit = splitPrefixNearRatio(
    splitMarkdownListItems(text),
    clamped,
    "\n",
  );
  if (listSplit) return listSplit;

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
