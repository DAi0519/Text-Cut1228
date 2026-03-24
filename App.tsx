import React, { useState, useRef, useCallback, useEffect } from "react";
import { Console, type ConsoleTabId } from "./components/Console";
import { Card, CardHandle, OverflowSplitResult } from "./components/Card";
import { ImageCropModal } from "./components/ImageCropModal";
import {
  CardConfig,
  AspectRatio,
  CardSegment,
  FontStyle,
  ImageConfig,
  ImageAspectRatio,
} from "./types";
import { splitTextIntoCards } from "./services/geminiService";
import { toPng } from "html-to-image";
import { ArrowRight } from "lucide-react";

const CAPACITY_REGEN_DEBOUNCE_MS = 700;
const VALID_COMPOSITIONS = new Set(["classic", "technical", "editorial"]);
const VALID_ASPECT_RATIOS = new Set([
  AspectRatio.PORTRAIT,
  AspectRatio.SQUARE,
  AspectRatio.WIDE,
]);
const VALID_COLORWAYS = new Set(["snow", "neon"]);
const VALID_FONT_STYLES = new Set([
  FontStyle.CHILL,
  FontStyle.OPPO,
  FontStyle.SWEI,
]);
const CONFIG_VERSION = 5;
const CARD_BASE_WIDTHS: Record<AspectRatio, number> = {
  [AspectRatio.PORTRAIT]: 380,
  [AspectRatio.SQUARE]: 480,
  [AspectRatio.WIDE]: 600,
};
const CONSOLE_COLLAPSED_SAFE_AREA = 92;
const PORTRAIT_STAGE_INSET_MIN = 24;
const PORTRAIT_STAGE_INSET_MAX = 72;

/* ─────────────────────────────────────────────────────────
 * PANEL CARD STORYBOARD
 *
 * Read top-to-bottom. Each panel shifts the deck into a different stance.
 *
 *    0ms   panel tab changes and the active card receives the new focus mode
 *  120ms   inactive cards ease back using opacity + scale only (no blur)
 *  240ms   active card shadow settles into its new depth
 *  420ms   the full deck reaches its resting pose without a hard snap
 * ───────────────────────────────────────────────────────── */
const PANEL_CARD_MOTION = {
  duration: 520, // ms for scale / opacity handoff when panel mode changes
  easing: "cubic-bezier(0.16,1,0.3,1)",
};

/* ─────────────────────────────────────────────────────────
 * DRAG STORYBOARD
 *
 * Read top-to-bottom. Each stage tunes a specific feel point.
 *
 *    0ms   pointer down disables snap and cancels any landing motion
 *    8ms   drag samples smooth velocity and moves the deck 1:1
 *   16ms   scroll state updates the active card on the next frame
 *  180ms   release predicts the landing card from drag momentum
 *  260ms   custom landing animation glides and re-enables snap
 * ───────────────────────────────────────────────────────── */
const DRAG_INTERACTION = {
  dragActivationDistance: 4,   // px before release is treated as a drag
  velocitySampleWeight:   0.28, // blends noisy pointer samples into a stable fling
  velocityProjection:     160,  // px of look-ahead per px/ms of release velocity
  landingBaseDuration:    260,  // ms baseline for custom snap landing
  landingDistanceFactor:  0.12, // extra ms per px traveled during landing
  landingVelocityFactor:  70,   // faster throws reduce settle duration slightly
  landingMinDuration:     220,  // shortest landing duration
  landingMaxDuration:     420,  // longest landing duration
  scrollIdleDelay:        110,  // ms before the deck is considered settled
};

/* ─────────────────────────────────────────────────────────
 * WHEEL STORYBOARD
 *
 * Read top-to-bottom. Each stage tunes mouse-wheel glide.
 *
 *    0ms   wheel input converts vertical or horizontal intent into deck motion
 *   16ms   wheel impulses accumulate into a soft horizontal glide
 *  140ms   after wheel idle, the deck predicts the nearest snap card
 *  260ms   landing animation settles the card into center
 * ───────────────────────────────────────────────────────── */
const WHEEL_INTERACTION = {
  lineStep:            18,   // px per wheel line when deltaMode is "line"
  pageFactor:          0.82, // viewport-width factor when deltaMode is "page"
  impulseFactor:       0.9,  // converts wheel delta into horizontal momentum
  frictionPerFrame:    0.86, // decay applied every ~16ms during wheel glide
  maxVelocity:         72,   // px per frame cap to prevent jumpy fast wheels
  minVelocity:         0.35, // stop the wheel glide once slower than this
  snapDelay:           140,  // ms after last wheel tick before snapping
  snapProjection:      26,   // velocity look-ahead when choosing the landing card
  horizontalBiasRatio: 0.75, // preserve intentional horizontal trackpad gestures
};

const OVERFLOW_NORMALIZATION = {
  maxPasses: 48,
};

const FLOW_FILL_THRESHOLD = 0.92; // absorb next card when below this occupancy

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getCardWrapperStateClass = (
  isActive: boolean,
  panelTab: ConsoleTabId,
  isEditing: boolean,
) => {
  if (isActive) {
    return "scale-100 opacity-100 translate-y-0 z-10";
  }

  if (panelTab === "editor" || isEditing) {
    return "scale-[0.955] opacity-[0.42] translate-y-0 z-0 hover:opacity-[0.54] cursor-pointer";
  }

  if (panelTab === "source") {
    return "scale-[0.965] opacity-[0.5] translate-y-0 z-0 hover:opacity-[0.62] cursor-pointer";
  }

  return "scale-[0.972] opacity-[0.6] translate-y-0 z-0 hover:opacity-[0.72] cursor-pointer";
};

const getCardSurfaceStateClass = (
  isActive: boolean,
  panelTab: ConsoleTabId,
  isEditing: boolean,
) => {
  if (isActive && (panelTab === "editor" || isEditing)) {
    return "shadow-[0_26px_60px_-30px_rgba(15,23,42,0.28)]";
  }

  if (isActive) {
    return "shadow-[0_24px_56px_-30px_rgba(15,23,42,0.24)]";
  }

  return "shadow-[0_18px_40px_-30px_rgba(15,23,42,0.14)]";
};

const getPreviewFontClass = (style: FontStyle) => {
  switch (style) {
    case FontStyle.CHILL:
      return "font-chill";
    case FontStyle.OPPO:
      return "font-oppo";
    case FontStyle.SWEI:
    default:
      return "font-swei";
  }
};

const normalizeSourceText = (text: string) => text.replace(/\r\n?/g, "\n");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getBoundarySeparatorFromSource = (
  sourceText: string,
  before: string,
  after: string,
) => {
  const normalizedSource = normalizeSourceText(sourceText);
  const beforeTrimmed = before.trim();
  const afterTrimmed = after.trim();
  if (!beforeTrimmed || !afterTrimmed) return "\n\n";

  let searchFrom = 0;
  while (searchFrom < normalizedSource.length) {
    const beforeIndex = normalizedSource.indexOf(beforeTrimmed, searchFrom);
    if (beforeIndex === -1) break;

    const start = beforeIndex + beforeTrimmed.length;
    const nearbyAfterIndex = normalizedSource.indexOf(afterTrimmed, start);
    if (nearbyAfterIndex !== -1 && nearbyAfterIndex - start <= 16) {
      return normalizedSource.slice(start, nearbyAfterIndex);
    }

    const tail = escapeRegExp(beforeTrimmed.slice(-24));
    const head = escapeRegExp(afterTrimmed.slice(0, 24));
    const matcher = new RegExp(`${tail}([\\s\\S]{0,16}?)${head}`, "g");
    matcher.lastIndex = Math.max(0, beforeIndex + beforeTrimmed.length - 24);
    const match = matcher.exec(normalizedSource);
    if (match) return match[1];

    searchFrom = beforeIndex + 1;
  }

  return "\n\n";
};

