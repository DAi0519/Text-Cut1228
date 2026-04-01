import React, { useState, useEffect, useRef, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import { CardConfig, AspectRatio, CardSegment, FontStyle, Composition, ImageConfig } from '../types';
import {
  carvePrefixForRebalance,
  hasAtomicMarkdownSyntax,
  isAtomicMarkdownBlock,
  splitFencedMarkdownBlock,
  splitIntoSentences,
  splitIntoClauses,
  splitAtNearestPunctuation,
} from '../utils/textSplit';
import { Scissors, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, Scaling, Move, ScanLine, Square, RectangleHorizontal, RectangleVertical } from 'lucide-react';

interface CardProps {
  content: string;
  sectionTitle: string;
  layout?: 'standard' | 'cover';
  image?: string;
  imageConfig?: ImageConfig;
  editorialBrandLabel?: string;
  editorialBadgeText?: string;
  index: number;
  total: number;
  config: CardConfig;
  onUpdate?: (data: CardSegment) => void;
  onSplit?: (segment: CardSegment) => void;
  onEditChange?: (hasImage: boolean, config: ImageConfig) => void;
  onAvatarUpload?: () => void;
  showOverflowControl?: boolean;
}

export interface OverflowSplitResult {
  keptSegment: CardSegment;
  movedSegment: CardSegment;
}

export interface CardHandle {
  element: HTMLDivElement | null;
  toggleLayout: () => void;
  startEdit: () => void;
  save: () => void;
  cancel: () => void;
  setImage: (image?: string) => void;
  updateImageConfig: (updates: Partial<ImageConfig>) => void;
  removeImage: () => void;
  toggleHighlight: () => void;
  resolveOverflow: () => OverflowSplitResult | null;
  isOverflowing: () => boolean;
  getBodyOccupancy: () => number;
}

const DEFAULT_IMG_CONFIG: ImageConfig = {
  position: 'top',
  heightRatio: 0.45,
  cropScale: 1,
  cropPanX: 50,
  cropPanY: 50,
  scale: 1,
  panX: 50,
  panY: 50
};

export const Card = forwardRef<CardHandle, CardProps>(({ content, sectionTitle, layout = 'standard', image, imageConfig, editorialBrandLabel: propBrandLabel, editorialBadgeText: propBadgeText, index, total, config, onUpdate, onSplit, onEditChange, onAvatarUpload, showOverflowControl = true }, ref) => {

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sectionTitle);
  const [editContent, setEditContent] = useState(content);
  const [editImage, setEditImage] = useState(image);
  const [editBrandLabel, setEditBrandLabel] = useState(propBrandLabel ?? '');
  const [editBadgeText, setEditBadgeText] = useState(propBadgeText ?? '');
  const [editImageConfig, setEditImageConfig] = useState<ImageConfig>(imageConfig || DEFAULT_IMG_CONFIG);
  const [currentLayout, setCurrentLayout] = useState<'standard' | 'cover'>(layout);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [bodyOccupancy, setBodyOccupancy] = useState(0);
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const contentRef = useRef<HTMLDivElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);

  // --- NUMBERING LOGIC ---
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const showNumber = !isFirst && !isLast;
  const displayIndex = String(index).padStart(2, '0');
  const displayTotal = String(Math.max(0, total - 2)).padStart(2, '0');

  const handleSave = () => {
    if (onUpdate) onUpdate({
      title: editTitle,
      content: editContent,
      layout: currentLayout,
      image: editImage,
      imageConfig: editImageConfig,
      ...(editBrandLabel ? { editorialBrandLabel: editBrandLabel } : {}),
      ...(editBadgeText ? { editorialBadgeText: editBadgeText } : {}),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(sectionTitle);
    setEditContent(content ? content.replace(/\\n/g, '\n') : "");
    setEditImage(image);
    setEditImageConfig(imageConfig || DEFAULT_IMG_CONFIG);
    setCurrentLayout(layout);
    setEditBrandLabel(propBrandLabel ?? '');
    setEditBadgeText(propBadgeText ?? '');
    setIsEditing(false);
  };

  const toggleLayout = () => {
    const newLayout = currentLayout === 'standard' ? 'cover' : 'standard';
    setCurrentLayout(newLayout);
    // If not editing, save immediately. If editing, just update local state.
    if (!isEditing && onUpdate) {
      onUpdate({ 
        title: editTitle, 
        content: editContent, 
        layout: newLayout,
        image: editImage,
        imageConfig: editImageConfig
      });
    }
  };

  type TextSegment = { text: string; bold: boolean };

  const buildSegments = (text: string): TextSegment[] => {
    const segments: TextSegment[] = [];
    let bold = false;
    let buffer = "";
    let i = 0;

    const pushBuffer = () => {
      if (!buffer) return;
      const last = segments[segments.length - 1];
      if (last && last.bold === bold) {
        last.text += buffer;
      } else {
        segments.push({ text: buffer, bold });
      }
      buffer = "";
    };

    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        pushBuffer();
        bold = !bold;
        i += 2;
        continue;
      }
      buffer += text[i];
      i += 1;
    }

    pushBuffer();
    return segments;
  };

  const buildIndexMap = (text: string): number[] => {
    const map = new Array(text.length + 1);
    let plainIndex = 0;
    let i = 0;
    map[0] = 0;

    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        map[i] = plainIndex;
        map[i + 1] = plainIndex;
        i += 2;
        map[i] = plainIndex;
        continue;
      }
      map[i] = plainIndex;
      i += 1;
      plainIndex += 1;
      map[i] = plainIndex;
    }

    return map;
  };

  const plainIndexToTextIndex = (text: string, plainIndex: number) => {
    let i = 0;
    let count = 0;
    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        i += 2;
        continue;
      }
      if (count === plainIndex) return i;
      i += 1;
      count += 1;
    }
    return text.length;
  };

  const visiblePlainIndexToTextIndex = (text: string, plainIndex: number) => {
    let i = 0;
    let count = 0;

    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        i += 2;
        continue;
      }

      const char = text[i];
      if (char === "\n" || char === "\r") {
        i += 1;
        continue;
      }

      if (count === plainIndex) return i;
      i += 1;
      count += 1;
    }

    return text.length;
  };

  const updateSegmentsBold = (
    segments: TextSegment[],
    start: number,
    end: number,
    boldValue: boolean,
  ): TextSegment[] => {
    const next: TextSegment[] = [];
    let offset = 0;

    const push = (text: string, bold: boolean) => {
      if (!text) return;
      const last = next[next.length - 1];
      if (last && last.bold === bold) {
        last.text += text;
      } else {
        next.push({ text, bold });
      }
    };

    for (const segment of segments) {
      const segStart = offset;
      const segEnd = offset + segment.text.length;
      offset = segEnd;

      if (segEnd <= start || segStart >= end) {
        push(segment.text, segment.bold);
        continue;
      }

      const overlapStart = Math.max(start, segStart);
      const overlapEnd = Math.min(end, segEnd);

      if (segStart < overlapStart) {
        push(segment.text.slice(0, overlapStart - segStart), segment.bold);
      }

      push(
        segment.text.slice(overlapStart - segStart, overlapEnd - segStart),
        boldValue,
      );

      if (overlapEnd < segEnd) {
        push(segment.text.slice(overlapEnd - segStart), segment.bold);
      }
    }

    return next;
  };

  const renderSegments = (segments: TextSegment[]) => {
    let result = "";
    for (const segment of segments) {
      if (!segment.text) continue;
      result += segment.bold ? `**${segment.text}**` : segment.text;
    }
    return result;
  };

  const toggleBoldAtSelection = (
    text: string,
    start: number,
    end: number,
  ): { newText: string; newStart: number; newEnd: number } => {
    if (start === end) {
      const before = text.slice(0, start);
      const after = text.slice(end);
      if (before.endsWith("**") && after.startsWith("**")) {
        const newText = before.slice(0, -2) + after.slice(2);
        return { newText, newStart: start - 2, newEnd: start - 2 };
      }
      const newText = before + "****" + after;
      return { newText, newStart: start + 2, newEnd: start + 2 };
    }

    const indexMap = buildIndexMap(text);
    const plainStart = indexMap[start] ?? 0;
    const plainEnd = indexMap[end] ?? plainStart;

    const segments = buildSegments(text);
    let hasUnbold = false;
    let offset = 0;
    for (const segment of segments) {
      const segStart = offset;
      const segEnd = offset + segment.text.length;
      offset = segEnd;
      if (segEnd <= plainStart || segStart >= plainEnd) continue;
      if (!segment.bold) {
        hasUnbold = true;
        break;
      }
    }

    const shouldBold = hasUnbold;
    const nextSegments = updateSegmentsBold(
      segments,
      plainStart,
      plainEnd,
      shouldBold,
    );
    const newText = renderSegments(nextSegments);
    const newStart = plainIndexToTextIndex(newText, plainStart);
    const newEnd = plainIndexToTextIndex(newText, plainEnd);

    return { newText, newStart, newEnd };
  };

  const applyBoldToggle = (
    inputEl: HTMLInputElement | HTMLTextAreaElement | null,
    text: string,
    setText: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    if (!inputEl) return;
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? 0;
    const { newText, newStart, newEnd } = toggleBoldAtSelection(text, start, end);
    setText(newText);
    setTimeout(() => {
      if (inputEl) {
        inputEl.setSelectionRange(newStart, newEnd);
        inputEl.focus();
      }
    }, 0);
  };

  const getRenderedFitPlainIndex = () => {
    const frame = contentRef.current;
    const contentNode = contentMeasureRef.current;
    if (!frame || !contentNode) return null;

    const walker = document.createTreeWalker(
      contentNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          node.textContent && node.textContent.length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      },
    );

    const segments: Array<{ node: Text; start: number; end: number }> = [];
    let totalLength = 0;
    let currentNode = walker.nextNode();

    while (currentNode) {
      const textNode = currentNode as Text;
      const textLength = textNode.textContent?.length ?? 0;
      if (textLength > 0) {
        segments.push({
          node: textNode,
          start: totalLength,
          end: totalLength + textLength,
        });
        totalLength += textLength;
      }
      currentNode = walker.nextNode();
    }

    if (totalLength < 2 || segments.length === 0) return null;

    const locate = (plainIndex: number) => {
      for (const segment of segments) {
        if (plainIndex <= segment.end) {
          return {
            node: segment.node,
            offset: Math.max(0, Math.min(segment.node.length, plainIndex - segment.start)),
          };
        }
      }

      const last = segments[segments.length - 1];
      return { node: last.node, offset: last.node.length };
    };

    const frameRect = frame.getBoundingClientRect();
    const range = document.createRange();
    let low = 1;
    let high = totalLength - 1;
    let best = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const end = locate(mid);
      range.setStart(segments[0].node, 0);
      range.setEnd(end.node, end.offset);
      const rects = Array.from(range.getClientRects());
      const lastRect = rects[rects.length - 1] ?? range.getBoundingClientRect();
      const fits = lastRect.bottom <= frameRect.bottom - 2;

      if (fits) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  };

  const findBestSplitIndex = (text: string, preferredIndex: number) => {
    const boundedIndex = Math.max(1, Math.min(text.length - 1, preferredIndex));
    const minPrefixLength = Math.max(40, Math.floor(text.length * 0.18));
    const minSuffixLength = Math.max(28, Math.floor(text.length * 0.1));

    const candidates: Array<{ index: number; type: 'paragraph' | 'sentence' | 'clause' }> = [];

    const paragraphMatcher = /\n\s*\n/g;
    for (const match of text.matchAll(paragraphMatcher)) {
      const matchIndex = match.index ?? -1;
      if (matchIndex <= minPrefixLength || text.length - matchIndex <= minSuffixLength) continue;
      if (matchIndex >= boundedIndex) continue;
      candidates.push({ index: matchIndex, type: 'paragraph' });
    }

    let runningIndex = 0;
    for (const sentence of splitIntoSentences(text)) {
      runningIndex = text.indexOf(sentence, runningIndex);
      if (runningIndex === -1) break;
      const endIndex = runningIndex + sentence.length;
      if (endIndex > minPrefixLength && text.length - endIndex > minSuffixLength && endIndex < boundedIndex) {
        candidates.push({ index: endIndex, type: 'sentence' });
      }
      runningIndex = endIndex;
    }

    runningIndex = 0;
    for (const clause of splitIntoClauses(text)) {
      runningIndex = text.indexOf(clause, runningIndex);
      if (runningIndex === -1) break;
      const endIndex = runningIndex + clause.length;
      if (endIndex > minPrefixLength && text.length - endIndex > minSuffixLength && endIndex < boundedIndex) {
        candidates.push({ index: endIndex, type: 'clause' });
      }
      runningIndex = endIndex;
    }

    if (candidates.length === 0) {
      return splitAtNearestPunctuation(text, boundedIndex / text.length).prefix.length;
    }

    const typePenalty = {
      paragraph: 0,
      sentence: 10,
      clause: 22,
    } as const;

    const bestCandidate = candidates.reduce((best, candidate) => {
      const distance = boundedIndex - candidate.index;
      const penalty =
        candidate.type === 'paragraph' && distance > 72
          ? 90
          : candidate.type === 'sentence' && distance > 48
            ? 36
            : candidate.type === 'clause' && distance > 24
              ? 14
              : 0;
      const score = distance + typePenalty[candidate.type] + penalty;
      if (!best || score < best.score) {
        return { candidate, score };
      }
      return best;
    }, null as null | { candidate: { index: number; type: 'paragraph' | 'sentence' | 'clause' }; score: number });

    return bestCandidate?.candidate.index ?? boundedIndex;
  };

  const getOverflowSplitResult = (): OverflowSplitResult | null => {
    // When not editing, read directly from props to avoid stale editContent
    const sourceContent = (isEditing ? editContent : content).trim();
    if (!sourceContent) return null;

    const plainFitIndex = getRenderedFitPlainIndex();
    if (!plainFitIndex) return null;

    if (isAtomicMarkdownBlock(sourceContent)) {
      const fencedSplit = splitFencedMarkdownBlock(
        sourceContent,
        plainFitIndex / Math.max(sourceContent.length, 1),
        { minRatio: 0.18, maxRatio: 0.82 },
      );
      if (!fencedSplit?.prefix || !fencedSplit?.suffix) return null;

      return {
        keptSegment: {
          title: editTitle,
          content: fencedSplit.prefix,
          layout: currentLayout,
          image: editImage,
          imageConfig: editImageConfig,
        },
        movedSegment: {
          title: "",
          content: fencedSplit.suffix,
          layout: currentLayout === 'cover' ? 'standard' : currentLayout,
        },
      };
    }

    const sourceFitIndex = visiblePlainIndexToTextIndex(sourceContent, plainFitIndex);
    const splitIndex = hasAtomicMarkdownSyntax(sourceContent)
      ? carvePrefixForRebalance(
          sourceContent,
          sourceFitIndex / Math.max(sourceContent.length, 1),
          { minRatio: 0.18, maxRatio: 0.82 },
        ).prefix.length
      : findBestSplitIndex(sourceContent, sourceFitIndex);
    const keptContent = sourceContent.slice(0, splitIndex).trim();
    const movedContent = sourceContent.slice(splitIndex).trim();

    if (!keptContent || !movedContent) return null;

    return {
      keptSegment: {
        title: editTitle,
        content: keptContent,
        layout: currentLayout,
        image: editImage,
        imageConfig: editImageConfig,
      },
      movedSegment: {
        title: hasAtomicMarkdownSyntax(sourceContent)
          ? ""
          : (editTitle || sectionTitle || "").trim(),
        content: movedContent,
        layout: currentLayout === 'cover' ? 'standard' : currentLayout,
      },
    };
  };

  useImperativeHandle(ref, () => ({
    element: containerRef.current,
    toggleLayout: toggleLayout,
    startEdit: () => setIsEditing(true),
    save: handleSave,
    cancel: handleCancel,
    setImage: (nextImage) => {
      setEditImage(nextImage);
      if (nextImage) {
        setEditImageConfig((prev) => prev || DEFAULT_IMG_CONFIG);
      }
    },
    updateImageConfig: (updates) => setEditImageConfig(prev => ({ ...prev, ...updates })),
    removeImage: () => setEditImage(undefined),
    toggleHighlight: () => {
      const activeEl = document.activeElement;
      if (activeEl === titleInputRef.current) {
        applyBoldToggle(
          titleInputRef.current,
          editTitle,
          setEditTitle,
        );
      } else if (activeEl === contentInputRef.current) {
        applyBoldToggle(
          contentInputRef.current,
          editContent,
          setEditContent,
        );
      }
    },
    resolveOverflow: getOverflowSplitResult,
    isOverflowing: () => isOverflowing,
    getBodyOccupancy: () => {
      const frame = contentRef.current;
      const contentNode = contentMeasureRef.current;
      if (!frame || !contentNode || isEditing) return 0;
      if (frame.clientHeight <= 0) return 0;
      return contentNode.scrollHeight / frame.clientHeight;
    },
  }));

  // Sync props to state when not editing — useLayoutEffect ensures state is
  // up-to-date before the overflow measurement useLayoutEffect fires.
  useLayoutEffect(() => {
    if (!isEditing) {
      setEditTitle(sectionTitle);
      const sanitizedContent = content ? content.replace(/\\n/g, '\n') : "";
      setEditContent(sanitizedContent);
      setEditImage(image);
      setEditImageConfig(imageConfig || DEFAULT_IMG_CONFIG);
      setCurrentLayout(layout);
      setEditBrandLabel(propBrandLabel ?? '');
      setEditBadgeText(propBadgeText ?? '');
    }
  }, [sectionTitle, content, layout, image, imageConfig, propBrandLabel, propBadgeText, isEditing]);

  // Report changes to parent during edit
  useEffect(() => {
    if (isEditing && onEditChange) {
      onEditChange(!!editImage, editImageConfig);
    }
  }, [editImage, editImageConfig, isEditing, onEditChange]);

  useLayoutEffect(() => {
    if (contentRef.current && contentMeasureRef.current && !isEditing) {
      const { clientHeight } = contentRef.current;
      const { scrollHeight } = contentMeasureRef.current;
      setBodyOccupancy(clientHeight > 0 ? scrollHeight / clientHeight : 0);
      setIsOverflowing(scrollHeight > clientHeight + 2);
    } else {
      setBodyOccupancy(0);
      setIsOverflowing(false);
    }
  }, [content, editContent, currentLayout, config.fontSize, config.cardScale, config.aspectRatio, config.title, config.authorName, isEditing, config.fontStyle, config.composition, editImage, editImageConfig]);

  useLayoutEffect(() => {
    const input = contentInputRef.current;
    if (!input || !isEditing || config.composition !== 'technical') return;

    input.style.height = 'auto';
    const availableHeight = input.parentElement?.clientHeight ?? input.scrollHeight;
    input.style.height = `${Math.min(input.scrollHeight, availableHeight)}px`;
  }, [editContent, isEditing, config.composition]);

  const handleSplitCard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSplit || !onUpdate) return;
    const splitResult = getOverflowSplitResult();
    if (!splitResult) return;

    onUpdate(splitResult.keptSegment);
    onSplit(splitResult.movedSegment);
  };

  const getAspectRatioStyle = (ratio: AspectRatio) => {
    return ratio.replace(':', '/');
  };
  
  const getCardAspectRatioValue = (ratio: AspectRatio) => {
    switch (ratio) {
      case AspectRatio.PORTRAIT: return 3/4;
      case AspectRatio.SQUARE: return 1;
      case AspectRatio.WIDE: return 16/9;
      default: return 3/4;
    }
  };

  const getTargetAspectRatioValue = (ratio: string) => {
      const [w, h] = ratio.split(':').map(Number);
      return w/h;
  };

  const getFontClass = (style?: FontStyle) => {
    switch (style) {
      case FontStyle.CHILL: return 'font-chill';
      case FontStyle.OPPO: return 'font-oppo';
      case FontStyle.SWEI: default: return 'font-swei'; 
    }
  };

  const renderHighlightedTitle = (title: string) => {
    return title.split(/(\*\*[\s\S]*?\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <span key={i} style={{ color: config.accentColor }}>
          {part.slice(2, -2)}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  const normalizeMarkdownParagraphs = (text: string) => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const blockSyntaxPattern = /^\s*(#{1,6}\s|>|\*{3,}$|-{3,}$|`{3,}|[-+*]\s|\d+\.\s|\|)/;
    const normalized: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        normalized.push('');
        continue;
      }

      if (blockSyntaxPattern.test(line)) {
        normalized.push(line);
        continue;
      }

      const previousLine = normalized[normalized.length - 1];
      const previousTrimmed = previousLine?.trim() ?? '';
      const previousIsPlainText =
        previousTrimmed && !blockSyntaxPattern.test(previousLine);
      const currentStartsContinuation = /^[，,、：:）)】\]]/.test(trimmed);
      const previousEndsParagraph = /[。！？!?；;:：""』」》）)\]]$/.test(
        previousTrimmed,
      );

      if (
        previousIsPlainText &&
        previousEndsParagraph &&
        !currentStartsContinuation
      ) {
        normalized.push('');
      }

      normalized.push(line);
    }

    return normalized.join('\n');
  };

  // Shared Styles
  const isDark = config.colorway === 'neon';
  const gridColor = isDark ? 'bg-white/5' : 'bg-black/5';
  const borderColor = isDark ? 'border-white/10' : 'border-black/10';
  const secondaryTextColor = isDark ? 'text-white/40' : 'text-black/40';
  const inputBgColor = isDark ? 'bg-white/10' : 'bg-black/5';
  const BODY_TYPOGRAPHY = {
    fontScale: 0.86,         // ~14px base feel at current standard device scales
    lineHeight: 2.0,         // Clean, airy line height of 2 as requested
    letterSpacing: '0.04em', // Approximately 0.5px tracking feel for 14px text
    paragraphGapEm: 1.5,     // Distinct paragraph breaks
    sideInset: 20,           // 20px margins on left/right for elegant framing
    topInset: 28,
  } as const;
  const chromeScale = config.cardScale || 1;
  const bodyLineHeight = BODY_TYPOGRAPHY.lineHeight;
  const px = (value: number) => `${Math.round(value * chromeScale)}px`;
  const rem = (value: number) => `${(value * chromeScale).toFixed(3)}rem`;
  const bodyFontSize = `${(config.fontSize * BODY_TYPOGRAPHY.fontScale).toFixed(3)}rem`;
  const codeBlockTheme = isDark
    ? {
        shellBackground: "#3f3f46",
        shellBorder: "rgba(255,255,255,0.12)",
        headerBackground: "#52525b",
        headerBorder: "rgba(255,255,255,0.1)",
        headerText: "rgba(255,255,255,0.72)",
        codeText: "#fafafa",
      }
    : {
        shellBackground: "#ffffff",
        shellBorder: "rgba(15,23,42,0.12)",
        headerBackground: "#f4f4f5",
        headerBorder: "rgba(15,23,42,0.08)",
        headerText: "rgba(63,63,70,0.7)",
        codeText: "#27272a",
      };
  const titleEditBaseStyle: React.CSSProperties = {
    color: config.textColor,
    background: 'transparent',
    padding: 0,
    margin: 0,
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    letterSpacing: 'inherit',
    wordSpacing: 'inherit',
    textRendering: 'geometricPrecision',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    caretColor: config.accentColor,
  };
  const bodyEditStyle: React.CSSProperties = {
    color: config.textColor,
    background: 'transparent',
    padding: 0,
    margin: 0,
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 400,
    lineHeight: 'inherit',
    letterSpacing: 'inherit',
    wordSpacing: 'inherit',
    textAlign: 'justify',
    textAlignLast: 'left',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    opacity: 0.9,
    textRendering: 'geometricPrecision',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    caretColor: config.accentColor,
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden',
  };

  const isCover = currentLayout === 'cover';
  const hasVisibleTitle = isEditing || Boolean(editTitle.trim());
  const shouldSoftCenterStandardBody =
    !isCover &&
    !isEditing &&
    !editImage &&
    config.composition !== 'technical' &&
    bodyOccupancy > 0 &&
    bodyOccupancy < 0.52;
  const standardBodyCenterOffset = (() => {
    if (!shouldSoftCenterStandardBody) return 0;
    const sparseThreshold = 0.52;
    const fullySparseThreshold = 0.18;
    const normalized = Math.max(
      0,
      Math.min(
        1,
        (sparseThreshold - bodyOccupancy) /
          (sparseThreshold - fullySparseThreshold),
      ),
    );

    // Push sparse cards a bit closer to center while keeping the reading rhythm stable.
    return 24 + normalized * 64;
  })();

  // --- IMAGE RENDERING UTILS ---
  const renderEditableImage = (className: string = "", forceCoverLayout: boolean = false) => {
    if (!editImage) return null;

    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!isEditing) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPanX = editImageConfig.panX;
      const startPanY = editImageConfig.panY;
      
      const container = e.currentTarget as HTMLDivElement;
      const { width, height } = container.getBoundingClientRect();

      const onMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          
          const changeX = (deltaX / width) * 100 * (1/editImageConfig.scale);
          const changeY = (deltaY / height) * 100 * (1/editImageConfig.scale);

          setEditImageConfig(prev => ({
             ...prev,
             panX: Math.max(-100, Math.min(200, startPanX + changeX)),
             panY: Math.max(-100, Math.min(200, startPanY + changeY))
          }));
      };

      const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    let currentSizeRatio = editImageConfig.heightRatio;
    const hasRatioPreset = !isHorizontal && !!editImageConfig.aspectRatio;

    // Apply aspect ratio preset logic ONLY for vertical layouts
    if (!isHorizontal && editImageConfig.aspectRatio) {
       const cardRatio = getCardAspectRatioValue(config.aspectRatio);
       const targetRatio = getTargetAspectRatioValue(editImageConfig.aspectRatio);
       currentSizeRatio = cardRatio / targetRatio;
    }

    const containerStyle: React.CSSProperties = {
      width: isHorizontal ? `${currentSizeRatio * 100}%` : '100%',
      // Always let vertical non-preset size follow heightRatio, including cover.
      // Otherwise HEIGHT slider appears ineffective in cover layouts.
      height: isHorizontal
        ? '100%'
        : hasRatioPreset
          ? undefined
          : `${currentSizeRatio * 100}%`,
    };

    // If ratio preset is selected, always let aspect-ratio drive vertical sizing
    // (including cover and non-cover) so the result is predictable.
    if (hasRatioPreset) {
      containerStyle.aspectRatio = editImageConfig.aspectRatio;
    }

    // Removed Internal Controls Toolbar (moved to App.tsx)

    return (
      <div 
        className={`relative group/image overflow-hidden shrink-0 transition-[height,width] duration-200 ease-out flex items-center justify-center ${className} ${isEditing ? 'cursor-move ring-2 ring-blue-500/20 shadow-lg z-10' : ''}`}
        style={containerStyle}
        onMouseDown={handleMouseDown}
      >
        <img 
          src={editImage} 
          alt="Card attachment"
          className="w-full h-full object-contain pointer-events-none select-none block"
          style={{
             transform: `translate(${editImageConfig.panX - 50}%, ${editImageConfig.panY - 50}%) scale(${editImageConfig.scale})`
          }}
        />
        {isEditing && (
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/image:opacity-100 pointer-events-none transition-opacity flex items-center justify-center">
             <Move size={24} className="text-white/50" />
          </div>
        )}
      </div>
    );
  };

  // --- CONTENT RENDERING COMPONENT (Shared across styles) ---
  const renderMarkdownContent = () => (
    <div 
      ref={contentRef}
      className={`max-w-none h-full overflow-hidden ${config.composition === 'technical' ? 'flex flex-col justify-center' : ''}`}
      style={{
        fontSize: 'inherit',
        fontFamily: 'inherit',
        lineHeight: 'inherit',
        fontWeight: 'inherit',
        letterSpacing: 'inherit',
        opacity: 0.9,
      } as React.CSSProperties}
    >
      <div ref={contentMeasureRef} className="w-full">
        <ReactMarkdown 
          components={{
            p: ({node, ...props}) => (
              <p
                className="mb-[1.5em] last:mb-0 hyphens-auto font-normal"
                style={{ textAlign: 'justify', textAlignLast: 'left', lineHeight: 'inherit' }}
                {...props}
              />
            ),
            strong: ({node, ...props}) => <strong className="font-semibold" style={{ color: config.accentColor }} {...props} />,
            ul: ({node, children, ...props}) => {
              const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
              return (
                <ul className="list-none pl-0 my-2 space-y-1" {...props}>
                   {validChildren.map((child, index) => {
                      return React.cloneElement(child as React.ReactElement, { 
                        key: index,
                        // @ts-ignore
                        markerType: 'bullet' 
                      });
                   })}
                </ul>
              );
            },
            ol: ({node, children, ...props}) => {
              const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
              return (
                <ol className="list-none pl-0 my-2 space-y-1" {...props}>
                   {validChildren.map((child, index) => {
                      return React.cloneElement(child as React.ReactElement, { 
                        key: index,
                        // @ts-ignore
                        listIndex: index 
                      });
                   })}
                </ol>
              );
            },
            li: ({node, ...props}: any) => {
              const { listIndex, markerType, children, ...rest } = props;
              let marker = "";
              if (typeof listIndex === 'number') {
                 marker = String(listIndex + 1).padStart(2, '0');
              } else if (markerType === 'bullet') {
                 marker = "–";
              } else {
                 marker = "•"; 
              }
              return (
                <li className="flex gap-4 items-baseline" {...rest}>
                    <span className="text-[10px] font-mono opacity-40 shrink-0 select-none w-4 text-right">
                      {marker}
                    </span>
                    <span className="flex-1 min-w-0 block">{children}</span>
                </li>
              );
            },
            h1: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-widest mb-2 mt-3 opacity-80" {...props} />,
            h2: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-wide mb-1 mt-3 opacity-80" {...props} />,
            blockquote: ({node, children, ...props}: any) => {
              return (
                <blockquote
                  className="mt-3 mb-[1em] rounded-r-2xl border-l-[3px] px-5 py-3 italic [&>p]:mb-0 [&>p+p]:mt-3"
                  style={{
                    borderColor: config.accentColor,
                    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)",
                    color: config.textColor,
                    opacity: 0.82,
                  }}
                  {...props}
                >
                  {children}
                </blockquote>
              );
            },
            pre: ({node, children, ...props}) => {
              const child = React.Children.toArray(children)[0];
              const childProps =
                React.isValidElement(child) && typeof child.props === "object"
                  ? (child.props as { className?: string })
                  : undefined;
              const languageMatch = childProps?.className?.match(/language-([\w-]+)/);
              const languageLabel = (languageMatch?.[1] || "text").toUpperCase();

              return (
                <div
                  className="my-3 overflow-hidden rounded-[20px] border"
                  style={{
                    borderColor: codeBlockTheme.shellBorder,
                    background: codeBlockTheme.shellBackground,
                  }}
                >
                  <div
                    className="flex items-center justify-between border-b px-3.5 py-2"
                    style={{
                      borderColor: codeBlockTheme.headerBorder,
                      background: codeBlockTheme.headerBackground,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                    </div>
                    <span
                      className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]"
                      style={{ color: codeBlockTheme.headerText }}
                    >
                      {languageLabel}
                    </span>
                  </div>
                  <pre
                    className="overflow-x-auto px-3.5 py-3 font-mono text-[0.76em] leading-[1.6]"
                    style={{
                      color: codeBlockTheme.codeText,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                    {...props}
                  >
                    {children}
                  </pre>
                </div>
              );
            },
            code: ({node, className, children, ...props}: any) => {
              const isBlockCode =
                typeof className === "string" && className.length > 0;
              if (isBlockCode) {
                return (
                  <code
                    className={className}
                    style={{
                      color: codeBlockTheme.codeText,
                      background: "transparent",
                      whiteSpace: "inherit",
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <code
                  className="rounded-md px-[0.35em] py-[0.12em] font-mono text-[0.9em]"
                  style={{
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                    color: config.accentColor,
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            a: ({node, ...props}) => <span className="underline decoration-1 underline-offset-4 decoration-dotted opacity-80" {...props} />
          }}
        >
          {normalizeMarkdownParagraphs(editContent)}
        </ReactMarkdown>
      </div>
    </div>
  );

  const renderOverflowBtn = () => (
    showOverflowControl && isOverflowing && !isEditing && (
      <div className={`absolute bottom-0 left-0 right-0 h-24 ${isDark ? 'bg-gradient-to-t from-black/90' : 'bg-gradient-to-t from-white/90'} to-transparent flex items-end justify-center pb-4 z-20`}>
          <button 
            onClick={handleSplitCard}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded shadow-lg transition-transform hover:scale-105 active:scale-95 animate-bounce"
          >
            <Scissors size={14} />
            Split Overflow
          </button>
      </div>
    )
  );

  // --- LAYOUT THEMES ---

  // 1. CLASSIC
  const renderClassic = () => {
    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';
    
    return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div
        className={`shrink-0 flex items-center justify-between border-b ${borderColor} font-sans`}
        style={{ height: px(64), paddingInline: px(32) }}
      >
        <div className="flex flex-col justify-center h-full">
           {!isFirst && (
             <span
               className={`font-mono uppercase tracking-[0.25em] ${secondaryTextColor} mb-0.5`}
               style={{ fontSize: px(9) }}
             >
               Project
             </span>
           )}
           <span
             className="font-bold uppercase tracking-widest truncate opacity-80"
             style={{ fontSize: px(12), maxWidth: px(120) }}
           >
             {isFirst ? "PROJECT" : (config.title || "Untitled")}
           </span>
        </div>
        <div className="flex items-center" style={{ gap: px(16) }}>
           {showNumber && (
             <div
               className={`font-mono tracking-widest ${secondaryTextColor}`}
               style={{ fontSize: px(10) }}
             >
               {displayIndex}<span className="opacity-30 mx-1">/</span>{displayTotal}
             </div>
           )}
           <div
             className="rounded-full shadow-sm relative"
             style={{ backgroundColor: config.accentColor, width: px(10), height: px(10) }}
           ></div>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 relative flex flex-col overflow-hidden"
        style={{ padding: px(BODY_TYPOGRAPHY.sideInset), paddingTop: px(BODY_TYPOGRAPHY.topInset) }}
      >
        {!isCover && <div className={`absolute top-0 h-full ${gridColor}`} style={{ left: px(BODY_TYPOGRAPHY.sideInset + 6), width: '1px' }}></div>}
        <div
          className={`flex-1 relative z-10 flex flex-col h-full ${isCover ? 'justify-center' : ''}`}
          style={
            isCover
              ? undefined
              : {
                  paddingLeft: px(BODY_TYPOGRAPHY.sideInset + 4),
                  paddingTop: px(standardBodyCenterOffset),
                }
          }
        >
          {isCover ? (
             <div
               className={`w-full flex h-full ${isHorizontal ? 'flex-row items-center' : 'flex-col justify-center'} animate-in fade-in zoom-in-95 duration-500`}
               style={isHorizontal ? { gap: px(24) } : undefined}
             >
               
               {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-sm")}
               {editImageConfig.position === 'top' && renderEditableImage(
                 "w-full mb-8 rounded-sm",
                 true
               )}

               <div className={`flex ${isHorizontal ? 'flex-1' : ''}`} style={{ gap: px(24) }}>
                  <div className="shrink-0" style={{ backgroundColor: config.accentColor, width: px(6) }}></div>
                  <div className="flex flex-col w-full justify-center" style={{ gap: px(24) }}>
                     {isEditing ? (
                        <textarea ref={titleInputRef as React.RefObject<HTMLTextAreaElement>} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="ENTER TITLE" spellCheck={false}
                          className={`w-full font-bold ${getFontClass(config.fontStyle)}`} rows={3} style={{ ...titleEditBaseStyle, fontSize: rem(2.7), lineHeight: 1.05 }} />
                     ) : (
                       <h2 className={`font-bold leading-[1.05] text-left break-words whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor, fontSize: rem(2.7) }}>
                        {renderHighlightedTitle(editTitle || "UNTITLED")}
                       </h2>
                     )}
                  </div>
               </div>

               {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-sm")}
               {editImageConfig.position === 'bottom' && renderEditableImage(
                 "w-full mt-8 rounded-sm",
                 true
               )}
             </div>
          ) : (
            <>
              {hasVisibleTitle && (
                <div className="shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div style={{ marginBottom: px(16) }}>
                    {isEditing ? (
                      <input ref={titleInputRef as any} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="(No Title)" spellCheck={false}
                        className={`w-full font-bold leading-tight placeholder:text-current/20 ${getFontClass(config.fontStyle)}`} style={{ ...titleEditBaseStyle, fontSize: rem(1.75), lineHeight: 'inherit' }} />
                    ) : (
                      <h2 className={`font-bold leading-tight whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor, fontSize: rem(1.75) }}>{editTitle}</h2>
                    )}
                  </div>
                  <div className="opacity-20 shrink-0" style={{ backgroundColor: config.accentColor, width: px(48), height: '2px', marginBottom: px(20) }}></div>
                </div>
              )}
              
              {/* Body Content with dynamic image position */}
              <div className={`flex-1 min-h-0 relative flex ${isHorizontal ? 'flex-row' : 'flex-col'}`} style={isHorizontal ? { gap: px(24) } : undefined}>
                 
                 {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-sm")}
                 {editImageConfig.position === 'top' && renderEditableImage("w-full mb-6 rounded-sm")}

                 <div className="flex-1 min-h-0 relative" style={{ fontSize: bodyFontSize, lineHeight: bodyLineHeight, letterSpacing: BODY_TYPOGRAPHY.letterSpacing, color: config.textColor }}>
                    {isEditing ? <textarea ref={contentInputRef} value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full h-full resize-none" style={bodyEditStyle} /> : renderMarkdownContent()}
                    {renderOverflowBtn()}
                 </div>

                 {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-sm")}
                 {editImageConfig.position === 'bottom' && renderEditableImage("w-full mt-6 rounded-sm")}
                 
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className={`shrink-0 border-t ${borderColor} flex items-center justify-between ${isDark ? 'bg-white/5' : 'bg-black/5'} font-sans`}
        style={{ height: px(48), paddingInline: px(32) }}
      >
        <div className="flex items-center" style={{ gap: px(16) }}>
           {config.authorName && <span className="font-bold tracking-widest uppercase opacity-40" style={{ fontSize: px(9) }}>Authored by {config.authorName}</span>}
        </div>
        <div className="flex gap-1 opacity-20"><div className="w-[1px] h-3 bg-current"></div><div className="w-[3px] h-3 bg-current"></div><div className="w-[1px] h-3 bg-current"></div></div>
      </div>
    </div>
  )};


  // 4. TECHNICAL
  const renderTechnical = () => {
    const baseFont = getFontClass(); 
    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';
    const technicalBadgeTextColor = config.colorway === 'neon' ? '#000000' : '#ffffff';
    
    // Helper to render the framed technical image
    const renderTechnicalImage = (marginTop = false) => {
       const wrapperClass = isHorizontal 
          ? `h-full p-1 border border-current border-dashed opacity-90 relative`
          : `w-full p-1 border border-current border-dashed opacity-90 relative ${marginTop ? 'mt-8' : 'mb-8'}`;

       return editImage && (
         <div className={wrapperClass}>
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l" style={{ borderColor: config.accentColor }}></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-current"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-current"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r" style={{ borderColor: config.accentColor }}></div>
            {renderEditableImage(isHorizontal ? "h-full" : "w-full filter grayscale-[0.2]", true)}
            <div className="absolute bottom-1 right-2 text-[8px] px-1 font-mono uppercase" style={{ backgroundColor: config.accentColor, color: technicalBadgeTextColor }}>Fig. 00</div>
         </div>
       );
    };

    return (
      <div className={`flex flex-col h-full w-full relative ${baseFont} overflow-hidden select-none`}>
         
         {/* Header */}
         <div
           className="shrink-0 flex items-end justify-between border-b-2 border-current font-bold uppercase tracking-tighter leading-none z-20 bg-inherit"
           style={{
             height: px(40),
             paddingBottom: px(8),
             marginInline: isCover ? px(24) : undefined,
             paddingInline: isCover ? 0 : px(24),
             fontSize: px(10),
           }}
         >
            <div className="flex gap-4 items-baseline">
               <span style={{ color: config.accentColor }}>/</span>
               <span>{isFirst ? "PROJECT" : (config.title || "Project")}</span>
            </div>
            <div
              className="font-mono font-bold uppercase"
              style={{
                backgroundColor: config.accentColor,
                color: technicalBadgeTextColor,
                fontSize: px(9),
                paddingInline: px(4),
                paddingBlock: px(2),
              }}
            >
               RUN_{new Date().getFullYear()}
            </div>
         </div>

         {/* Big Number */}
         {showNumber && (
           <div 
              className={`absolute bottom-2 right-5 font-bold tracking-tighter leading-[0.8] select-none pointer-events-none z-0 transition-opacity duration-300`}
              style={{ 
                 fontSize: rem(8), 
                 color: config.accentColor,
                 opacity: isCover ? 1 : (isDark ? 0.4 : 0.08) 
              }}
           >
              {displayIndex}
           </div>
         )}

         {isCover ? (
           <div className="flex-1 flex flex-col relative z-10" style={{ padding: px(BODY_TYPOGRAPHY.sideInset + 2) }}>
              <div className="flex items-center gap-1 opacity-80" style={{ marginBottom: px(32) }}>
                  <div style={{ backgroundColor: config.accentColor, width: px(4), height: px(16) }}></div>
                  <div className="bg-current opacity-20" style={{ width: '1px', height: px(16) }}></div>
                  <div className="h-[1px] bg-current opacity-20 ml-2" style={{ width: px(96) }}></div>
              </div>

              <div className={`flex-1 flex ${isHorizontal ? 'flex-row' : 'flex-col'}`} style={isHorizontal ? { gap: px(32) } : undefined}>
                 {editImageConfig.position === 'left' && renderTechnicalImage(false)}
                 {editImageConfig.position === 'top' && renderTechnicalImage(false)}

                 <div className={`flex-1 flex flex-col justify-center ${isHorizontal ? '' : 'mb-8'}`}>
                    {isEditing ? (
                       <textarea ref={titleInputRef as React.RefObject<HTMLTextAreaElement>} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} spellCheck={false}
                         className="w-full font-bold uppercase tracking-tighter leading-[1.0]" rows={4} style={{ ...titleEditBaseStyle, fontSize: rem(3.4), lineHeight: 1 }} />
                    ) : (
                      <h1 className="font-bold uppercase tracking-tighter leading-[1.0] break-words hyphens-auto whitespace-pre-wrap" style={{ fontSize: rem(3.4) }}>
                        {renderHighlightedTitle(editTitle || "UNTITLED")}
                      </h1>
                    )}
                 </div>

                 {editImageConfig.position === 'right' && renderTechnicalImage(true)}
                 {editImageConfig.position === 'bottom' && renderTechnicalImage(true)}
              </div>

              <div className="mt-auto border-t-2 border-current pt-2 flex items-center justify-between" style={{ paddingTop: px(8) }}>
                 <div className="flex flex-col gap-1 uppercase font-mono" style={{ fontSize: px(9), maxWidth: px(100) }}>
                    <span className="opacity-50">Design Build</span>
                    <span>{config.authorName || "SYS_OP"}</span>
                 </div>
                 <div className="flex items-center gap-2" style={{ gap: px(8) }}>
                     <div className="h-[1px] bg-current opacity-20" style={{ width: px(48) }}></div>
                     <div style={{ backgroundColor: config.accentColor, width: px(10), height: px(10) }}></div>
                 </div>
              </div>
           </div>
         ) : (
           <div className="flex-1 flex h-full z-10">
              
              {/* Left Sidebar */}
              <div className="border-r border-current/20 flex flex-col items-center shrink-0 relative overflow-hidden bg-inherit" style={{ width: px(40), paddingBlock: px(24) }}>
                  <div className="absolute inset-0 opacity-5 pointer-events-none" 
                     style={{backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`, backgroundSize: '4px 4px'}}></div>
                 <div style={{ backgroundColor: config.accentColor, width: px(4), height: px(4), marginBottom: px(16) }}></div>
                 <div className="w-[1px] bg-current opacity-20" style={{ height: px(48) }}></div>
                 <div className="flex-1"></div>
                 <div className="border opacity-50 rounded-full flex items-center justify-center" style={{ width: px(12), height: px(12), borderColor: config.accentColor }}>
                    <div className="rounded-full" style={{ width: px(4), height: px(4), backgroundColor: config.accentColor }}></div>
                 </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col min-h-0" style={{ padding: px(BODY_TYPOGRAPHY.sideInset + 2) }}>
                 {hasVisibleTitle && (
                   <div className="shrink-0 flex items-center justify-between border-b border-current/20" style={{ marginBottom: px(16), paddingBottom: px(8), minHeight: px(32) }}>
                     {isEditing ? (
                       <input ref={titleInputRef as any} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} spellCheck={false}
                         className="font-bold uppercase tracking-tight w-full" style={{ ...titleEditBaseStyle, fontSize: rem(1.25), lineHeight: 'inherit' }} placeholder="DATA BLOCK" />
                     ) : (
                       <h2 className="font-bold uppercase tracking-tight leading-none" style={{ fontSize: rem(1.25) }}>
                         {renderHighlightedTitle(editTitle)}
                       </h2>
                     )}
                   </div>
                 )}
                 
                 {/* Technical Image Body */}
                 <div className={`flex-1 flex min-h-0 ${isHorizontal ? 'flex-row gap-4' : 'flex-col'}`}>
                    
                    {editImageConfig.position === 'left' && editImage && (
                        <div className="h-full p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("h-full")}
                        </div>
                    )}

                    {editImageConfig.position === 'top' && editImage && (
                       <div className="mb-4 p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("w-full")}
                           <div className="flex justify-between items-center mt-1 px-1">
                              <span className="font-mono uppercase opacity-50" style={{ fontSize: px(8) }}>Visual Data</span>
                              <span className="font-mono uppercase" style={{ fontSize: px(8), color: config.accentColor }}>FIG.{displayIndex}</span>
                           </div>
                       </div>
                    )}

                    {/* Text Body */}
                    <div className={`flex-1 min-h-0 relative flex flex-col justify-center ${getFontClass(config.fontStyle)}`} style={{ fontSize: bodyFontSize, lineHeight: bodyLineHeight, letterSpacing: BODY_TYPOGRAPHY.letterSpacing, color: config.textColor }}>
                       {isEditing ? (
                         <textarea ref={contentInputRef} value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full max-h-full resize-none" style={bodyEditStyle} />
                       ) : renderMarkdownContent()}
                       {renderOverflowBtn()}
                    </div>

                    {editImageConfig.position === 'right' && editImage && (
                        <div className="h-full p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("h-full")}
                        </div>
                    )}

                    {editImageConfig.position === 'bottom' && editImage && (
                       <div className="mt-4 p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("w-full")}
                           <div className="flex justify-between items-center mt-1 px-1">
                              <span className="font-mono uppercase opacity-50" style={{ fontSize: px(8) }}>Visual Data</span>
                              <span className="font-mono uppercase" style={{ fontSize: px(8), color: config.accentColor }}>FIG.{displayIndex}</span>
                           </div>
                       </div>
                    )}
                 </div>
              </div>
           </div>
         )}
      </div>
    );
  };





  // 5. EDITORIAL — V3
  // Reference: "Insane Websites For Designers" — grid paper texture, plain brand name top-left,
  // simple index top-right, huge title with accent/muted color split, "Part X" pill badge, author bottom-left
  const renderEditorial = () => {
    const hasImage = !!editImage;
    const showEditorialGrid = config.backgroundStyle === 'grid';
    const titleScale = config.editorialTitleScale || 1.0;
    const secondaryOpacity = 0.4;
    const editorialAuthorName = config.authorName?.trim() || "Author";
    const editorialTitleLineHeight = 1.05;

    // Brand name — plain text, no "©"
    const brandName = propBrandLabel || config.title || config.authorName || 'Project';

    // Theme tag — editorial cover label for the article topic, never a counter.
    const badgeText = propBadgeText?.trim() || '';

    // Editorial-specific highlighted title: **highlighted** = accentColor, rest = textColor with low opacity
    const renderEditorialTitle = (title: string) => {
      return title.split(/(\*\*[\s\S]*?\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <span key={i} style={{ color: config.accentColor }}>
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={i} style={{ color: config.textColor }}>
            {part}
          </span>
        ),
      );
    };

    // Muted gray — solid color matching the visual weight of semi-transparent text
    const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';

    /* ── EDITORIAL TYPE SCALE ──────────────────────────
     *  Display:  coverTitle 4.5rem / standardTitle 3.0rem (× titleScale only, NOT cardScale)
     *  Label:    brand, index, badge, author-name  → 13px (× cardScale)
     *  Caption:  handle, bookmark-text, avatar-init → 11px (× cardScale)
     *  Body:     bodyFontSize (config.fontSize × 0.86 rem)
     * ───────────────────────────────────────────────── */
    const EDITORIAL_LABEL = 13;   // Level 2: secondary info
    const EDITORIAL_CAPTION = 11; // Level 3: tertiary info
    const coverTitleSize = `${(4.5 * titleScale).toFixed(3)}rem`;
    const standardTitleSize = `${(3.0 * titleScale).toFixed(3)}rem`;
    const coverBadgeFontSize = px(EDITORIAL_LABEL * titleScale);
    const coverBadgePaddingY = px(6 * titleScale);
    const coverBadgePaddingX = px(16 * titleScale);
    const coverBadgeMarginTop = px(24 * titleScale);
    const editorialGridVerticalColor = isDark
      ? 'rgba(255,255,255,0.032)'
      : 'rgba(24,24,27,0.03)';
    const editorialGridHorizontalColor = isDark
      ? 'rgba(255,255,255,0.02)'
      : 'rgba(24,24,27,0.018)';
    const editorialGridBackgroundImage = `
      linear-gradient(to right, ${editorialGridVerticalColor} 1px, transparent 1px),
      linear-gradient(to bottom, ${editorialGridHorizontalColor} 1px, transparent 1px)
    `;
    const editorialGridBackgroundSize = '36px 36px, 36px 36px';

    return (
      <div className="flex flex-col h-full w-full relative overflow-hidden">

        {/* Layer 1: Editorial grid background */}
        {showEditorialGrid && (
          <div
            className="absolute inset-0 z-0 pointer-events-none"
            style={{
              backgroundImage: editorialGridBackgroundImage,
              backgroundSize: editorialGridBackgroundSize,
            }}
          />
        )}

        {/* Layer 2: Subtle grain for non-grid solid backgrounds */}
        {!hasImage && !showEditorialGrid && (
          <div
            className={`absolute inset-0 z-[1] pointer-events-none ${isDark ? 'opacity-[0.06]' : 'opacity-[0.04]'}`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              mixBlendMode: isDark ? 'screen' : 'multiply'
            }}
          />
        )}

        {/* Layer 3: Full-screen background image */}
        {hasImage && (
          <div className="absolute inset-0 z-[2] overflow-hidden pointer-events-none">
            <img
              src={editImage}
              alt="Background"
              className="absolute left-1/2 top-1/2 block max-w-none select-none"
              onLoad={(e) => {
                const img = e.currentTarget;
                const container = img.parentElement!;
                const cRatio = container.offsetWidth / container.offsetHeight;
                const iRatio = img.naturalWidth / img.naturalHeight;
                // Size to just-cover: constrain the shorter dimension to 100%
                if (iRatio > cRatio) {
                  img.style.width = 'auto';
                  img.style.height = '100%';
                } else {
                  img.style.width = '100%';
                  img.style.height = 'auto';
                }
              }}
              style={{
                transform: `translate(calc(-50% + ${editImageConfig.panX - 50}%), calc(-50% + ${editImageConfig.panY - 50}%)) scale(${editImageConfig.scale})`,
                transformOrigin: 'center center',
              }}
            />
          </div>
        )}

        {/* Layer 4: Snap guide lines — only visible during drag near center */}
        {(snapGuides.x || snapGuides.y) && (
          <div className="absolute inset-0 z-[3] pointer-events-none">
            {snapGuides.x && (
              <div className="absolute top-0 bottom-0 left-1/2" style={{ width: '1px', background: 'rgba(255,255,255,0.6)', boxShadow: '0 0 4px rgba(0,0,0,0.3)' }} />
            )}
            {snapGuides.y && (
              <div className="absolute left-0 right-0 top-1/2" style={{ height: '1px', background: 'rgba(255,255,255,0.6)', boxShadow: '0 0 4px rgba(0,0,0,0.3)' }} />
            )}
          </div>
        )}

        {/* Layer 5: Content — also handles image drag in edit mode */}
        <div
          className={`relative z-10 flex flex-col h-full w-full select-none ${isEditing && hasImage ? 'cursor-move' : ''}`}
          onMouseDown={(e) => {
            if (!isEditing || !hasImage) return;
            // Skip drag if target is an interactive element
            const target = e.target as HTMLElement;
            if (target.closest('input, textarea, button, label, [contenteditable]')) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startPanX = editImageConfig.panX;
            const startPanY = editImageConfig.panY;
            const container = e.currentTarget as HTMLDivElement;
            // Find sibling image element for accurate dimension-based drag math
            const imgEl = container.parentElement?.querySelector('.overflow-hidden img[alt="Background"]') as HTMLImageElement | null;
            const imgW = imgEl?.offsetWidth || container.offsetWidth;
            const imgH = imgEl?.offsetHeight || container.offsetHeight;

            const SNAP_CENTER = 50;
            const SNAP_THRESHOLD = 3; // snap when within 3% of center

            const onMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;
              const changeX = (deltaX / imgW) * 100;
              const changeY = (deltaY / imgH) * 100;
              let rawX = Math.max(-50, Math.min(150, startPanX + changeX));
              let rawY = Math.max(-50, Math.min(150, startPanY + changeY));
              const nearX = Math.abs(rawX - SNAP_CENTER) < SNAP_THRESHOLD;
              const nearY = Math.abs(rawY - SNAP_CENTER) < SNAP_THRESHOLD;
              setSnapGuides({ x: nearX, y: nearY });
              setEditImageConfig(prev => ({
                ...prev,
                panX: nearX ? SNAP_CENTER : rawX,
                panY: nearY ? SNAP_CENTER : rawY,
              }));
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              setSnapGuides({ x: false, y: false });
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >

          {isCover ? (
            /* ═══ COVER: full magazine cover layout ═══ */
            <>
              {/* Top bar: brand name (left) + index (right) */}
              <div
                className="shrink-0 flex items-start justify-between"
                style={{ paddingInline: px(28), paddingTop: px(28) }}
              >
                {isEditing ? (
                  <input
                    value={editBrandLabel || config.title || ''}
                    onChange={(e) => setEditBrandLabel(e.target.value)}
                    placeholder="Brand"
                    spellCheck={false}
                    className="font-sans font-medium uppercase tracking-wider bg-transparent border-none outline-none p-0"
                    style={{ fontSize: px(EDITORIAL_CAPTION), color: config.accentColor, width: '60%' }}
                  />
                ) : (
                  <span
                    className="font-sans font-medium uppercase tracking-wider"
                    style={{ fontSize: px(EDITORIAL_CAPTION), color: config.accentColor }}
                  >
                    {brandName}
                  </span>
                )}
                <span
                  className="font-sans"
                  style={{ fontSize: px(EDITORIAL_CAPTION), color: config.textColor }}
                >
                  {displayIndex}
                </span>
              </div>

              {/* Center: HUGE title */}
              <div className="flex-1 flex flex-col items-start justify-center" style={{ paddingInline: px(28) }}>
                <div className="w-full">
                  {isEditing ? (
                    <textarea
                      ref={(el) => {
                        (titleInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                        if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                      }}
                      value={editTitle}
                      onChange={(e) => {
                        setEditTitle(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                      placeholder="TITLE"
                      spellCheck={false}
                      className={`w-full font-bold ${getFontClass(config.fontStyle)}`}
                      rows={1}
                      style={{ ...titleEditBaseStyle, color: config.textColor, fontSize: coverTitleSize, lineHeight: editorialTitleLineHeight, overflow: 'hidden', resize: 'none' }}
                    />
                  ) : (
                    <h1
                      className={`font-bold break-words whitespace-pre-wrap ${getFontClass(config.fontStyle)}`}
                      style={{ fontSize: coverTitleSize, lineHeight: editorialTitleLineHeight }}
                    >
                      {renderEditorialTitle(editTitle || 'UNTITLED')}
                    </h1>
                  )}
                  {/* Theme-tag pill — only shows once a tag exists, editable in edit mode */}
                  {(isEditing || badgeText) && (
                    <div
                      className="inline-grid font-sans"
                      style={{
                        fontSize: coverBadgeFontSize,
                        color: mutedColor,
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'}`,
                        borderRadius: '999px',
                        padding: `${coverBadgePaddingY} ${coverBadgePaddingX}`,
                        marginTop: coverBadgeMarginTop,
                      }}
                      onClick={(e) => isEditing && e.stopPropagation()}
                    >
                      {/* Mirror span controls width; input overlays it */}
                      <span className="invisible whitespace-pre [grid-area:1/1/2/2]">
                        {(isEditing ? (editBadgeText || badgeText || 'Theme tag') : badgeText)}
                      </span>
                      {isEditing ? (
                        <input
                          value={editBadgeText}
                          onChange={(e) => setEditBadgeText(e.target.value)}
                          placeholder="Theme tag"
                          spellCheck={false}
                          className="bg-transparent border-none outline-none [grid-area:1/1/2/2] w-full text-center placeholder:opacity-40"
                          style={{ color: mutedColor, fontSize: 'inherit' }}
                        />
                      ) : (
                        <span className="[grid-area:1/1/2/2]">{badgeText}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom bar: author info (left), optional text (right) */}
              <div
                className="shrink-0 flex items-end justify-between font-sans"
                style={{ paddingInline: px(28), paddingBottom: px(24) }}
              >
                {/* Author info — avatar centered on text, text bottom-aligns with right side */}
                <div className="relative" style={{ paddingLeft: px(48) }}>
                  {/* Avatar — absolutely positioned, centered on text column */}
                  <div
                    className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center font-bold overflow-hidden ${isEditing ? 'cursor-pointer' : ''}`}
                    style={{
                      width: px(40),
                      height: px(40),
                      backgroundColor: config.authorAvatar ? 'transparent' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                      color: config.textColor,
                      fontSize: px(16),
                      outline: isEditing ? `2px dashed ${config.accentColor}` : 'none',
                      outlineOffset: isEditing ? '2px' : '0px',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isEditing && onAvatarUpload) onAvatarUpload();
                    }}
                    title={isEditing ? 'Click to upload avatar' : ''}
                  >
                    {config.authorAvatar ? (
                      <img src={config.authorAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      editorialAuthorName.charAt(0).toUpperCase()
                    )}
                  </div>
                  {/* Text column — in flow, defines group height */}
                  <div className="flex flex-col" onClick={(e) => isEditing && e.stopPropagation()}>
                    {isEditing ? (
                      <input
                        value={config.authorName || ''}
                        onChange={(e) => {
                          if (onUpdate) onUpdate({
                            title: editTitle,
                            content: editContent,
                            layout: currentLayout,
                            image: editImage,
                            imageConfig: editImageConfig,
                            _authorNameUpdate: e.target.value,
                          } as any);
                        }}
                        placeholder="Author"
                        spellCheck={false}
                        className="bg-transparent border-none outline-none p-0"
                        style={{ fontSize: px(EDITORIAL_CAPTION), color: config.textColor, fontWeight: 600, width: '100%' }}
                      />
                    ) : (
                      <span style={{ fontSize: px(EDITORIAL_CAPTION), color: config.textColor, fontWeight: 600 }}>
                        {editorialAuthorName}
                      </span>
                    )}
                    <span style={{ fontSize: px(EDITORIAL_CAPTION), color: config.textColor, opacity: secondaryOpacity }}>
                      daiziyu.com
                    </span>
                  </div>
                </div>
                {/* Right side: accent-colored bookmark icon + text */}
                <div className="flex items-center gap-1.5 font-medium tracking-wide" style={{ color: config.accentColor }}>
                  <svg width={px(EDITORIAL_CAPTION + 1)} height={px(EDITORIAL_CAPTION + 1)} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2.5A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5v12a.5.5 0 01-.748.434L8 12.153l-4.252 2.78A.5.5 0 013 14.5v-12z" />
                  </svg>
                  <span style={{ fontSize: px(EDITORIAL_CAPTION) }}>Save for later</span>
                </div>
              </div>
            </>
          ) : (
            /* ═══ STANDARD: clean body page — title + content ONLY ═══ */
            <>
              {/* 4 Corner Marks */}
              <div
                className="absolute top-0 left-0 w-full flex justify-between items-start pointer-events-none z-10"
                style={{
                  paddingInline: px(28),
                  paddingTop: px(28),
                  fontSize: px(EDITORIAL_CAPTION),
                  color: config.textColor,
                }}
              >
                <div className="font-sans font-medium uppercase tracking-wider" style={{ color: config.accentColor }}>{brandName}</div>
                <div className="font-sans font-medium" style={{ opacity: isDark ? 0.8 : 0.6 }}>{displayIndex.toString().padStart(2, '0')}</div>
              </div>

              <div
                className="absolute bottom-0 left-0 w-full flex justify-between items-end pointer-events-none z-10"
                style={{
                  paddingInline: px(28),
                  paddingBottom: px(24),
                  fontSize: px(EDITORIAL_CAPTION),
                  color: config.textColor,
                }}
              >
                <div className="font-sans" style={{ opacity: secondaryOpacity }}>daiziyu.com</div>
                <div className="font-sans font-medium flex items-center gap-1.5 tracking-wide" style={{ color: config.accentColor }}>
                  Swipe 
                  <svg width={px(EDITORIAL_CAPTION + 1)} height={px(EDITORIAL_CAPTION + 1)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </div>
              </div>

              {hasVisibleTitle && (
                <div
                  className="shrink-0 relative z-10"
                  style={{
                    paddingInline: px(28),
                    paddingTop: px(64 + standardBodyCenterOffset),
                  }}
                >
                  {isEditing ? (
                    <input
                      ref={titleInputRef as any}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="(No Title)"
                      spellCheck={false}
                      className={`w-full font-bold placeholder:opacity-20 ${getFontClass(config.fontStyle)}`}
                      style={{ ...titleEditBaseStyle, color: config.textColor, fontSize: standardTitleSize, lineHeight: editorialTitleLineHeight }}
                    />
                  ) : (
                    <h2
                      className={`font-bold whitespace-pre-wrap ${getFontClass(config.fontStyle)}`}
                      style={{ fontSize: standardTitleSize, lineHeight: editorialTitleLineHeight }}
                    >
                      {renderEditorialTitle(editTitle)}
                    </h2>
                  )}
                </div>
              )}

              <div
                className="flex-1 min-h-0 relative z-10"
                style={{
                  fontSize: bodyFontSize,
                  lineHeight: bodyLineHeight,
                  letterSpacing: BODY_TYPOGRAPHY.letterSpacing,
                  color: config.textColor,
                  paddingInline: px(28),
                  paddingTop: hasVisibleTitle
                    ? px(24)
                    : px(64 + standardBodyCenterOffset),
                  paddingBottom: px(64),
                }}
              >
                {isEditing ? (
                  <textarea
                    ref={contentInputRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full resize-none bg-transparent"
                    style={{ ...bodyEditStyle, color: config.textColor }}
                  />
                ) : (
                  renderMarkdownContent()
                )}
                {renderOverflowBtn()}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };


  // --- MAIN RENDER ---
  const getContainerStyle = () => {
    const baseStyle = {
      backgroundColor: config.backgroundColor,
      color: config.textColor,
    };

    if (config.composition === 'technical') {
      return {
        ...baseStyle,
        borderRadius: '2px',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
      }
    }

    if (config.composition === 'editorial') {
      // Lighten the deep black neon background to a softer matte gray for a more premium editorial feel
      const matteBgColor = (isDark && config.backgroundColor === '#111111') ? '#18181a' : config.backgroundColor;

      return {
        ...baseStyle,
        backgroundColor: matteBgColor,
        borderRadius: '20px',
        boxShadow: isDark
          ? 'inset 0 0 0 1px rgba(255,255,255,0.08), 0 32px 64px -16px rgba(0,0,0,0.7)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.08), 0 32px 64px -16px rgba(0,0,0,0.12)',
      }
    }

    return {
      ...baseStyle,
      borderRadius: '16px',
      boxShadow: isDark
          ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 48px -12px rgba(0,0,0,0.6)'
          : 'inset 0 1px 0 rgba(255,255,255,0.8), 0 24px 48px -12px rgba(0,0,0,0.1)',
    };
  };

  return (
    <div
      ref={containerRef}
      className={`relative group/card ${getFontClass(config.fontStyle)} w-full shrink-0 overflow-hidden flex flex-col transition-all duration-300`}
      style={{
        ...getContainerStyle(),
        aspectRatio: getAspectRatioStyle(config.aspectRatio)
      }}
    >
       <style>{`.writing-vertical-rl { writing-mode: vertical-rl; }`}</style>

       {config.composition === 'classic' && renderClassic()}
       {config.composition === 'technical' && renderTechnical()}
       {config.composition === 'editorial' && renderEditorial()}

       
    </div>
  );
});
