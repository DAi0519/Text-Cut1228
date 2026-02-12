import React, { useState } from 'react';
import { CardConfig, AspectRatio, FontStyle, Preset, Composition, ImageConfig } from '../types';
import { 
  Type, Grid, Crop, Scaling, Layout, 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, RectangleHorizontal, 
  RectangleVertical, ScanLine, ZoomIn, Trash2, X, Check, Pencil, 
  LayoutTemplate, Image as ImageIcon, ArrowDownToLine, Download, Play, Minus, Plus, Settings2,
  Palette, FileText, Sparkles, Move
} from 'lucide-react';

interface ConsoleProps {
  // Global State
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

  // Active Card State
  activeCardIndex: number | null;
  editingIndex: number | null;
  
  // Active Card Actions
  onToggleLayout: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onTriggerImage: () => void;
  onDownload: () => void;
  onToggleHighlight: () => void;
  
  // Active Card Image Config
  activeHasImage: boolean;
  activeImageConfig: ImageConfig | null;
  onUpdateImageConfig: (updates: Partial<ImageConfig>) => void;
  onRemoveImage: () => void;
}

const COLORWAYS: Preset[] = [
  {
    id: 'snow',
    name: 'Snow',
    config: { colorway: 'snow', backgroundColor: '#f4f4f5', textColor: '#18181b', accentColor: '#ea580c' }
  },
  {
    id: 'neon',
    name: 'Neon',
    config: { colorway: 'neon', backgroundColor: '#111111', textColor: '#ffffff', accentColor: '#ccff00' }
  },
];

