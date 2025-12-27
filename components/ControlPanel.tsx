import React, { useState } from 'react';
import { CardConfig, AspectRatio, FontStyle, Preset, Composition } from '../types';
import { AlignLeft, Type, Grid, Crop, Scaling, SlidersHorizontal, FileText, Layout } from 'lucide-react';

interface ControlPanelProps {
  inputText: string;
  setInputText: (text: string) => void;
  config: CardConfig;
  setConfig: React.Dispatch<React.SetStateAction<CardConfig>>;
  isVisible: boolean;
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
  {
    id: 'carbon',
    name: 'Carbon',
    config: { colorway: 'carbon', backgroundColor: '#18181b', textColor: '#e4e4e7', accentColor: '#ea580c' }
  }
];

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
  inputText, 
  setInputText, 
  config, 
  setConfig,
  isVisible
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'style'>('text');

  const updateConfig = (key: keyof CardConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const fontStyles = [
    { value: FontStyle.SANS, label: 'Sans' },
    { value: FontStyle.SERIF, label: 'Serif' },
    { value: FontStyle.MING_LIGHT, label: 'Ming' },
    { value: FontStyle.MONO, label: 'Mono' },
  ];

  const compositions: { value: Composition, label: string }[] = [
    { value: 'classic', label: 'Classic' },
    { value: 'swiss', label: 'Swiss' },
    { value: 'technical', label: 'Technical' },
    { value: 'zen', label: 'Zen' },
    { value: 'neo', label: 'Neo' },
  ];

  return (
    <div 
      className={`
        absolute bottom-[calc(100%+24px)] left-1/2 -translate-x-1/2 
        w-[90vw] max-w-[540px] h-[520px] max-h-[65vh]
        bg-white border border-black/10 rounded-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.1)]
        flex flex-col overflow-hidden transition-all duration-500 cubic-bezier(0.23, 1, 0.32, 1) origin-bottom
        ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8 pointer-events-none'}
      `}
    >
      {/* --- Tab Header --- */}
      <div className="flex shrink-0 border-b border-black/5 bg-white p-2 gap-2">
        <button 
          onClick={() => setActiveTab('text')}
          className={`flex-1 h-10 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${activeTab === 'text' ? 'bg-black text-white shadow-md' : 'text-black/40 hover:text-black hover:bg-black/5'}`}
        >
          <FileText size={14} />
          <span>Source</span>
        </button>
        <button 
          onClick={() => setActiveTab('style')}
          className={`flex-1 h-10 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${activeTab === 'style' ? 'bg-black text-white shadow-md' : 'text-black/40 hover:text-black hover:bg-black/5'}`}
        >
          <SlidersHorizontal size={14} />
          <span>System</span>
        </button>
      </div>

      {/* --- Content Area --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
        
        {/* TEXT TAB */}
        {activeTab === 'text' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {/* Textarea */}
             <div className="space-y-2">
                <div className="flex items-center gap-2 opacity-40">
                  <AlignLeft size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Raw Content</span>
                </div>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your article here..."
                  className="w-full h-48 p-4 bg-[#fafafa] border border-black/5 rounded-lg focus:border-black/20 focus:bg-white focus:ring-0 outline-none text-xs font-mono leading-relaxed resize-none transition-all placeholder:text-black/20 text-black/80 shadow-inner"
                />
             </div>

             {/* Metadata Fields */}
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-40 block">Project Title</label>
                  <input 
                    type="text" 
                    value={config.title}
                    onChange={(e) => updateConfig('title', e.target.value)}
                    className="w-full bg-[#fafafa] border border-black/5 px-3 py-2.5 rounded text-sm font-medium focus:outline-none focus:border-black/20 focus:bg-white transition-colors placeholder:text-black/10"
                    placeholder="Untitled"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-40 block">Author</label>
                  <input 
                    type="text" 
                    value={config.authorName}
                    onChange={(e) => updateConfig('authorName', e.target.value)}
                    className="w-full bg-[#fafafa] border border-black/5 px-3 py-2.5 rounded text-sm font-medium focus:outline-none focus:border-black/20 focus:bg-white transition-colors placeholder:text-black/10"
                    placeholder="Unknown"
                  />
                </div>
             </div>
          </div>
        )}

        {/* STYLE TAB */}
        {activeTab === 'style' && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Colorways */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 opacity-40">
                 <Grid size={12} />
                 <span className="text-[10px] font-bold uppercase tracking-wider">Color System</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {COLORWAYS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setConfig(prev => ({...prev, ...c.config}))}
                    className={`
                      h-16 border rounded-lg flex flex-col items-center justify-center gap-2 transition-all group relative overflow-hidden
                      ${config.colorway === c.id 
                        ? 'border-black bg-white shadow-md ring-1 ring-black/5' 
                        : 'border-black/5 bg-[#fafafa] hover:bg-white hover:border-black/20'}
                    `}
                  >
                    <div className="w-4 h-4 rounded-full border border-black/10 shadow-sm z-10" style={{ backgroundColor: c.config.backgroundColor }}></div>
                    <span className="text-[9px] uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100 z-10">{c.name}</span>
                    
                    {/* Active Corner Marker */}
                    {config.colorway === c.id && (
                       <div className="absolute top-0 right-0 w-3 h-3 bg-black">
                          <div className="absolute bottom-0 left-0 w-[150%] h-[150%] bg-white -rotate-45 transform origin-bottom-left"></div>
                       </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-black/5 w-full"></div>

             {/* Composition */}
             <div className="space-y-3">
              <div className="flex items-center gap-2 opacity-40">
                 <Layout size={12} />
                 <span className="text-[10px] font-bold uppercase tracking-wider">Layout Theme</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {compositions.map(comp => (
                  <button
                   key={comp.value}
                   onClick={() => updateConfig('composition', comp.value)}
                   className={`
                     h-12 border rounded flex items-center justify-center transition-all
                     ${config.composition === comp.value 
                       ? 'bg-black text-white border-black shadow-lg' 
                       : 'bg-[#fafafa] border-black/5 text-black/60 hover:border-black/20 hover:bg-white'}
                   `}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest">{comp.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 opacity-40">
                 <Type size={12} />
                 <span className="text-[10px] font-bold uppercase tracking-wider">Typeface</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {fontStyles.map(style => (
                  <button
                   key={style.value}
                   onClick={() => updateConfig('fontStyle', style.value)}
                   className={`
                     h-12 border rounded flex items-center justify-center transition-all
                     ${config.fontStyle === style.value 
                       ? 'bg-black text-white border-black shadow-lg' 
                       : 'bg-[#fafafa] border-black/5 text-black/60 hover:border-black/20 hover:bg-white'}
                   `}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest">{style.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Controls Row */}
            <div className="grid grid-cols-2 gap-6">
               {/* Aspect Ratio */}
               <div className="space-y-3">
                 <div className="flex items-center gap-2 opacity-40">
                    <Crop size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Format</span>
                 </div>
                 <div className="flex rounded overflow-hidden border border-black/5 h-[34px] items-center bg-[#fafafa] p-0.5">
                   {Object.values(AspectRatio).map(ratio => (
                     <button
                       key={ratio}
                       onClick={() => updateConfig('aspectRatio', ratio)}
                       className={`flex-1 h-full rounded-sm text-[10px] font-mono transition-all flex items-center justify-center ${config.aspectRatio === ratio ? 'bg-white text-black shadow-sm' : 'text-black/40 hover:text-black'}`}
                     >
                       {ratio}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Font Size */}
               <div className="space-y-3">
                 <div className="flex items-center gap-2 opacity-40">
                    <Scaling size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Scale: {config.fontSize.toFixed(2)}</span>
                 </div>
                 <div className="h-[34px] flex items-center px-1">
                    <input 
                        type="range" min="0.7" max="1.5" step="0.05"
                        value={config.fontSize}
                        onChange={(e) => updateConfig('fontSize', parseFloat(e.target.value))}
                        className="w-full h-1 bg-black/10 appearance-none cursor-pointer rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md transition-all hover:[&::-webkit-slider-thumb]:scale-125"
                      />
                 </div>
               </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};