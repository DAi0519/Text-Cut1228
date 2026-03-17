import React, { useState, useRef, useCallback, useEffect } from "react";
import { Console } from "./components/Console";
import { Card, CardHandle, OverflowSplitResult } from "./components/Card";
import {
  CardConfig,
  AspectRatio,
  CardSegment,
  FontStyle,
  ImageConfig,
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
const CONFIG_VERSION = 3;
const CARD_BASE_WIDTHS: Record<AspectRatio, number> = {
  [AspectRatio.PORTRAIT]: 380,
  [AspectRatio.SQUARE]: 480,
  [AspectRatio.WIDE]: 600,
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

const getCapacitySignature = (
  config: Pick<CardConfig, "cardScale" | "aspectRatio" | "fontSize">,
) => `${config.cardScale}|${config.aspectRatio}|${config.fontSize}`;

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

  if (raw.fontSize == null || raw.fontSize === 1.0) {
    next.fontSize = defaults.fontSize;
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [consoleHeight, setConsoleHeight] = useState(0);
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

  const [config, setConfig] = useState<CardConfig>(() => {
    const defaultConfig = {
      colorway: "snow",
      backgroundColor: "#f4f4f5",
      textColor: "#18181b",
      accentColor: "#ea580c",
      fontStyle: FontStyle.SWEI,
      composition: "classic",
      aspectRatio: AspectRatio.PORTRAIT,
      fontSize: 1.05,
      cardScale: 1.35,
      editorialTitleScale: 1.0,
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

    const getMaxScrollLeft = () =>
      Math.max(0, container.scrollWidth - container.clientWidth);

    const setSnapEnabled = (enabled: boolean) => {
      container.style.scrollSnapType = enabled ? "x mandatory" : "none";
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

    const animateScrollTo = (targetLeft: number, releaseVelocity = 0) => {
      cancelWheelMomentum();
      cancelLandingAnimation();

      const startLeft = container.scrollLeft;
      const maxScrollLeft = getMaxScrollLeft();
      const clampedTarget = clamp(targetLeft, 0, maxScrollLeft);
      const distance = clampedTarget - startLeft;

      if (Math.abs(distance) < 0.5) {
        container.scrollLeft = clampedTarget;
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
        container.scrollLeft = startLeft + distance * eased;

        if (progress < 1) {
          landingAnimationFrameRef.current = requestAnimationFrame(step);
          return;
        }

        container.scrollLeft = clampedTarget;
        setSnapEnabled(true);
        landingAnimationFrameRef.current = null;
      };

      landingAnimationFrameRef.current = requestAnimationFrame(step);
    };

    const getClosestSnapLeft = (projectedCenter: number) => {
      let minDistance = Infinity;
      let closestLeft = container.scrollLeft;
      const cardElements = container.querySelectorAll(".card-wrapper");

      cardElements.forEach((el) => {
        const element = el as HTMLElement;
        const rectCenter = element.offsetLeft + element.offsetWidth / 2;
        const distance = Math.abs(projectedCenter - rectCenter);

        if (distance < minDistance) {
          minDistance = distance;
          closestLeft =
            element.offsetLeft -
            container.clientWidth / 2 +
            element.offsetWidth / 2;
        }
      });

      return clamp(closestLeft, 0, getMaxScrollLeft());
    };

    const measureActiveCard = () => {
      scrollMeasureFrameRef.current = null;
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      
      const center = container.scrollLeft + container.clientWidth / 2;
      let minDistance = Infinity;
      let closestIndex = 0;

      // Find card closest to center
      const cardElements = container.querySelectorAll('.card-wrapper');
      cardElements.forEach((el, idx) => {
        const rect = (el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth / 2;
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

      const useHorizontalIntent =
        Math.abs(e.deltaX) >=
        Math.abs(e.deltaY) * WHEEL_INTERACTION.horizontalBiasRatio;
      const rawDelta = useHorizontalIntent ? e.deltaX : e.deltaY;

      if (rawDelta === 0) return;

      e.preventDefault();
      cancelLandingAnimation();
      setSnapEnabled(false);

      const deltaMultiplier =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_INTERACTION.lineStep
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientWidth * WHEEL_INTERACTION.pageFactor
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
          container.scrollLeft = clamp(
            container.scrollLeft + wheelVelocityRef.current * frameRatio,
            0,
            getMaxScrollLeft(),
          );

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
          container.scrollLeft +
          container.clientWidth / 2 +
          wheelVelocityRef.current * WHEEL_INTERACTION.snapProjection;
        const targetLeft = getClosestSnapLeft(projectedCenter);
        animateScrollTo(targetLeft, wheelVelocityRef.current / 16);
      }, WHEEL_INTERACTION.snapDelay);
    };

    const handlePointerDown = (e: PointerEvent) => {
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
      lastX.current = e.clientX;
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
      
      const currentX = e.clientX;
      const currentTime = performance.now();
      
      const deltaX = currentX - lastX.current;
      const dt = currentTime - lastTime.current || 16;
      
      // Instant exact 1:1 scroll without anchor rubberbanding
      container.scrollLeft -= deltaX;

      // Blend pointer samples so the release velocity feels stable, not twitchy.
      const sampleVelocity = deltaX / dt;
      velocity.current =
        velocity.current * (1 - DRAG_INTERACTION.velocitySampleWeight) +
        sampleVelocity * DRAG_INTERACTION.velocitySampleWeight;
      
      dragDistance.current += Math.abs(deltaX);
      lastX.current = currentX;
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
        container.scrollLeft + container.clientWidth / 2 - projection;
      const closestLeft = getClosestSnapLeft(predictedCenter);

      animateScrollTo(closestLeft, velocity.current);
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
      newCards[index] = updatedSegment;
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
      setActiveEditConfig(config);
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
        setHasCardEditsSinceGenerate(true);
        // Keep editing-state preview in sync immediately.
        cardRefs.current[targetIdx]?.setImage(result);
        setCards((prev) => {
          const newCards = [...prev];
          newCards[targetIdx] = {
            ...newCards[targetIdx],
            image: result,
          };
          return newCards;
        });
        if (editingIndex === targetIdx) {
          setActiveHasImage(true);
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
        imageConfig: {
          ...(existing.imageConfig ?? {}),
          ...updates,
        } as ImageConfig,
      };
      return next;
    });
  };

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
  const capacityFeedback =
    pendingRegeneration && hasCardEditsSinceGenerate
      ? "Capacity changed. Re-generate to reflow text."
      : pendingRegeneration || processingReasonRef.current === "capacity"
        ? "Card capacity changed, regenerating..."
        : null;

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
              <div className="w-full max-w-4xl relative group">
                <div className="relative bg-white rounded-3xl shadow-[0_18px_44px_-24px_rgba(15,23,42,0.14)] border border-black/[0.06] overflow-hidden flex flex-col transition-all duration-300 focus-within:shadow-[0_24px_56px_-26px_rgba(15,23,42,0.18)] focus-within:border-black/10 focus-within:translate-y-[-2px]">
                  
                  {/* Metadata Inputs */}
                  <div className="flex border-b border-black/[0.06] bg-white">
                    <div className="flex-1 border-r border-black/5 flex items-center px-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 shrink-0 select-none w-12">Title</span>
                      <input
                        type="text"
                        value={config.title}
                        onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                        className={`w-full h-12 bg-transparent text-base font-semibold outline-none text-black/80 placeholder:text-black/20 tracking-[0.01em] px-2 ${getPreviewFontClass(config.fontStyle)}`}
                      />
                    </div>
                    <div className="w-1/3 flex items-center px-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 shrink-0 select-none w-14">Author</span>
                      <input
                        type="text"
                        value={config.authorName}
                        onChange={(e) => setConfig(prev => ({ ...prev, authorName: e.target.value }))}
                        className={`w-full h-12 bg-transparent text-sm font-medium outline-none text-black/80 placeholder:text-black/20 tracking-[0.01em] px-2 ${getPreviewFontClass(config.fontStyle)}`}
                      />
                    </div>
                  </div>

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your article or notes here..."
                    className="w-full h-52 px-8 py-7 text-xl text-black/90 placeholder:text-black/20 outline-none resize-none bg-transparent leading-relaxed font-serif tracking-wide selection:bg-orange-100"
                    spellCheck={false}
                  />
                  
                  {/* Action Bar */}
                  <div className="flex justify-end border-t border-black/[0.06] bg-white px-6 py-4">
                     <button
                        onClick={handleProcess}
                        disabled={!inputText.trim() || isProcessing}
                        className={`
                          h-12 rounded-2xl px-5 flex items-center justify-center gap-3 transition-all duration-300
                          ${!inputText.trim() || isProcessing
                            ? "bg-black/[0.03] text-black/25 cursor-not-allowed"
                            : "bg-black text-white hover:bg-[#ea580c] active:scale-[0.98]"
                          }
                        `}
                     >
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
                          {isProcessing ? "Processing" : "Generate Cards"}
                        </span>
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                        ) : (
                          <ArrowRight size={18} strokeWidth={2.5} />
                        )}
                     </button>
                  </div>
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
                 paddingBottom: hasContent ? consoleHeight + 40 : 0,
                 transition: 'padding-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease',
                 touchAction: "pan-y pinch-zoom",
                 overscrollBehaviorX: "contain",
               }}
            >
               <div className="flex items-center gap-12 py-20">
                  {cards.map((segment, idx) => (
                    <div
                      key={idx}
                      className={`card-wrapper flex-shrink-0 snap-center transition-[transform,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        activeCardIndex === idx 
                          ? 'scale-100 opacity-100 z-10 filter-none' 
                          : 'scale-[0.94] opacity-50 z-0 blur-[0.5px] hover:opacity-70 cursor-pointer'
                      }`}
                    >
                      <div
                        className={`relative rounded-2xl shadow-xl bg-white mx-auto overflow-hidden ring-1 ring-black/5 transition-transform duration-300 will-change-transform ${isScrolling && editingIndex !== idx ? 'pointer-events-none' : ''}`}
                        style={{
                          ...getCardStyle(config.aspectRatio, config.cardScale),
                          // @ts-ignore
                          zoom: zoomLevel,
                          transformOrigin: "center center",
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
          <Console
            inputText={inputText}
            setInputText={setInputText}
            config={config}
            setConfig={setConfig}
            isProcessing={isProcessing}
            onProcess={handleProcess}
            onDownloadAll={handleDownloadAll}
            hasContent={hasContent}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            
            activeCardIndex={activeCardIndex}
            editingIndex={editingIndex}
            
            onToggleLayout={() => activeCardIndex !== null && cardRefs.current[activeCardIndex]?.toggleLayout()}
            onStartEdit={() => activeCardIndex !== null && handleStartEdit(activeCardIndex)}
            onSaveEdit={() => activeCardIndex !== null && handleSaveEdit(activeCardIndex)}
            onCancelEdit={() => activeCardIndex !== null && handleCancelEdit(activeCardIndex)}
            onTriggerImage={() => activeCardIndex !== null && triggerImageUpload(activeCardIndex)}
            onTriggerAvatarUpload={triggerAvatarUpload}
            onDownload={() => activeCardIndex !== null && handleDownload(activeCardIndex)}
            onToggleHighlight={() => activeCardIndex !== null && cardRefs.current[activeCardIndex]?.toggleHighlight()}
            
            activeHasImage={activeHasImage}
            activeImageConfig={activeEditConfig}
            onUpdateImageConfig={handleUpdateImageConfig}
            onRemoveImage={handleRemoveImage}
            capacityFeedback={capacityFeedback}
            onHeightChange={setConsoleHeight}
          />
        </div>
      )}
    </div>
  );
};

export default App;
