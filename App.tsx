import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Card, CardHandle } from './components/Card';
import { CardConfig, AspectRatio, CardSegment, FontStyle } from './types';
import { splitTextIntoCards } from './services/geminiService';
import { Download, Plus, Minus, Settings2, Play, ArrowDownToLine, X, Pencil, LayoutTemplate, Check } from 'lucide-react';
import { toPng } from 'html-to-image';

const App: React.FC = () => {
  // --- State ---
  const [inputText, setInputText] = useState<string>(() => {
    try { return localStorage.getItem('textcuts_input') || ""; } catch { return ""; }
  });
  
  const [cards, setCards] = useState<CardSegment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.85); 
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Open by default for first visit
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [config, setConfig] = useState<CardConfig>(() => {
    const defaultConfig = {
      colorway: 'snow',
      backgroundColor: '#f4f4f5',
      textColor: '#18181b',
      accentColor: '#ea580c',
      fontStyle: FontStyle.SERIF,
      composition: 'classic',
      aspectRatio: AspectRatio.PORTRAIT,
      fontSize: 0.9, 
      showMetadata: true,
      title: "",
      authorName: ""
    } as CardConfig;

    try {
      const saved = localStorage.getItem('textcuts_config');
      if (saved) return { ...defaultConfig, ...JSON.parse(saved) };
      return defaultConfig;
    } catch { return defaultConfig; }
  });

  // --- Effects ---
  useEffect(() => { localStorage.setItem('textcuts_input', inputText); }, [inputText]);
  useEffect(() => { localStorage.setItem('textcuts_config', JSON.stringify(config)); }, [config]);

  // Load LXGW Font manually to avoid html-to-image CORS issues with external stylesheets
  useEffect(() => {
    const linkId = 'lxgw-font-style';
    if (!document.getElementById(linkId)) {
      fetch('https://cdn.jsdelivr.net/npm/lxgw-zhi-song-screen-web/style.css')
        .then(res => res.text())
        .then(css => {
          const style = document.createElement('style');
          style.id = linkId;
          style.appendChild(document.createTextNode(css));
          document.head.appendChild(style);
        })
        .catch(err => console.error('Failed to load LXGW font:', err));
    }
  }, []);

  const cardRefs = useRef<(CardHandle | null)[]>([]);

  // --- Handlers ---
  const handleProcess = async () => {
    if (!inputText) return;
    setIsProcessing(true);
    setIsPanelOpen(false); // Auto close panel on run
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
    setCards(prev => {
      const newCards = [...prev];
      newCards[index] = updatedSegment;
      return newCards;
    });
  };

  const handleSplitCard = (index: number, contentToMove: string) => {
    setCards(prev => {
      const newCards = [...prev];
      newCards.splice(index + 1, 0, { title: "", content: contentToMove, layout: 'standard' });
      return newCards;
    });
  };

  const handleStartEdit = (index: number) => {
    // Auto-save previous if exists
    if (editingIndex !== null && editingIndex !== index) {
       cardRefs.current[editingIndex]?.save();
    }
    setEditingIndex(index);
    // Direct call triggers internal state update in Card
    cardRefs.current[index]?.startEdit();
  };

  const handleSaveEdit = (index: number) => {
    cardRefs.current[index]?.save();
    setEditingIndex(null);
  };

  const handleCancelEdit = (index: number) => {
    cardRefs.current[index]?.cancel();
    setEditingIndex(null);
  };

  const handleDownload = useCallback(async (index: number) => {
    const handle = cardRefs.current[index];
    if (!handle || !handle.element) return;
    const el = handle.element;

    try {
      // Small delay to ensure render is stable
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const width = 380;
      // Capture the exact height of the element as currently rendered (constrained by aspect ratio)
      const height = el.offsetHeight;

      const dataUrl = await toPng(el, { 
        cacheBust: true, 
        pixelRatio: 3,
        width: width,
        height: height,
        style: {
           // Explicitly set dimensions on the clone to prevent zoom/transform inheritance issues
           width: `${width}px`,
           height: `${height}px`,
           zoom: '1',
           transform: 'none',
           margin: '0',
           maxHeight: 'none',
        },
        // Filter out the external font link if it still exists to prevent double loading/errors
        filter: (node) => {
          if (node.tagName === 'LINK' && (node as HTMLLinkElement).href.includes('lxgw-zhi-song-screen-web')) {
            return false;
          }
          return true;
        },
        fetchRequestInit: {
          mode: 'cors'
        }
      });
      const link = document.createElement('a');
      link.download = `card-${String(index + 1).padStart(2, '0')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) { console.error('Download failed', err); }
  }, []);

  const handleDownloadAll = useCallback(async () => {
     for(let i=0; i<cards.length; i++) {
        await handleDownload(i);
        await new Promise(r => setTimeout(r, 200));
     }
  }, [cards.length, handleDownload]);

  const hasContent = cards.length > 0;

  // --- Render ---
  return (
    <div className="relative h-screen w-full overflow-hidden bg-white font-sans text-[#18181b]">
      
      {/* Background Texture (Dieter Rams Style: Technical Grid + Vignette) */}
      <div className="absolute inset-0 pointer-events-none opacity-20 mix-blend-multiply" 
           style={{ 
             backgroundImage: `
               linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
               linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
             `,
             backgroundSize: '20px 20px' 
           }}>
      </div>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.03)_100%)]"></div>

      {/* Main Content Stage */}
      <main className="absolute inset-0 flex flex-col items-center">
        <div className="w-full h-full overflow-y-auto custom-scrollbar scroll-smooth">
          <div className="flex flex-col items-center py-20 px-4 min-h-full">
            
            {!hasContent ? (
               <div className="flex-1 flex flex-col items-center justify-center select-none">
                  {/* Dieter Rams Style: Minimalist Typography on Canvas */}
                  <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-1000">
                    
                    {/* Main Quote - Pure Typography */}
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-[#18181b] text-center max-w-4xl leading-none">
                      Quantity produces quality<span className="text-[#ea580c]">.</span>
                    </h1>

                  </div>
               </div>
            ) : (
              <div className="flex flex-col gap-20 pb-48 animate-in fade-in duration-700">
                {cards.map((segment, idx) => (
                  <div key={idx} className="flex flex-col items-center group">
                    {/* Card Container */}
                    <div 
                      className="transition-transform duration-500 ease-out rounded-2xl"
                      style={{ 
                        width: '380px', 
                        // @ts-ignore
                        zoom: zoomLevel,
                        transformOrigin: 'center top'
                      }}
                    >
                       <Card 
                        ref={(handle) => { cardRefs.current[idx] = handle; }}
                        content={segment.content}
                        sectionTitle={segment.title} 
                        layout={segment.layout}
                        index={idx} 
                        total={cards.length} 
                        config={config} 
                        onUpdate={(updated) => handleUpdateCard(idx, updated)}
                        onSplit={(contentToMove) => handleSplitCard(idx, contentToMove)}
                      />
                    </div>
                    {/* Card Actions (Dieter Rams Style: Functional, grouped, clear) */}
                    <div className="mt-6 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                       
                       {editingIndex === idx ? (
                         <>
                           <button 
                              onClick={() => cardRefs.current[idx]?.toggleLayout()}
                              className="p-2 rounded-full border border-black/10 text-black/60 hover:text-black hover:border-black/30 bg-white hover:bg-white/80 transition-all"
                              title="Toggle Layout"
                            >
                              <LayoutTemplate size={14} />
                           </button>

                           <div className="w-px h-4 bg-black/10 mx-1"></div>

                           <button 
                             onClick={() => handleCancelEdit(idx)}
                             className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600 border border-red-100 hover:border-red-200 px-4 py-2 rounded-full bg-white hover:bg-red-50 transition-all shadow-sm"
                           >
                             <X size={12} /> Cancel
                           </button>

                           <button 
                             onClick={() => handleSaveEdit(idx)}
                             className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-700 border border-green-100 hover:border-green-200 px-4 py-2 rounded-full bg-white hover:bg-green-50 transition-all shadow-sm"
                           >
                             <Check size={12} /> Confirm
                           </button>
                         </>
                       ) : (
                         <>
                           <div className="flex items-center gap-1">
                              <button 
                                onClick={() => cardRefs.current[idx]?.toggleLayout()}
                                className="p-2 rounded-full border border-black/10 text-black/60 hover:text-black hover:border-black/30 bg-white hover:bg-white/80 transition-all"
                                title="Toggle Layout"
                              >
                                <LayoutTemplate size={14} />
                              </button>
                              <button 
                                onClick={() => handleStartEdit(idx)}
                                className="p-2 rounded-full border border-black/10 text-black/60 hover:text-black hover:border-black/30 bg-white hover:bg-white/80 transition-all"
                                title="Edit Content"
                              >
                                <Pencil size={14} />
                              </button>
                           </div>

                           <div className="w-px h-4 bg-black/10 mx-1"></div>

                           <button 
                             onClick={() => handleDownload(idx)}
                             className="p-2 rounded-full border border-black/10 text-black/60 hover:text-black hover:border-black/30 bg-white hover:bg-white/80 transition-all shadow-sm"
                             title="Download"
                           >
                             <ArrowDownToLine size={14} />
                           </button>
                         </>
                       )}

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- FLOATING CONTROL DECK (Braun/Rams Style) --- */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center z-50">
        <div className="relative">
          
          {/* The Dashboard Panel (Pops UP from here) */}
          <ControlPanel 
            inputText={inputText}
            setInputText={setInputText}
            config={config}
            setConfig={setConfig}
            isVisible={isPanelOpen}
          />

          {/* The Main Controller Bar */}
          <div className="
            flex items-center gap-2 p-2 pl-3
            bg-white border border-black/10 rounded-full 
            shadow-[0_10px_30px_rgba(0,0,0,0.08)]
            backdrop-blur-xl
            transition-transform duration-300 hover:scale-[1.005]
          ">
             
             {/* Left: View Controls */}
             <div className="flex items-center gap-1 px-2 border-r border-black/5 mr-1">
                <button onClick={() => setZoomLevel(z => Math.max(0.4, z - 0.05))} className="p-2 text-black/40 hover:text-black transition-colors rounded-full hover:bg-black/5">
                  <Minus size={14} />
                </button>
                <div className="w-8 text-center font-mono text-[10px] text-black/60 select-none">
                  {(zoomLevel * 100).toFixed(0)}%
                </div>
                <button onClick={() => setZoomLevel(z => Math.min(1.5, z + 0.05))} className="p-2 text-black/40 hover:text-black transition-colors rounded-full hover:bg-black/5">
                  <Plus size={14} />
                </button>
             </div>

             {/* Center: System Toggle */}
             <button
               onClick={() => setIsPanelOpen(!isPanelOpen)}
               className={`
                 h-10 px-6 rounded-full flex items-center gap-2 transition-all duration-300
                 text-[10px] font-bold uppercase tracking-[0.15em]
                 ${isPanelOpen 
                   ? 'bg-black text-white shadow-lg' 
                   : 'bg-transparent text-black/60 hover:bg-black/5'}
               `}
             >
               {isPanelOpen ? <X size={14} /> : <Settings2 size={14} />}
               <span className="hidden sm:inline">{isPanelOpen ? 'Close Panel' : 'Settings'}</span>
             </button>

             {/* Right: Primary Action (Run) */}
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
                    ${!inputText.trim() 
                       ? 'bg-[#e4e4e7] text-black/20 cursor-not-allowed shadow-none' 
                       : 'bg-[#ea580c] hover:bg-[#c2410c] text-white hover:shadow-orange-500/20 active:translate-y-0.5'}
                  `}
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                  <span>{hasContent ? 'Rerun' : 'Generate'}</span>
                </button>
             </div>

          </div>
        </div>
      </div>

    </div>
  );
};

export default App;