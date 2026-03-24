import { GoogleGenAI, Type } from "@google/genai";
import { SplitResponse, CardSegment, CardConfig, AspectRatio } from "../types";
import {
  carvePrefixForRebalance,
  hasAtomicMarkdownSyntax,
  isAtomicMarkdownBlock,
  splitIntoMarkdownBlocks,
} from "../utils/textSplit";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getCapacityGuide = (
  config?: Pick<CardConfig, "aspectRatio" | "fontSize" | "cardScale">,
) => {
  const aspectRatio = config?.aspectRatio ?? AspectRatio.PORTRAIT;
  const fontSize = config?.fontSize ?? 1;
  const cardScale = config?.cardScale ?? 1;

  const aspectMultiplier =
    aspectRatio === AspectRatio.WIDE
      ? 1.35
      : aspectRatio === AspectRatio.SQUARE
        ? 1.15
        : 1;
  const scaleMultiplier =
    (cardScale / 1.35) * Math.pow(1.05 / Math.max(fontSize, 0.8), 0.55);
  const words = Math.max(
    130,
    Math.round(180 * aspectMultiplier * scaleMultiplier),
  );
  const cjk = Math.max(
    240,
    Math.round(340 * aspectMultiplier * scaleMultiplier),
  );

  return {
    words,
    cjk,
    targetWordsMin: Math.max(110, Math.round(words * 0.84)),
    targetCjkMin: Math.max(210, Math.round(cjk * 0.84)),
    wordsRange: `${Math.max(115, words - 20)}-${words}`,
    cjkRange: `${Math.max(220, cjk - 40)}-${cjk}`,
  };
};

const CJK_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

const estimateSegmentOccupancy = (
  text: string,
  capacity: ReturnType<typeof getCapacityGuide>,
) => {
  const condensed = text.trim();
  if (!condensed) return 0;

  const cjkCount = condensed.match(CJK_CHAR_PATTERN)?.length ?? 0;
  const wordCount = condensed.match(WORD_PATTERN)?.length ?? 0;
  const nonWhitespaceChars = condensed.replace(/\s+/g, "").length;

  const cjkRatio = cjkCount / Math.max(capacity.cjk, 1);
  const wordRatio = wordCount / Math.max(capacity.words, 1);
  const characterRatio = nonWhitespaceChars / Math.max(capacity.cjk * 1.08, 1);

  return Math.max(cjkRatio, wordRatio, characterRatio);
};

