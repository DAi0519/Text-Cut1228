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
  onEditChange?: (hasImage: boolean, config: ImageConfig) => void;
}

export interface CardHandle {
  element: HTMLDivElement | null;
  toggleLayout: () => void;
  startEdit: () => void;
  save: () => void;
  cancel: () => void;
  setImage: (image?: string) => void;
  updateImageConfig: (updates: Partial<ImageConfig>) => void;
  removeImage: () => void;
  toggleHighlight: () => void;
}

const DEFAULT_IMG_CONFIG: ImageConfig = {
  position: 'top',
  heightRatio: 0.45,
  scale: 1,
  panX: 50,
  panY: 50
};

export const Card = forwardRef<CardHandle, CardProps>(({ content, sectionTitle, layout = 'standard', image, imageConfig, index, total, config, onUpdate, onSplit, onEditChange }, ref) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sectionTitle);
  const [editContent, setEditContent] = useState(content);
  const [editImage, setEditImage] = useState(image);
  const [editImageConfig, setEditImageConfig] = useState<ImageConfig>(imageConfig || DEFAULT_IMG_CONFIG);
  const [currentLayout, setCurrentLayout] = useState<'standard' | 'cover'>(layout);
  const [isOverflowing, setIsOverflowing] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);

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
    // If not editing, save immediately. If editing, just update local state.
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

  type TextSegment = { text: string; bold: boolean };

  const buildSegments = (text: string): TextSegment[] => {
    const segments: TextSegment[] = [];
    let bold = false;
    let buffer = "";
    let i = 0;

    const pushBuffer = () => {
      if (!buffer) return;
      const last = segments[segments.length - 1];
      if (last && last.bold === bold) {
        last.text += buffer;
      } else {
        segments.push({ text: buffer, bold });
      }
      buffer = "";
    };

    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        pushBuffer();
        bold = !bold;
        i += 2;
        continue;
      }
      buffer += text[i];
      i += 1;
    }

    pushBuffer();
    return segments;
  };

  const buildIndexMap = (text: string): number[] => {
    const map = new Array(text.length + 1);
    let plainIndex = 0;
    let i = 0;
    map[0] = 0;

    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        map[i] = plainIndex;
        map[i + 1] = plainIndex;
        i += 2;
        map[i] = plainIndex;
        continue;
      }
      map[i] = plainIndex;
      i += 1;
      plainIndex += 1;
      map[i] = plainIndex;
    }

    return map;
  };

  const plainIndexToTextIndex = (text: string, plainIndex: number) => {
    let i = 0;
    let count = 0;
    while (i < text.length) {
      if (text.slice(i, i + 2) === "**") {
        i += 2;
        continue;
      }
      if (count === plainIndex) return i;
      i += 1;
      count += 1;
    }
    return text.length;
  };

  const updateSegmentsBold = (
    segments: TextSegment[],
    start: number,
    end: number,
    boldValue: boolean,
  ): TextSegment[] => {
    const next: TextSegment[] = [];
    let offset = 0;

    const push = (text: string, bold: boolean) => {
      if (!text) return;
      const last = next[next.length - 1];
      if (last && last.bold === bold) {
        last.text += text;
      } else {
        next.push({ text, bold });
      }
    };

    for (const segment of segments) {
      const segStart = offset;
      const segEnd = offset + segment.text.length;
      offset = segEnd;

      if (segEnd <= start || segStart >= end) {
        push(segment.text, segment.bold);
        continue;
      }

      const overlapStart = Math.max(start, segStart);
      const overlapEnd = Math.min(end, segEnd);

      if (segStart < overlapStart) {
        push(segment.text.slice(0, overlapStart - segStart), segment.bold);
      }

      push(
        segment.text.slice(overlapStart - segStart, overlapEnd - segStart),
        boldValue,
      );

      if (overlapEnd < segEnd) {
        push(segment.text.slice(overlapEnd - segStart), segment.bold);
      }
    }

    return next;
  };

  const renderSegments = (segments: TextSegment[]) => {
    let result = "";
    for (const segment of segments) {
      if (!segment.text) continue;
      result += segment.bold ? `**${segment.text}**` : segment.text;
    }
    return result;
  };

  const toggleBoldAtSelection = (
    text: string,
    start: number,
    end: number,
  ): { newText: string; newStart: number; newEnd: number } => {
    if (start === end) {
      const before = text.slice(0, start);
      const after = text.slice(end);
      if (before.endsWith("**") && after.startsWith("**")) {
        const newText = before.slice(0, -2) + after.slice(2);
        return { newText, newStart: start - 2, newEnd: start - 2 };
      }
      const newText = before + "****" + after;
      return { newText, newStart: start + 2, newEnd: start + 2 };
    }

    const indexMap = buildIndexMap(text);
    const plainStart = indexMap[start] ?? 0;
    const plainEnd = indexMap[end] ?? plainStart;

    const segments = buildSegments(text);
    let hasUnbold = false;
    let offset = 0;
    for (const segment of segments) {
      const segStart = offset;
      const segEnd = offset + segment.text.length;
      offset = segEnd;
      if (segEnd <= plainStart || segStart >= plainEnd) continue;
      if (!segment.bold) {
        hasUnbold = true;
        break;
      }
    }

    const shouldBold = hasUnbold;
    const nextSegments = updateSegmentsBold(
      segments,
      plainStart,
      plainEnd,
      shouldBold,
    );
    const newText = renderSegments(nextSegments);
    const newStart = plainIndexToTextIndex(newText, plainStart);
    const newEnd = plainIndexToTextIndex(newText, plainEnd);

    return { newText, newStart, newEnd };
  };

  const applyBoldToggle = (
    inputEl: HTMLInputElement | HTMLTextAreaElement | null,
    text: string,
    setText: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    if (!inputEl) return;
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? 0;
    const { newText, newStart, newEnd } = toggleBoldAtSelection(text, start, end);
    setText(newText);
    setTimeout(() => {
      if (inputEl) {
        inputEl.setSelectionRange(newStart, newEnd);
        inputEl.focus();
      }
    }, 0);
  };

  useImperativeHandle(ref, () => ({
    element: containerRef.current,
    toggleLayout: toggleLayout,
    startEdit: () => setIsEditing(true),
    save: handleSave,
    cancel: handleCancel,
    setImage: (nextImage) => {
      setEditImage(nextImage);
      if (nextImage) {
        setEditImageConfig((prev) => prev || DEFAULT_IMG_CONFIG);
      }
    },
    updateImageConfig: (updates) => setEditImageConfig(prev => ({ ...prev, ...updates })),
    removeImage: () => setEditImage(undefined),
    toggleHighlight: () => {
      const activeEl = document.activeElement;
      if (activeEl === titleInputRef.current) {
        applyBoldToggle(
          titleInputRef.current,
          editTitle,
          setEditTitle,
        );
      } else if (activeEl === contentInputRef.current) {
        applyBoldToggle(
          contentInputRef.current,
          editContent,
          setEditContent,
        );
      }
    }
  }));

  // Sync props to state when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(sectionTitle);
      const sanitizedContent = content ? content.replace(/\\n/g, '\n') : "";
      setEditContent(sanitizedContent);
      setEditImage(image);
      setEditImageConfig(imageConfig || DEFAULT_IMG_CONFIG);
      setCurrentLayout(layout);
    }
  }, [sectionTitle, content, layout, image, imageConfig, isEditing]);

  // Report changes to parent during edit
  useEffect(() => {
    if (isEditing && onEditChange) {
      onEditChange(!!editImage, editImageConfig);
    }
  }, [editImage, editImageConfig, isEditing, onEditChange]);

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
      case FontStyle.CHILL: return 'font-chill';
      case FontStyle.OPPO: return 'font-oppo';
      case FontStyle.SWEI: default: return 'font-swei'; 
    }
  };

  // Shared Styles
  const isDark = config.colorway === 'neon';
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
          
          const changeX = (deltaX / width) * 100 * (1/editImageConfig.scale);
          const changeY = (deltaY / height) * 100 * (1/editImageConfig.scale);

          setEditImageConfig(prev => ({
             ...prev,
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

    let currentSizeRatio = editImageConfig.heightRatio;
    const hasRatioPreset = !isHorizontal && !!editImageConfig.aspectRatio;

    // Apply aspect ratio preset logic ONLY for vertical layouts
    if (!isHorizontal && editImageConfig.aspectRatio) {
       const cardRatio = getCardAspectRatioValue(config.aspectRatio);
       const targetRatio = getTargetAspectRatioValue(editImageConfig.aspectRatio);
       currentSizeRatio = cardRatio / targetRatio;
    }

    const containerStyle: React.CSSProperties = {
      width: isHorizontal ? `${currentSizeRatio * 100}%` : '100%',
      // Always let vertical non-preset size follow heightRatio, including cover.
      // Otherwise HEIGHT slider appears ineffective in cover layouts.
      height: isHorizontal
        ? '100%'
        : hasRatioPreset
          ? undefined
          : `${currentSizeRatio * 100}%`,
    };

    // If ratio preset is selected, always let aspect-ratio drive vertical sizing
    // (including cover and non-cover) so the result is predictable.
    if (hasRatioPreset) {
      containerStyle.aspectRatio = editImageConfig.aspectRatio;
    }

    // Removed Internal Controls Toolbar (moved to App.tsx)

    return (
      <div 
        className={`relative group/image overflow-hidden shrink-0 transition-[height,width] duration-200 ease-out flex items-center justify-center ${className} ${isEditing ? 'cursor-move ring-2 ring-blue-500/20 shadow-lg z-10' : ''}`}
        style={containerStyle}
        onMouseDown={handleMouseDown}
      >
        <img 
          src={editImage} 
          alt="Card attachment"
          className="w-full h-full object-contain pointer-events-none select-none block"
          style={{
             transform: `translate(${editImageConfig.panX - 50}%, ${editImageConfig.panY - 50}%) scale(${editImageConfig.scale})`
          }}
        />
        {isEditing && (
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/image:opacity-100 pointer-events-none transition-opacity flex items-center justify-center">
             <Move size={24} className="text-white/50" />
          </div>
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
          strong: ({node, ...props}) => <strong className="font-semibold" style={{ color: config.accentColor }} {...props} />,
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
           {!isFirst && <span className={`text-[9px] font-mono uppercase tracking-[0.25em] ${secondaryTextColor} mb-0.5`}>Project</span>}
           <span className="text-xs font-bold uppercase tracking-widest truncate max-w-[120px] opacity-80">{isFirst ? "PROJECT" : (config.title || "Untitled")}</span>
        </div>
        <div className="flex items-center gap-4">
           {showNumber && (
             <div className={`text-[10px] font-mono tracking-widest ${secondaryTextColor}`}>
               {displayIndex}<span className="opacity-30 mx-1">/</span>{displayTotal}
             </div>
           )}
           <div className="w-2.5 h-2.5 rounded-full shadow-sm relative" style={{ backgroundColor: config.accentColor }}></div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative flex flex-col p-6 pt-8 overflow-hidden">
        {!isCover && <div className={`absolute top-0 left-8 w-[1px] h-full ${gridColor}`}></div>}
        <div className={`flex-1 relative z-10 flex flex-col h-full ${isCover ? 'justify-center' : 'pl-6'}`}>
          {isCover ? (
             <div className={`w-full flex h-full ${isHorizontal ? 'flex-row items-center gap-6' : 'flex-col justify-center'} animate-in fade-in zoom-in-95 duration-500`}>
               
               {editImageConfig.position === 'left' && renderEditableImage("h-full rounded-sm")}
               {editImageConfig.position === 'top' && renderEditableImage(
                 "w-full mb-8 rounded-sm",
                 true
               )}

               <div className={`flex gap-6 md:gap-8 ${isHorizontal ? 'flex-1' : ''}`}>
                  <div className="w-1.5 shrink-0" style={{ backgroundColor: config.accentColor }}></div>
                  <div className="flex flex-col gap-6 w-full justify-center">
                     {isEditing ? (
                        <textarea ref={titleInputRef as React.RefObject<HTMLTextAreaElement>} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="ENTER TITLE"
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

               {editImageConfig.position === 'right' && renderEditableImage("h-full rounded-sm")}
               {editImageConfig.position === 'bottom' && renderEditableImage(
                 "w-full mt-8 rounded-sm",
                 true
               )}
             </div>
          ) : (
            <>
              <div className="shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="mb-4">
                  {/* Segment Decoration Removed */}
                  {isEditing ? (
                    <input ref={titleInputRef as any} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="(No Title)"
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
                    {isEditing ? <textarea ref={contentInputRef} value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded leading-relaxed text-sm opacity-90 ${inputBgColor}`} style={{ color: config.textColor }} /> : renderMarkdownContent()}
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
    const baseFont = getFontClass(); 
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
         <div className={`h-10 shrink-0 flex items-end justify-between ${isCover ? 'mx-6 px-0' : 'px-6'} border-b-2 border-current pb-2 font-bold uppercase tracking-tighter text-[10px] leading-none z-20 bg-inherit`}>
            <div className="flex gap-4 items-baseline">
               <span className="opacity-30">/</span>
               <span>{isFirst ? "PROJECT" : (config.title || "Project")}</span>
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
                 opacity: isCover ? 1 : 0.05 
              }}
           >
              {displayIndex}
           </div>
         )}

         {isCover ? (
           <div className="flex-1 flex flex-col relative p-6 z-10">
              <div className="mb-8 flex items-center gap-1 opacity-20">
                  <div className="w-1 h-4 bg-current"></div>
                  <div className="w-1 h-4 border border-current"></div>
                  <div className="w-24 h-[1px] bg-current ml-2"></div>
              </div>

              <div className={`flex-1 flex ${isHorizontal ? 'flex-row gap-8' : 'flex-col'}`}>
                 {editImageConfig.position === 'left' && renderTechnicalImage(false)}
                 {editImageConfig.position === 'top' && renderTechnicalImage(false)}

                 <div className={`flex-1 flex flex-col justify-center ${isHorizontal ? '' : 'mb-8'}`}>
                    {isEditing ? (
                       <textarea ref={titleInputRef as React.RefObject<HTMLTextAreaElement>} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
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

              <div className="mt-auto border-t-2 border-current pt-2 flex items-center justify-between">
                 <div className="flex flex-col gap-1 text-[9px] uppercase font-mono max-w-[100px]">
                    <span className="opacity-50">Design Build</span>
                    <span>{config.authorName || "SYS_OP"}</span>
                 </div>
                 <div className="flex items-center gap-2 opacity-20">
                     <div className="w-12 h-[1px] bg-current"></div>
                     <div className="w-2.5 h-2.5 bg-current"></div>
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
                   <div className="shrink-0 mb-4 flex items-center justify-between border-b border-current/20 pb-2 min-h-[32px]">
                    {isEditing ? (
                       <input ref={titleInputRef as any} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                        className={`bg-transparent text-xl font-bold uppercase tracking-tight w-full outline-none ${inputBgColor}`} style={{ color: config.textColor }} placeholder="DATA BLOCK" />
                    ) : ( editTitle && (
                       <h2 className="text-xl font-bold uppercase tracking-tight leading-none">{editTitle}</h2>
                    ))}
                    <div className="w-2.5 h-2.5 opacity-100" style={{ backgroundColor: config.accentColor }}></div>
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
                    <div className={`flex-1 min-h-0 relative flex flex-col justify-center leading-relaxed ${getFontClass(config.fontStyle)}`} style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                       {isEditing ? (
                         <textarea ref={contentInputRef} value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 ${inputBgColor}`} style={{ color: config.textColor }} />
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

       
    </div>
  );
});