const canNormalizeAdjacentCards = (
  current: CardSegment | undefined,
  next: CardSegment | undefined,
) => {
  if (!current || !next) return false;
  if (current.layout === "cover" || next.layout === "cover") return false;

  const currentTitle = current.title.trim();
  const nextTitle = next.title.trim();
  if (!currentTitle || !nextTitle) return true;

  return currentTitle === nextTitle;
};

const getCardWidth = (ratio: AspectRatio, scale: number) =>
  Math.round(CARD_BASE_WIDTHS[ratio] * scale);

const getAspectRatioValue = (ratio: AspectRatio) => {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
};

const getCardHeight = (ratio: AspectRatio, scale: number) =>
  Math.round(getCardWidth(ratio, scale) / getAspectRatioValue(ratio));

const getCapacitySignature = (
  config: Pick<CardConfig, "cardScale" | "aspectRatio" | "fontSize">,
) => `${config.cardScale}|${config.aspectRatio}|${config.fontSize}`;

type CropModalState = {
  cardIndex: number;
  ratio: ImageAspectRatio;
  imageSrc: string;
  initialScale: number;
  initialPanX: number;
  initialPanY: number;
};

const parseImageAspectRatio = (ratio: ImageAspectRatio) => {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });

const cropImageWithConfig = async (
  imageSrc: string,
  ratio: ImageAspectRatio,
  cropScale: number,
  cropPanX: number,
  cropPanY: number,
) => {
  const image = await loadImage(imageSrc);
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = parseImageAspectRatio(ratio);
  const viewportWidth = targetRatio;
  const viewportHeight = 1;
  const baseDisplayWidth =
    imageRatio > targetRatio ? imageRatio : targetRatio;
  const baseDisplayHeight =
    imageRatio > targetRatio ? 1 : targetRatio / imageRatio;
  const scaledWidth = baseDisplayWidth * cropScale;
  const scaledHeight = baseDisplayHeight * cropScale;
  const left =
    (viewportWidth - scaledWidth) / 2 +
    ((cropPanX - 50) / 100) * scaledWidth;
  const top =
    (viewportHeight - scaledHeight) / 2 +
    ((cropPanY - 50) / 100) * scaledHeight;
  const sourceX = clamp((-left / scaledWidth) * image.naturalWidth, 0, image.naturalWidth);
  const sourceY = clamp((-top / scaledHeight) * image.naturalHeight, 0, image.naturalHeight);
  const sourceWidth = clamp(
    (viewportWidth / scaledWidth) * image.naturalWidth,
    1,
    image.naturalWidth - sourceX,
  );
  const sourceHeight = clamp(
    (viewportHeight / scaledHeight) * image.naturalHeight,
    1,
    image.naturalHeight - sourceY,
  );
  const OUTPUT_LONG_EDGE = 1600;
  const canvasWidth =
    targetRatio >= 1
      ? OUTPUT_LONG_EDGE
      : Math.round(OUTPUT_LONG_EDGE * targetRatio);
  const canvasHeight =
    targetRatio >= 1
      ? Math.round(OUTPUT_LONG_EDGE / targetRatio)
      : OUTPUT_LONG_EDGE;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create crop canvas");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvasWidth,
    canvasHeight,
  );

  return canvas.toDataURL("image/png");
};

const createImageConfig = (
  overrides?: Partial<ImageConfig>,
): ImageConfig => ({
  position: overrides?.position ?? "top",
  heightRatio: overrides?.heightRatio ?? 0.45,
  aspectRatio: overrides?.aspectRatio,
  cropScale: overrides?.cropScale ?? 1,
  cropPanX: overrides?.cropPanX ?? 50,
  cropPanY: overrides?.cropPanY ?? 50,
  scale: overrides?.scale ?? 1,
  panX: overrides?.panX ?? 50,
  panY: overrides?.panY ?? 50,
});

const migrateConfig = (
  raw: Partial<CardConfig>,
  defaults: CardConfig,
  savedVersion: number,
): CardConfig => {
  if (savedVersion >= CONFIG_VERSION) {
    return normalizeConfig(raw, defaults);
  }

  const next = { ...raw };

  // Upgrade legacy defaults without stomping on deliberate user choices.
  if (
    raw.cardScale == null ||
    raw.cardScale === 1.15 ||
    raw.cardScale === 1.5
  ) {
    next.cardScale = defaults.cardScale;
  }

  if (raw.fontSize == null || raw.fontSize === 1.0 || raw.fontSize === 1.05) {
    next.fontSize = defaults.fontSize;
  }

  if (raw.editorialTitleScale == null || raw.editorialTitleScale === 1.0) {
    next.editorialTitleScale = defaults.editorialTitleScale;
  }

  return normalizeConfig(next, defaults);
};

const normalizeConfig = (
  raw: Partial<CardConfig>,
  defaults: CardConfig,
): CardConfig => {
  const merged = { ...defaults, ...raw } as CardConfig;
  return {
    ...merged,
    composition: VALID_COMPOSITIONS.has(merged.composition)
      ? merged.composition
      : defaults.composition,
    aspectRatio: VALID_ASPECT_RATIOS.has(merged.aspectRatio)
      ? merged.aspectRatio
      : defaults.aspectRatio,
    colorway: VALID_COLORWAYS.has(merged.colorway)
      ? merged.colorway
      : defaults.colorway,
    fontStyle: VALID_FONT_STYLES.has(merged.fontStyle)
      ? merged.fontStyle
      : defaults.fontStyle,
    fontSize:
      typeof merged.fontSize === "number" &&
      Number.isFinite(merged.fontSize) &&
      merged.fontSize >= 0.7 &&
      merged.fontSize <= 1.5
        ? merged.fontSize
        : defaults.fontSize,
    cardScale:
      typeof merged.cardScale === "number" &&
      Number.isFinite(merged.cardScale) &&
      merged.cardScale >= 0.9 &&
      merged.cardScale <= 1.5
        ? merged.cardScale
        : defaults.cardScale,
    editorialTitleScale:
      typeof merged.editorialTitleScale === "number" &&
      Number.isFinite(merged.editorialTitleScale) &&
      merged.editorialTitleScale >= 0.6 &&
      merged.editorialTitleScale <= 1.6
        ? merged.editorialTitleScale
        : defaults.editorialTitleScale,
  };
};

