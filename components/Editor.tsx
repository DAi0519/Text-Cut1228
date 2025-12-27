import React from 'react';
import { Type, Grid, AlignLeft, X } from 'lucide-react';
import { CardConfig, Preset } from '../types';

interface EditorProps {
  inputText: string;
  setInputText: (text: string) => void;
  config: CardConfig;
  setConfig: React.Dispatch<React.SetStateAction<CardConfig>>;
  onProcess: () => void;
  isProcessing: boolean;
  onClose?: () => void;
}

const COLORWAYS: Preset[] = [
  {
    id: 'snow',
    name: 'Snow',
    config: {
      colorway: 'snow',
      backgroundColor: '#f4f4f5',
      textColor: '#18181b',
      accentColor: '#ea580c',
    }
  },
  {
    id: 'neon',
    name: 'Neon',
    config: {
      colorway: 'neon',
      backgroundColor: '#111111',
      textColor: '#ffffff',
      accentColor: '#ccff00',
    }
  },
  {
    id: 'carbon',
    name: 'Carbon',
    config: {
      colorway: 'carbon',
      backgroundColor: '#18181b',
      textColor: '#e4e4e7',
      accentColor: '#ea580c',
    }
  }
];

export const Editor: React.FC<EditorProps> = ({ 
  inputText, 
  setInputText, 
  config, 
  setConfig, 
  onProcess,
  isProcessing,
  onClose
}) => {

  const applyColorway = (preset: Preset) => {
    setConfig(prev => ({
      ...prev,
      ...preset.config
    }));
  };

  return (
    <div className="h-full flex flex-col font-sans text-[#18181b]">
      
      {/* Header - Minimal */}
      <div className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Input Source</span>
        {onClose && (
          <button onClick={onClose} className="p-2 -mr-2 text-black/40 hover:text-black transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-6 space-y-10">
        
        {/* Source Text */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 opacity-100">
             <AlignLeft size={14} className="opacity-40" />
             <span className="text-xs font-bold uppercase tracking-wide">Raw Text</span>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your long-form content here..."
            className="w-full h-64 p-4 bg-[#f4f4f5] rounded-none border-l-2 border-transparent focus:border-black focus:bg-[#f4f4f5] outline-none text-xs font-mono leading-relaxed resize-none transition-all placeholder:text-black/20 text-black/80"
          />
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 opacity-100">
             <Type size={14} className="opacity-40" />
             <span className="text-xs font-bold uppercase tracking-wide">Metadata</span>
          </div>
          <div className="space-y-4">
             <div className="relative group">
                <input 
                  type="text" 
                  value={config.title}
                  onChange={(e) => setConfig(prev => ({...prev, title: e.target.value}))}
                  className="w-full bg-transparent border-b border-black/10 py-2 text-sm font-medium focus:outline-none focus:border-black transition-colors placeholder:text-transparent"
                  id="field-title"
                />
                <label htmlFor="field-title" className={`absolute left-0 top-2 text-xs text-black/40 pointer-events-none transition-all duration-200 ${config.title ? '-translate-y-5 text-[9px] tracking-widest uppercase' : ''}`}>
                  Project Title
                </label>
             </div>
             
             <div className="relative group">
                <input 
                  type="text" 
                  value={config.authorName}
                  onChange={(e) => setConfig(prev => ({...prev, authorName: e.target.value}))}
                  className="w-full bg-transparent border-b border-black/10 py-2 text-sm font-medium focus:outline-none focus:border-black transition-colors placeholder:text-transparent"
                  id="field-author"
                />
                <label htmlFor="field-author" className={`absolute left-0 top-2 text-xs text-black/40 pointer-events-none transition-all duration-200 ${config.authorName ? '-translate-y-5 text-[9px] tracking-widest uppercase' : ''}`}>
                   Author
                </label>
             </div>
          </div>
        </div>

        {/* Finish */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 opacity-100">
             <Grid size={14} className="opacity-40" />
             <span className="text-xs font-bold uppercase tracking-wide">Finish</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
             {COLORWAYS.map(c => (
               <button
                 key={c.id}
                 onClick={() => applyColorway(c)}
                 className={`
                   h-10 border flex items-center justify-center gap-2 transition-all
                   ${config.colorway === c.id 
                     ? 'border-black bg-black text-white' 
                     : 'border-black/10 text-black/60 hover:border-black/30 bg-transparent'}
                 `}
               >
                 <div 
                   className="w-2 h-2 rounded-full" 
                   style={{ backgroundColor: c.config.backgroundColor, border: '1px solid rgba(0,0,0,0.1)' }}
                 ></div>
                 <span className="text-[10px] uppercase font-bold tracking-widest">{c.name}</span>
               </button>
             ))}
          </div>
        </div>

      </div>

      {/* Footer Action */}
      <div className="p-6 pt-0 shrink-0">
         <button
            onClick={() => {
              onProcess();
              if (onClose) onClose();
            }}
            disabled={!inputText.trim() || isProcessing}
            className={`
              w-full h-12 text-xs font-bold uppercase tracking-[0.2em] transition-all border
              flex items-center justify-center gap-3
              ${!inputText.trim() || isProcessing 
                 ? 'bg-[#f4f4f5] text-black/20 border-transparent cursor-not-allowed' 
                 : 'bg-white text-black border-black hover:bg-black hover:text-white'}
            `}
          >
            {isProcessing ? 'Processing...' : 'Run Sequence'}
          </button>
      </div>

    </div>
  );
};