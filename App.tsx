import React, { useState, useRef, useCallback, useEffect } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { Toolbar } from "./components/Toolbar";
import { Card, CardHandle } from "./components/Card";
import {
  CardConfig,
  AspectRatio,
  CardSegment,
  FontStyle,
  ImageConfig,
} from "./types";
import { splitTextIntoCards } from "./services/geminiService";
import {
  Download,
  Plus,
  Minus,
  Settings2,
  Play,
  ArrowDownToLine,
  X,
  Pencil,
  LayoutTemplate,
  Check,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  ScanLine,
  ZoomIn,
  Scaling,
  Trash2,
} from "lucide-react";
import { toPng } from "html-to-image";

const VALID_COMPOSITIONS = new Set(["classic", "technical"]);
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
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Open by default for first visit
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);

  // Handle outside click to clear active card
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // If clicking inside a toolbar or card, don't clear
      if ((e.target as HTMLElement).closest('.card-container') || (e.target as HTMLElement).closest('.toolbar-container')) {
        return;
      }
      setActiveCardIndex(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      fontSize: 1.0,
      showMetadata: true,
      title: "",
      authorName: "",
    } as CardConfig;

    try {
      const saved = localStorage.getItem("textcuts_config");
      if (saved) {
        return normalizeConfig(JSON.parse(saved), defaultConfig);
      }
      return defaultConfig;
    } catch {
      return defaultConfig;
    }
  });

  // --- Image Upload Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeCardIndexForUpload = useRef<number | null>(null);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem("textcuts_input", inputText);
  }, [inputText]);
  useEffect(() => {
    localStorage.setItem("textcuts_config", JSON.stringify(config));
  }, [config]);



  const cardRefs = useRef<(CardHandle | null)[]>([]);

  // --- Handlers ---
  const handleProcess = async () => {
    if (!inputText) return;
    setIsProcessing(true);
    setIsPanelOpen(false);
    setEditingIndex(null);

    try {
      const segments = await splitTextIntoCards(inputText);
      setCards(segments);
    } catch (error) {
      alert("Failed to process text.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateCard = (index: number, updatedSegment: CardSegment) => {
    setCards((prev) => {
      const newCards = [...prev];
      newCards[index] = updatedSegment;
      return newCards;
    });
  };

  const handleSplitCard = (index: number, contentToMove: string) => {
    setCards((prev) => {
      const newCards = [...prev];
      newCards.splice(index + 1, 0, {
        title: "",
        content: contentToMove,
        layout: "standard",
      });
      return newCards;
    });
  };

  const handleStartEdit = (index: number) => {
    if (editingIndex !== null && editingIndex !== index) {
      cardRefs.current[editingIndex]?.save();
    }
    setEditingIndex(index);
    setActiveCardIndex(index); // Ensure toolbar stays visible
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

  // --- External Toolbar Handlers ---
  const cyclePosition = () => {
    if (editingIndex === null || !activeEditConfig) return;
    const order: ImageConfig["position"][] = ["top", "bottom", "left", "right"];
    const currentIdx = order.indexOf(activeEditConfig.position);
    const nextPos = order[(currentIdx + 1) % order.length];
    cardRefs.current[editingIndex]?.updateImageConfig({ position: nextPos });
  };

  const cycleAspectRatio = () => {
    if (editingIndex === null || !activeEditConfig) return;
    const order: (ImageConfig["aspectRatio"] | undefined)[] = [
      undefined,
      "1:1",
      "4:3",
      "16:9",
      "3:4",
    ];
    const currentIdx = order.indexOf(activeEditConfig.aspectRatio);
    cardRefs.current[editingIndex]?.updateImageConfig({
      aspectRatio: order[(currentIdx + 1) % order.length],
    });
  };

  const updateScale = (val: number) => {
    if (editingIndex !== null)
      cardRefs.current[editingIndex]?.updateImageConfig({ scale: val });
  };

  const updateHeightRatio = (val: number) => {
    if (editingIndex !== null)
      cardRefs.current[editingIndex]?.updateImageConfig({
        heightRatio: val,
        aspectRatio: undefined,
      });
  };

  const removeImage = () => {
    if (editingIndex !== null) cardRefs.current[editingIndex]?.removeImage();
  };

  // --- Icons helper ---
  const getPositionIcon = (pos: string) => {
    switch (pos) {
      case "top":
        return <ArrowUp size={14} />;
      case "bottom":
        return <ArrowDown size={14} />;
      case "left":
        return <ArrowLeft size={14} />;
      case "right":
        return <ArrowRight size={14} />;
      default:
        return <ArrowUp size={14} />;
    }
  };

  const getRatioIcon = (ratio?: string) => {
    switch (ratio) {
      case "1:1":
        return <Square size={14} />;
      case "4:3":
      case "16:9":
        return <RectangleHorizontal size={14} />;
      case "3:4":
        return <RectangleVertical size={14} />;
      default:
        return <ScanLine size={14} />;
    }
  };

  const triggerImageUpload = (index: number) => {
    activeCardIndexForUpload.current = index;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeCardIndexForUpload.current !== null) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setCards((prev) => {
          const newCards = [...prev];
          const idx = activeCardIndexForUpload.current!;
          newCards[idx] = {
            ...newCards[idx],
            image: result,
          };
          return newCards;
        });
        activeCardIndexForUpload.current = null;
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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

  const getCardStyle = (ratio: AspectRatio) => {
    const ratioValue = ratio.replace(':', '/');
    let maxWidth;
    
    switch (ratio) {
      case AspectRatio.WIDE:
        maxWidth = "800px";
        break;
      case AspectRatio.SQUARE:
        maxWidth = "520px";
        break;
      case AspectRatio.PORTRAIT:
      default:
        maxWidth = "380px";
        break;
    }

    return {
      width: "100%",
      maxWidth,
      aspectRatio: ratioValue,
    };
  };

  // --- Render ---
  return (
    <div className="relative h-screen w-full overflow-hidden bg-white font-sans text-[#18181b]">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg"
        className="hidden"
      />

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
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.03)_100%)]"></div>

      {/* Main Content Stage */}
      <main className="absolute inset-0 flex flex-col items-center">
        <div className="w-full h-full overflow-y-auto custom-scrollbar scroll-smooth">
          <div className="flex flex-col items-center py-20 px-4 min-h-full">
            {!hasContent ? (
              <div
                className="flex-1 flex flex-col items-center justify-start select-none transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{
                  paddingTop: isPanelOpen ? "clamp(32px, 12vh, 140px)" : "42vh",
                  paddingBottom: isPanelOpen ? "0px" : "0px",
                }}
              >
                <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-1000">
                  <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-[#18181b] text-center max-w-4xl leading-none">
                    Quantity produces quality
                    <span className="text-[#ea580c]">.</span>
                  </h1>
                  <p className="mt-6 text-black/40 text-sm font-medium uppercase tracking-widest animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
                    Open settings to begin
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-20 pb-48 animate-in fade-in duration-700 w-full items-center">
                {cards.map((segment, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center group relative w-full max-w-full px-4 md:px-0"
                  >
                    {/* Card Container */}
                    <div
                      className={`card-container transition-all duration-500 ease-out rounded-2xl shadow-sm bg-white mx-auto cursor-pointer ${activeCardIndex === idx ? 'ring-2 ring-black/5 shadow-lg' : ''}`}
                      onClick={(e) => {
                          e.stopPropagation();
                          setActiveCardIndex(idx);
                      }}
                      style={{
                        ...getCardStyle(config.aspectRatio),
                        // @ts-ignore
                        zoom: zoomLevel,
                        transformOrigin: "center top",
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
                        index={idx}
                        total={cards.length}
                        config={config}
                        onUpdate={(updated) => handleUpdateCard(idx, updated)}
                        onSplit={(contentToMove) =>
                          handleSplitCard(idx, contentToMove)
                        }
                        onEditChange={(hasImage, cfg) =>
                          handleEditStateChange(idx, hasImage, cfg)
                        }
                      />
                    </div>
                    {/* Card Actions */}
                    <div className={`toolbar-container mt-8 transition-all duration-300 translate-y-2 w-full flex justify-center z-50 ${activeCardIndex === idx ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none'}`}>
                      <Toolbar
                        mode={editingIndex === idx ? 'edit' : 'view'}
                        onToggleLayout={() => cardRefs.current[idx]?.toggleLayout()}
                        onStartEdit={() => handleStartEdit(idx)}
                        onTriggerImage={() => triggerImageUpload(idx)}
                        onDownload={() => handleDownload(idx)}
                        onCancelEdit={() => handleCancelEdit(idx)}
                        onSaveEdit={() => handleSaveEdit(idx)}
                        onToggleHighlight={() => cardRefs.current[idx]?.toggleHighlight()}
                        hasImage={activeHasImage}
                        imageConfig={activeEditConfig}
                        onUpdateImageConfig={(updates) => cardRefs.current[idx]?.updateImageConfig(updates)}
                        onRemoveImage={removeImage}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Protective Gradient Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent z-[60] pointer-events-auto" />

      {/* --- FLOATING CONTROL DECK --- */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center z-[100]">
        <div className="relative">
          <ControlPanel
            inputText={inputText}
            setInputText={setInputText}
            config={config}
            setConfig={setConfig}
            isVisible={isPanelOpen}
          />

          {/* Main Controller Bar */}
          <div
            className="
            flex items-center gap-2 p-2 pl-3
            bg-white border border-black/10 rounded-full 
            shadow-[0_10px_30px_rgba(0,0,0,0.08)]
            backdrop-blur-xl
            transition-transform duration-300 hover:scale-[1.005]
          "
          >
            <div className="flex items-center gap-1 px-2 border-r border-black/5 mr-1">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.05))}
                className="p-2 text-black/40 hover:text-black transition-colors rounded-full hover:bg-black/5"
              >
                <Minus size={14} />
              </button>
              <div className="w-8 text-center font-mono text-[10px] text-black/60 select-none">
                {(zoomLevel * 100).toFixed(0)}%
              </div>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.05))}
                className="p-2 text-black/40 hover:text-black transition-colors rounded-full hover:bg-black/5"
              >
                <Plus size={14} />
              </button>
            </div>

            <button
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              className={`
                 h-10 px-6 rounded-full flex items-center gap-2 transition-all duration-300
                 text-[10px] font-bold uppercase tracking-[0.15em]
                 ${
                   isPanelOpen
                     ? "bg-black text-white shadow-lg"
                     : "bg-transparent text-black/60 hover:bg-black/5"
                 }
               `}
            >
              {isPanelOpen ? <X size={14} /> : <Settings2 size={14} />}
              <span className="hidden sm:inline">
                {isPanelOpen ? "Close Panel" : "Settings"}
              </span>
            </button>

            <div className="pl-2 flex items-center gap-2">
              {hasContent && (
                <button
                  onClick={handleDownloadAll}
                  className="p-3 rounded-full text-black/60 hover:text-black hover:bg-black/5 transition-colors"
                  title="Export All"
                >
                  <Download size={16} strokeWidth={2} />
                </button>
              )}

              <button
                onClick={handleProcess}
                disabled={!inputText.trim() || isProcessing}
                className={`
                    h-10 px-6 rounded-full flex items-center gap-2 transition-all duration-200
                    text-[10px] font-bold uppercase tracking-[0.15em] shadow-lg
                    ${
                      !inputText.trim()
                        ? "bg-[#e4e4e7] text-black/20 cursor-not-allowed shadow-none"
                        : "bg-[#ea580c] hover:bg-[#c2410c] text-white hover:shadow-orange-500/20 active:translate-y-0.5"
                    }
                  `}
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Play size={12} fill="currentColor" />
                )}
                <span>{hasContent ? "Rerun" : "Generate"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
