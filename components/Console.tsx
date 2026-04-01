import React, { useState, useEffect, useRef } from 'react';
import { CardConfig, AspectRatio, FontStyle, Preset, Composition, ImageConfig, ImageAspectRatio, BackgroundStyle } from '../types';
import { 
  Pencil, 
  LayoutTemplate, Image as ImageIcon, ArrowDownToLine, Download,
  Sparkles, ChevronDown, Layers, CircleUserRound
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
  onTriggerAvatarUpload: () => void;
  onDownload: () => void;
  onToggleHighlight: () => void;
  
  activeHasImage: boolean;
  activeImageConfig: ImageConfig | null;
  onUpdateImageConfig: (updates: Partial<ImageConfig>) => void;
  onSelectFrameSize: (ratio?: ImageAspectRatio) => void;
  onRemoveImage: () => void;
  onDeleteCard: () => void;
  activeCardCanDelete: boolean;
  capacityFeedback?: string | null;
  onHeightChange?: (height: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onActiveTabChange?: (tab: TabId) => void;
}

const COLORWAYS: Preset[] = [
  { id: 'snow', name: 'Snow', config: { colorway: 'snow', backgroundColor: '#f4f4f5', textColor: '#18181b' } },
  { id: 'neon', name: 'Neon', config: { colorway: 'neon', backgroundColor: '#111111', textColor: '#ffffff' } },
];

const ACCENT_COLORS = [
  { id: 'poster-orange', hex: '#ea580c' },
  { id: 'poster-purple', hex: '#8b579c' },
  { id: 'poster-red', hex: '#f02d1a' },
  { id: 'poster-green', hex: '#b8ff12' },
  { id: 'poster-pink', hex: '#f5a3b7' },
  { id: 'poster-blue', hex: '#4a67b5' },
];

type TabId = 'style' | 'editor' | 'source';

export type ConsoleTabId = TabId;

export const Console: React.FC<ConsoleProps> = ({
  inputText, setInputText, config, setConfig, isProcessing, onProcess, 
  onDownloadAll, hasContent, zoomLevel, setZoomLevel,
  activeCardIndex, editingIndex,
  onToggleLayout, onStartEdit, onSaveEdit, onCancelEdit, onTriggerImage,
  onTriggerAvatarUpload, onDownload, onToggleHighlight,
  activeHasImage, activeImageConfig, onUpdateImageConfig, onSelectFrameSize, onRemoveImage, onDeleteCard, activeCardCanDelete,
  capacityFeedback,
  onHeightChange,
  isCollapsed = false,
  onToggleCollapse,
  onActiveTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('style');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFrameSizeMenu, setShowFrameSizeMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const showExportMenuRef = useRef(showExportMenu);
  const frameSizeMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | 'auto'>('auto');

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
      if (frameSizeMenuRef.current && !frameSizeMenuRef.current.contains(event.target as Node)) {
        setShowFrameSizeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Observe inner content height to explicitly set root height for smooth CSS transitions
  useEffect(() => {
    if (isCollapsed) {
      setPanelHeight('auto');
      return;
    }
    const el = contentRef.current;
    if (!el) return;
    
    // We observe the inner unconstrained content wrapper
    const ro = new ResizeObserver(() => {
      // 50px is the height of the TOP BAR
      // Math.ceil prevents fractional pixel jitter
      setPanelHeight(Math.ceil(el.getBoundingClientRect().height) + 50);
    });
    
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCollapsed, activeTab]);

  useEffect(() => {
    if (activeTab !== 'editor' || !activeHasImage) {
      setShowFrameSizeMenu(false);
    }
  }, [activeTab, activeHasImage, activeCardIndex]);

  useEffect(() => {
    if (isCollapsed) {
      setShowExportMenu(false);
      setShowFrameSizeMenu(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

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
  }, [activeTab, activeCardIndex, editingIndex, onSaveEdit, onStartEdit]);

  // --- Auto edit when switching cards while in Editor tab ---
  const prevCardRef = useRef(activeCardIndex);
  useEffect(() => {
    const prevCard = prevCardRef.current;
    prevCardRef.current = activeCardIndex;
    if (activeTab === 'editor' && activeCardIndex !== null && activeCardIndex !== prevCard) {
      onStartEdit();
    }
  }, [activeCardIndex, activeTab, onStartEdit]);

  const fontStyles = [
    { value: FontStyle.CHILL, label: 'Chill' },
    { value: FontStyle.OPPO, label: 'OPPO' },
    { value: FontStyle.SWEI, label: 'Swei' },
  ];

  const compositions: { value: Composition, label: string }[] = [
    { value: 'classic', label: 'Classic' },
    { value: 'technical', label: 'Tech' },
    { value: 'editorial', label: 'Edito' },
  ];
  const backgroundStyles: { value: BackgroundStyle; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'grid', label: 'Grid' },
  ];

  const positionLabels: Record<string, string> = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };
  const positionOptions: ImageConfig["position"][] = ["top", "bottom", "left", "right"];

  const frameSizeOptions: Array<{ label: string; value?: ImageAspectRatio }> = [
    { label: "Orig" },
    { label: "1:1", value: "1:1" },
    { label: "4:3", value: "4:3" },
    { label: "16:9", value: "16:9" },
    { label: "3:4", value: "3:4" },
    { label: "21:9", value: "21:9" },
    { label: "9:21", value: "9:21" },
    { label: "9:16", value: "9:16" },
  ];

  const hasActiveCard = activeCardIndex !== null;
  const activeFrameSizeLabel = activeImageConfig?.aspectRatio || "Orig";
  const blockClass = "flex flex-col gap-3.5 border-t border-black/[0.06] pt-5 pb-4 first:border-t-0 first:pt-2 first:pb-4";
  const sectionLabelClass = "text-[9px] font-bold uppercase tracking-[0.14em] text-black/85";
  const sliderClass =
    "w-full h-1.5 bg-black/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all";
  const chipClass =
    "min-h-[34px] rounded-[11px] border border-black/10 bg-white px-3 text-[9px] font-bold uppercase tracking-[0.08em] text-black/70 transition-colors hover:border-black/15 hover:text-black";
  const activeChipClass = "border-[#ea580c]/50 bg-[#fff7ed] text-black/80";
  const rootClass = `fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[640px] bg-white/95 backdrop-blur-xl border border-black/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 ring-1 ring-black/5 transition-[max-height,height] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
    isCollapsed
      ? "h-[58px] min-h-0 max-h-[58px]"
      : "min-h-[236px] max-h-[392px]"
  }`;

  return (
    <div 
      ref={containerRef} 
      className={rootClass}
      style={!isCollapsed && panelHeight !== 'auto' ? { height: `${panelHeight}px` } : undefined}
    >
      
      {/* --- TOP BAR --- */}
      <div className={`min-h-[50px] bg-white/75 px-3 flex items-center justify-between ${isCollapsed ? "" : "border-b border-black/5"}`}>
        <div className="flex items-center gap-4 h-full">
           {(['style', 'editor', 'source'] as TabId[]).map(tab => (
             <button 
               key={tab}
               onClick={() => setActiveTab(tab)}
               className={`relative min-h-[50px] bg-transparent px-0 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors after:absolute after:left-0 after:right-0 after:h-0.5 after:rounded-full after:transition-colors ${
                 activeTab === tab
                   ? 'text-black/80 after:bottom-[8px] after:bg-[#ea580c]'
                   : 'text-black/40 after:bottom-[8px] after:bg-transparent hover:text-black/70'
               }`}
             >
               <span>{tab === 'style' ? 'Style' : tab === 'editor' ? 'Edit' : 'Source'}</span>
             </button>
           ))}
        </div>
        <div className="flex items-center gap-1.5">
           {onToggleCollapse && (
             <button
               onClick={onToggleCollapse}
               className="h-8 px-2 rounded-lg transition-colors inline-flex items-center gap-1.5 justify-center text-black/40 hover:bg-black/[0.04] hover:text-black/70"
               aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
               title={isCollapsed ? "Expand panel" : "Collapse panel"}
             >
               <ChevronDown
                 size={14}
                 className={`transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
               />
               <span className="text-[9px] font-bold uppercase tracking-[0.14em] hidden sm:inline">
                 {isCollapsed ? 'Expand' : 'Collapse'}
               </span>
             </button>
           )}
           {hasContent && isCollapsed ? (
             <div className="flex items-center gap-1">
               <button
                 onClick={onDownload}
                 className="h-8 px-2 rounded-lg transition-colors inline-flex items-center gap-1.5 justify-center text-black/40 hover:bg-black/[0.04] hover:text-black/70"
                 aria-label="Export current card"
                 title="Export current card"
               >
                 <ArrowDownToLine size={14} />
                 <span className="text-[9px] font-bold uppercase tracking-[0.14em] hidden sm:inline">
                   Card
                 </span>
               </button>
               <button
                 onClick={onDownloadAll}
                 className="h-8 px-2 rounded-lg transition-colors inline-flex items-center gap-1.5 justify-center text-black/40 hover:bg-black/[0.04] hover:text-black/70"
                 aria-label="Export all cards"
                 title="Export all cards"
               >
                 <Layers size={14} />
                 <span className="text-[9px] font-bold uppercase tracking-[0.14em] hidden sm:inline">
                   All
                 </span>
               </button>
             </div>
           ) : hasContent ? (
             <div className="relative" ref={exportMenuRef}>
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)} 
                  className={`h-8 px-3 rounded-lg transition-colors inline-flex items-center gap-1.5 justify-center border ${
                    showExportMenu
                      ? 'border-black/10 bg-white text-black/80'
                      : 'border-transparent text-black/40 hover:bg-black/[0.04] hover:text-black/70'
                  }`}
                >
                  <Download size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] hidden sm:inline">Export</span>
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
           ) : null}
        </div>
      </div>

      {/* --- CONTENT --- */}
      {!isCollapsed && (
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div ref={contentRef} className="flex flex-col">
          {capacityFeedback && (
            <div className="px-5 py-2 border-b border-black/5 bg-[#fff7ed] text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a3412]">
              {capacityFeedback}
            </div>
          )}
          
          {/* ═══════ STYLE TAB ═══════ */}
          {activeTab === 'style' && (
            <div className="p-5">
               <div className={blockClass}>
                 <div className={sectionLabelClass}>Theme</div>
                 <div className="flex flex-wrap gap-2">
                   {compositions.map((comp) => (
                     <button
                       key={comp.value}
                       onClick={() => updateConfig('composition', comp.value)}
                       className={`${chipClass} ${config.composition === comp.value ? activeChipClass : ''}`}
                     >
                       {comp.label}
                     </button>
                   ))}
                 </div>
               </div>

               <div className={blockClass}>
                 <div className={sectionLabelClass}>Colorway</div>
                 <div className="flex flex-wrap gap-2">
                   {COLORWAYS.map((c) => (
                     <button
                       key={c.id}
                       onClick={() => setConfig(prev => ({...prev, ...c.config}))}
                       className={`${chipClass} ${config.colorway === c.id ? activeChipClass : ''}`}
                     >
                       {c.name}
                     </button>
                   ))}
                 </div>
               </div>

               {config.composition === 'editorial' && (
                 <div className={blockClass}>
                   <div className={sectionLabelClass}>Background</div>
                   <div className="flex flex-wrap gap-2">
                     {backgroundStyles.map((background) => (
                       <button
                         key={background.value}
                         onClick={() => updateConfig('backgroundStyle', background.value)}
                         className={`${chipClass} ${config.backgroundStyle === background.value ? activeChipClass : ''}`}
                       >
                         {background.label}
                       </button>
                     ))}
                   </div>
                 </div>
               )}

               <div className={blockClass}>
                 <div className={sectionLabelClass}>Accent</div>
                 <div className="flex flex-wrap items-center gap-2">
                   <button
                     onClick={() => updateConfig('accentColor', '#111111')}
                     className="h-[19px] w-[19px] rounded-full border border-black/10"
                     style={{ backgroundColor: '#111111' }}
                     aria-label="Accent #111111"
                   />
                   {ACCENT_COLORS.map((color) => (
                     <button
                       key={color.id}
                       onClick={() => updateConfig('accentColor', color.hex)}
                       className="h-[19px] w-[19px] rounded-full border border-black/10"
                       style={{ backgroundColor: color.hex }}
                       aria-label={`Accent ${color.hex}`}
                     />
                   ))}
                   <div className="inline-flex h-[34px] min-w-[118px] items-center justify-between gap-2 rounded-[11px] border border-black/10 bg-white px-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-black/80">
                     <span className="text-black/35">HEX</span>
                     <input
                       type="text"
                       value={config.accentColor}
                       onChange={(e) => {
                         if (/^#?[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                           const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                           updateConfig('accentColor', next);
                         }
                       }}
                       className="w-[72px] bg-transparent text-right outline-none"
                       maxLength={7}
                     />
                   </div>
                 </div>
               </div>

               <div className={blockClass}>
                 <div className="grid grid-cols-2 gap-10 py-1">
                  <div className="flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/80">Card Size</label>
                        <span className="text-[9px] font-mono text-black/45">{Math.round(config.cardScale * 100)}%</span>
                     </div>
                     <input
                       type="range"
                       min="0.9"
                       max="1.5"
                       step="0.05"
                       value={config.cardScale}
                       onChange={(e) => updateConfig('cardScale', parseFloat(e.target.value))}
                       className={sliderClass}
                     />
                  </div>
                  <div className="flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/80">Type Scale</label>
                        <span className="text-[9px] font-mono text-black/45">{config.fontSize.toFixed(2)}</span>
                     </div>
                     <input
                       type="range"
                       min="0.7"
                       max="1.5"
                       step="0.05"
                       value={config.fontSize}
                       onChange={(e) => updateConfig('fontSize', parseFloat(e.target.value))}
                       className={sliderClass}
                     />
                  </div>
                 </div>
               </div>

               <div className={blockClass}>
                 <div className={sectionLabelClass}>Ratio</div>
                 <div className="flex flex-wrap gap-2">
                   {Object.values(AspectRatio).map((ratio) => (
                     <button
                       key={ratio}
                       onClick={() => updateConfig('aspectRatio', ratio)}
                       className={`${chipClass} ${config.aspectRatio === ratio ? activeChipClass : ''}`}
                     >
                       {ratio}
                     </button>
                   ))}
                 </div>
               </div>

               <div className={blockClass}>
                 <div className={sectionLabelClass}>Font</div>
                 <div className="flex flex-wrap gap-2">
                   {fontStyles.map((style) => (
                     <button
                       key={style.value}
                       onClick={() => updateConfig('fontStyle', style.value)}
                       className={`${chipClass} ${config.fontStyle === style.value ? activeChipClass : ''}`}
                     >
                       {style.label}
                     </button>
                   ))}
                 </div>
               </div>

               {config.composition === 'editorial' && (
                 <div className={blockClass}>
                   <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                        <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/50">Title Scale</label>
                        <span className="text-[9px] font-mono text-black/45">{(config.editorialTitleScale || 1).toFixed(2)}×</span>
                     </div>
                     <input
                       type="range"
                       min="0.6"
                       max="1.6"
                       step="0.05"
                       value={config.editorialTitleScale || 1}
                       onChange={(e) => updateConfig('editorialTitleScale', parseFloat(e.target.value))}
                       className={sliderClass}
                     />
                   </div>
                 </div>
               )}
            </div>
          )}

          {/* ═══════ EDITOR TAB ═══════ */}
          {activeTab === 'editor' && (
            <div>
               {hasActiveCard ? (
                 <div className="p-5 flex flex-col gap-5">
                    <div className="grid grid-cols-2 gap-2">
                       <button
                         onClick={onToggleLayout}
                         className="min-h-[34px] min-w-0 rounded-[11px] border border-black/10 bg-white px-3 text-[9px] font-bold uppercase tracking-[0.08em] text-black/70 transition-colors hover:border-black/15 hover:text-black flex items-center justify-center gap-2"
                       >
                          <LayoutTemplate size={15} />
                          <span className="truncate">Switch Layout</span>
                       </button>

                       <button
                         onMouseDown={(e) => e.preventDefault()}
                         onClick={onToggleHighlight}
                         className="min-h-[34px] min-w-0 rounded-[11px] border border-black/10 bg-white px-3 text-[9px] font-bold uppercase tracking-[0.08em] text-black/70 transition-colors hover:border-black/15 hover:text-black flex items-center justify-center gap-2"
                       >
                          <span className="font-serif text-sm font-black">B</span>
                          <span className="truncate">Bold Text</span>
                       </button>

                       <button
                         onClick={onTriggerImage}
                         className={`min-h-[34px] min-w-0 rounded-[11px] border px-3 text-[9px] font-bold uppercase tracking-[0.08em] transition-colors flex items-center justify-center gap-2 ${
                           activeHasImage
                             ? "border-[#ea580c]/50 bg-[#fff7ed] text-black/80"
                             : "border-black/10 bg-white text-black/70 hover:border-black/15 hover:text-black"
                         }`}
                       >
                          <ImageIcon size={15} />
                          <span className="truncate">
                            {activeHasImage ? "Replace Image" : "Add Image"}
                          </span>
                       </button>

                       <button
                         onClick={onTriggerAvatarUpload}
                         className="min-h-[34px] min-w-0 rounded-[11px] border border-black/10 bg-white px-3 text-[9px] font-bold uppercase tracking-[0.08em] text-black/70 transition-colors hover:border-black/15 hover:text-black flex items-center justify-center gap-2"
                       >
                          <CircleUserRound size={15} />
                          <span className="truncate">
                            {config.authorAvatar ? "Replace Avatar" : "Upload Avatar"}
                          </span>
                       </button>
                    </div>

                    {activeHasImage && activeImageConfig && (
                      <div className="flex flex-col gap-6 border-t border-black/5 pt-6">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/80">
                              Zoom
                            </span>
                            <span className="text-[9px] font-mono text-black/45">
                              {activeImageConfig.scale.toFixed(1)}x
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.2"
                            max="3"
                            step="0.1"
                            value={activeImageConfig.scale}
                            onChange={(e) =>
                              onUpdateImageConfig({ scale: parseFloat(e.target.value) })
                            }
                            className={sliderClass}
                          />
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/50">
                            Position
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {positionOptions.map((position) => {
                              const isActive = activeImageConfig.position === position;
                              return (
                                <button
                                  key={position}
                                  onClick={() => onUpdateImageConfig({ position })}
                                  className={`min-h-[34px] rounded-[11px] border text-[9px] font-bold uppercase tracking-[0.08em] transition-colors ${
                                    isActive
                                      ? "border-[#ea580c]/50 bg-[#fff7ed] text-black/80"
                                      : "border-black/10 bg-white text-black/65 hover:border-black/15 hover:text-black"
                                  }`}
                                  title={positionLabels[position]}
                                  aria-label={`Position ${positionLabels[position]}`}
                                >
                                  {positionLabels[position]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/50">
                              Frame Size
                            </span>
                            <div ref={frameSizeMenuRef} className="relative flex items-center justify-end">
                              <button
                                onClick={() => setShowFrameSizeMenu((prev) => !prev)}
                                className="min-h-[34px] min-w-[88px] rounded-[11px] border border-black/10 bg-white px-3 text-[9px] font-bold uppercase tracking-[0.08em] text-black/75 transition-colors hover:border-black/15 hover:text-black inline-flex items-center justify-between gap-2"
                                aria-label="Choose frame size"
                              >
                                <span>{activeFrameSizeLabel}</span>
                                <ChevronDown
                                  size={10}
                                  className={`text-black/40 transition-transform duration-150 ${showFrameSizeMenu ? "rotate-180" : ""}`}
                                />
                              </button>

                              {showFrameSizeMenu && (
                                <div className="absolute right-0 top-full z-40 mt-2 w-[220px] rounded-2xl border border-black/10 bg-white p-2 shadow-xl ring-1 ring-black/5">
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {frameSizeOptions.map((option) => {
                                      const isActive =
                                        (option.value ?? undefined) ===
                                        (activeImageConfig.aspectRatio ?? undefined);

                                      return (
                                        <button
                                          key={option.label}
                                          onClick={() => {
                                            onSelectFrameSize(option.value);
                                            setShowFrameSizeMenu(false);
                                          }}
                                          className={`min-h-[34px] rounded-[11px] border text-[9px] font-bold uppercase tracking-[0.08em] transition-colors ${
                                            isActive
                                              ? "border-[#ea580c]/50 bg-[#fff7ed] text-black/80"
                                              : "border-black/10 bg-white text-black/65 hover:border-black/15 hover:text-black"
                                          }`}
                                        >
                                          {option.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={onRemoveImage}
                          className="min-h-[34px] rounded-[11px] border border-red-200 bg-red-50/60 text-[9px] font-bold uppercase tracking-[0.08em] text-red-500/80 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove Image"
                        >
                          Remove Image
                        </button>
                      </div>
                    )}

                    {activeCardCanDelete && (
                      <button
                        onClick={onDeleteCard}
                        className="min-h-[36px] rounded-[11px] border border-red-200 bg-red-50/60 px-3 text-[9px] font-bold uppercase tracking-[0.08em] text-red-500/85 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center gap-2"
                        aria-label="Delete Card"
                      >
                        <span>Delete Card</span>
                      </button>
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
            <div className="p-5">
               <div className={blockClass}>
                 <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/85">Title</label>
                    <input type="text" value={config.title} onChange={(e) => updateConfig('title', e.target.value)} className="h-[42px] rounded-[11px] border border-black/10 bg-white px-3 text-sm text-black/80 outline-none" placeholder="Untitled" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/85">Author</label>
                    <input type="text" value={config.authorName} onChange={(e) => updateConfig('authorName', e.target.value)} className="h-[42px] rounded-[11px] border border-black/10 bg-white px-3 text-sm text-black/80 outline-none" placeholder="Unknown" />
                  </div>
                 </div>
               </div>

               <div className={blockClass}>
                 <div className={sectionLabelClass}>Source Text</div>
                 <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Paste your article here..." className="h-28 rounded-[13px] border border-black/10 bg-white p-3 font-mono text-sm leading-relaxed text-black/75 outline-none resize-none" />
               </div>

               <div className={blockClass}>
                 <button onClick={onProcess} disabled={!inputText.trim() || isProcessing} className={`h-[42px] w-full rounded-[13px] flex items-center justify-center gap-2 font-bold text-[9px] uppercase tracking-[0.12em] transition-colors ${!inputText.trim() ? "bg-black/[0.03] text-black/20 cursor-not-allowed" : "bg-[#ea580c] hover:bg-[#c2410c] text-white"}`}>
                    {isProcessing ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div><span>Processing</span></>) : (<><Sparkles size={14} /><span>Regenerate Cards</span></>)}
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
