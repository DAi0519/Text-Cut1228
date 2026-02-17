import React, { useState, useRef, useCallback, useEffect } from "react";
import { Console } from "./components/Console";
import { Card, CardHandle } from "./components/Card";
import {
  CardConfig,
  AspectRatio,
  CardSegment,
  FontStyle,
  ImageConfig,
} from "./types";
import { splitTextIntoCards } from "./services/geminiService";
import { toPng } from "html-to-image";
import { Sparkles, ArrowRight } from "lucide-react";

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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [consoleHeight, setConsoleHeight] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(CardHandle | null)[]>([]);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem("textcuts_input", inputText);
  }, [inputText]);
  useEffect(() => {
    localStorage.setItem("textcuts_config", JSON.stringify(config));
  }, [config]);

  // --- Scroll & Active Card Detection ---
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || cards.length === 0) return;

    const handleScroll = () => {
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

      if (closestIndex !== activeCardIndex) {
        setActiveCardIndex(closestIndex);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [cards.length, activeCardIndex]);

  // --- Handlers ---
  const handleProcess = async () => {
    if (!inputText) return;
    setIsProcessing(true);
    setEditingIndex(null);

    try {
      const segments = await splitTextIntoCards(inputText);
      const userTitle = config.title.trim();
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
      // Reset scroll
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
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
    let width = "380px";
    
    switch (ratio) {
      case AspectRatio.WIDE:
        width = "600px";
        break;
      case AspectRatio.SQUARE:
        width = "480px";
        break;
      case AspectRatio.PORTRAIT:
      default:
        width = "380px";
        break;
    }

    return {
      width,
      aspectRatio: ratioValue,
    };
  };

  // --- Render ---
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#fafafa] font-sans text-[#18181b] flex flex-col">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg"
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
            <div className="w-full max-w-5xl flex flex-col items-center gap-16">
              
              {/* Slogan */}
              <div className="text-center space-y-8">
                <h1 className="text-5xl md:text-8xl font-bold tracking-tighter text-[#18181b] leading-none text-nowrap">
                  Quantity produces quality
                  <span className="text-[#ea580c]">.</span>
                </h1>
                <p className="text-lg text-black/40 font-medium tracking-wide">
                  Turn your thoughts into elegant cards instantly.
                </p>
              </div>

              {/* Hero Input Area */}
              <div className="w-full max-w-3xl relative group">
                <div className="relative bg-white rounded-3xl shadow-xl shadow-black/5 border border-black/5 overflow-hidden flex flex-col transition-all duration-300 focus-within:shadow-2xl focus-within:border-black/10 focus-within:translate-y-[-2px]">
                  
                  {/* Metadata Inputs */}
                  <div className="flex border-b border-black/5 bg-gray-50/50">
                    <div className="flex-1 border-r border-black/5 flex items-center px-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 shrink-0 select-none w-12">Title</span>
                      <input
                        type="text"
                        value={config.title}
                        onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Optional"
                        className="w-full h-12 bg-transparent text-sm font-medium outline-none text-black/80 placeholder:text-black/20 tracking-wide px-2 font-serif"
                      />
                    </div>
                    <div className="w-1/3 flex items-center px-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 shrink-0 select-none w-14">Author</span>
                      <input
                        type="text"
                        value={config.authorName}
                        onChange={(e) => setConfig(prev => ({ ...prev, authorName: e.target.value }))}
                        placeholder="Optional"
                        className="w-full h-12 bg-transparent text-sm font-medium outline-none text-black/80 placeholder:text-black/20 tracking-wide px-2 font-serif"
                      />
                    </div>
                  </div>

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your article or notes here..."
                    className="w-full h-48 p-8 text-xl text-black/90 placeholder:text-black/20 outline-none resize-none bg-transparent leading-relaxed font-serif tracking-wide selection:bg-orange-100"
                    spellCheck={false}
                  />
                  
                  {/* Action Bar */}
                  <div className="absolute bottom-6 right-6">
                     <button
                        onClick={handleProcess}
                        disabled={!inputText.trim() || isProcessing}
                        className={`
                          h-12 w-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg
                          ${!inputText.trim() 
                            ? "bg-black/5 text-black/10 cursor-not-allowed shadow-none scale-90" 
                            : "bg-black text-white hover:bg-[#ea580c] hover:scale-110 active:scale-95 hover:shadow-orange-500/30"
                          }
                        `}
                     >
                        {isProcessing ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <ArrowRight size={20} strokeWidth={2.5} />
                        )}
                     </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          // --- RESULT DECK MODE ---
          <div 
             ref={scrollContainerRef}
             className="absolute inset-0 flex items-center overflow-x-auto snap-x snap-mandatory px-[50vw] scroll-smooth custom-scrollbar animate-in fade-in duration-1000"
             style={{ 
               paddingLeft: 'calc(50vw - 190px)', 
               paddingRight: 'calc(50vw - 190px)',
               paddingBottom: hasContent ? consoleHeight + 40 : 0,
               transition: 'padding-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1)'
             }}
          >
             <div className="flex items-center gap-12 py-20">
                {cards.map((segment, idx) => (
                  <div
                    key={idx}
                    className={`card-wrapper flex-shrink-0 snap-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                      activeCardIndex === idx 
                        ? 'scale-100 opacity-100 z-10 filter-none' 
                        : 'scale-90 opacity-40 z-0 blur-[1px] hover:opacity-60 cursor-pointer'
                    }`}
                    onClick={() => {
                       if (activeCardIndex === idx) return;
                       const targetEl = scrollContainerRef.current?.children[0]?.children[idx] as HTMLElement;
                       if (targetEl && scrollContainerRef.current) {
                          const targetLeft = targetEl.offsetLeft - scrollContainerRef.current.clientWidth / 2 + targetEl.offsetWidth / 2;
                          scrollContainerRef.current.scrollTo({
                             left: targetLeft,
                             behavior: 'smooth'
                          });
                       }
                    }}
                  >
                    <div
                      className={`relative rounded-2xl shadow-xl bg-white mx-auto overflow-hidden ring-1 ring-black/5 transition-transform duration-500 will-change-transform ${isScrolling ? 'pointer-events-none' : ''}`}
                      style={{
                        ...getCardStyle(config.aspectRatio),
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
                  </div>
                ))}
             </div>
          </div>
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
            onDownload={() => activeCardIndex !== null && handleDownload(activeCardIndex)}
            onToggleHighlight={() => activeCardIndex !== null && cardRefs.current[activeCardIndex]?.toggleHighlight()}
            
            activeHasImage={activeHasImage}
            activeImageConfig={activeEditConfig}
            onUpdateImageConfig={(updates) => activeCardIndex !== null && cardRefs.current[activeCardIndex]?.updateImageConfig(updates)}
            onRemoveImage={() => activeCardIndex !== null && cardRefs.current[activeCardIndex]?.removeImage()}
            onHeightChange={setConsoleHeight}
          />
        </div>
      )}
    </div>
  );
};

export default App;
