import React from 'react';
import { CardConfig, AspectRatio, FontStyle } from '../types';
import { X, Crop, Type, Scaling } from 'lucide-react';

interface StylePanelProps {
  config: CardConfig;
  setConfig: React.Dispatch<React.SetStateAction<CardConfig>>;
  onClose?: () => void;
}

export const StylePanel: React.FC<StylePanelProps> = ({ config, setConfig, onClose }) => {

  const updateConfig = (key: keyof CardConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const ratios = Object.values(AspectRatio);
  const fontStyles = [
    { value: FontStyle.SANS, label: 'Sans' },
    { value: FontStyle.SERIF, label: 'Serif' }, // Display as Serif, logic maps to Zhi Song
    { value: FontStyle.MING_LIGHT, label: 'Ming' },
    { value: FontStyle.MONO, label: 'Mono' },
  ];

  return (
    <div className="h-full font-sans text-[#18181b] flex flex-col w-full">
      
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Configuration</span>
        {onClose && (
          <button onClick={onClose} className="p-2 -mr-2 text-black/40 hover:text-black transition-colors">
             <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 p-6 space-y-12 overflow-y-auto">
        
        {/* Ratio Control */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 mb-4">
             <Crop size={14} className="opacity-40" />
             <span className="text-xs font-bold uppercase tracking-wide">Aspect Ratio</span>
           </div>
           
           <div className="flex flex-col gap-0.5 border border-black/10 bg-black/5 rounded overflow-hidden">
             {ratios.map(ratio => (
               <button
                key={ratio}
                onClick={() => updateConfig('aspectRatio', ratio)}
                className={`
                  w-full flex items-center justify-between px-4 py-3 text-xs font-medium transition-all
                  ${config.aspectRatio === ratio 
                    ? 'bg-white text-black shadow-sm z-10' 
                    : 'bg-transparent text-[#71717a] hover:bg-black/5 hover:text-black'}
                `}
               >
                 <span className="uppercase tracking-wider text-[10px]">
                   {ratio === AspectRatio.PORTRAIT ? 'Portrait' : ratio === AspectRatio.SQUARE ? 'Square' : 'Wide'}
                 </span>
                 <span className="font-mono text-[10px] opacity-40">{ratio}</span>
               </button>
             ))}
           </div>
        </div>

        {/* Font Style Control */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 mb-4">
             <Type size={14} className="opacity-40" />
             <span className="text-xs font-bold uppercase tracking-wide">Typeface</span>
           </div>
           
           <div className="grid grid-cols-2 gap-px bg-black/10 border border-black/10 rounded overflow-hidden">
             {fontStyles.map(style => (
               <button
                key={style.value}
                onClick={() => updateConfig('fontStyle', style.value)}
                className={`
                  flex flex-col items-center justify-center py-4 transition-all
                  ${config.fontStyle === style.value 
                    ? 'bg-white text-black' 
                    : 'bg-[#f4f4f5] text-[#71717a] hover:text-black'}
                `}
               >
                 <span className={`text-lg mb-1 ${
                    style.value === FontStyle.SERIF ? 'font-serif-sc' : 
                    style.value === FontStyle.MING_LIGHT ? 'font-ming-light' :
                    style.value === FontStyle.MONO ? 'font-mono text-sm' : 'font-sans'
                 }`}>Ag</span>
                 <span className="text-[9px] uppercase tracking-widest opacity-60">{style.label}</span>
               </button>
             ))}
           </div>
        </div>

        {/* Font Size */}
        <div className="space-y-4">
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
                <Scaling size={14} className="opacity-40" />
                <span className="text-xs font-bold uppercase tracking-wide">Typescale</span>
             </div>
             <span className="text-[10px] font-mono opacity-60">{config.fontSize.toFixed(2)}rem</span>
           </div>
           
           <div className="relative h-8 flex items-center">
             <input 
              type="range" min="0.7" max="1.5" step="0.05"
              value={config.fontSize}
              onChange={(e) => updateConfig('fontSize', parseFloat(e.target.value))}
              className="w-full h-[2px] bg-black/10 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-none"
            />
           </div>
        </div>

      </div>
      
      {/* Decorative Footer */}
      <div className="p-6 border-t border-black/5 opacity-30 flex justify-between items-end shrink-0 text-[9px] font-mono uppercase tracking-widest">
         <span>SYS.CFG.01</span>
         <span>READY</span>
      </div>
    </div>
  );
};