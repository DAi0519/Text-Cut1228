/**
 * [INPUT]: 依赖 ../types 的 ImageAspectRatio，依赖 lucide-react 的 X 图标
 * [OUTPUT]: 对外提供 ImageCropModal 组件；回调输出 { scale, panX, panY } 写入 ImageConfig
 * [POS]: components/ 的按需弹出 Modal；由 App.tsx 在用户触发图片编辑时挂载，
 *        裁剪结果通过 onConfirm 回调传递给 Card.updateImageConfig()
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImageAspectRatio } from "../types";
import { X } from "lucide-react";

interface ImageCropModalProps {
  imageSrc: string;
  ratio: ImageAspectRatio;
  initialScale: number;
  initialPanX: number;
  initialPanY: number;
  onCancel: () => void;
  onConfirm: (result: {
    scale: number;
    panX: number;
    panY: number;
  }) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseRatio = (ratio: ImageAspectRatio) => {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
};

const getCoverBaseSize = (imageRatio: number, targetRatio: number) => {
  if (imageRatio > targetRatio) {
    return { width: imageRatio, height: 1 };
  }

  return { width: targetRatio, height: targetRatio / imageRatio };
};

const getPanBounds = (
  imageRatio: number,
  targetRatio: number,
  scale: number,
) => {
  const baseSize = getCoverBaseSize(imageRatio, targetRatio);
  const scaledWidth = baseSize.width * scale;
  const scaledHeight = baseSize.height * scale;
  const maxDeltaX = Math.max(
    0,
    ((scaledWidth - targetRatio) / (2 * scaledWidth)) * 100,
  );
  const maxDeltaY = Math.max(
    0,
    ((scaledHeight - 1) / (2 * scaledHeight)) * 100,
  );

  return {
    minPanX: 50 - maxDeltaX,
    maxPanX: 50 + maxDeltaX,
    minPanY: 50 - maxDeltaY,
    maxPanY: 50 + maxDeltaY,
  };
};

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  imageSrc,
  ratio,
  initialScale,
  initialPanX,
  initialPanY,
  onCancel,
  onConfirm,
}) => {
  const [scale, setScale] = useState(initialScale);
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const targetRatio = useMemo(() => parseRatio(ratio), [ratio]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  useEffect(() => {
    if (!naturalRatio) return;
    const bounds = getPanBounds(naturalRatio, targetRatio, scale);
    setPanX((prev) => clamp(prev, bounds.minPanX, bounds.maxPanX));
    setPanY((prev) => clamp(prev, bounds.minPanY, bounds.maxPanY));
  }, [naturalRatio, scale, targetRatio]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateSize = () => {
      const nextWidth = stage.clientWidth;
      const nextHeight = stage.clientHeight;
      setStageSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const cropViewportSize = useMemo(() => {
    const stageWidth = stageSize.width;
    const stageHeight = stageSize.height;
    const fallbackMax = 420;

    if (!stageWidth || !stageHeight) {
      if (targetRatio >= 1) {
        return {
          width: fallbackMax,
          height: fallbackMax / targetRatio,
        };
      }
      return {
        width: fallbackMax * targetRatio,
        height: fallbackMax,
      };
    }

    const padding = 24;
    const availableWidth = Math.max(1, stageWidth - padding * 2);
    const availableHeight = Math.max(1, stageHeight - padding * 2);

    if (availableWidth / availableHeight > targetRatio) {
      return {
        width: availableHeight * targetRatio,
        height: availableHeight,
      };
    }

    return {
      width: availableWidth,
      height: availableWidth / targetRatio,
    };
  }, [stageSize.height, stageSize.width, targetRatio]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!naturalRatio || !imageRef.current) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPanX = panX;
    const startPanY = panY;

    const imageRect = imageRef.current.getBoundingClientRect();
    const bounds = getPanBounds(naturalRatio, targetRatio, scale);

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextPanX = startPanX + (deltaX / imageRect.width) * 100;
      const nextPanY = startPanY + (deltaY / imageRect.height) * 100;

      setPanX(clamp(nextPanX, bounds.minPanX, bounds.maxPanX));
      setPanY(clamp(nextPanY, bounds.minPanY, bounds.maxPanY));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleReset = () => {
    setScale(1);
    setPanX(50);
    setPanY(50);
  };

  const baseImageStyle: React.CSSProperties =
    naturalRatio == null
      ? { width: "100%", height: "100%", objectFit: "cover" }
      : naturalRatio > targetRatio
        ? { width: "auto", height: "100%" }
        : { width: "100%", height: "auto" };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] px-6 py-10">
      <div className="w-full max-w-5xl rounded-[28px] border border-black/5 bg-[#fafaf8] shadow-2xl overflow-hidden ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
          <div className="text-sm font-semibold text-black/80">Crop Image</div>
          <button
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 transition-colors hover:bg-black/5 hover:text-black"
            aria-label="Close crop dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,1fr)_240px]">
          <div
            ref={stageRef}
            className="relative mx-auto w-full max-w-[620px] overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,rgba(74,103,181,0.12),rgba(245,163,183,0.1)),#ece7e1] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
            style={{ height: "min(64vh, 560px)" }}
          >
            <div
              className="absolute left-1/2 top-1/2 cursor-move overflow-hidden rounded-[16px] bg-white shadow-[0_14px_30px_rgba(0,0,0,0.14),inset_0_0_0_1px_rgba(0,0,0,0.12)]"
              style={{
                width: `${cropViewportSize.width}px`,
                height: `${cropViewportSize.height}px`,
                transform: "translate(-50%, -50%)",
              }}
              onMouseDown={handleMouseDown}
            >
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop preview"
                className="absolute left-1/2 top-1/2 block max-w-none select-none pointer-events-none"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setNaturalRatio(image.naturalWidth / image.naturalHeight);
                  }
                }}
                style={{
                  ...baseImageStyle,
                  transform: `translate(calc(-50% + ${panX - 50}%), calc(-50% + ${panY - 50}%)) scale(${scale})`,
                  transformOrigin: "center center",
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.34)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.34)_1px,transparent_1px)] [background-size:33.333%_33.333%]" />
            </div>
          </div>

          <div className="flex flex-col gap-6 pt-1">
            <div className="flex items-end justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-black/35">
                Frame Size
              </div>
              <div className="text-[32px] font-semibold leading-none text-black/90">
                {ratio}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">
                <span>Crop Zoom</span>
                <span className="font-mono text-black/45">{scale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={scale}
                onChange={(event) => setScale(parseFloat(event.target.value))}
                className="w-full h-1.5 bg-black/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
              />
            </div>

            <div className="mt-auto flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleReset}
                  className="h-10 rounded-xl bg-black/[0.04] text-[11px] font-bold uppercase tracking-[0.16em] text-black/55 transition-colors hover:bg-black/[0.06] hover:text-black"
                >
                  Reset
                </button>
                <button
                  onClick={onCancel}
                  className="h-10 rounded-xl border border-black/10 text-[11px] font-bold uppercase tracking-[0.16em] text-black/55 transition-colors hover:border-black/20 hover:text-black"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={() => onConfirm({ scale, panX, panY })}
                className="h-11 rounded-xl bg-black text-[11px] font-bold uppercase tracking-[0.18em] text-white transition-transform hover:scale-[0.99]"
              >
                Confirm Crop
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