const extractExplicitHeadings = (text: string) => {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const headings = new Set<string>();

  for (const paragraph of paragraphs) {
    const markdownHeading = paragraph.match(/^#{1,6}\s+(.+)$/m);
    if (markdownHeading?.[1]) {
      headings.add(markdownHeading[1].trim());
      continue;
    }

    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length !== 1) continue;

    const candidate = lines[0].replace(/^[#*\-\d.\s]+/, "").trim();
    const hasSentencePunctuation = /[。！？；：，,.!?;:]/.test(candidate);
    if (!hasSentencePunctuation && candidate.length > 0 && candidate.length <= 24) {
      headings.add(candidate);
    }
  }

  return Array.from(headings);
};

const stripContinuationMarkers = (title: string) =>
  title
    .replace(/\s*\((?:continued|cont\.?|part\s*\d+|\d+\s*\/\s*\d+|\d+)\)\s*$/i, "")
    .replace(/\s*[（【]\s*(?:续|下|其二|其三|第\s*\d+\s*[部分篇章章节则]|第\s*\d+)\s*[】）]\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeThemeTag = (value?: string | null) =>
  (value || "")
    .replace(/^[#"'“”‘’\s]+|[#"'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

const deriveFallbackThemeTag = (sourceText: string, coverTitle?: string) => {
  const headings = extractExplicitHeadings(sourceText);
  const headingCandidate = normalizeThemeTag(headings[0]);
  if (headingCandidate) return headingCandidate;

  const lines = sourceText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const shortLineCandidate = lines.find(
    (line) => line.length <= 24 && !/[。！？；：，,.!?;:]/.test(line),
  );
  if (shortLineCandidate) {
    return normalizeThemeTag(shortLineCandidate.replace(/^[#*\-\d.\s]+/, ""));
  }

  const titleCandidate = normalizeThemeTag(coverTitle);
  if (titleCandidate && !/^(project text|untitled|fin|the end)$/i.test(titleCandidate)) {
    return titleCandidate;
  }

  return "Essay";
};

const applyThemeTagToCoverSegments = (
  segments: CardSegment[],
  sourceText: string,
  preferredTag?: string,
) => {
  const fallbackCoverTitle =
    segments.find((segment) => segment.layout === "cover")?.title?.trim() || "";
  const themeTag =
    normalizeThemeTag(preferredTag) ||
    deriveFallbackThemeTag(sourceText, fallbackCoverTitle);

  return segments.map((segment) =>
    segment.layout === "cover"
      ? {
          ...segment,
          editorialBadgeText: themeTag,
        }
      : segment,
  );
};

const segmentHasAtomicMarkdown = (segment: CardSegment) =>
  segment.layout !== "cover" &&
  (isAtomicMarkdownBlock(segment.content) || hasAtomicMarkdownSyntax(segment.content));

const buildSequentialBodySegments = (
  sourceText: string,
  capacity: ReturnType<typeof getCapacityGuide>,
) => {
  const normalizedText = sourceText.replace(/\r\n?/g, "\n").trim();
  const paragraphs = splitIntoMarkdownBlocks(normalizedText);

  if (paragraphs.length === 0) {
    return [
      {
        title: "",
        content: normalizedText,
        layout: "standard" as const,
      },
    ];
  }

  const bodySegments: CardSegment[] = [];
  let currentContent = "";

  const flushCurrent = () => {
    const trimmed = currentContent.trim();
    if (!trimmed) return;
    bodySegments.push({
      title: "",
      content: trimmed,
      layout: "standard" as const,
    });
    currentContent = "";
  };

  const appendChunk = (chunk: string) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;

    if (!currentContent) {
      currentContent = trimmed;
      return;
    }

    const merged = `${currentContent}\n\n${trimmed}`.trim();
    if (estimateSegmentOccupancy(merged, capacity) <= 1.02) {
      currentContent = merged;
      return;
    }

    flushCurrent();
    currentContent = trimmed;
  };

  for (const paragraph of paragraphs) {
    let remainder = paragraph;

    while (remainder) {
      const occupancy = estimateSegmentOccupancy(remainder, capacity);
      const isAtomicBlock = isAtomicMarkdownBlock(remainder);
      if (occupancy <= 1.02) {
        appendChunk(remainder);
        remainder = "";
        continue;
      }

      if (isAtomicBlock) {
        appendChunk(remainder);
        remainder = "";
        continue;
      }

      const targetRatio = Math.min(
        0.62,
        Math.max(0.28, 0.9 / Math.max(occupancy, 0.01)),
      );
      const split = carvePrefixForRebalance(remainder, targetRatio, {
        minRatio: 0.28,
        maxRatio: 0.62,
      });

      if (!split?.prefix || !split?.suffix) {
        appendChunk(remainder);
        remainder = "";
        continue;
      }

      appendChunk(split.prefix);
      remainder = split.suffix.trim();
    }
  }

  flushCurrent();

  return bodySegments.length > 0
    ? bodySegments
    : [
        {
          title: "",
          content: normalizedText,
          layout: "standard" as const,
        },
      ];
};

const buildStructuredMarkdownSegments = (
  sourceText: string,
  capacity: ReturnType<typeof getCapacityGuide>,
  options?: {
    coverTitle?: string;
    endTitle?: string;
    preferredTag?: string;
  },
) => {
  const normalizedText = sourceText.replace(/\r\n?/g, "\n").trim();
  const blocks = splitIntoMarkdownBlocks(normalizedText);
  const bodySegments: CardSegment[] = [];
  let pendingTitle = "";
  let currentContent = "";

  const flushCurrent = () => {
    const trimmed = currentContent.trim();
    if (!trimmed) return;
    bodySegments.push({
      title: pendingTitle,
      content: trimmed,
      layout: "standard" as const,
    });
    pendingTitle = "";
    currentContent = "";
  };

  const appendBlock = (block: string) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    if (!currentContent) {
      currentContent = trimmed;
      return;
    }

    const merged = `${currentContent}\n\n${trimmed}`.trim();
    if (estimateSegmentOccupancy(merged, capacity) <= 1.02) {
      currentContent = merged;
      return;
    }

    flushCurrent();
    currentContent = trimmed;
  };

  for (const block of blocks) {
    const headingMatch = block.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flushCurrent();
      pendingTitle = headingMatch[1].trim();
      continue;
    }

    let remainder = block;
    while (remainder) {
      const occupancy = estimateSegmentOccupancy(remainder, capacity);
      const isAtomicBlock = isAtomicMarkdownBlock(remainder);

      if (occupancy <= 1.02 || isAtomicBlock) {
        appendBlock(remainder);
        remainder = "";
        continue;
      }

      const targetRatio = Math.min(
        0.62,
        Math.max(0.28, 0.9 / Math.max(occupancy, 0.01)),
      );
      const split = carvePrefixForRebalance(remainder, targetRatio, {
        minRatio: 0.28,
        maxRatio: 0.62,
      });

      if (!split?.prefix || !split?.suffix) {
        appendBlock(remainder);
        remainder = "";
        continue;
      }

      appendBlock(split.prefix);
      remainder = split.suffix.trim();
    }
  }

  flushCurrent();

  const markdownSegments: CardSegment[] = [
    {
      title: options?.coverTitle?.trim() || "Project Text",
      content: "",
      layout: "cover" as const,
    },
    ...bodySegments,
    {
      title: options?.endTitle?.trim() || "FIN",
      content: "",
      layout: "cover" as const,
    },
  ];

  return applyThemeTagToCoverSegments(
    sanitizeGeneratedSegments(markdownSegments, sourceText, capacity),
    sourceText,
    options?.preferredTag,
  );
};

const collapseToSequentialFlow = (
  segments: CardSegment[],
  sourceText: string,
  capacity: ReturnType<typeof getCapacityGuide>,
  preferredTag?: string,
) => {
  const coverSegment = segments.find((segment) => segment.layout === "cover");
  const endSegment = [...segments]
    .reverse()
    .find((segment) => segment.layout === "cover" && segment !== coverSegment);
  const bodySegments = buildSequentialBodySegments(sourceText, capacity);

  const sequentialSegments: CardSegment[] = [
    {
      title: coverSegment?.title.trim() || "Project Text",
      content: "",
      layout: "cover" as const,
    },
    ...bodySegments,
    {
      title: endSegment?.title.trim() || "FIN",
      content: "",
      layout: "cover" as const,
    },
  ];

  return applyThemeTagToCoverSegments(
    sanitizeGeneratedSegments(sequentialSegments, sourceText, capacity),
    sourceText,
    preferredTag,
  );
};

const sanitizeGeneratedSegments = (
  segments: CardSegment[],
  sourceText: string,
  capacity: ReturnType<typeof getCapacityGuide>,
): CardSegment[] => {
  const explicitHeadings = extractExplicitHeadings(sourceText);
  const hasExplicitHeadings = explicitHeadings.length > 0;

  const normalizedSegments = segments
    .filter((segment, index) => {
      if (segment.layout === "cover") return true;
      return index === 0 || segment.content.trim().length > 0;
    })
    .map((segment, index) => {
      if (segment.layout === "cover") {
        return {
          ...segment,
          title: segment.title.trim(),
        };
      }

      const strippedTitle = stripContinuationMarkers(segment.title.trim());
      const normalizedTitle = hasExplicitHeadings ? strippedTitle : "";

      return {
        ...segment,
        title: normalizedTitle,
        content: segment.content.trim(),
      };
    });

  const mergeCompatibleSegments = (
    previous: CardSegment,
    current: CardSegment,
  ) => {
    if (previous.layout === "cover" || current.layout === "cover") return false;
    if (segmentHasAtomicMarkdown(previous) || segmentHasAtomicMarkdown(current)) {
      return false;
    }

    const previousTitle = previous.title.trim();
    const currentTitle = current.title.trim();
    if (hasExplicitHeadings) {
      const sameTitle = previousTitle && currentTitle && previousTitle === currentTitle;
      const bothUntitled = !previousTitle && !currentTitle;
      if (!sameTitle && !bothUntitled) return false;
    }

    const previousOccupancy = estimateSegmentOccupancy(previous.content, capacity);
    const currentOccupancy = estimateSegmentOccupancy(current.content, capacity);
    const mergedContent = `${previous.content.trim()}\n\n${current.content.trim()}`.trim();
    const mergedOccupancy = estimateSegmentOccupancy(mergedContent, capacity);

    if (mergedOccupancy > 1.04) return false;

    const previousUnderfilled = previousOccupancy < 0.84;
    const currentUnderfilled = currentOccupancy < 0.58;
    const currentIsShortTail =
      currentOccupancy < 0.48 || current.content.split(/\n{2,}/).length <= 1;

    return previousUnderfilled || currentUnderfilled || currentIsShortTail;
  };

  const canRebalanceBetween = (previous: CardSegment, current: CardSegment) => {
    if (previous.layout === "cover" || current.layout === "cover") return false;
    if (segmentHasAtomicMarkdown(previous) || segmentHasAtomicMarkdown(current)) {
      return false;
    }

    const previousTitle = previous.title.trim();
    const currentTitle = current.title.trim();
    if (!hasExplicitHeadings) return true;

    return (
      (!!previousTitle && !!currentTitle && previousTitle === currentTitle) ||
      (!previousTitle && !currentTitle)
    );
  };

  const mergeSparseNeighbors = (inputSegments: CardSegment[]) => {
    const mergedSegments: CardSegment[] = [];

    for (const segment of inputSegments) {
      const previous = mergedSegments[mergedSegments.length - 1];
      if (!previous || !mergeCompatibleSegments(previous, segment)) {
        mergedSegments.push(segment);
        continue;
      }

      mergedSegments[mergedSegments.length - 1] = {
        ...previous,
        title: previous.title.trim() || segment.title.trim(),
        content: `${previous.content.trim()}\n\n${segment.content.trim()}`.trim(),
      };
    }

    return mergedSegments;
  };

  const rebalanceDensePairs = (inputSegments: CardSegment[]) => {
    const nextSegments = inputSegments.map((segment) => ({ ...segment }));

    for (let index = 1; index < nextSegments.length - 1; index += 1) {
      const previous = nextSegments[index];
      const current = nextSegments[index + 1];
      if (!canRebalanceBetween(previous, current)) continue;

      const previousOccupancy = estimateSegmentOccupancy(previous.content, capacity);
      const currentOccupancy = estimateSegmentOccupancy(current.content, capacity);
      if (previousOccupancy >= 0.8 || currentOccupancy <= 0.72) continue;

      const desiredTransferOccupancy = Math.min(
        0.9 - previousOccupancy,
        currentOccupancy - 0.62,
        0.32,
      );
      if (desiredTransferOccupancy <= 0.1) continue;

      const transferRatio = desiredTransferOccupancy / Math.max(currentOccupancy, 0.01);
      const transfer = carvePrefixForRebalance(current.content, transferRatio);
      if (!transfer?.prefix || !transfer.suffix) continue;

      const nextPreviousContent = `${previous.content.trim()}\n\n${transfer.prefix}`.trim();
      const nextCurrentContent = transfer.suffix.trim();
      const nextPreviousOccupancy = estimateSegmentOccupancy(
        nextPreviousContent,
        capacity,
      );
      const nextCurrentOccupancy = estimateSegmentOccupancy(
        nextCurrentContent,
        capacity,
      );

      if (nextPreviousOccupancy > 1.02 || nextCurrentOccupancy < 0.48) continue;

      nextSegments[index] = {
        ...previous,
        content: nextPreviousContent,
      };
      nextSegments[index + 1] = {
        ...current,
        content: nextCurrentContent,
      };
    }

    return nextSegments;
  };

  const mergedSegments = mergeSparseNeighbors(normalizedSegments);
  const rebalancedSegments = rebalanceDensePairs(mergedSegments);
  return mergeSparseNeighbors(rebalancedSegments);
};

export const splitTextIntoCards = async (
  text: string,
  config?: Pick<CardConfig, "aspectRatio" | "fontSize" | "cardScale">,
): Promise<CardSegment[]> => {
  try {
    const model = "gemini-3-flash-preview";
    const capacity = getCapacityGuide(config);

    const prompt = `
      You are an expert digital typesetter and editor.
      Your goal is to split the input text into a sequence of readable cards.
      Current card format:
      - Aspect ratio: ${config?.aspectRatio ?? AspectRatio.PORTRAIT}
      - Font scale: ${config?.fontSize ?? 1}
      - Card size scale: ${config?.cardScale ?? 1}
      
      *** CRITICAL RULES FOR SPLITTING ***

      1. **STRICT VISUAL CAPACITY (THE MOST IMPORTANT RULE)**:
         - Keep each card airy and readable. **DO NOT CREATE WALLS OF TEXT.**
         - **Preferred Length per Card**: 
           - English: ~${capacity.wordsRange} words.
           - Chinese/CJK: ~${capacity.cjkRange} characters.
         - Try to fill each body card to at least:
           - English: ~${capacity.targetWordsMin} words when the source allows it.
           - Chinese/CJK: ~${capacity.targetCjkMin} characters when the source allows it.
         - Prefer **fewer, fuller cards** over many sparse cards.
         - Most body cards should feel visually substantial, ideally using roughly 80-95% of the comfortable text area.
         - If two adjacent paragraphs fit comfortably on one card, KEEP THEM TOGETHER.
         - Only split when a card would become visually crowded or hard to scan.

      2. **INTELLIGENT CONTINUITY**:
         - When splitting a long paragraph or section across multiple cards:
           - End the first card at a logical pause (period, comma).
           - Keep continuation titles natural and clean. Do not use markers like "(1/2)", "(2/2)", or "(continued)".
           - If two consecutive cards are part of the same section, it is better to reuse the same title than add mechanical suffixes.
           - Do not leave "orphaned" sentences or tiny leftover cards if possible.
           - Do not create continuation cards unless the section truly cannot fit in one card.

      3. **BODY TITLES ARE OPTIONAL**:
         - Cover cards should have titles.
         - Body cards may have an empty title.
         - If the source text has a real header (e.g., "## 1. Overview"), use it as the title and **REMOVE IT from the content**.
         - If the source text does not provide a real header, prefer an empty title instead of inventing one.
         - Never create placeholder titles like "Note Sequence", "Body Text", "Part 2", or similar mechanical labels.
         - Titles must be single-line plain text when present.

      4. **VERBATIM BODY TEXT**:
         - The "content" field must contain the **exact original text** (minus the moved headers).
         - Do not summarize. Do not rewrite.
         - Preserve existing markdown formatting (bold, italics, lists).

      5. **STRUCTURE**:
         - **Card 1 (Cover)**: Title = Project Title, Content = "", Layout = "cover".
         - **Card 2..N (Body)**: Title = Segment Title, Content = Segment Text, Layout = "standard".
         - **Card N+1 (End)**: Title = "FIN", Content = "", Layout = "cover".
         - Also return a top-level "themeTag": a short article topic label shared by the first and last cover.
         - "themeTag" should be 1-4 words, plain text, no numbering, no quotes, no sentence punctuation.

      Input Text:
      ${text}
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            themeTag: {
              type: Type.STRING,
              description:
                "Short article topic label for the cover badge, such as Design, AI, Typography, or Product Strategy.",
            },
            segments: {
              type: Type.ARRAY,
              items: { 
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Card title. Leave empty for untitled body cards." },
                  content: { type: Type.STRING, description: "Body text sized to the current card capacity." },
                  layout: { type: Type.STRING, enum: ["standard", "cover"] }
                },
                required: ["title", "content", "layout"]
              }
            }
          }
        }
      }
    });

    const jsonStr = response.text ? response.text.replace(/```json|```/g, "").trim() : "";
    
    if (!jsonStr) {
      throw new Error("Empty response from Gemini");
    }

    const parsedData = JSON.parse(jsonStr) as SplitResponse;
    const hasExplicitHeadings = extractExplicitHeadings(text).length > 0;
    const sanitizedSegments = applyThemeTagToCoverSegments(
      sanitizeGeneratedSegments(parsedData.segments, text, capacity),
      text,
      parsedData.themeTag,
    );
    if (hasAtomicMarkdownSyntax(text)) {
      const coverTitle =
        sanitizedSegments.find((segment) => segment.layout === "cover")?.title || "";
      const endTitle =
        [...sanitizedSegments]
          .reverse()
          .find((segment) => segment.layout === "cover")?.title || "FIN";

      return buildStructuredMarkdownSegments(text, capacity, {
        coverTitle,
        endTitle,
        preferredTag: parsedData.themeTag,
      });
    }
    if (!hasExplicitHeadings) {
      return collapseToSequentialFlow(
        sanitizedSegments,
        text,
        capacity,
        parsedData.themeTag,
      );
    }
    return sanitizedSegments;

  } catch (error) {
    console.error("Error splitting text:", error);
    const capacity = getCapacityGuide(config);
    
    // Fallback: Manually create structure if API fails
    const segments: CardSegment[] = [];
    const MAX_CHARS = Math.round(capacity.cjk * 1.2);
    
    // 1. Title Card
    segments.push({
      title: "Project Text",
      content: "",
      layout: "cover"
    });

    // 2. Body Cards - Robust Splitting
    const rawParagraphs = text.split("\n\n").filter(t => t.trim().length > 0);
    
    let currentChunk = "";
    let currentTitle = "";

    rawParagraphs.forEach((part) => {
      // Heuristic: Short lines without punctuation might be headers
      if (part.length < 50 && !part.match(/[.,;!?。，；！？]/)) {
         if (currentChunk) {
            segments.push({
              title: currentTitle,
              content: currentChunk,
              layout: "standard"
            });
            currentChunk = "";
         }
         currentTitle = part.replace(/#|\*/g, '').trim();
         return; 
      }

      if ((currentChunk.length + part.length) > MAX_CHARS) {
        if (currentChunk) {
          segments.push({
            title: currentTitle,
            content: currentChunk,
            layout: "standard"
          });
        }

        // Split oversized single paragraphs further
        let remainder = part;
        while (remainder.length > MAX_CHARS) {
          const split = carvePrefixForRebalance(remainder, 0.5, {
            minRatio: 0.3,
            maxRatio: 0.7,
          });
          segments.push({
            title: currentTitle,
            content: split.prefix,
            layout: "standard"
          });
          remainder = split.suffix;
        }
        currentChunk = remainder;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + part;
      }
    });
    
    if (currentChunk) {
        segments.push({
          title: currentTitle,
          content: currentChunk,
          layout: "standard"
        });
    }

    // 3. End Card
    segments.push({
      title: "The End",
      content: "",
      layout: "cover"
    });

    const sanitizedSegments = applyThemeTagToCoverSegments(
      sanitizeGeneratedSegments(segments, text, capacity),
      text,
    );
    if (hasAtomicMarkdownSyntax(text)) {
      return buildStructuredMarkdownSegments(text, capacity);
    }
    if (extractExplicitHeadings(text).length === 0) {
      return collapseToSequentialFlow(sanitizedSegments, text, capacity);
    }
    return sanitizedSegments;
  }
};