export const Console: React.FC<ConsoleProps> = ({
  inputText, setInputText, config, setConfig, isProcessing, onProcess, 
  onDownloadAll, hasContent, zoomLevel, setZoomLevel,
  activeCardIndex, editingIndex,
  onToggleLayout, onStartEdit, onSaveEdit, onCancelEdit, onTriggerImage, 
  onDownload, onToggleHighlight,
  activeHasImage, activeImageConfig, onUpdateImageConfig, onRemoveImage
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'source' | 'style'>('editor');

  const updateConfig = (key: keyof CardConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const fontStyles = [
    { value: FontStyle.CHILL, label: 'Chill' },
    { value: FontStyle.OPPO, label: 'OPPO' },
    { value: FontStyle.SWEI, label: 'Swei' },
  ];

  const compositions: { value: Composition, label: string }[] = [
    { value: 'classic', label: 'Classic' },
    { value: 'technical', label: 'Tech' },
  ];

  // Helper for Icon rendering
  const getPositionIcon = (pos: string) => {
    switch (pos) {
      case "top": return <ArrowUp size={14} />;
      case "bottom": return <ArrowDown size={14} />;
      case "left": return <ArrowLeft size={14} />;
      case "right": return <ArrowRight size={14} />;
      default: return <ArrowUp size={14} />;
    }
  };

  const getRatioIcon = (ratio?: string) => {
    switch (ratio) {
      case "1:1": return <Square size={14} />;
      case "4:3":
      case "16:9": return <RectangleHorizontal size={14} />;
      case "3:4": return <RectangleVertical size={14} />;
      default: return <ScanLine size={14} />;
    }
  };

  const cyclePosition = () => {
    if (!activeImageConfig) return;
    const order: ImageConfig["position"][] = ["top", "bottom", "left", "right"];
    const currentIdx = order.indexOf(activeImageConfig.position);
    const nextPos = order[(currentIdx + 1) % order.length];
    onUpdateImageConfig({ position: nextPos });
  };

  const cycleAspectRatio = () => {
    if (!activeImageConfig) return;
    const order: (ImageConfig["aspectRatio"] | undefined)[] = [undefined, "1:1", "4:3", "16:9", "3:4"];
    const currentIdx = order.indexOf(activeImageConfig.aspectRatio);
    onUpdateImageConfig({ aspectRatio: order[(currentIdx + 1) % order.length] });
  };

  const isEditing = activeCardIndex !== null && activeCardIndex === editingIndex;
  const hasActiveCard = activeCardIndex !== null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[640px] bg-white/95 backdrop-blur-xl border border-black/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 transition-all duration-300 ring-1 ring-black/5">
      
      {/* --- TOP BAR: TABS & ACTIONS --- */}
      <div className="h-12 border-b border-black/5 flex items-center justify-between px-2 bg-white/50">
        
        {/* Left: Tabs */}
        <div className="flex items-center gap-1 p-1">
           <button 
             onClick={() => setActiveTab('editor')}
             className={`h-8 px-3 rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'editor' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:bg-black/5 hover:text-black'}`}
           >
             <Pencil size={14} />
             <span>Editor</span>
           </button>
           <button 
             onClick={() => setActiveTab('style')}
             className={`h-8 px-3 rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'style' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:bg-black/5 hover:text-black'}`}
           >
             <Settings2 size={14} />
             <span>Style</span>
           </button>
           <button 
             onClick={() => setActiveTab('source')}
             className={`h-8 px-3 rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'source' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:bg-black/5 hover:text-black'}`}
           >
             <FileText size={14} />
             <span>Source</span>
           </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 pr-2">
           {hasContent && (
              <button
                onClick={onDownloadAll}
                className="h-8 w-8 rounded-lg text-black/40 hover:text-black hover:bg-black/5 transition-colors flex items-center justify-center"
                title="Download All"
              >
                <Download size={16} />
              </button>
           )}
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="p-0 min-h-[240px] max-h-[45vh] overflow-y-auto custom-scrollbar bg-[#fafafa]/50">
        
        {/* TAB 1: EDITOR (Unified & Expanded) */}
        {activeTab === 'editor' && (
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
             {hasActiveCard ? (
               <div className="flex flex-col p-6 gap-6 h-full">
                  
                  {/* --- ROW 1: PRIMARY CONTROLS (Layout & Text) --- */}
                  <div className="grid grid-cols-2 gap-6">
                     
                     {/* Layout Control */}
                     <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 opacity-40">
                           <LayoutTemplate size={12} />
                           <span className="text-[10px] font-bold uppercase tracking-wider">Structure</span>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={onToggleLayout} className="h-10 px-4 bg-white border border-black/5 rounded-lg flex-1 flex items-center justify-center gap-2 hover:border-black/20 hover:shadow-sm transition-all text-black/70">
                              <LayoutTemplate size={14} />
                              <span className="text-[10px] font-bold uppercase">Toggle Layout</span>
                           </button>
                        </div>
                     </div>

                     {/* Text Edit Toggle - Simplified */}
                     <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 opacity-40">
                           <Type size={12} />
                           <span className="text-[10px] font-bold uppercase tracking-wider">Content</span>
                        </div>
                        <div className="flex gap-2 items-center h-10 px-4 bg-white border border-black/5 rounded-lg text-black/40 text-[10px]">
                           <span className="flex-1 font-medium text-black/60">Edit Directly on Card</span>
                           <button 
                              onClick={onToggleHighlight} 
                              className="h-8 w-8 bg-black/5 rounded hover:bg-black/10 hover:text-black transition-all flex items-center justify-center text-black/60" 
                              title="Highlight Selection (Bold)"
                           >
                              <span className="font-serif font-black text-sm">B</span>
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="h-px bg-black/5 w-full"></div>

                  {/* --- ROW 2: IMAGE CONTROLS (Always Visible Area) --- */}
                  <div className="flex flex-col gap-4">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 opacity-40">
                           <ImageIcon size={12} />
                           <span className="text-[10px] font-bold uppercase tracking-wider">Visuals</span>
                        </div>
                        
                        {/* Add/Remove Image Buttons */}
                        <div className="flex gap-2">
                           {activeHasImage && (
                              <button onClick={onRemoveImage} className="h-6 px-2 text-[9px] font-bold uppercase text-red-500 hover:bg-red-50 rounded transition-colors flex items-center gap-1">
                                 <Trash2 size={10} /> Remove
                              </button>
                           )}
                           <button onClick={onTriggerImage} className="h-6 px-3 bg-black text-white rounded-md text-[9px] font-bold uppercase shadow-sm hover:bg-black/80 transition-all flex items-center gap-1">
                              {activeHasImage ? "Replace" : "Add Image"}
                           </button>
                        </div>
                     </div>

                     {/* Expanded Image Controls (Only if image exists) */}
                     {activeHasImage && activeImageConfig ? (
                        <div className="bg-white border border-black/5 rounded-xl p-4 shadow-sm flex flex-col gap-4">
                           
                           {/* Position & Ratio Toggles */}
                           <div className="flex gap-4">
                              <div className="flex-1 flex flex-col gap-1.5">
                                 <label className="text-[9px] font-bold uppercase tracking-wider opacity-40">Position</label>
                                 <div className="flex gap-1 bg-black/5 p-1 rounded-lg">
                                    {['top', 'bottom', 'left', 'right'].map((pos) => (
                                       <button 
                                          key={pos}
                                          onClick={() => onUpdateImageConfig({ position: pos as ImageConfig['position'] })}
                                          className={`flex-1 h-7 rounded flex items-center justify-center transition-all ${activeImageConfig.position === pos ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black'}`}
                                       >
                                          {getPositionIcon(pos)}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                              <div className="flex-1 flex flex-col gap-1.5">
                                 <label className="text-[9px] font-bold uppercase tracking-wider opacity-40">Ratio</label>
                                 <div className="flex gap-1 bg-black/5 p-1 rounded-lg">
                                    {[undefined, '1:1', '4:3', '16:9'].map((r, i) => (
                                       <button 
                                          key={i}
                                          onClick={() => onUpdateImageConfig({ aspectRatio: r as ImageConfig['aspectRatio'] })}
                                          className={`flex-1 h-7 rounded flex items-center justify-center transition-all ${activeImageConfig.aspectRatio === r ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black'}`}
                                       >
                                          {r ? getRatioIcon(r) : <ScanLine size={12} />}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                           </div>

                           {/* Sliders */}
                           <div className="grid grid-cols-2 gap-6 pt-2 border-t border-black/5">
                              <div className="space-y-2">
                                 <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider opacity-40">
                                    <span className="flex items-center gap-1"><ZoomIn size={10} /> Zoom</span>
                                    <span>{activeImageConfig.scale.toFixed(1)}x</span>
                                 </div>
                                 <input 
                                    type="range" min="0.2" max="3" step="0.1" 
                                    value={activeImageConfig.scale}
                                    onChange={(e) => onUpdateImageConfig({ scale: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-black/5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                                 />
                              </div>
                              <div className="space-y-2">
                                 <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider opacity-40">
                                    <span className="flex items-center gap-1"><Scaling size={10} /> Size</span>
                                    <span>{(activeImageConfig.heightRatio * 100).toFixed(0)}%</span>
                                 </div>
                                 <input 
                                    type="range" min="0.1" max="0.9" step="0.05"
                                    value={activeImageConfig.heightRatio}
                                    onChange={(e) => onUpdateImageConfig({ heightRatio: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-black/5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                                 />
                              </div>
                           </div>
                           
                           <div className="text-[9px] text-black/30 text-center flex items-center justify-center gap-1.5 pt-1">
                              <Move size={10} />
                              <span>Drag image to reposition</span>
                           </div>

                        </div>
                     ) : (
                        <div 
                           onClick={onTriggerImage}
                           className="border-2 border-dashed border-black/5 rounded-xl h-20 flex flex-col items-center justify-center gap-2 text-black/30 hover:border-black/20 hover:text-black/60 hover:bg-black/[0.02] transition-all cursor-pointer"
                        >
                           <ImageIcon size={20} />
                           <span className="text-[10px] font-bold uppercase tracking-wide">No image selected</span>
                        </div>
                     )}
                  </div>

               </div>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-black/30 gap-3 pb-8">
                  <LayoutTemplate size={32} strokeWidth={1} />
                  <p className="text-xs font-medium uppercase tracking-widest">Select a card to start editing</p>
               </div>
             )}
          </div>
        )}

        {/* TAB 2: STYLE CONTROLS */}
        {activeTab === 'style' && (
          <div className="p-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             
             {/* Row 1: The Big Three (Layout, Color, Type) */}
             <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {/* Layout */}
                <div className="flex flex-col gap-2 shrink-0">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Theme</label>
                   <div className="flex bg-white border border-black/5 p-1 rounded-lg gap-1 shadow-sm">
                      {compositions.map(comp => (
                        <button key={comp.value} onClick={() => updateConfig('composition', comp.value)} className={`h-8 px-3 rounded-md flex items-center justify-center transition-all ${config.composition === comp.value ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black hover:bg-black/5'}`}>
                           <span className="text-[10px] font-bold uppercase tracking-widest">{comp.label}</span>
                        </button>
                      ))}
                   </div>
                </div>

                {/* Color */}
                <div className="flex flex-col gap-2 shrink-0">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Palette</label>
                   <div className="flex items-center gap-2">
                      <div className="flex bg-white border border-black/5 p-1 rounded-lg gap-1 shadow-sm">
                        {COLORWAYS.map(c => (
                          <button key={c.id} onClick={() => setConfig(prev => ({...prev, ...c.config}))} className={`h-8 w-8 rounded-md flex items-center justify-center transition-all ${config.colorway === c.id ? 'bg-black/5 ring-1 ring-black/10' : 'hover:bg-black/5'}`} title={c.name}>
                             <div className={`w-3 h-3 rounded-full border ${config.colorway === c.id ? 'border-black/10' : 'border-black/20'}`} style={{ backgroundColor: c.id === 'neon' && config.colorway === c.id ? c.config.accentColor : c.config.backgroundColor }}></div>
                          </button>
                        ))}
                      </div>
                      <div className="h-10 w-px bg-black/5 mx-1"></div>
                      <div className="flex items-center gap-2 bg-white border border-black/5 rounded-lg px-2 h-10 hover:border-black/20 transition-colors focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/5 shadow-sm">
                        <div className="w-3 h-3 rounded-full shadow-sm shrink-0 border border-black/10" style={{ backgroundColor: config.accentColor }}></div>
                        <input type="text" value={config.accentColor.replace('#', '')} onChange={(e) => { if (/^[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateConfig('accentColor', '#' + e.target.value); }} className="bg-transparent text-[10px] font-mono font-bold uppercase w-12 outline-none text-black/80" placeholder="HEX" maxLength={6} />
                      </div>
                   </div>
                </div>

                {/* Typography */}
                <div className="flex flex-col gap-2 shrink-0">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Font</label>
                   <div className="flex bg-white border border-black/5 p-1 rounded-lg gap-1 shadow-sm">
                      {fontStyles.map(style => (
                        <button key={style.value} onClick={() => updateConfig('fontStyle', style.value)} className={`h-8 px-3 rounded-md flex items-center justify-center transition-all ${config.fontStyle === style.value ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black hover:bg-black/5'}`}>
                           <span className="text-[10px] font-bold uppercase tracking-wide">{style.label}</span>
                        </button>
                      ))}
                   </div>
                </div>
             </div>

             <div className="h-px bg-black/5 w-full"></div>

             {/* Row 2: Format & Scale */}
             <div className="flex items-end justify-between gap-6">
                <div className="flex flex-col gap-2 flex-1">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Aspect Ratio</label>
                   <div className="flex bg-white border border-black/5 p-1 rounded-lg gap-1 w-full shadow-sm">
                     {Object.values(AspectRatio).map(ratio => (
                       <button key={ratio} onClick={() => updateConfig('aspectRatio', ratio)} className={`flex-1 h-8 rounded-md text-[10px] font-mono transition-all flex items-center justify-center ${config.aspectRatio === ratio ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black hover:bg-black/5'}`}>
                         {ratio}
                       </button>
                     ))}
                   </div>
                </div>

                <div className="flex flex-col gap-2 w-1/3">
                   <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1 flex justify-between">
                      <span>Scale</span>
                      <span className="font-mono opacity-100">{config.fontSize.toFixed(1)}</span>
                   </label>
                   <div className="h-10 flex items-center px-1">
                      <input 
                        type="range" min="0.7" max="1.5" step="0.05"
                        value={config.fontSize}
                        onChange={(e) => updateConfig('fontSize', parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-black/5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/10 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                      />
                   </div>
                </div>
             </div>

          </div>
        )}

        {/* TAB 3: SOURCE & REGENERATE */}
        {activeTab === 'source' && (
          <div className="p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
             
             {/* Metadata Input */}
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Project Title</label>
                  <input type="text" value={config.title} onChange={(e) => updateConfig('title', e.target.value)} className="w-full bg-white border border-black/10 px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:border-black/30 transition-colors shadow-sm" placeholder="Untitled" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Author</label>
                  <input type="text" value={config.authorName} onChange={(e) => updateConfig('authorName', e.target.value)} className="w-full bg-white border border-black/10 px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:border-black/30 transition-colors shadow-sm" placeholder="Unknown" />
                </div>
             </div>

             {/* Source Text */}
             <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider opacity-40 pl-1">Source Text</label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your article here..."
                  className="w-full h-32 p-3 bg-white border border-black/10 rounded-lg focus:border-black/30 outline-none text-xs font-mono leading-relaxed resize-none transition-all placeholder:text-black/20 text-black/80 shadow-inner"
                />
             </div>

             {/* Big Rerun Button */}
             <button
                onClick={onProcess}
                disabled={!inputText.trim() || isProcessing}
                className={`
                    h-12 w-full rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-md font-bold text-xs uppercase tracking-widest
                    ${!inputText.trim() ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none" : "bg-[#ea580c] hover:bg-[#c2410c] text-white hover:shadow-orange-500/20 active:scale-[0.98]"}
                `}
             >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Regenerate Cards</span>
                  </>
                )}
             </button>
          </div>
        )}

      </div>
    </div>
  );
};
