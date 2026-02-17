import React, { useState, useEffect, useRef } from 'react';
import { CardConfig, AspectRatio, FontStyle, Preset, Composition, ImageConfig } from '../types';
import { 
  Type, Grid, Crop, Scaling, Layout, 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, RectangleHorizontal, 
  RectangleVertical, ScanLine, ZoomIn, Trash2, X, Check, Pencil, 
  LayoutTemplate, Image as ImageIcon, ArrowDownToLine, Download, Play, Minus, Plus, Settings2,
  FileText, Sparkles, Move, ChevronDown, Layers
} from 'lucide-react';

interface ConsoleProps {
  inputText: string;
  setInputText: (text: string) => void;
  config: CardConfig;
  setConfig: React.Dispatch<React.SetStateAction<CardConfig>>;
  isProcessing: boolean;
  onProcess: () => void;
  onDownloadAll: () => void;
  hasContent: boolean;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;

  activeCardIndex: number | null;
  editingIndex: number | null;
  
  onToggleLayout: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onTriggerImage: () => void;
  onDownload: () => void;
  onToggleHighlight: () => void;
  
  activeHasImage: boolean;
  activeImageConfig: ImageConfig | null;
  onUpdateImageConfig: (updates: Partial<ImageConfig>) => void;
  onRemoveImage: () => void;
  onHeightChange?: (height: number) => void;
}

const COLORWAYS: Preset[] = [
  { id: 'snow', name: 'Snow', config: { colorway: 'snow', backgroundColor: '#f4f4f5', textColor: '#18181b', accentColor: '#ea580c' } },
  { id: 'neon', name: 'Neon', config: { colorway: 'neon', backgroundColor: '#111111', textColor: '#ffffff', accentColor: '#ccff00' } },
];

type TabId = 'style' | 'editor' | 'source';