const App: React.FC = () => {
  // --- State ---
  const [inputText, setInputText] = useState<string>(() => {
    try {
      return localStorage.getItem("textcuts_input") || "";
    } catch {
      return "";
    }
  });

  const [cards, setCards] = useState<CardSegment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.85);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1440,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
  }));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [activeConsoleTab, setActiveConsoleTab] =
    useState<ConsoleTabId>("style");
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(236);
  const [isScrolling, setIsScrolling] = useState(false);
  const [lastGeneratedCapacitySignature, setLastGeneratedCapacitySignature] =
    useState<string | null>(null);
  const [hasCardEditsSinceGenerate, setHasCardEditsSinceGenerate] =
    useState(false);
  const [pendingRegeneration, setPendingRegeneration] = useState(false);
  const [pendingOverflowNormalization, setPendingOverflowNormalization] =
    useState(false);
  const [overflowNormalizationRevision, setOverflowNormalizationRevision] =
    useState(0);
  const [dismissedCapacitySignature, setDismissedCapacitySignature] = useState<
    string | null
  >(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const regenerationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processingReasonRef = useRef<"manual" | "capacity" | null>(null);
  
  const editingIndexRef = useRef<number | null>(null);
  editingIndexRef.current = editingIndex;
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const dragDistance = useRef(0);
  const velocity = useRef(0);
  const lastTime = useRef(0);
  const activePointerId = useRef<number | null>(null);
  const landingAnimationFrameRef = useRef<number | null>(null);
  const scrollMeasureFrameRef = useRef<number | null>(null);
  const wheelAnimationFrameRef = useRef<number | null>(null);
  const wheelSnapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wheelVelocityRef = useRef(0);
  const lastWheelFrameTimeRef = useRef<number | null>(null);
  const overflowNormalizationFrameRef = useRef<number | null>(null);
  const overflowNormalizationPassRef = useRef(0);
  const flowFillStableSetRef = useRef(new Set<number>());
  const lastFlowFillMergeIndexRef = useRef(-1);
  const fontNormalizationRequestRef = useRef(0);

  // Track active card state for external toolbar
  const [activeEditConfig, setActiveEditConfig] = useState<ImageConfig | null>(
    null,
  );
  const [activeHasImage, setActiveHasImage] = useState(false);
  const [cropModalState, setCropModalState] = useState<CropModalState | null>(
    null,
  );

  const [config, setConfig] = useState<CardConfig>(() => {
    const defaultConfig = {
      colorway: "snow",
      backgroundColor: "#f4f4f5",
      textColor: "#18181b",
      accentColor: "#ea580c",
      fontStyle: FontStyle.SWEI,
      composition: "classic",
      aspectRatio: AspectRatio.PORTRAIT,
      fontSize: 1.3,
      cardScale: 1.35,
      editorialTitleScale: 0.9,
      showMetadata: true,
      title: "",
      authorName: "",
    } as CardConfig;

    try {
      const saved = localStorage.getItem("textcuts_config");
      if (saved) {
        const savedVersion = Number(
          localStorage.getItem("textcuts_config_version") || "0",
        );
        return migrateConfig(JSON.parse(saved), defaultConfig, savedVersion);
      }
      return defaultConfig;
    } catch {
      return defaultConfig;
    }
  });

  // --- Image Upload Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const activeCardIndexForUpload = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(CardHandle | null)[]>([]);
  const capacitySignature = getCapacitySignature(config);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem("textcuts_input", inputText);
  }, [inputText]);
  useEffect(() => {
    localStorage.setItem("textcuts_config", JSON.stringify(config));
    localStorage.setItem("textcuts_config_version", String(CONFIG_VERSION));
  }, [config]);
  useEffect(() => {
    const updateViewportSize = () => {
      const { innerWidth, innerHeight } = window;
      setViewportSize({ width: innerWidth, height: innerHeight });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (regenerationTimeoutRef.current) {
        clearTimeout(regenerationTimeoutRef.current);
      }
      if (landingAnimationFrameRef.current !== null) {
        cancelAnimationFrame(landingAnimationFrameRef.current);
      }
      if (scrollMeasureFrameRef.current !== null) {
        cancelAnimationFrame(scrollMeasureFrameRef.current);
      }
      if (wheelAnimationFrameRef.current !== null) {
        cancelAnimationFrame(wheelAnimationFrameRef.current);
      }
      if (wheelSnapTimeoutRef.current) {
        clearTimeout(wheelSnapTimeoutRef.current);
      }
      if (overflowNormalizationFrameRef.current !== null) {
        cancelAnimationFrame(overflowNormalizationFrameRef.current);
      }
    };
  }, []);

  // --- Scroll & Active Card Detection ---
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || cards.length === 0) return;
    const axis: "x" = "x";

    const getScrollPosition = () =>
      axis === "x" ? container.scrollLeft : container.scrollTop;
    const setScrollPosition = (value: number) => {
      if (axis === "x") {
        container.scrollLeft = value;
      } else {
        container.scrollTop = value;
      }
    };
    const getViewportSize = () =>
      axis === "x" ? container.clientWidth : container.clientHeight;
    const getMaxScroll = () =>
      axis === "x"
        ? Math.max(0, container.scrollWidth - container.clientWidth)
        : Math.max(0, container.scrollHeight - container.clientHeight);
    const getItemOffset = (element: HTMLElement) =>
      axis === "x" ? element.offsetLeft : element.offsetTop;
    const getItemSize = (element: HTMLElement) =>
      axis === "x" ? element.offsetWidth : element.offsetHeight;
    const getPointerCoord = (event: PointerEvent) =>
      axis === "x" ? event.clientX : event.clientY;

    const setSnapEnabled = (enabled: boolean) => {
      container.style.scrollSnapType = enabled ? `${axis} mandatory` : "none";
    };

    const cancelLandingAnimation = () => {
      if (landingAnimationFrameRef.current !== null) {
        cancelAnimationFrame(landingAnimationFrameRef.current);
        landingAnimationFrameRef.current = null;
      }
    };

    const cancelWheelMomentum = () => {
      if (wheelAnimationFrameRef.current !== null) {
        cancelAnimationFrame(wheelAnimationFrameRef.current);
        wheelAnimationFrameRef.current = null;
      }
      if (wheelSnapTimeoutRef.current) {
        clearTimeout(wheelSnapTimeoutRef.current);
        wheelSnapTimeoutRef.current = null;
      }
      wheelVelocityRef.current = 0;
      lastWheelFrameTimeRef.current = null;
    };

    const animateScrollTo = (targetPosition: number, releaseVelocity = 0) => {
      cancelWheelMomentum();
      cancelLandingAnimation();

      const startPosition = getScrollPosition();
      const maxScroll = getMaxScroll();
      const clampedTarget = clamp(targetPosition, 0, maxScroll);
      const distance = clampedTarget - startPosition;

      if (Math.abs(distance) < 0.5) {
        setScrollPosition(clampedTarget);
        setSnapEnabled(true);
        return;
      }

      setSnapEnabled(false);

      const duration = clamp(
        DRAG_INTERACTION.landingBaseDuration +
          Math.abs(distance) * DRAG_INTERACTION.landingDistanceFactor -
          Math.min(
            Math.abs(releaseVelocity) * DRAG_INTERACTION.landingVelocityFactor,
            DRAG_INTERACTION.landingVelocityFactor,
          ),
        DRAG_INTERACTION.landingMinDuration,
        DRAG_INTERACTION.landingMaxDuration,
      );
      const startedAt = performance.now();

      const step = (now: number) => {
        const progress = clamp((now - startedAt) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setScrollPosition(startPosition + distance * eased);

        if (progress < 1) {
          landingAnimationFrameRef.current = requestAnimationFrame(step);
          return;
        }

        setScrollPosition(clampedTarget);
        setSnapEnabled(true);
        landingAnimationFrameRef.current = null;
      };

      landingAnimationFrameRef.current = requestAnimationFrame(step);
    };

    const getClosestSnapPosition = (projectedCenter: number) => {
      let minDistance = Infinity;
      let closestPosition = getScrollPosition();
      const cardElements = container.querySelectorAll(".card-wrapper");

      cardElements.forEach((el) => {
        const element = el as HTMLElement;
        const rectCenter = getItemOffset(element) + getItemSize(element) / 2;
        const distance = Math.abs(projectedCenter - rectCenter);

        if (distance < minDistance) {
          minDistance = distance;
          closestPosition =
            getItemOffset(element) - getViewportSize() / 2 + getItemSize(element) / 2;
        }
      });

      return clamp(closestPosition, 0, getMaxScroll());
    };

    const measureActiveCard = () => {
      scrollMeasureFrameRef.current = null;
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      
      const center = getScrollPosition() + getViewportSize() / 2;
      let minDistance = Infinity;
      let closestIndex = 0;

      // Find card closest to center
      const cardElements = container.querySelectorAll('.card-wrapper');
      cardElements.forEach((el, idx) => {
        const element = el as HTMLElement;
        const rect = getItemOffset(element) + getItemSize(element) / 2;
        const distance = Math.abs(center - rect);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = idx;
        }
      });

      setActiveCardIndex((prev) => (prev === closestIndex ? prev : closestIndex));

      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, DRAG_INTERACTION.scrollIdleDelay);
    };

    const handleScroll = () => {
      if (scrollMeasureFrameRef.current !== null) return;
      scrollMeasureFrameRef.current = requestAnimationFrame(measureActiveCard);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || isDragging.current) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const rawDelta =
        axis === "x"
          ? Math.abs(e.deltaX) >=
            Math.abs(e.deltaY) * WHEEL_INTERACTION.horizontalBiasRatio
            ? e.deltaX
            : e.deltaY
          : Math.abs(e.deltaY) >=
              Math.abs(e.deltaX) * WHEEL_INTERACTION.horizontalBiasRatio
            ? e.deltaY
            : e.deltaX;

      if (rawDelta === 0) return;

      e.preventDefault();
      cancelLandingAnimation();
      setSnapEnabled(false);

      const deltaMultiplier =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_INTERACTION.lineStep
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? getViewportSize() * WHEEL_INTERACTION.pageFactor
            : 1;
      const impulse = rawDelta * deltaMultiplier * WHEEL_INTERACTION.impulseFactor;

      wheelVelocityRef.current = clamp(
        wheelVelocityRef.current + impulse,
        -WHEEL_INTERACTION.maxVelocity,
        WHEEL_INTERACTION.maxVelocity,
      );

      if (wheelAnimationFrameRef.current === null) {
        const step = (now: number) => {
          const previousTime = lastWheelFrameTimeRef.current ?? now;
          const dt = Math.min(34, now - previousTime || 16);
          lastWheelFrameTimeRef.current = now;

          const frameRatio = dt / 16;
          setScrollPosition(clamp(
            getScrollPosition() + wheelVelocityRef.current * frameRatio,
            0,
            getMaxScroll(),
          ));

          wheelVelocityRef.current *= Math.pow(
            WHEEL_INTERACTION.frictionPerFrame,
            frameRatio,
          );

          if (Math.abs(wheelVelocityRef.current) <= WHEEL_INTERACTION.minVelocity) {
            wheelAnimationFrameRef.current = null;
            lastWheelFrameTimeRef.current = null;
            wheelVelocityRef.current = 0;
            return;
          }

          wheelAnimationFrameRef.current = requestAnimationFrame(step);
        };

        lastWheelFrameTimeRef.current = null;
        wheelAnimationFrameRef.current = requestAnimationFrame(step);
      }

      if (wheelSnapTimeoutRef.current) clearTimeout(wheelSnapTimeoutRef.current);
      wheelSnapTimeoutRef.current = setTimeout(() => {
        wheelSnapTimeoutRef.current = null;
        const projectedCenter =
          getScrollPosition() +
          getViewportSize() / 2 +
          wheelVelocityRef.current * WHEEL_INTERACTION.snapProjection;
        const targetPosition = getClosestSnapPosition(projectedCenter);
        animateScrollTo(targetPosition, wheelVelocityRef.current / 16);
      }, WHEEL_INTERACTION.snapDelay);
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Disable carousel drag entirely while editing a card (allows image drag in editorial)
      if (editingIndexRef.current !== null) return;
      // ignore inputs, clickable elements or non-left clicks
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).closest('button') ||
        e.button !== 0
      ) {
        return;
      }

      cancelLandingAnimation();
      cancelWheelMomentum();
      isDragging.current = true;
      dragDistance.current = 0;
      lastX.current = getPointerCoord(e);
      velocity.current = 0;
      lastTime.current = performance.now();
      activePointerId.current = e.pointerId;
      
      // Stop any ongoing smooth scrolling by forcibly snapping
      setSnapEnabled(false);
      
      container.style.scrollBehavior = "auto";
      container.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      container.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current || activePointerId.current !== e.pointerId) return;
      e.preventDefault();
      
      const currentCoord = getPointerCoord(e);
      const currentTime = performance.now();
      
      const delta = currentCoord - lastX.current;
      const dt = currentTime - lastTime.current || 16;
      
      // Instant exact 1:1 scroll without anchor rubberbanding
      setScrollPosition(getScrollPosition() - delta);

      // Blend pointer samples so the release velocity feels stable, not twitchy.
      const sampleVelocity = delta / dt;
      velocity.current =
        velocity.current * (1 - DRAG_INTERACTION.velocitySampleWeight) +
        sampleVelocity * DRAG_INTERACTION.velocitySampleWeight;
      
      dragDistance.current += Math.abs(delta);
      lastX.current = currentCoord;
      lastTime.current = currentTime;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging.current || activePointerId.current !== e.pointerId) return;
      isDragging.current = false;
      activePointerId.current = null;
      
      container.style.cursor = "";
      document.body.style.userSelect = "";
      container.releasePointerCapture(e.pointerId);

      const projection =
        dragDistance.current > DRAG_INTERACTION.dragActivationDistance
          ? velocity.current * DRAG_INTERACTION.velocityProjection
          : 0;
      const predictedCenter =
        getScrollPosition() + getViewportSize() / 2 - projection;
      const closestPosition = getClosestSnapPosition(predictedCenter);

      animateScrollTo(closestPosition, velocity.current);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (!isDragging.current || activePointerId.current !== e.pointerId) return;
      handlePointerUp(e);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);
    
    // Initial check
    handleScroll();

    return () => {
      cancelWheelMomentum();
      cancelLandingAnimation();
      if (scrollMeasureFrameRef.current !== null) {
        cancelAnimationFrame(scrollMeasureFrameRef.current);
        scrollMeasureFrameRef.current = null;
      }
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [cards.length]);

  // --- Handlers ---
  const runGeneration = useCallback(
    async (
      reason: "manual" | "capacity",
      configSnapshot: CardConfig = config,
      signatureSnapshot: string = getCapacitySignature(configSnapshot),
    ) => {
      if (!inputText.trim()) return false;

      processingReasonRef.current = reason;

      if (regenerationTimeoutRef.current) {
        clearTimeout(regenerationTimeoutRef.current);
        regenerationTimeoutRef.current = null;
      }

      setIsProcessing(true);
      setEditingIndex(null);

      try {
        const segments = await splitTextIntoCards(inputText, configSnapshot);
        const userTitle = configSnapshot.title.trim();
        const nextSegments = [...segments];

        if (nextSegments.length > 0) {
          if (userTitle) {
            nextSegments[0] = { ...nextSegments[0], title: userTitle };
          } else {
            const generatedCoverTitle = (nextSegments[0].title || "").trim();
            if (generatedCoverTitle) {
              setConfig((prev) => ({ ...prev, title: generatedCoverTitle }));
            }
          }
        }

        setCards(nextSegments);
        setLastGeneratedCapacitySignature(signatureSnapshot);
        setHasCardEditsSinceGenerate(false);
        setPendingRegeneration(false);
        setPendingOverflowNormalization(true);
        setOverflowNormalizationRevision(0);
        setDismissedCapacitySignature(null);
        overflowNormalizationPassRef.current = 0;
        fontNormalizationRequestRef.current += 1;

        if (typeof document !== "undefined" && "fonts" in document) {
          const requestId = fontNormalizationRequestRef.current;
          document.fonts.ready.then(() => {
            if (fontNormalizationRequestRef.current !== requestId) return;
            setPendingOverflowNormalization(true);
            setOverflowNormalizationRevision(0);
            overflowNormalizationPassRef.current = 0;
          });
        }

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = 0;
        }

        return true;
      } catch (error) {
        alert("Failed to process text.");
        return false;
      } finally {
        processingReasonRef.current = null;
        setIsProcessing(false);
      }
    },
    [config, inputText],
  );

  const handleProcess = useCallback(async () => {
    if (!inputText.trim()) return;
    setPendingRegeneration(false);
    setPendingOverflowNormalization(false);
    setOverflowNormalizationRevision(0);
    setDismissedCapacitySignature(null);
    await runGeneration("manual");
  }, [inputText, runGeneration]);

  const handleRegenerateForCapacityChange = useCallback(async () => {
    if (
      !cards.length ||
      !inputText.trim() ||
      capacitySignature === lastGeneratedCapacitySignature
    ) {
      setPendingRegeneration(false);
      return;
    }

    if (hasCardEditsSinceGenerate) {
      if (dismissedCapacitySignature === capacitySignature) {
        setPendingRegeneration(true);
        return;
      }

      const confirmed = window.confirm(
        "Card capacity changed. Re-generate cards to match the new text capacity? This will overwrite your current card-level edits.",
      );

      if (!confirmed) {
        setPendingRegeneration(true);
        setDismissedCapacitySignature(capacitySignature);
        return;
      }
    }

    await runGeneration("capacity", config, capacitySignature);
  }, [
    capacitySignature,
    cards.length,
    config,
    dismissedCapacitySignature,
    hasCardEditsSinceGenerate,
    inputText,
    lastGeneratedCapacitySignature,
    runGeneration,
  ]);

  useEffect(() => {
    const hasGenerationTarget =
      cards.length > 0 &&
      inputText.trim().length > 0 &&
      lastGeneratedCapacitySignature !== null;

    if (!hasGenerationTarget) {
      setPendingRegeneration(false);
      setDismissedCapacitySignature(null);
      return;
    }

    if (capacitySignature === lastGeneratedCapacitySignature) {
      setPendingRegeneration(false);
      setDismissedCapacitySignature(null);
      return;
    }

    setPendingRegeneration(true);
    if (
      dismissedCapacitySignature &&
      dismissedCapacitySignature !== capacitySignature
    ) {
      setDismissedCapacitySignature(null);
    }
  }, [
    cards.length,
    capacitySignature,
    dismissedCapacitySignature,
    inputText,
    lastGeneratedCapacitySignature,
  ]);

  useEffect(() => {
    if (
      !pendingRegeneration ||
      !cards.length ||
      !inputText.trim() ||
      isProcessing ||
      editingIndex !== null ||
      capacitySignature === lastGeneratedCapacitySignature
    ) {
      return;
    }

    if (regenerationTimeoutRef.current) {
      clearTimeout(regenerationTimeoutRef.current);
    }

    regenerationTimeoutRef.current = setTimeout(() => {
      void handleRegenerateForCapacityChange();
    }, CAPACITY_REGEN_DEBOUNCE_MS);

    return () => {
      if (regenerationTimeoutRef.current) {
        clearTimeout(regenerationTimeoutRef.current);
        regenerationTimeoutRef.current = null;
      }
    };
  }, [
    capacitySignature,
    cards.length,
    editingIndex,
    handleRegenerateForCapacityChange,
    inputText,
    isProcessing,
    lastGeneratedCapacitySignature,
    pendingRegeneration,
  ]);

  const handleUpdateCard = (index: number, updatedSegment: CardSegment) => {
    setHasCardEditsSinceGenerate(true);
    // Handle editorial cover card special updates
    const raw = updatedSegment as any;
    if (raw._avatarUpload) {
      setConfig(prev => ({ ...prev, authorAvatar: raw._avatarUpload }));
      delete raw._avatarUpload;
    }
    if (raw._authorNameUpdate !== undefined) {
      setConfig(prev => ({ ...prev, authorName: raw._authorNameUpdate }));
      delete raw._authorNameUpdate;
    }
    setCards((prev) => {
      const newCards = [...prev];
      const existing = newCards[index];
      const nextSegment = {
        ...existing,
        ...updatedSegment,
        originalImage:
          updatedSegment.originalImage ?? existing?.originalImage,
      };
      newCards[index] = nextSegment;

      // Keep the editorial theme tag in sync between the first and last cover.
      if (
        nextSegment.layout === "cover" &&
        updatedSegment.editorialBadgeText !== undefined
      ) {
        const coverIndices = newCards
          .map((segment, segmentIndex) =>
            segment.layout === "cover" ? segmentIndex : -1,
          )
          .filter((segmentIndex) => segmentIndex >= 0);

        if (coverIndices.length >= 2) {
          const firstCoverIndex = coverIndices[0];
          const lastCoverIndex = coverIndices[coverIndices.length - 1];
          const syncedTag = nextSegment.editorialBadgeText;

          if (index === firstCoverIndex || index === lastCoverIndex) {
            newCards[firstCoverIndex] = {
              ...newCards[firstCoverIndex],
              editorialBadgeText: syncedTag,
            };
            newCards[lastCoverIndex] = {
              ...newCards[lastCoverIndex],
              editorialBadgeText: syncedTag,
            };
          }
        }
      }

      return newCards;
    });
  };

  const applyOverflowSplit = useCallback(
    (
      index: number,
      splitResult: OverflowSplitResult,
      options?: { markEdited?: boolean },
    ) => {
      if (options?.markEdited !== false) {
        setHasCardEditsSinceGenerate(true);
      }

      setCards((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = splitResult.keptSegment;

        const movedContent = splitResult.movedSegment.content.trim();
        const nextCard = next[index + 1];

        // Small remnant (< 80 chars): prepend to the next body card instead of
        // creating a standalone tiny card that would cause merge-split oscillation.
        if (
          movedContent.length < 80 &&
          nextCard &&
          nextCard.layout !== "cover"
        ) {
          const sep = getBoundarySeparatorFromSource(
            inputText,
            movedContent,
            nextCard.content,
          );
          next[index + 1] = {
            ...nextCard,
            content: `${movedContent}${sep}${nextCard.content.trim()}`.trim(),
          };
        } else {
          next.splice(index + 1, 0, splitResult.movedSegment);
        }

        return next;
      });
    },
    [inputText],
  );

  const applyUnderfillMerge = useCallback(
    (index: number) => {
      setCards((prev) => {
        if (!prev[index] || !prev[index + 1]) return prev;

        const next = [...prev];
        const boundary = getBoundarySeparatorFromSource(
          inputText,
          next[index].content,
          next[index + 1].content,
        );
        next[index] = {
          ...next[index],
          title: next[index].title.trim() || next[index + 1].title.trim(),
          content: `${next[index].content.trim()}${boundary}${next[index + 1].content.trim()}`.trim(),
        };
        next.splice(index + 1, 1);
        return next;
      });
    },
    [inputText],
  );

  const handleSplitCard = useCallback((index: number, splitSegment: CardSegment) => {
    setHasCardEditsSinceGenerate(true);
    setCards((prev) => {
      const newCards = [...prev];
      newCards.splice(index + 1, 0, splitSegment);
      return newCards;
    });
  }, []);

  const handleStartEdit = (index: number) => {
    if (editingIndex !== null && editingIndex !== index) {
      cardRefs.current[editingIndex]?.save();
    }
    setEditingIndex(index);
    // Reset state for new edit
    setActiveEditConfig(null);
    setActiveHasImage(false);
    cardRefs.current[index]?.startEdit();
  };

  const handleSaveEdit = (index: number) => {
    cardRefs.current[index]?.save();
    setEditingIndex(null);
    setActiveEditConfig(null);
  };

  const handleCancelEdit = (index: number) => {
    cardRefs.current[index]?.cancel();
    setEditingIndex(null);
    setActiveEditConfig(null);
  };

  const handleEditStateChange = (
    index: number,
    hasImage: boolean,
    config: ImageConfig,
  ) => {
    if (index === editingIndex) {
      setActiveHasImage(hasImage);
      setActiveEditConfig(createImageConfig(config));
    }
  };

  const triggerImageUpload = (index: number) => {
    activeCardIndexForUpload.current = index;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeCardIndexForUpload.current !== null) {
      const targetIdx = activeCardIndexForUpload.current;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const existingCard = cards[targetIdx];
        const nextImageConfig = createImageConfig({
          position: existingCard?.imageConfig?.position,
          heightRatio: existingCard?.imageConfig?.heightRatio,
          aspectRatio: existingCard?.imageConfig?.aspectRatio,
        });
        setHasCardEditsSinceGenerate(true);
        // Keep editing-state preview in sync immediately.
        cardRefs.current[targetIdx]?.setImage(result);
        cardRefs.current[targetIdx]?.updateImageConfig(nextImageConfig);
        setCards((prev) => {
          const newCards = [...prev];
          newCards[targetIdx] = {
            ...newCards[targetIdx],
            image: result,
            originalImage: result,
            imageConfig: nextImageConfig,
          };
          return newCards;
        });
        if (editingIndex === targetIdx) {
          setActiveHasImage(true);
          setActiveEditConfig(nextImageConfig);
        }
        activeCardIndexForUpload.current = null;
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const triggerAvatarUpload = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setConfig(prev => ({ ...prev, authorAvatar: result }));
    };
    reader.readAsDataURL(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleUpdateImageConfig = (updates: Partial<ImageConfig>) => {
    if (activeCardIndex === null) return;
    setHasCardEditsSinceGenerate(true);
    cardRefs.current[activeCardIndex]?.updateImageConfig(updates);
    setCards((prev) => {
      const next = [...prev];
      const existing = next[activeCardIndex];
      if (!existing) return prev;
      next[activeCardIndex] = {
        ...existing,
        imageConfig: createImageConfig({
          ...(existing.imageConfig ?? {}),
          ...updates,
        }),
      };
      return next;
    });
  };

  const handleSelectFrameSize = (ratio?: ImageAspectRatio) => {
    if (activeCardIndex === null) return;

    const activeCard = cards[activeCardIndex];
    if (!activeCard?.image) return;

    const originalImage = activeCard.originalImage || activeCard.image;
    if (!originalImage) return;

    if (!ratio) {
      const restoredConfig = createImageConfig({
        position: activeCard.imageConfig?.position,
        heightRatio: activeCard.imageConfig?.heightRatio,
      });

      setHasCardEditsSinceGenerate(true);
      cardRefs.current[activeCardIndex]?.setImage(originalImage);
      cardRefs.current[activeCardIndex]?.updateImageConfig(restoredConfig);
      setCards((prev) => {
        const next = [...prev];
        const existing = next[activeCardIndex];
        if (!existing) return prev;
        next[activeCardIndex] = {
          ...existing,
          image: originalImage,
          originalImage,
          imageConfig: restoredConfig,
        };
        return next;
      });

      if (editingIndex === activeCardIndex) {
        setActiveEditConfig(restoredConfig);
        setActiveHasImage(true);
      }
      return;
    }

    const existingConfig = createImageConfig(activeCard.imageConfig);
    const isSameRatio = existingConfig.aspectRatio === ratio;
    setCropModalState({
      cardIndex: activeCardIndex,
      ratio,
      imageSrc: originalImage,
      initialScale: isSameRatio ? existingConfig.cropScale ?? 1 : 1,
      initialPanX: isSameRatio ? existingConfig.cropPanX ?? 50 : 50,
      initialPanY: isSameRatio ? existingConfig.cropPanY ?? 50 : 50,
    });
  };

  const handleConfirmCrop = useCallback(
    async ({
      scale,
      panX,
      panY,
    }: {
      scale: number;
      panX: number;
      panY: number;
    }) => {
      if (!cropModalState) return;

      const { cardIndex, ratio, imageSrc } = cropModalState;

      try {
        const croppedImage = await cropImageWithConfig(
          imageSrc,
          ratio,
          scale,
          panX,
          panY,
        );
        const currentCard = cards[cardIndex];
        const nextImageConfig = createImageConfig({
          ...currentCard?.imageConfig,
          aspectRatio: ratio,
          cropScale: scale,
          cropPanX: panX,
          cropPanY: panY,
          scale: 1,
          panX: 50,
          panY: 50,
        });

        setHasCardEditsSinceGenerate(true);
        cardRefs.current[cardIndex]?.setImage(croppedImage);
        cardRefs.current[cardIndex]?.updateImageConfig(nextImageConfig);
        setCards((prev) => {
          const next = [...prev];
          const existing = next[cardIndex];
          if (!existing) return prev;
          next[cardIndex] = {
            ...existing,
            image: croppedImage,
            originalImage: imageSrc,
            imageConfig: nextImageConfig,
          };
          return next;
        });

        if (editingIndex === cardIndex) {
          setActiveHasImage(true);
          setActiveEditConfig(nextImageConfig);
        }
      } catch (error) {
        console.error("Crop confirm failed", error);
      } finally {
        setCropModalState(null);
      }
    },
    [cards, cropModalState, editingIndex],
  );

  const handleRemoveImage = () => {
    if (activeCardIndex === null) return;
    setHasCardEditsSinceGenerate(true);
    cardRefs.current[activeCardIndex]?.removeImage();
    setCards((prev) => {
      const next = [...prev];
      const existing = next[activeCardIndex];
      if (!existing) return prev;
      next[activeCardIndex] = {
        ...existing,
        image: undefined,
        originalImage: undefined,
        imageConfig: undefined,
      };
      return next;
    });
    if (editingIndex === activeCardIndex) {
      setActiveHasImage(false);
      setActiveEditConfig(null);
    }
  };

  useEffect(() => {
    if (
      !pendingOverflowNormalization ||
      !cards.length ||
      isProcessing ||
      editingIndex !== null
    ) {
      return;
    }

    overflowNormalizationFrameRef.current = requestAnimationFrame(() => {
      overflowNormalizationFrameRef.current = requestAnimationFrame(() => {
        overflowNormalizationFrameRef.current = null;

        if (
          overflowNormalizationPassRef.current >= OVERFLOW_NORMALIZATION.maxPasses
        ) {
          overflowNormalizationPassRef.current = 0;
          flowFillStableSetRef.current.clear();
          lastFlowFillMergeIndexRef.current = -1;
          setPendingOverflowNormalization(false);
          setOverflowNormalizationRevision(0);
          return;
        }

        // Phase 1: resolve any overflow (split)
        let sawUnresolvedOverflow = false;
        for (let index = 1; index < cards.length - 1; index += 1) {
          const handle = cardRefs.current[index];
          if (!handle?.isOverflowing()) continue;

          const splitResult = handle.resolveOverflow();
          if (!splitResult) {
            sawUnresolvedOverflow = true;
            continue;
          }

          // Only mark as stable when this split was caused by a Phase 2 merge
          // (merge-then-split cycle). Initial overflow splits should NOT block
          // Phase 2 from filling the card later.
          if (index === lastFlowFillMergeIndexRef.current) {
            flowFillStableSetRef.current.add(index);
          }
          lastFlowFillMergeIndexRef.current = -1;
          overflowNormalizationPassRef.current += 1;
          applyOverflowSplit(index, splitResult, { markEdited: false });
          return;
        }

        // Phase 2: flow-fill — find the first underfilled card and absorb the
        // next card into it.  After absorption the merged card will likely
        // overflow, which Phase 1 handles on the next pass — together they
        // implement a left-to-right reflow that fills every card to capacity.
        for (let index = 1; index < cards.length - 2; index += 1) {
          const handle = cardRefs.current[index];
          if (!handle) continue;

          const currentCard = cards[index];
          const nextCard = cards[index + 1];
          if (!canNormalizeAdjacentCards(currentCard, nextCard)) continue;

          const occupancy = handle.getBodyOccupancy();
          if (occupancy <= 0 || occupancy >= FLOW_FILL_THRESHOLD) continue;
          if (flowFillStableSetRef.current.has(index)) continue;
          lastFlowFillMergeIndexRef.current = index;
          overflowNormalizationPassRef.current += 1;
          applyUnderfillMerge(index);
          return;
        }

        if (sawUnresolvedOverflow) {
          overflowNormalizationPassRef.current += 1;
          setOverflowNormalizationRevision((prev) => prev + 1);
          return;
        }

        overflowNormalizationPassRef.current = 0;
        flowFillStableSetRef.current.clear();
        setPendingOverflowNormalization(false);
        setOverflowNormalizationRevision(0);
      });
    });

    return () => {
      if (overflowNormalizationFrameRef.current !== null) {
        cancelAnimationFrame(overflowNormalizationFrameRef.current);
        overflowNormalizationFrameRef.current = null;
      }
    };
  }, [
    applyOverflowSplit,
    applyUnderfillMerge,
    cards,
    editingIndex,
    isProcessing,
    pendingOverflowNormalization,
    overflowNormalizationRevision,
  ]);

  const handleDownload = useCallback(async (index: number) => {
    const handle = cardRefs.current[index];
    if (!handle || !handle.element) return;
    const el = handle.element;

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const width = el.offsetWidth;
      const height = el.offsetHeight;

      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 3,
        width: width,
        height: height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          zoom: "1",
          transform: "none",
          margin: "0",
          maxHeight: "none",
        },
        filter: (node) => {
          if (
            node.tagName === "LINK" &&
            (node as HTMLLinkElement).href.includes("lxgw-zhi-song-screen-web")
          ) {
            return false;
          }
          return true;
        },
        fetchRequestInit: {
          mode: "cors",
        },
      });
      const link = document.createElement("a");
      link.download = `card-${String(index + 1).padStart(2, "0")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Download failed", err);
    }
  }, []);

  const handleDownloadAll = useCallback(async () => {
    for (let i = 0; i < cards.length; i++) {
      await handleDownload(i);
      await new Promise((r) => setTimeout(r, 200));
    }
  }, [cards.length, handleDownload]);

  const hasContent = cards.length > 0;
  const isLayoutSettling = hasContent && pendingOverflowNormalization;

  const getCardStyle = (ratio: AspectRatio, scale: number) => {
    const ratioValue = ratio.replace(':', '/');
    const width = `${getCardWidth(ratio, scale)}px`;

    return {
      width,
      aspectRatio: ratioValue,
    };
  };

  const activeCardWidth = getCardWidth(config.aspectRatio, config.cardScale);
  const activeCardHeight = getCardHeight(config.aspectRatio, config.cardScale);
  const bottomDockSafeArea = isConsoleCollapsed
    ? CONSOLE_COLLAPSED_SAFE_AREA
    : consoleHeight + 48;
  const portraitAvailableStageHeight = Math.max(
    320,
    viewportSize.height - bottomDockSafeArea - PORTRAIT_STAGE_INSET_MIN * 2,
  );
  const portraitAvailableStageWidth = Math.max(
    320,
    viewportSize.width - 48,
  );
  const portraitFitZoom = Math.min(
    zoomLevel,
    portraitAvailableStageHeight / activeCardHeight,
    portraitAvailableStageWidth / activeCardWidth
  );
  const deckZoomLevel = portraitFitZoom;
  const portraitDeckInset = clamp(
    (viewportSize.height - bottomDockSafeArea - activeCardHeight * deckZoomLevel) / 2,
    PORTRAIT_STAGE_INSET_MIN,
    PORTRAIT_STAGE_INSET_MAX,
  );
  const capacityFeedback =
    pendingRegeneration && hasCardEditsSinceGenerate
      ? "Capacity changed. Re-generate to reflow text."
      : pendingRegeneration || processingReasonRef.current === "capacity"
        ? "Card capacity changed, regenerating..."
        : null;
  const consoleProps = {
    inputText,
    setInputText,
    config,
    setConfig,
    isProcessing,
    onProcess: handleProcess,
    onDownloadAll: handleDownloadAll,
    hasContent,
    zoomLevel,
    setZoomLevel,
    activeCardIndex,
    editingIndex,
    onToggleLayout: () =>
      activeCardIndex !== null && cardRefs.current[activeCardIndex]?.toggleLayout(),
    onStartEdit: () =>
      activeCardIndex !== null && handleStartEdit(activeCardIndex),
    onSaveEdit: () =>
      activeCardIndex !== null && handleSaveEdit(activeCardIndex),
    onCancelEdit: () =>
      activeCardIndex !== null && handleCancelEdit(activeCardIndex),
    onTriggerImage: () =>
      activeCardIndex !== null && triggerImageUpload(activeCardIndex),
    onTriggerAvatarUpload: triggerAvatarUpload,
    onDownload: () =>
      activeCardIndex !== null && handleDownload(activeCardIndex),
    onToggleHighlight: () =>
      activeCardIndex !== null && cardRefs.current[activeCardIndex]?.toggleHighlight(),
    activeHasImage,
    activeImageConfig: activeEditConfig,
    onUpdateImageConfig: handleUpdateImageConfig,
    onSelectFrameSize: handleSelectFrameSize,
    onRemoveImage: handleRemoveImage,
    capacityFeedback,
    isCollapsed: isConsoleCollapsed,
    onToggleCollapse: () => setIsConsoleCollapsed((prev) => !prev),
    onHeightChange: setConsoleHeight,
    onActiveTabChange: setActiveConsoleTab,
  };

  // --- Render ---
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#fafafa] font-sans text-[#18181b] flex flex-col">
      {/* Hidden File Input — background image */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg"
        className="hidden"
      />
      {/* Hidden File Input — avatar upload */}
      <input
        type="file"
        ref={avatarInputRef}
        onChange={handleAvatarFileChange}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
      />

      {/* Main Content Stage */}
      <div className={`flex-1 relative overflow-hidden transition-all duration-700 ${!hasContent ? 'bg-white' : 'bg-[#e4e4e7]/30'}`}>
        {/* Background Texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 mix-blend-multiply"
          style={{
            backgroundImage: `
                 linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                 linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
               `,
            backgroundSize: "20px 20px",
          }}
        ></div>

        {!hasContent ? (
          // --- HERO INPUT MODE ---
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-700">
            <div className="w-full max-w-5xl flex flex-col items-center gap-14">
              
              {/* Slogan */}
              <div className="text-center">
                <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-[#18181b] leading-[0.94] text-nowrap">
                  Quantity produces quality
                  <span className="text-[#ea580c]">.</span>
                </h1>
              </div>

              {/* Hero Input Area */}
              <div className="w-full max-w-3xl aspect-[4/3] relative group mx-auto">
                <div className="absolute inset-0 bg-white rounded-3xl shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06),0_12px_24px_-4px_rgba(15,23,42,0.08),0_24px_64px_-12px_rgba(15,23,42,0.12)] border border-black/[0.06] overflow-hidden flex flex-col transition-colors duration-300 focus-within:border-black/10">
                  
                  {/* Metadata & Content: 2-Column Grid Area */}
                  <div className="flex flex-col flex-1 min-h-0 px-8 pt-7 pb-6">
                    {/* Header Row 1: Title */}
                    <div className="flex items-center mb-1 shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-black/90 shrink-0 select-none w-24">Title</span>
                      <input
                        type="text"
                        value={config.title}
                        onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full h-10 bg-transparent text-xl font-bold outline-none text-black/90 placeholder:text-black/20 tracking-[0.01em] font-oppo"
                      />
                    </div>
                    {/* Header Row 2: Author */}
                    <div className="flex items-center mb-3 shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-black/90 shrink-0 select-none w-24">Author</span>
                      <input
                        type="text"
                        value={config.authorName}
                        onChange={(e) => setConfig(prev => ({ ...prev, authorName: e.target.value }))}
                        className="w-full h-8 bg-transparent text-base font-medium outline-none text-black/60 placeholder:text-black/20 tracking-[0.01em] font-oppo"
                      />
                    </div>
                    {/* Body Content Row */}
                    <div className="flex flex-1 min-h-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-black/90 shrink-0 select-none w-24 pt-[8px]">Content</span>
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Paste your article or notes here..."
                        className="w-full h-full flex-1 text-lg text-black/90 placeholder:text-black/20 outline-none resize-none bg-transparent leading-[1.8] font-oppo tracking-wide selection:bg-orange-100 pr-4 -mr-4 custom-scrollbar"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                  
                  {/* Full-width Structural Action Bar */}
                  <button
                     onClick={handleProcess}
                     disabled={!inputText.trim() || isProcessing}
                     className={`
                       w-full h-12 shrink-0 flex items-center justify-end px-8 gap-3 transition-colors duration-300 border-t outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ea580c]
                       ${isProcessing
                         ? "border-[#ea580c]/20 bg-[#ea580c]/[0.04] text-[#ea580c] cursor-wait"
                         : !inputText.trim()
                           ? "border-black/[0.06] bg-black/[0.02] text-black/25 cursor-not-allowed"
                           : "border-black/[0.08] bg-white text-black/80 hover:bg-[#ea580c] hover:border-[#ea580c] hover:text-white active:bg-[#c24100]"
                       }
                     `}
                  >
                     <span className="text-xs font-bold uppercase tracking-[0.2em] relative top-[0.5px]">
                       {isProcessing ? "Processing" : "Generate Cards"}
                     </span>
                     {isProcessing ? (
                       <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                     ) : (
                       <ArrowRight size={16} strokeWidth={2.5} />
                     )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        ) : (
          // --- RESULT DECK MODE ---
          <>
            <div 
                 ref={scrollContainerRef}
                 className={`absolute inset-0 flex items-center overflow-x-auto snap-x snap-mandatory px-[50vw] custom-scrollbar animate-in fade-in duration-1000 transition-opacity duration-300 ${isLayoutSettling ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                 style={{ 
                   paddingLeft: `calc(50vw - ${activeCardWidth / 2}px)`, 
                   paddingRight: `calc(50vw - ${activeCardWidth / 2}px)`,
                   paddingTop: hasContent ? portraitDeckInset : 0,
                   paddingBottom: hasContent ? bottomDockSafeArea : 0,
                   transition: 'opacity 220ms ease',
                   touchAction: "pan-y pinch-zoom",
                   overscrollBehaviorX: "contain",
                 }}
              >
                 <div className="flex items-center gap-12 min-h-full">
                    {cards.map((segment, idx) => (
                      <div
                        key={idx}
                        className={`card-wrapper flex-shrink-0 snap-center transform-gpu transition-[transform,opacity] ${getCardWrapperStateClass(
                          activeCardIndex === idx,
                          activeConsoleTab,
                          editingIndex === idx,
                        )}`}
                        style={{
                          willChange: "transform, opacity",
                          transformOrigin: "center center",
                          backfaceVisibility: "hidden",
                          transitionDuration: `${PANEL_CARD_MOTION.duration}ms`,
                          transitionTimingFunction: PANEL_CARD_MOTION.easing,
                        }}
                      >
                        <div
                            className={`relative rounded-2xl bg-white mx-auto overflow-hidden ring-1 ring-black/5 transform-gpu transition-[transform,box-shadow] ${getCardSurfaceStateClass(
                              activeCardIndex === idx,
                              activeConsoleTab,
                              editingIndex === idx,
                            )} ${isScrolling && editingIndex !== idx ? 'pointer-events-none' : ''}`}
                            style={{
                              ...getCardStyle(config.aspectRatio, config.cardScale),
                              // @ts-ignore
                              zoom: deckZoomLevel,
                              transformOrigin: "center center",
                              willChange: "transform, box-shadow",
                              backfaceVisibility: "hidden",
                              transitionDuration: `${PANEL_CARD_MOTION.duration}ms`,
                              transitionTimingFunction: PANEL_CARD_MOTION.easing,
                            }}
                          >
                          <Card
                            ref={(handle) => {
                              cardRefs.current[idx] = handle;
                            }}
                            content={segment.content}
                            sectionTitle={segment.title}
                            layout={segment.layout}
                            image={segment.image}
                            imageConfig={segment.imageConfig}
                            editorialBrandLabel={segment.editorialBrandLabel}
                            editorialBadgeText={segment.editorialBadgeText}
                            index={idx}
                            total={cards.length}
                            config={config}
                            onUpdate={(updated) => handleUpdateCard(idx, updated)}
                            onSplit={(splitSegment) =>
                              handleSplitCard(idx, splitSegment)
                            }
                            onEditChange={(hasImage, cfg) =>
                              handleEditStateChange(idx, hasImage, cfg)
                            }
                            onAvatarUpload={triggerAvatarUpload}
                            showOverflowControl={
                              hasCardEditsSinceGenerate && !pendingOverflowNormalization
                            }
                          />
                        </div>
                      </div>
                    ))}
                 </div>
              </div>

            {isLayoutSettling && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#fafafa]/78 backdrop-blur-[2px]">
                <div className="h-10 w-10 rounded-full border-2 border-black/10 border-t-[#ea580c] animate-spin" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/40">
                  Paginating
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Console (Bottom Panel) - Only visible when content exists */}
      {hasContent && (
        <div className="animate-in slide-in-from-bottom-full duration-700 ease-out">
          <Console {...consoleProps} />
        </div>
      )}

      {cropModalState && (
        <ImageCropModal
          imageSrc={cropModalState.imageSrc}
          ratio={cropModalState.ratio}
          initialScale={cropModalState.initialScale}
          initialPanX={cropModalState.initialPanX}
          initialPanY={cropModalState.initialPanY}
          onCancel={() => setCropModalState(null)}
          onConfirm={handleConfirmCrop}
        />
      )}
    </div>
  );
};

export default App;
