import React, { useState, useRef, useEffect } from 'react';
import { 
  LayoutTemplate, 
  Pencil, 
  Image as ImageIcon, 
  ArrowDownToLine, 
  Check, 
  X, 
  Trash2, 
  ZoomIn, 
  Scaling, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  ScanLine,
  Bold
} from 'lucide-react';
import { ImageConfig } from '../types';

interface ToolbarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  active?: boolean;
  danger?: boolean;
  className?: string;
  title?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, icon, label, active, danger, className = "", title, onMouseDown }) => (
  <button
    onClick={onClick}
    onMouseDown={onMouseDown}
    className={`
      h-9 flex items-center justify-center rounded-full transition-all gap-2 px-2
      ${active ? 'bg-black text-white shadow-sm' : ''}
      ${!active && !danger ? 'text-black/60 hover:text-black hover:bg-black/5' : ''}
      ${danger ? 'text-red-500 hover:bg-red-50' : ''}
      ${className}
    `}
    title={title}
  >
    {icon}
    {label && <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>}
  </button>
);

interface ToolbarProps {
  // Mode
  mode: 'view' | 'edit';
  
  // View Mode Actions
  onToggleLayout: () => void;
  onStartEdit: () => void;
  onTriggerImage: () => void;
  onDownload: () => void;
  
  // Edit Mode Actions
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleHighlight: () => void;
  
  // Image Actions (Edit Mode)
  hasImage: boolean;
  imageConfig: ImageConfig | null;
  onUpdateImageConfig: (updates: Partial<ImageConfig>) => void;
  onRemoveImage: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  mode,
  onToggleLayout,
  onStartEdit,
  onTriggerImage,
  onDownload,
  onCancelEdit,
  onSaveEdit,
  onToggleHighlight,
  hasImage,
  imageConfig,
  onUpdateImageConfig,
  onRemoveImage
}) => {
  const [activePopover, setActivePopover] = useState<'layout' | 'size' | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Helpers ---
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
    if (!imageConfig) return;
    const order: ImageConfig["position"][] = ["top", "bottom", "left", "right"];
    const currentIdx = order.indexOf(imageConfig.position);
    const nextPos = order[(currentIdx + 1) % order.length];
    onUpdateImageConfig({ position: nextPos });
  };

  const isHorizontal = imageConfig?.position === 'left' || imageConfig?.position === 'right';
  
  // --- RENDER: VIEW MODE ---
  if (mode === 'view') {
    return (
      <div className="h-12 bg-white/90 backdrop-blur-md rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/20 ring-1 ring-black/5 flex items-center p-1.5 gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Primary Actions Group */}
        <div className="flex items-center gap-1">
          <ToolbarButton 
            onClick={onStartEdit} 
            icon={<Pencil size={13} strokeWidth={2.5} />} 
            label="Edit" 
            active 
            className="px-4"
          />

          <ToolbarButton 
            onClick={onTriggerImage} 
            icon={<ImageIcon size={16} />} 
            label="Image"
          />

          <ToolbarButton 
            onClick={onToggleLayout} 
            icon={<LayoutTemplate size={16} />} 
            label="Layout"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-black/10 mx-1"></div>

        {/* Export */}
        <ToolbarButton 
          onClick={onDownload} 
          icon={<ArrowDownToLine size={16} />} 
          label="Save"
        />
      </div>
    );
  }

  // --- RENDER: EDIT MODE ---
  return (
    <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Popover Controls (Floating above) */}
      {activePopover && imageConfig && (
        <div 
          ref={popoverRef}
          className="mb-2 bg-black text-white rounded-xl shadow-xl p-3 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200 origin-bottom"
        >
          {activePopover === 'size' && (
            <>
              <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 w-8">Scale</span>
                    <input
                      type="range"
                      min="0.2"
                      max="3"
                      step="0.1"
                      value={imageConfig.scale}
                      onChange={(e) => onUpdateImageConfig({ scale: parseFloat(e.target.value) })}
                      className="w-32 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                    />
                    <span className="text-[10px] font-mono w-8 text-right">{imageConfig.scale.toFixed(1)}x</span>
                 </div>
                 
                 <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 w-8">
                       {isHorizontal ? 'Width' : 'Height'}
                    </span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={imageConfig.heightRatio}
                      onChange={(e) => onUpdateImageConfig({ 
                        heightRatio: parseFloat(e.target.value),
                        aspectRatio: undefined // Clear preset ratio when manually resizing
                      })}
                      className="w-32 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                    />
                    <span className="text-[10px] font-mono w-8 text-right">{(imageConfig.heightRatio * 100).toFixed(0)}%</span>
                 </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Edit Bar */}
      <div className="h-12 bg-white/90 backdrop-blur-md rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/20 ring-1 ring-black/5 flex items-center p-1.5 gap-1">
        
        {/* Group 1: Content Tools */}
        <div className="flex items-center gap-1 px-1">
           <ToolbarButton 
             onClick={onToggleLayout} 
             icon={<LayoutTemplate size={16} />} 
             label="Layout"
           />
          
          <ToolbarButton 
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleHighlight} 
            icon={<Bold size={16} />} 
            label="Bold"
          />
        </div>

        {/* Divider if Image Tools exist */}
        {hasImage && imageConfig && <div className="w-px h-4 bg-black/10 mx-1"></div>}

        {/* Group 2: Image Tools */}
        {hasImage && imageConfig && (
          <div className="flex items-center gap-1 px-1">
            <ToolbarButton 
              onClick={cyclePosition} 
              icon={getPositionIcon(imageConfig.position)} 
              label="Pos"
            />

            <ToolbarButton 
              onClick={() => setActivePopover(activePopover === 'size' ? null : 'size')} 
              icon={<Scaling size={16} />} 
              active={activePopover === 'size'}
              label="Size"
            />

            <ToolbarButton 
              onClick={onRemoveImage} 
              icon={<Trash2 size={16} />} 
              danger
            />
          </div>
        )}

        {/* Spacer */}
        <div className="w-px h-4 bg-black/10 mx-2"></div>

        {/* Group 3: Commit Actions */}
        <div className="flex items-center gap-1">
          <ToolbarButton 
            onClick={onCancelEdit} 
            icon={<X size={16} />} 
          />

          <ToolbarButton 
            onClick={onSaveEdit} 
            icon={<Check size={14} strokeWidth={3} />} 
            label="Done"
            active
            className="px-4"
          />
        </div>

      </div>
    </div>
  );
};
