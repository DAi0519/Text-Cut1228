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
  
  // Track active card state for external toolbar
  const [activeEditConfig, setActiveEditConfig] = useState<ImageConfig | null>(
    null,
  );
  const [activeHasImage, setActiveHasImage] = useState(false);

  // Sync editing index with active card index
  useEffect(() => {
    if (activeCardIndex !== null && activeCardIndex !== editingIndex) {
       // Save previous if any
       if (editingIndex !== null) {
          cardRefs.current[editingIndex]?.save();
       }
       // Start editing new
       setEditingIndex(activeCardIndex);
       // Small delay to let ref update
       setTimeout(() => {
          cardRefs.current[activeCardIndex]?.startEdit();
       }, 50);
    }
  }, [activeCardIndex, editingIndex]);

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
      const center = container.scrollLeft + container.clientWidth / 2;
      let minDistance = Infinity;
      let closestIndex = 0;

      // Find card closest to center
      const cardElements = container.querySelectorAll('.card-wrapper');
      if (cardElements.length === 0) return;

      cardElements.forEach((el, idx) => {
        const rect = (el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth / 2;
        const distance = Math.abs(center - rect);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = idx;
        }
      });
      
      if (closestIndex !== activeCardIndex) {
         if (activeCardIndex !== null) {
            // Save the PREVIOUS card before switching
            cardRefs.current[activeCardIndex]?.save();
         }
         
         setActiveCardIndex(closestIndex);
         setEditingIndex(closestIndex);
         
         // Start editing the NEW card
         setTimeout(() => {
            cardRefs.current[closestIndex]?.startEdit();
         }, 50);
      }
    };
    
    // Initial call
    // If we have cards but no active index, default to 0
    if (activeCardIndex === null && cards.length > 0) {
       setActiveCardIndex(0);
       setEditingIndex(0);
       setTimeout(() => cardRefs.current[0]?.startEdit(), 50);
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [cards.length, activeCardIndex]);

  // --- Handlers ---
  const handleProcess = async () => {
    if (!inputText) return;
    setIsProcessing(true);
    // Clear any previous edit state
    setEditingIndex(null);
    setActiveCardIndex(null);
    setActiveEditConfig(null);
    setActiveHasImage(false);

    try {
      const segments = await splitTextIntoCards(inputText);
      setCards(segments);
      // Reset scroll
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
      
      // Auto-select first card
      setTimeout(() => {
         if (segments.length > 0) {
            setActiveCardIndex(0);
            setEditingIndex(0);
            cardRefs.current[0]?.startEdit();
         }
      }, 100);

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
    // If we're already editing this card, do nothing
    if (editingIndex === index) return;
    
    // Save previous
    if (editingIndex !== null) {
      cardRefs.current[editingIndex]?.save();
    }
    
    setEditingIndex(index);
    setActiveCardIndex(index); // Ensure active matches edit
    
    // Reset state for new edit
    setActiveEditConfig(null);
    setActiveHasImage(false);
    
    // Trigger edit on card component
    cardRefs.current[index]?.startEdit();
  };

  const handleSaveEdit = (index: number) => {
    // Only save content, don't exit edit mode completely if it's the active card
    cardRefs.current[index]?.save();
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
    // Always update if it's the active card
    if (index === activeCardIndex) {
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
        
        // Auto-switch to editor tab/mode if needed, but since we are always editing,
        // just ensure the state is refreshed
        setTimeout(() => {
            if (activeCardIndexForUpload.current === activeCardIndex) {
                 // Force refresh of edit state
                 cardRefs.current[activeCardIndex]?.startEdit(); 
            }
            activeCardIndexForUpload.current = null;
        }, 100);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = useCallback(async (index: number) => {
    const handle = cardRefs.current[index];
    if (!handle || !handle.element) return;
    
    // Save state to render final view
    handle.save();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const el = handle.element;

    try {
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
          if (node instanceof HTMLElement && node.classList.contains('ui-overlay')) {
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
    } finally {
        // Restore edit mode if active
        // Note: Using a ref to access current active index avoids stale closure issues
        // We'll rely on the parent component (App) passing the correct state or logic
        // But here we are inside App.tsx. However, activeCardIndex is from closure.
        // We need to use the ref or ensure dependencies are correct.
        // Since we can't easily access the LATEST state in a callback without re-creating it on every scroll...
        // Let's use a ref for activeCardIndex?
        // Actually, we can just check if the current editingIndex matches?
        // Or better, just restore it blindly? No, that would activate non-active cards.
        // We'll check if index === activeCardIndexRef.current (need to add ref)
        // For now, let's just use the prop.
        if (index === activeCardIndex) {
            handle.startEdit();
        }
    }
  }, [activeCardIndex]);

  const handleDownloadAll = useCallback(async () => {
    // If there are cards
    if (cards.length === 0) return;
    
    // Deactivate editing for clean screenshots
    const previousActive = activeCardIndex;
    if (previousActive !== null) {
       cardRefs.current[previousActive]?.save();
    }
    
    // We intentionally don't clear setEditingIndex immediately to avoid UI jumps, 
    // but we saved the content.
    
    // We iterate manually
    for (let i = 0; i < cards.length; i++) {
       const handle = cardRefs.current[i];
       if (!handle || !handle.element) continue;
       
       // Force save
       handle.save();
       // Wait for render
       await new Promise(r => setTimeout(r, 100));
       
       try {
           const el = handle.element;
           const width = el.offsetWidth;
           const height = el.offsetHeight;
           const dataUrl = await toPng(el, {
              cacheBust: true, pixelRatio: 3, width, height,
              style: { width: `${width}px`, height: `${height}px`, zoom: "1", transform: "none", margin: "0", maxHeight: "none" },
              filter: (node) => {
                 if (node.tagName === "LINK" && (node as HTMLLinkElement).href.includes("lxgw-zhi-song-screen-web")) return false;
                 // Exclude internal UI overlays if any remain
                 if (node instanceof HTMLElement && node.classList.contains('ui-overlay')) return false;
                 return true;
              },
              fetchRequestInit: { mode: "cors" },
           });
           const link = document.createElement("a");
           link.download = `card-${String(i + 1).padStart(2, "0")}.png`;
           link.href = dataUrl;
           link.click();
       } catch (e) { console.error(e); }
       
       await new Promise(r => setTimeout(r, 200));
    }
    
    // Restore editing on the active card
    if (previousActive !== null) {
       // Re-trigger edit
       cardRefs.current[previousActive]?.startEdit();
    }
    
  }, [cards.length, activeCardIndex]);

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
            <div className="w-full max-w-2xl flex flex-col items-center gap-10">
              
              {/* Slogan */}
              <div className="text-center space-y-4">
                <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-[#18181b] leading-none">
                  Quantity produces quality
                  <span className="text-[#ea580c]">.</span>
                </h1>
                <p className="text-lg text-black/40 font-medium tracking-wide">
                  Turn your thoughts into elegant cards instantly.
                </p>
              </div>

              {/* Hero Input Area */}
              <div className="w-full relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-orange-100 to-orange-50 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <div className="relative bg-white rounded-xl shadow-2xl shadow-black/5 border border-black/5 overflow-hidden flex flex-col transition-all duration-300 group-hover:shadow-orange-500/10 group-hover:border-orange-500/20">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your article or notes here..."
                    className="w-full h-40 p-6 text-lg text-black/80 placeholder:text-black/20 outline-none resize-none bg-transparent leading-relaxed"
                    spellCheck={false}
                  />
                  
                  {/* Action Bar */}
                  <div className="h-16 border-t border-black/5 bg-gray-50/50 flex items-center justify-between px-4">
                     <div className="flex items-center gap-2 text-xs font-medium text-black/30 px-2">
                        <Sparkles size={14} />
                        <span>AI-Powered Formatting</span>
                     </div>
                     <button
                        onClick={handleProcess}
                        disabled={!inputText.trim() || isProcessing}
                        className={`
                          h-10 px-6 rounded-lg flex items-center gap-2 transition-all duration-300 font-bold text-sm tracking-wide shadow-lg
                          ${!inputText.trim() 
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none" 
                            : "bg-[#ea580c] hover:bg-[#c2410c] text-white hover:shadow-orange-500/25 active:scale-95 transform"
                          }
                        `}
                     >
                        {isProcessing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <span>Generate Cards</span>
                            <ArrowRight size={16} />
                          </>
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
             style={{ paddingLeft: 'calc(50vw - 190px)', paddingRight: 'calc(50vw - 190px)' }}
          >
             <div className="flex items-center gap-12 py-20">
                {cards.map((segment, idx) => (
                  <div
                    key={idx}
                    className={`card-wrapper flex-shrink-0 snap-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeCardIndex === idx ? 'scale-100 opacity-100 z-10' : 'scale-90 opacity-40 z-0 blur-[1px]'}`}
                    onClick={() => {
                       setActiveCardIndex(idx);
                       scrollContainerRef.current?.scrollTo({
                          left: (scrollContainerRef.current?.children[0]?.children[idx] as HTMLElement)?.offsetLeft - scrollContainerRef.current?.clientWidth / 2 + (scrollContainerRef.current?.children[0]?.children[idx] as HTMLElement)?.offsetWidth / 2,
                          behavior: 'smooth'
                       });
                    }}
                  >
                    <div
                      className={`relative rounded-2xl shadow-xl bg-white mx-auto overflow-hidden ring-1 ring-black/5`}
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
          />
        </div>
      )}
    </div>
  );
};

export default App;