export const Console: React.FC<ConsoleProps> = ({
  inputText, setInputText, config, setConfig, isProcessing, onProcess, 
  onDownloadAll, hasContent, zoomLevel, setZoomLevel,
  activeCardIndex, editingIndex,
  onToggleLayout, onStartEdit, onSaveEdit, onCancelEdit, onTriggerImage, 
  onDownload, onToggleHighlight,
  activeHasImage, activeImageConfig, onUpdateImageConfig, onRemoveImage,
  onHeightChange
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('style');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure height changes
  useEffect(() => {
    if (!containerRef.current || !onHeightChange) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height);
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [onHeightChange]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const prevTabRef = useRef<TabId>('style');

  const updateConfig = (key: keyof CardConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // --- Auto edit mode when switching to/from Editor tab ---
  useEffect(() => {
    const prevTab = prevTabRef.current;
    prevTabRef.current = activeTab;

    if (activeTab === 'editor' && prevTab !== 'editor') {
      if (activeCardIndex !== null && editingIndex !== activeCardIndex) {
        onStartEdit();
      }
    } else if (activeTab !== 'editor' && prevTab === 'editor') {
      if (editingIndex !== null) {
        onSaveEdit();
      }
    }
  }, [activeTab]);

  // --- Auto edit when switching cards while in Editor tab ---
  const prevCardRef = useRef(activeCardIndex);
  useEffect(() => {
    const prevCard = prevCardRef.current;
    prevCardRef.current = activeCardIndex;
    if (activeTab === 'editor' && activeCardIndex !== null && activeCardIndex !== prevCard) {
      onStartEdit();
    }
  }, [activeCardIndex]);

  const fontStyles = [
    { value: FontStyle.CHILL, label: 'Chill' },
    { value: FontStyle.OPPO, label: 'OPPO' },
    { value: FontStyle.SWEI, label: 'Swei' },
  ];

  const compositions: { value: Composition, label: string }[] = [
    { value: 'classic', label: 'Classic' },
    { value: 'technical', label: 'Tech' },
  ];

  const positionLabels: Record<string, string> = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };
  const getPositionIcon = (pos: string) => {
    switch (pos) {
      case "top": return <ArrowUp size={14} />;
      case "bottom": return <ArrowDown size={14} />;
      case "left": return <ArrowLeft size={14} />;
      case "right": return <ArrowRight size={14} />;
      default: return <ArrowUp size={14} />;
    }
  };

  const cyclePosition = () => {
    if (!activeImageConfig) return;
    const order: ImageConfig["position"][] = ["top", "bottom", "left", "right"];
    const currentIdx = order.indexOf(activeImageConfig.position);
    onUpdateImageConfig({ position: order[(currentIdx + 1) % order.length] });
  };

  const cycleAspectRatio = () => {
    if (!activeImageConfig) return;
    const order: (ImageConfig["aspectRatio"] | undefined)[] = [undefined, "1:1", "4:3", "16:9", "3:4"];
    const currentIdx = order.indexOf(activeImageConfig.aspectRatio);
    onUpdateImageConfig({ aspectRatio: order[(currentIdx + 1) % order.length] });
  };

  const hasActiveCard = activeCardIndex !== null;

  return (
    <div ref={containerRef} className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[640px] bg-white/95 backdrop-blur-xl border border-black/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 ring-1 ring-black/5">
      
      {/* --- TOP BAR --- */}
      <div className="h-11 border-b border-black/5 flex items-center justify-between px-2">
        <div className="flex items-center gap-1 p-1">
           {(['style', 'editor', 'source'] as TabId[]).map(tab => (
             <button 
               key={tab}
               onClick={() => setActiveTab(tab)}
               className={`h-7 px-3 rounded-lg flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:bg-black/5 hover:text-black'}`}
             >
               {tab === 'style' && <Settings2 size={12} />}
               {tab === 'editor' && <Pencil size={12} />}
               {tab === 'source' && <FileText size={12} />}
               <span>{tab === 'style' ? 'Style' : tab === 'editor' ? 'Edit' : 'Source'}</span>
             </button>
           ))}
        </div>
        <div className="flex items-center gap-1.5 pr-1">
           {hasContent && (
             <div className="relative" ref={exportMenuRef}>
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)} 
                  className={`h-7 px-2.5 rounded-lg transition-all flex items-center gap-1.5 justify-center border ${showExportMenu ? 'bg-black text-white border-black shadow-sm' : 'text-black/40 hover:text-black hover:bg-black/5 border-transparent'}`}
                >
                  <Download size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-wider hidden sm:inline">Export</span>
                  <ChevronDown size={10} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>
                
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 w-36 bg-white rounded-xl shadow-xl border border-black/5 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 p-1 flex flex-col z-50 ring-1 ring-black/5">
                     <button onClick={() => { onDownload(); setShowExportMenu(false); }} className="h-9 px-2.5 rounded-lg hover:bg-black/5 flex items-center gap-2.5 text-left transition-colors text-black/80 hover:text-black group">
                        <ArrowDownToLine size={14} className="text-black/40 group-hover:text-black transition-colors" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Current Card</span>
                     </button>
                     <button onClick={() => { onDownloadAll(); setShowExportMenu(false); }} className="h-9 px-2.5 rounded-lg hover:bg-black/5 flex items-center gap-2.5 text-left transition-colors text-black/80 hover:text-black group">
                        <Layers size={14} className="text-black/40 group-hover:text-black transition-colors" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">All Cards</span>
                     </button>
                  </div>
                )}
             </div>
           )}
        </div>
      </div>

      {/* --- CONTENT --- */}
      <div className="max-h-[45vh] overflow-y-auto custom-scrollbar">
        
        {/* ═══════ STYLE TAB ═══════ */}
        {activeTab === 'style' && (
          <div className="p-5 flex flex-col gap-5 animate-in fade-in duration-200">
             <div className="flex gap-4 overflow-x-auto scrollbar-hide">
                <div className="flex flex-col gap-2 shrink-0">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Theme</label>
                   <div className="flex bg-black/[0.03] p-0.5 rounded-lg gap-0.5">
                      {compositions.map(comp => (
                        <button key={comp.value} onClick={() => updateConfig('composition', comp.value)} className={`h-8 px-3 rounded-md flex items-center justify-center transition-all ${config.composition === comp.value ? 'bg-white text-black shadow-sm' : 'text-black/40 hover:text-black'}`}>
                           <span className="text-[10px] font-bold uppercase tracking-widest">{comp.label}</span>
                        </button>
                      ))}
                   </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Palette</label>
                   <div className="flex items-center gap-2">
                      <div className="flex bg-black/[0.03] p-0.5 rounded-lg gap-0.5">
                        {COLORWAYS.map(c => (
                          <button key={c.id} onClick={() => setConfig(prev => ({...prev, ...c.config}))} className={`h-8 w-8 rounded-md flex items-center justify-center transition-all ${config.colorway === c.id ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`} title={c.name}>
                             <div className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: c.id === 'neon' ? c.config.accentColor : c.config.backgroundColor }}></div>
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 bg-black/[0.03] rounded-lg px-2.5 h-9">
                        <div className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: config.accentColor }}></div>
                        <input type="text" value={config.accentColor.replace('#', '')} onChange={(e) => { if (/^[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateConfig('accentColor', '#' + e.target.value); }} className="bg-transparent text-[10px] font-mono font-bold uppercase w-14 outline-none text-black/70" placeholder="HEX" maxLength={6} />
                      </div>
                   </div>
                </div>
             </div>
             <div className="h-px bg-black/5"></div>
             <div className="flex items-end gap-4">
                <div className="flex flex-col gap-2 flex-1">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Font</label>
                   <div className="flex bg-black/[0.03] p-0.5 rounded-lg gap-0.5">
                      {fontStyles.map(style => (
                        <button key={style.value} onClick={() => updateConfig('fontStyle', style.value)} className={`flex-1 h-8 px-3 rounded-md flex items-center justify-center transition-all ${config.fontStyle === style.value ? 'bg-white text-black shadow-sm' : 'text-black/40 hover:text-black'}`}>
                           <span className="text-[10px] font-bold uppercase tracking-wide">{style.label}</span>
                        </button>
                      ))}
                   </div>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Ratio</label>
                   <div className="flex bg-black/[0.03] p-0.5 rounded-lg gap-0.5 w-full">
                     {Object.values(AspectRatio).map(ratio => (
                       <button key={ratio} onClick={() => updateConfig('aspectRatio', ratio)} className={`flex-1 h-8 rounded-md text-[10px] font-mono transition-all flex items-center justify-center ${config.aspectRatio === ratio ? 'bg-white text-black shadow-sm' : 'text-black/40 hover:text-black'}`}>{ratio}</button>
                     ))}
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* ═══════ EDITOR TAB ═══════ */}
        {activeTab === 'editor' && (
          <div className="animate-in fade-in duration-200">
             {hasActiveCard ? (
               <div className="p-5">
                  {/* Primary Actions Row */}
                  <div className="grid grid-cols-3 gap-3">
                     <button onClick={onToggleLayout} className="h-10 bg-black/[0.03] rounded-lg flex items-center justify-center gap-2 hover:bg-black/[0.06] transition-all text-black/60 hover:text-black group">
                        <LayoutTemplate size={16} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Switch Layout</span>
                     </button>
                     
                     <button onMouseDown={(e) => e.preventDefault()} onClick={onToggleHighlight} className="h-10 bg-black/[0.03] rounded-lg flex items-center justify-center gap-2 hover:bg-black/[0.06] transition-all text-black/60 hover:text-black group">
                        <span className="font-serif font-black text-base group-hover:scale-110 transition-transform">B</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide">Bold Text</span>
                     </button>

                     <button onClick={onTriggerImage} className="h-10 bg-black/[0.03] rounded-lg flex items-center justify-center gap-2 hover:bg-black/[0.06] transition-all text-black/60 hover:text-black group">
                        <ImageIcon size={16} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">{activeHasImage ? "Replace Image" : "Add Image"}</span>
                     </button>
                  </div>

                  {/* Image Tuning - Expands below when image exists */}
                  {activeHasImage && activeImageConfig && (
                    <div className="mt-5 pt-5 border-t border-black/5 flex flex-col gap-4">
                       <div className="flex items-center gap-4">
                          {/* Position Cycle */}
                          <button onClick={cyclePosition} className="h-9 px-3 bg-black/[0.03] rounded-lg flex items-center gap-2 hover:bg-black/[0.06] transition-all text-black/60 hover:text-black shrink-0" title="Change Position">
                             {getPositionIcon(activeImageConfig.position)}
                             <span className="text-[10px] font-bold uppercase w-12 text-center">{positionLabels[activeImageConfig.position]}</span>
                          </button>
                          
                          <div className="h-6 w-px bg-black/5"></div>

                          {/* Sliders */}
                          <div className="flex-1 grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-1.5">
                               <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider opacity-40">
                                  <span>Zoom</span>
                                  <span className="font-mono">{activeImageConfig.scale.toFixed(1)}x</span>
                               </div>
                               <input type="range" min="0.2" max="3" step="0.1" value={activeImageConfig.scale} onChange={(e) => onUpdateImageConfig({ scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-black/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                               <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider opacity-40">
                                  <span>Size</span>
                                  <span className="font-mono">{(activeImageConfig.heightRatio * 100).toFixed(0)}%</span>
                               </div>
                               <input type="range" min="0.1" max="0.9" step="0.05" value={activeImageConfig.heightRatio} onChange={(e) => onUpdateImageConfig({ heightRatio: parseFloat(e.target.value) })} className="w-full h-1.5 bg-black/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all" />
                            </div>
                          </div>

                          {/* Remove */}
                          <button onClick={onRemoveImage} className="w-9 h-9 rounded-full hover:bg-red-50 text-black/20 hover:text-red-500 transition-all flex items-center justify-center shrink-0" title="Remove Image">
                             <Trash2 size={16} />
                          </button>
                       </div>
                    </div>
                  )}
               </div>
             ) : (
               <div className="h-[140px] flex flex-col items-center justify-center text-black/25 gap-2">
                  <Pencil size={24} strokeWidth={1.5} />
                  <p className="text-[11px] font-medium">Select a card to start editing</p>
               </div>
             )}
          </div>
        )}

        {/* ═══════ SOURCE TAB ═══════ */}
        {activeTab === 'source' && (
          <div className="p-5 flex flex-col gap-4 animate-in fade-in duration-200">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Title</label>
                  <input type="text" value={config.title} onChange={(e) => updateConfig('title', e.target.value)} className="w-full bg-black/[0.03] px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:bg-white focus:ring-1 focus:ring-black/10 transition-all" placeholder="Untitled" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Author</label>
                  <input type="text" value={config.authorName} onChange={(e) => updateConfig('authorName', e.target.value)} className="w-full bg-black/[0.03] px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:bg-white focus:ring-1 focus:ring-black/10 transition-all" placeholder="Unknown" />
                </div>
             </div>
             <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-0.5">Source Text</label>
                <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Paste your article here..." className="w-full h-28 p-3 bg-black/[0.03] rounded-lg focus:bg-white focus:ring-1 focus:ring-black/10 outline-none text-xs font-mono leading-relaxed resize-none transition-all placeholder:text-black/20 text-black/80" />
             </div>
             <button onClick={onProcess} disabled={!inputText.trim() || isProcessing} className={`h-11 w-full rounded-xl flex items-center justify-center gap-2 transition-all duration-200 font-bold text-[11px] uppercase tracking-widest ${!inputText.trim() ? "bg-black/[0.03] text-black/20 cursor-not-allowed" : "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-md hover:shadow-orange-500/20 active:scale-[0.98]"}`}>
                {isProcessing ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div><span>Processing...</span></>) : (<><Sparkles size={14} /><span>Regenerate Cards</span></>)}
             </button>
          </div>
        )}

      </div>
    </div>
  );
};
