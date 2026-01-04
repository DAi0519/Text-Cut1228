import React, { useState, useEffect, useRef, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import { CardConfig, AspectRatio, CardSegment, FontStyle, Composition, ImageConfig } from '../types';
import { Scissors, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, Scaling, Move, ScanLine, Square, RectangleHorizontal, RectangleVertical } from 'lucide-react';

interface CardProps {
  content: string;
  sectionTitle: string;
  layout?: 'standard' | 'cover';
  image?: string;
  imageConfig?: ImageConfig;
  index: number;
  total: number;
  config: CardConfig;
  onUpdate?: (data: CardSegment) => void;
  onSplit?: (contentToMove: string) => void;
}

export interface CardHandle {
  element: HTMLDivElement | null;
  toggleLayout: () => void;
  startEdit: () => void;
  save: () => void;
  cancel: () => void;
}

const DEFAULT_IMG_CONFIG: ImageConfig = {
  position: 'top',
  heightRatio: 0.45,
  scale: 1,
  panX: 50,
  panY: 50
};

export const Card = forwardRef<CardHandle, CardProps>(({ content, sectionTitle, layout = 'standard', image, imageConfig, index, total, config, onUpdate, onSplit }, ref) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sectionTitle);
  const [editContent, setEditContent] = useState(content);
  const [editImage, setEditImage] = useState(image);
  const [editImageConfig, setEditImageConfig] = useState<ImageConfig>(imageConfig || DEFAULT_IMG_CONFIG);
  const [currentLayout, setCurrentLayout] = useState<'standard' | 'cover'>(layout);
  const [isOverflowing, setIsOverflowing] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- NUMBERING LOGIC ---
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const showNumber = !isFirst && !isLast;
  const displayIndex = String(index).padStart(2, '0');
  const displayTotal = String(Math.max(0, total - 2)).padStart(2, '0');

  const handleSave = () => {
    if (onUpdate) onUpdate({ 
      title: editTitle, 
      content: editContent, 
      layout: currentLayout,
      image: editImage,
      imageConfig: editImageConfig
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(sectionTitle);
    setEditContent(content ? content.replace(/\\n/g, '\n') : "");
    setEditImage(image);
    setEditImageConfig(imageConfig || DEFAULT_IMG_CONFIG);
    setCurrentLayout(layout);
    setIsEditing(false);
  };

  const toggleLayout = () => {
    const newLayout = currentLayout === 'standard' ? 'cover' : 'standard';
    setCurrentLayout(newLayout);
    if (!isEditing && onUpdate) {
      onUpdate({ 
        title: editTitle, 
        content: editContent, 
        layout: newLayout,
        image: editImage,
        imageConfig: editImageConfig
      });
    }
  };

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditImage(undefined);
  };

  useImperativeHandle(ref, () => ({
    element: containerRef.current,
    toggleLayout: toggleLayout,
    startEdit: () => setIsEditing(true),
    save: handleSave,
    cancel: handleCancel
  }));

  useEffect(() => {
    setEditTitle(sectionTitle);
    const sanitizedContent = content ? content.replace(/\\n/g, '\n') : "";
    setEditContent(sanitizedContent);
    setEditImage(image);
    setEditImageConfig(imageConfig || DEFAULT_IMG_CONFIG);
    setCurrentLayout(layout);
  }, [sectionTitle, content, layout, image, imageConfig]);

  useLayoutEffect(() => {
    if (contentRef.current && !isEditing) {
      const { scrollHeight, clientHeight } = contentRef.current;
      setIsOverflowing(scrollHeight > clientHeight + 2);
    } else {
      setIsOverflowing(false);
    }
  }, [editContent, currentLayout, config.fontSize, config.aspectRatio, config.title, config.authorName, isEditing, config.fontStyle, config.composition, editImage, editImageConfig]);


  const handleSplitCard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSplit || !onUpdate) return;
    const paragraphs = editContent.split('\n\n');
    let keptContent = "", movedContent = "";

    if (paragraphs.length > 1) {
      movedContent = paragraphs.pop() || "";
      keptContent = paragraphs.join('\n\n');
    } else {
      const sentences = editContent.match(/[^.!?]+[.!?]+/g) || [editContent];
      if (sentences.length > 1) {
        const splitIndex = Math.floor(sentences.length * 0.7);
        keptContent = sentences.slice(0, splitIndex).join('').trim();
        movedContent = sentences.slice(splitIndex).join('').trim();
      } else {
        const mid = Math.floor(editContent.length * 0.7);
        keptContent = editContent.slice(0, mid) + "...";
        movedContent = "..." + editContent.slice(mid);
      }
    }

    if (keptContent && movedContent) {
      onUpdate({ title: editTitle, content: keptContent, layout: currentLayout, image: editImage, imageConfig: editImageConfig });
      onSplit(movedContent);
    }
  };

  const getAspectRatioStyle = (ratio: AspectRatio) => {
    return ratio.replace(':', '/');
  };
  
  const getCardAspectRatioValue = (ratio: AspectRatio) => {
    switch (ratio) {
      case AspectRatio.PORTRAIT: return 3/4;
      case AspectRatio.SQUARE: return 1;
      case AspectRatio.WIDE: return 16/9;
      default: return 3/4;
    }
  };

  const getTargetAspectRatioValue = (ratio: string) => {
      const [w, h] = ratio.split(':').map(Number);
      return w/h;
  };

  const getFontClass = (style?: FontStyle) => {
    switch (style) {
      case FontStyle.MONO: return 'font-mono';
      case FontStyle.MING_LIGHT: return 'font-ming-light';
      case FontStyle.SERIF: return 'font-serif-sc'; 
      case FontStyle.SANS: default: return 'font-sans';
    }
  };

  // Shared Styles
  const isDark = config.colorway === 'carbon' || config.colorway === 'neon';
  const gridColor = isDark ? 'bg-white/5' : 'bg-black/5';
  const borderColor = isDark ? 'border-white/10' : 'border-black/10';
  const secondaryTextColor = isDark ? 'text-white/40' : 'text-black/40';
  const inputBgColor = isDark ? 'bg-white/10' : 'bg-black/5';

  const isCover = currentLayout === 'cover';

  // --- IMAGE RENDERING UTILS ---
  const renderEditableImage = (className: string = "", forceCoverLayout: boolean = false) => {
    if (!editImage) return null;

    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!isEditing) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPanX = editImageConfig.panX;
      const startPanY = editImageConfig.panY;
      
      const container = e.currentTarget as HTMLDivElement;
      const { width, height } = container.getBoundingClientRect();

      const onMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          
          // Natural Scrolling: Drag right -> Move image right -> Increase PanX
          // Scale Compensation: We want 1:1 pixel movement.
          // Translate is relative to element width. 
          // visual_move = translate_percent * width * scale.
          // We want visual_move = deltaX.
          // So translate_percent = (deltaX / width) / scale.
          const changeX = (deltaX / width) * 100 * (1/editImageConfig.scale);
          const changeY = (deltaY / height) * 100 * (1/editImageConfig.scale);

          setEditImageConfig(prev => ({
             ...prev,
             // Increased range (-100 to 200) allows reaching edges even at high zoom levels
             panX: Math.max(-100, Math.min(200, startPanX + changeX)),
             panY: Math.max(-100, Math.min(200, startPanY + changeY))
          }));
      };

      const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    // Calculate dynamic size
    // If vertical: controls Height %
    // If horizontal: controls Width %
    let currentSizeRatio = editImageConfig.heightRatio;

    // Apply aspect ratio preset logic ONLY for vertical layouts
    if (!isHorizontal && editImageConfig.aspectRatio) {
       const cardRatio = getCardAspectRatioValue(config.aspectRatio);
       const targetRatio = getTargetAspectRatioValue(editImageConfig.aspectRatio);
       currentSizeRatio = cardRatio / targetRatio;
    }

    const containerStyle: React.CSSProperties = {
        height: (!forceCoverLayout && !isCover && !isHorizontal) ? `${currentSizeRatio * 100}%` : (isHorizontal ? '100%' : undefined),
        width: isHorizontal ? `${currentSizeRatio * 100}%` : '100%'
    };

    const cyclePosition = () => {
       const order: ImageConfig['position'][] = ['top', 'bottom', 'left', 'right'];
       const currentIdx = order.indexOf(editImageConfig.position);
       setEditImageConfig(p => ({ ...p, position: order[(currentIdx + 1) % order.length] }));
    };

    const getPositionIcon = () => {
       switch(editImageConfig.position) {
          case 'top': return <ArrowUp size={14} />;
          case 'bottom': return <ArrowDown size={14} />;
          case 'left': return <ArrowLeft size={14} />;
          case 'right': return <ArrowRight size={14} />;
          default: return <ArrowUp size={14} />;
       }
    };

    const cycleAspectRatio = () => {
       const order: (ImageConfig['aspectRatio'] | undefined)[] = [undefined, '1:1', '4:3', '16:9', '3:4'];
       const currentIdx = order.indexOf(editImageConfig.aspectRatio);
       setEditImageConfig(prev => ({ ...prev, aspectRatio: order[(currentIdx + 1) % order.length] }));
    };
    
    const getRatioIcon = () => {
       switch(editImageConfig.aspectRatio) {
          case '1:1': return <Square size={14} />;
          case '4:3': 
          case '16:9': return <RectangleHorizontal size={14} />;
          case '3:4': return <RectangleVertical size={14} />;
          default: return <ScanLine size={14} />;
       }
    };

    return (
      <div 
        className={`relative group/image overflow-hidden shrink-0 transition-[height,width] duration-200 ease-out flex items-center justify-center ${className} ${isEditing ? 'cursor-move ring-2 ring-blue-500/20' : ''}`}
        style={containerStyle}
        onMouseDown={handleMouseDown}
      >
        <img 
          src={editImage} 
          alt="Card attachment"
          // Switched to object-contain to allow non-destructive zoom/crop
          className="w-full h-full object-contain pointer-events-none select-none block"
          style={{
             // Use translate for panning to allow moving the image beyond container bounds
             transform: `translate(${editImageConfig.panX - 50}%, ${editImageConfig.panY - 50}%) scale(${editImageConfig.scale})`
          }}
        />
        
        {isEditing && (
           <>
             {/* Delete Button */}
             <button 
                onClick={removeImage}
                className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full shadow-lg z-20 hover:scale-110 transition-transform opacity-0 group-hover/image:opacity-100"
                title="Remove Image"
             >
               <Trash2 size={12} />
             </button>

             {/* Controls Toolbar */}
             <div 
               className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur text-white p-1.5 rounded-lg flex items-center gap-3 shadow-xl z-20 opacity-0 group-hover/image:opacity-100 transition-opacity whitespace-nowrap"
               onMouseDown={e => e.stopPropagation()} 
             >
                {/* Position Toggle */}
                <button 
                  onClick={cyclePosition}
                  className="p-1 hover:bg-white/20 rounded"
                  title="Position: Top -> Bottom -> Left -> Right"
                >
                  {getPositionIcon()}
                </button>

                <div className="w-px h-3 bg-white/20"></div>
                
                {/* Ratio Toggle (Only for vertical) */}
                <button 
                  onClick={cycleAspectRatio}
                  className={`p-1 hover:bg-white/20 rounded flex items-center gap-1 min-w-[36px] justify-center ${isHorizontal ? 'opacity-30 pointer-events-none' : ''}`}
                  title={isHorizontal ? "Ratio locked in horizontal mode" : "Aspect Ratio"}
                >
                  {getRatioIcon()}
                  {!isHorizontal && <span className="text-[9px] font-mono">{editImageConfig.aspectRatio || "Free"}</span>}
                </button>

                <div className="w-px h-3 bg-white/20"></div>

                {/* Scale (Min 0.2 for shrinking) */}
                <div className="flex items-center gap-1" title="Zoom">
                   <ZoomIn size={12} className="opacity-60" />
                   <input 
                     type="range" min="0.2" max="3" step="0.1"
                     value={editImageConfig.scale}
                     onChange={e => setEditImageConfig(p => ({ ...p, scale: parseFloat(e.target.value) }))}
                     className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                   />
                </div>

                <div className="w-px h-3 bg-white/20"></div>

                {/* Height/Width Ratio */}
                 <div className={`flex items-center gap-1 transition-opacity ${(editImageConfig.aspectRatio && !isHorizontal) ? 'opacity-30 pointer-events-none' : 'opacity-100'}`} title={isHorizontal ? "Width" : "Height"}>
                   <Scaling size={12} className="opacity-60" />
                   <input 
                     type="range" min="0.1" max="0.9" step="0.05"
                     value={editImageConfig.heightRatio}
                     onChange={e => setEditImageConfig(p => ({ ...p, heightRatio: parseFloat(e.target.value), aspectRatio: undefined }))}
                     className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                   />
                </div>
                
                <div className="w-px h-3 bg-white/20"></div>
                <Move size={12} className="opacity-40 animate-pulse" />
             </div>
           </>
        )}
      </div>
    );
  };

  // --- CONTENT RENDERING COMPONENT (Shared across styles) ---
  const renderMarkdownContent = () => (
    <div 
      ref={contentRef}
      className={`prose prose-sm max-w-none h-full overflow-hidden ${config.composition === 'technical' ? 'flex flex-col justify-center' : ''}`}
      style={{
        lineHeight: 1.75,
        opacity: 0.9,
        '--tw-prose-body': config.textColor,
        '--tw-prose-headings': config.textColor,
        '--tw-prose-bold': config.textColor,
        '--tw-prose-links': config.accentColor,
      } as React.CSSProperties}
    >
      <ReactMarkdown 
        components={{
          p: ({node, ...props}) => <p className="mb-3 last:mb-0 text-justify hyphens-auto font-normal whitespace-pre-line" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
          ul: ({node, children, ...props}) => {
            const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
            return (
              <ul className="list-none pl-0 my-2 space-y-1" {...props}>
                 {validChildren.map((child, index) => {
                    return React.cloneElement(child as React.ReactElement, { 
                      key: index,
                      // @ts-ignore
                      markerType: 'bullet' 
                    });
                 })}
              </ul>
            );
          },
          ol: ({node, children, ...props}) => {
            const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
            return (
              <ol className="list-none pl-0 my-2 space-y-1" {...props}>
                 {validChildren.map((child, index) => {
                    return React.cloneElement(child as React.ReactElement, { 
                      key: index,
                      // @ts-ignore
                      listIndex: index 
                    });
                 })}
              </ol>
            );
          },
          li: ({node, ...props}: any) => {
            const { listIndex, markerType, children, ...rest } = props;
            let marker = "";
            if (typeof listIndex === 'number') {
               marker = String(listIndex + 1).padStart(2, '0');
            } else if (markerType === 'bullet') {
               marker = "–";
            } else {
               marker = "•"; 
            }
            return (
              <li className="flex gap-4 items-baseline" {...rest}>
                  <span className="text-[10px] font-mono opacity-40 shrink-0 select-none w-4 text-right">
                    {marker}
                  </span>
                  <span className="flex-1 min-w-0 block">{children}</span>
              </li>
            );
          },
          h1: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-widest mb-2 mt-3 opacity-80" {...props} />,
          h2: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-wide mb-1 mt-3 opacity-80" {...props} />,
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-[3px] pl-5 my-4 italic opacity-75" style={{ borderColor: config.accentColor }} {...props} />
          ),
          a: ({node, ...props}) => <span className="underline decoration-1 underline-offset-4 decoration-dotted opacity-80" {...props} />
        }}
      >
        {editContent}
      </ReactMarkdown>
    </div>
  );

  const renderOverflowBtn = () => (
    isOverflowing && !isEditing && (
      <div className={`absolute bottom-0 left-0 right-0 h-24 ${isDark ? 'bg-gradient-to-t from-black/90' : 'bg-gradient-to-t from-white/90'} to-transparent flex items-end justify-center pb-4 z-20`}>
          <button 
            onClick={handleSplitCard}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded shadow-lg transition-transform hover:scale-105 active:scale-95 animate-bounce"
          >
            <Scissors size={14} />
            Split Overflow
          </button>
      </div>
    )
  );

  // --- LAYOUT THEMES ---

  // 1. CLASSIC
  const renderClassic = () => {
    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';
    
    return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className={`h-16 shrink-0 px-8 flex items-center justify-between border-b ${borderColor} font-sans`}>
        <div className="flex flex-col justify-center h-full">
           <span className={`text-[9px] font-mono uppercase tracking-[0.25em] ${secondaryTextColor} mb-0.5`}>Project</span>
           <span className="text-xs font-bold uppercase tracking-widest truncate max-w-[120px] opacity-80">{config.title || "Untitled"}</span>
        </div>
        <div className="flex items-center gap-4">
           {showNumber && (
             <div className={`text-[10px] font-mono tracking-widest ${secondaryTextColor}`}>
               {displayIndex}<span className="opacity-30 mx-1">/</span>{displayTotal}
             </div>
           )}
           <div className="w-2.5 h-2.5 rounded-full shadow-sm relative" style={{ backgroundColor: config.accentColor }}>
             <div className="absolute inset-0 rounded-full animate-pulse opacity-50 bg-white mix-blend-overlay"></div>
           </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative flex flex-col p-6 pt-8 overflow-hidden">
        {!isCover && <div className={`absolute top-0 left-8 w-[1px] h-full ${gridColor}`}></div>}
        <div className={`flex-1 relative z-10 flex flex-col h-full ${isCover ? 'justify-center' : 'pl-6'}`}>
          {isCover ? (
             <div className={`w-full flex h-full ${isHorizontal ? 'flex-row items-center gap-6' : 'flex-col justify-center'} animate-in fade-in zoom-in-95 duration-500`}>
               
               {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-sm shadow-sm")}
               {editImageConfig.position === 'top' && renderEditableImage("w-full max-h-[40%] mb-8 rounded-sm shadow-sm", true)}

               <div className={`flex gap-6 md:gap-8 ${isHorizontal ? 'flex-1' : ''}`}>
                  <div className="w-1.5 shrink-0 opacity-80" style={{ backgroundColor: config.accentColor }}></div>
                  <div className="flex flex-col gap-6 w-full justify-center">
                     {isEditing ? (
                        <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="ENTER TITLE"
                          className={`w-full bg-transparent text-5xl font-bold leading-none outline-none border-b border-dashed border-current/30 py-2 ${inputBgColor} ${getFontClass(config.fontStyle)}`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
                     ) : (
                       <h2 className={`text-5xl font-bold leading-[1.05] text-left break-words whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
                        {(editTitle || "UNTITLED").split(/(\*\*[\s\S]*?\*\*)/g).map((part, i) => 
                          part.startsWith('**') && part.endsWith('**') 
                            ? <span key={i} style={{ color: config.accentColor }}>{part.slice(2, -2)}</span> 
                            : part
                        )}
                       </h2>
                     )}
                  </div>
               </div>

               {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-sm shadow-sm")}
               {editImageConfig.position === 'bottom' && renderEditableImage("w-full max-h-[40%] mt-8 rounded-sm shadow-sm", true)}
             </div>
          ) : (
            <>
              <div className="shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="mb-6">
                  {showNumber && (
                    <div className="flex items-center gap-3 mb-2 opacity-60">
                      <div className="w-2 h-2 border border-current opacity-50"></div>
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em]">Segment {displayIndex}</span>
                    </div>
                  )}
                  {isEditing ? (
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="(No Title)"
                      className={`w-full bg-transparent text-[1.75rem] font-bold leading-tight outline-none border-b border-dashed border-current/30 py-1 ${inputBgColor} placeholder:text-current/20 ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && <h2 className={`text-[1.75rem] font-bold leading-tight whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>{editTitle}</h2> )}
                </div>
                {(isEditing || editTitle) && <div className="w-12 h-[2px] mb-6 opacity-20 shrink-0" style={{ backgroundColor: config.accentColor }}></div>}
              </div>
              
              {/* Body Content with dynamic image position */}
              <div className={`flex-1 min-h-0 relative flex ${isHorizontal ? 'flex-row gap-6' : 'flex-col'}`}>
                 
                 {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-sm")}
                 {editImageConfig.position === 'top' && renderEditableImage("w-full mb-6 rounded-sm")}

                 <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                    {isEditing ? <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded leading-relaxed text-sm opacity-90 ${inputBgColor}`} style={{ color: config.textColor }} /> : renderMarkdownContent()}
                    {renderOverflowBtn()}
                 </div>

                 {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-sm")}
                 {editImageConfig.position === 'bottom' && renderEditableImage("w-full mt-6 rounded-sm")}
                 
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className={`h-12 shrink-0 border-t ${borderColor} flex items-center justify-between px-8 ${isDark ? 'bg-white/5' : 'bg-black/5'} font-sans`}>
        <div className="flex items-center gap-4">
           {config.authorName && <span className="text-[9px] font-bold tracking-widest uppercase opacity-40">Authored by {config.authorName}</span>}
        </div>
        <div className="flex gap-1 opacity-20"><div className="w-[1px] h-3 bg-current"></div><div className="w-[3px] h-3 bg-current"></div><div className="w-[1px] h-3 bg-current"></div></div>
      </div>
    </div>
  )};


  // 4. TECHNICAL
  const renderTechnical = () => {
    const baseFont = getFontClass(FontStyle.SANS); 
    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';
    
    // Helper to render the framed technical image
    const renderTechnicalImage = (marginTop = false) => {
       const wrapperClass = isHorizontal 
          ? `h-full p-1 border border-current border-dashed opacity-90 relative`
          : `w-full p-1 border border-current border-dashed opacity-90 relative ${marginTop ? 'mt-8' : 'mb-8'}`;

       return editImage && (
         <div className={wrapperClass}>
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-current"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-current"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-current"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-current"></div>
            {renderEditableImage(isHorizontal ? "h-full" : "w-full filter grayscale-[0.2]", true)}
            <div className="absolute bottom-1 right-2 bg-black text-white text-[8px] px-1 font-mono uppercase">Fig. 00</div>
         </div>
       );
    };

    return (
      <div className={`flex flex-col h-full w-full relative ${baseFont} overflow-hidden select-none`}>
         
         {/* Header */}
         <div className="h-10 shrink-0 flex items-end justify-between px-6 border-b-2 border-current pb-2 font-bold uppercase tracking-tighter text-[10px] leading-none z-20 bg-inherit">
            <div className="flex gap-4 items-baseline">
               <span>{config.authorName || "SYS_OP"}</span>
               <span className="opacity-30">/</span>
               {showNumber && <span>SERIES {displayIndex}</span>}
            </div>
            <div className={`font-mono text-[9px] px-1 py-0.5 text-white font-bold uppercase`} style={{ backgroundColor: config.accentColor }}>
               RUN_{new Date().getFullYear()}
            </div>
         </div>

         {/* Big Number */}
         {showNumber && (
           <div 
              className={`absolute bottom-2 right-5 font-bold tracking-tighter leading-[0.8] select-none pointer-events-none z-0 transition-opacity duration-300`}
              style={{ 
                 fontSize: '8rem', 
                 color: isCover ? config.accentColor : 'currentColor',
                 opacity: isCover ? 1 : 0.1 
              }}
           >
              {displayIndex}
           </div>
         )}

         {isCover ? (
           <div className="flex-1 flex flex-col relative p-6 z-10">
              <div className="mb-8 flex items-center gap-1 opacity-40">
                  <div className="w-1 h-4 bg-current"></div>
                  <div className="w-1 h-4 border border-current"></div>
                  <div className="w-24 h-[1px] bg-current ml-2"></div>
              </div>

              <div className={`flex-1 flex ${isHorizontal ? 'flex-row gap-8' : 'flex-col'}`}>
                 {editImageConfig.position === 'left' && renderTechnicalImage(false)}
                 {editImageConfig.position === 'top' && renderTechnicalImage(false)}

                 <div className={`flex-1 flex flex-col justify-center ${isHorizontal ? '' : 'mb-8'}`}>
                    {isEditing ? (
                       <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                         className={`w-full bg-transparent text-6xl font-bold uppercase tracking-tighter outline-none ${inputBgColor} leading-[1.0]`} rows={4} style={{ color: config.textColor, resize: 'none' }} />
                    ) : (
                      <h1 className="text-6xl font-bold uppercase tracking-tighter leading-[1.0] break-words hyphens-auto whitespace-pre-wrap">
                        {editTitle || "UNTITLED"}
                      </h1>
                    )}
                 </div>

                 {editImageConfig.position === 'right' && renderTechnicalImage(true)}
                 {editImageConfig.position === 'bottom' && renderTechnicalImage(true)}
              </div>

              <div className="mt-auto border-t-2 border-current pt-4 flex items-end justify-between">
                 <div className="flex flex-col gap-1 text-[9px] uppercase font-mono max-w-[100px]">
                    <span className="opacity-50">Design Build</span>
                    <span>{config.title || "Project"}</span>
                    <span className="block w-4 h-4 rounded-full border border-current mt-2"></span>
                 </div>
              </div>
           </div>
         ) : (
           <div className="flex-1 flex h-full z-10">
              
              {/* Left Sidebar */}
              <div className="w-10 border-r border-current/20 flex flex-col items-center py-6 shrink-0 relative overflow-hidden bg-inherit">
                  <div className="absolute inset-0 opacity-5 pointer-events-none" 
                     style={{backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`, backgroundSize: '4px 4px'}}></div>
                 <div className="w-1 h-1 bg-current rounded-full opacity-50 mb-4"></div>
                 <div className="w-[1px] h-12 bg-current opacity-20"></div>
                 <div className="flex-1"></div>
                 <div className="w-3 h-3 border border-current opacity-30 rounded-full flex items-center justify-center">
                    <div className="w-0.5 h-0.5 bg-current rounded-full"></div>
                 </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col p-6 min-h-0">
                 {/* Section Title Block */}
                 <div className="shrink-0 mb-4 flex items-end justify-between border-b border-current/20 pb-2 min-h-[32px]">
                    {isEditing ? (
                       <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                        className={`bg-transparent text-xl font-bold uppercase tracking-tight w-full outline-none ${inputBgColor}`} style={{ color: config.textColor }} placeholder="DATA BLOCK" />
                    ) : ( editTitle && (
                       <h2 className="text-xl font-bold uppercase tracking-tight leading-none">{editTitle}</h2>
                    ))}
                    <div className="w-2 h-2 opacity-100" style={{ backgroundColor: config.accentColor }}></div>
                 </div>
                 
                 {/* Technical Image Body */}
                 <div className={`flex-1 flex min-h-0 ${isHorizontal ? 'flex-row gap-4' : 'flex-col'}`}>
                    
                    {editImageConfig.position === 'left' && editImage && (
                        <div className="h-full p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("h-full")}
                        </div>
                    )}

                    {editImageConfig.position === 'top' && editImage && (
                       <div className="mb-4 p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("w-full")}
                           <div className="flex justify-between items-center mt-1 px-1">
                              <span className="text-[8px] font-mono uppercase opacity-50">Visual Data</span>
                              <span className="text-[8px] font-mono uppercase opacity-50">FIG.{displayIndex}</span>
                           </div>
                       </div>
                    )}

                    {/* Text Body */}
                    <div className={`flex-1 min-h-0 relative flex flex-col justify-center leading-relaxed ${config.fontStyle === FontStyle.SERIF ? 'font-serif-sc' : 'font-mono'}`} style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                       {isEditing ? (
                         <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 ${inputBgColor}`} style={{ color: config.textColor }} />
                       ) : renderMarkdownContent()}
                       {renderOverflowBtn()}
                    </div>

                    {editImageConfig.position === 'right' && editImage && (
                        <div className="h-full p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("h-full")}
                        </div>
                    )}

                    {editImageConfig.position === 'bottom' && editImage && (
                       <div className="mt-4 p-[2px] border border-current/30 relative shrink-0">
                           {renderEditableImage("w-full")}
                           <div className="flex justify-between items-center mt-1 px-1">
                              <span className="text-[8px] font-mono uppercase opacity-50">Visual Data</span>
                              <span className="text-[8px] font-mono uppercase opacity-50">FIG.{displayIndex}</span>
                           </div>
                       </div>
                    )}
                 </div>
              </div>
           </div>
         )}
      </div>
    );
  };

  // 5. ZEN
  const renderZen = () => {
    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';

    return (
      <div className="flex flex-col h-full w-full relative p-8">
         
         <div className="absolute top-8 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full z-10" style={{ backgroundColor: config.accentColor }}></div>

         {isCover ? (
            <div className={`flex-1 flex ${isHorizontal ? 'flex-row items-center gap-8' : 'flex-col justify-center items-center text-center'} relative z-0 h-full`}>
               {showNumber && !isHorizontal && (
                 <div className="mt-8 mb-8 opacity-60 font-ming-light">
                    <span className="text-xs uppercase tracking-[0.3em]">No. {displayIndex}</span>
                 </div>
               )}
               
               {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-lg shadow-sm opacity-90", true)}
               {editImageConfig.position === 'top' && renderEditableImage("w-full max-h-[40%] mb-8 rounded-lg shadow-sm opacity-90", true)}

               <div className={`flex-1 ${isHorizontal ? 'flex flex-col justify-center text-left' : ''}`}>
                 {isEditing ? (
                    <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title"
                      className={`w-full bg-transparent text-3xl font-ming-light outline-none ${inputBgColor} ${isHorizontal ? 'text-left' : 'text-center'}`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
                 ) : (
                   <h2 className="text-3xl font-ming-light leading-relaxed tracking-wide opacity-90 whitespace-pre-wrap">
                     {editTitle || "The Essence"}
                   </h2>
                 )}
               </div>

               {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-lg shadow-sm opacity-90", true)}
               {editImageConfig.position === 'bottom' && renderEditableImage("w-full max-h-[40%] mt-8 rounded-lg shadow-sm opacity-90", true)}
            </div>
         ) : (
            <div className="flex-1 flex flex-col pt-8 min-h-0 relative z-0">
               <div className="text-center mb-6 shrink-0">
                  {isEditing ? (
                     <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                      className={`bg-transparent text-base text-center font-ming-light uppercase tracking-widest w-full outline-none opacity-60 ${inputBgColor}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && (
                     <h2 className="text-base font-ming-light uppercase tracking-widest opacity-60 whitespace-pre-wrap">{editTitle}</h2>
                  ))}
               </div>

               <div className={`flex-1 flex min-h-0 ${isHorizontal ? 'flex-row gap-6' : 'flex-col'}`}>
                  {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-lg shadow-sm")}
                  {editImageConfig.position === 'top' && renderEditableImage("w-full mb-6 rounded-lg shadow-sm")}

                  <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                      {isEditing ? (
                          <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 leading-relaxed font-ming-light ${inputBgColor} ${isHorizontal ? 'text-left' : 'text-center'}`} style={{ color: config.textColor }} />
                      ) : (
                        <div className={`leading-loose opacity-80 font-ming-light ${isHorizontal ? 'text-left' : 'text-justify'}`}>
                          {renderMarkdownContent()}
                        </div>
                      )}
                      {renderOverflowBtn()}
                  </div>

                  {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-lg shadow-sm")}
                  {editImageConfig.position === 'bottom' && renderEditableImage("w-full mt-6 rounded-lg shadow-sm")}
               </div>
               
               {showNumber && (
                 <div className="absolute bottom-0 right-0 opacity-20 text-[10px] font-mono">
                   {displayIndex}
                 </div>
               )}
            </div>
         )}
      </div>
    );
  };

  // 10. FLUX
  const renderFlux = () => {
    const isDark = config.colorway === 'carbon' || config.colorway === 'neon';
    const gradientOpacity = isDark ? 0.25 : 0.4; 
    const glassBg = isDark ? 'bg-black/20 backdrop-blur-2xl' : 'bg-white/50 backdrop-blur-3xl';
    const glassBorder = isDark ? 'border-white/10' : 'border-white/50';
    const textColor = config.textColor;
    const isHorizontal = editImageConfig.position === 'left' || editImageConfig.position === 'right';

    return (
       <div className="flex flex-col h-full w-full relative overflow-hidden select-none">
          
          <div className="absolute inset-0 z-0">
             <div className="absolute inset-0" style={{backgroundColor: config.backgroundColor}}></div>
             
             <div 
               className="absolute -top-[10%] -right-[10%] w-[80%] h-[80%] rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
               style={{ backgroundColor: config.accentColor, opacity: gradientOpacity }}
             ></div>
             
             <div 
               className="absolute bottom-0 left-0 w-[100%] h-[60%] rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
               style={{ backgroundColor: config.accentColor, opacity: gradientOpacity * 0.6 }}
             ></div>
          </div>

          <div className={`relative z-10 flex-1 m-4 rounded-[24px] ${glassBg} border ${glassBorder} flex flex-col overflow-hidden shadow-sm`}>
             
             {isCover ? (
                <div className="flex-1 flex flex-col p-8 relative">
                   {showNumber && (
                     <div className="absolute top-0 right-4 text-[12rem] font-bold leading-none tracking-tighter opacity-[0.05] pointer-events-none select-none">
                       {displayIndex}
                     </div>
                   )}
                   
                   <div className={`flex-1 flex ${isHorizontal ? 'flex-row items-center gap-8' : 'flex-col'}`}>
                     
                     {editImageConfig.position === 'left' && editImage && (
                       <div className="h-full rounded-2xl overflow-hidden shadow-sm relative shrink-0">
                          {renderEditableImage("h-full", true)}
                          <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none"></div>
                       </div>
                     )}

                     {editImageConfig.position === 'top' && editImage && (
                       <div className="w-full mb-8 rounded-2xl overflow-hidden shadow-sm relative shrink-0 max-h-[45%]">
                          {renderEditableImage("w-full h-full", true)}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                       </div>
                     )}

                     <div className={`flex-1 flex flex-col ${isHorizontal ? 'justify-center' : 'mt-auto mb-8 relative z-20'}`}>
                       {!isHorizontal && <div className="w-16 h-2 mb-6 rounded-full" style={{ backgroundColor: config.accentColor }}></div>}
                       
                       {isEditing ? (
                          <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="TITLE"
                            className={`w-full bg-transparent text-6xl font-bold leading-[0.9] outline-none ${inputBgColor} ${getFontClass(config.fontStyle)} tracking-tighter uppercase rounded-lg p-2`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
                       ) : (
                         <h1 className={`text-6xl font-bold leading-[0.9] tracking-tighter uppercase break-words whitespace-pre-wrap drop-shadow-sm ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
                           {editTitle || "UNTITLED"}
                         </h1>
                       )}
                       
                       {config.authorName && (
                          <div className="mt-6 flex items-center gap-3">
                             <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">By {config.authorName}</span>
                          </div>
                       )}
                     </div>

                     {editImageConfig.position === 'right' && editImage && (
                       <div className="h-full rounded-2xl overflow-hidden shadow-sm relative shrink-0">
                          {renderEditableImage("h-full", true)}
                          <div className="absolute inset-0 bg-gradient-to-l from-black/20 to-transparent pointer-events-none"></div>
                       </div>
                     )}

                     {editImageConfig.position === 'bottom' && editImage && (
                       <div className="w-full mt-auto rounded-2xl overflow-hidden shadow-sm relative shrink-0 max-h-[45%]">
                          {renderEditableImage("w-full h-full", true)}
                          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent pointer-events-none"></div>
                       </div>
                     )}
                   </div>
                </div>
             ) : (
                <div className="flex-1 flex flex-col relative">
                   <div className="p-8 pb-4 border-b border-current/10 flex flex-col gap-1">
                      <div className="flex justify-between items-baseline">
                         {showNumber ? (
                           <span className="text-6xl font-bold tracking-tighter leading-none opacity-90" style={{color: textColor}}>
                              {displayIndex}
                           </span>
                         ) : <div></div>}
                         <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">
                            {config.title || "FLUX"}
                         </span>
                      </div>
                      
                      <div className="mt-4">
                        {isEditing ? (
                           <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                            className={`bg-transparent text-2xl font-bold uppercase tracking-tight w-full outline-none ${inputBgColor} rounded px-1`} style={{ color: textColor }} placeholder="SECTION" />
                        ) : ( editTitle && (
                           <h2 className="text-2xl font-bold uppercase tracking-tight leading-none opacity-95" style={{color: textColor}}>{editTitle}</h2>
                        ))}
                      </div>
                   </div>

                   {/* Content Body */}
                   <div className={`flex-1 p-8 pt-6 relative min-h-0 flex ${isHorizontal ? 'flex-row gap-6' : 'flex-col'}`}>
                      
                      {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-xl shadow-sm")}
                      {editImageConfig.position === 'top' && renderEditableImage("w-full mb-6 rounded-xl shadow-sm")}

                      <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: textColor }}>
                         {isEditing ? (
                            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded ${inputBgColor}`} style={{ color: textColor }} />
                         ) : renderMarkdownContent()}
                         {renderOverflowBtn()}
                      </div>

                      {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-xl shadow-sm")}
                      {editImageConfig.position === 'bottom' && renderEditableImage("w-full mt-6 rounded-xl shadow-sm")}
                   </div>

                   <div className="h-1.5 w-full mt-auto relative bg-current/5">
                      <div className="absolute top-0 bottom-0 left-0 bg-current transition-all duration-500" 
                           style={{ width: `${((index + 1) / total) * 100}%`, color: config.accentColor }}></div>
                   </div>
                </div>
             )}
          </div>
       </div>
    );
  }

  // --- MAIN RENDER ---
  const getContainerStyle = () => {
    const baseStyle = {
      backgroundColor: config.backgroundColor,
      color: config.textColor,
    };

    if (config.composition === 'technical') {
      return {
        ...baseStyle,
        borderRadius: '2px',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
      }
    }
    
    if (config.composition === 'zen') {
      return {
        ...baseStyle,
        borderRadius: '2px',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)',
      }
    }

    if (config.composition === 'flux') {
      return {
        ...baseStyle,
        borderRadius: '32px',
        boxShadow: isDark
           ? '0 20px 40px -10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)'
           : '0 25px 50px -12px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(0,0,0,0.03)',
      }
    }

    return {
      ...baseStyle,
      borderRadius: '16px',
      boxShadow: isDark
          ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 48px -12px rgba(0,0,0,0.6)' 
          : 'inset 0 1px 0 rgba(255,255,255,0.8), 0 24px 48px -12px rgba(0,0,0,0.1)',
    };
  };
  
  return (
    <div 
      ref={containerRef}
      className={`relative group/card ${getFontClass(config.fontStyle)} w-full shrink-0 overflow-hidden flex flex-col transition-all duration-300`}
      style={{
        ...getContainerStyle(),
        aspectRatio: getAspectRatioStyle(config.aspectRatio)
      }}
    >
       <style>{`.writing-vertical-rl { writing-mode: vertical-rl; }`}</style>

       {config.composition === 'classic' && renderClassic()}
       {config.composition === 'technical' && renderTechnical()}
       {config.composition === 'zen' && renderZen()}
       {config.composition === 'flux' && renderFlux()}
       
    </div>
  );
});