import React, { useState, useEffect, useRef, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import { CardConfig, AspectRatio, CardSegment, FontStyle, Composition } from '../types';
import { Scissors } from 'lucide-react';

interface CardProps {
  content: string;
  sectionTitle: string;
  layout?: 'standard' | 'cover';
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

export const Card = forwardRef<CardHandle, CardProps>(({ content, sectionTitle, layout = 'standard', index, total, config, onUpdate, onSplit }, ref) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sectionTitle);
  const [editContent, setEditContent] = useState(content);
  const [currentLayout, setCurrentLayout] = useState<'standard' | 'cover'>(layout);
  const [isOverflowing, setIsOverflowing] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- NUMBERING LOGIC ---
  // 1. Title Page (Index 0) and End Page (Index Total-1) do not show numbers.
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const showNumber = !isFirst && !isLast;

  // 2. Body cards start at Index 1. 
  // Since we want the first body page to be "01", we can just use the current `index`.
  // Index 1 -> "01", Index 2 -> "02", etc.
  const displayIndex = String(index).padStart(2, '0');

  // 3. Display Total calculation (Body cards only)
  // Total cards - 2 (Title + End). Ensure at least 0.
  const displayTotal = String(Math.max(0, total - 2)).padStart(2, '0');

  const handleSave = () => {
    if (onUpdate) onUpdate({ title: editTitle, content: editContent, layout: currentLayout });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(sectionTitle);
    setEditContent(content ? content.replace(/\\n/g, '\n') : "");
    setCurrentLayout(layout);
    setIsEditing(false);
  };

  const toggleLayout = () => {
    setCurrentLayout(prev => prev === 'standard' ? 'cover' : 'standard');
    if (!isEditing && onUpdate) {
      onUpdate({ title: editTitle, content: editContent, layout: currentLayout === 'standard' ? 'cover' : 'standard' });
    }
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
    setCurrentLayout(layout);
  }, [sectionTitle, content, layout]);

  useLayoutEffect(() => {
    if (contentRef.current && !isEditing) {
      const { scrollHeight, clientHeight } = contentRef.current;
      setIsOverflowing(scrollHeight > clientHeight + 2);
    } else {
      setIsOverflowing(false);
    }
  }, [editContent, currentLayout, config.fontSize, config.aspectRatio, config.title, config.authorName, isEditing, config.fontStyle, config.composition]);


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
      onUpdate({ title: editTitle, content: keptContent, layout: currentLayout });
      onSplit(movedContent);
    }
  };

  const getAspectRatioStyle = (ratio: AspectRatio) => {
    // Convert "3:4" to standard CSS "3/4"
    return ratio.replace(':', '/');
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

  // --- CONTENT RENDERING COMPONENT (Shared across styles) ---
  const renderMarkdownContent = () => (
    <div 
      ref={contentRef}
      // Added flexible centering for Technical mode
      className={`prose prose-sm max-w-none h-full overflow-hidden ${config.composition === 'technical' ? 'flex flex-col justify-center' : ''}`}
      style={{
        lineHeight: 1.75, // REVERTED: Back to 1.75 for loose, elegant feel
        opacity: 0.9,
        '--tw-prose-body': config.textColor,
        '--tw-prose-headings': config.textColor,
        '--tw-prose-bold': config.textColor,
        '--tw-prose-links': config.accentColor,
      } as React.CSSProperties}
    >
      <ReactMarkdown 
        components={{
          // CHANGED: Reduced margin bottom from mb-5 to mb-3
          p: ({node, ...props}) => <p className="mb-3 last:mb-0 text-justify hyphens-auto font-normal whitespace-pre-line" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
          
          // Lists: Filter valid children to ensure correct indexing
          ul: ({node, children, ...props}) => {
            const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
            return (
              // CHANGED: Reduced vertical margins (my-4 -> my-2) and spacing (space-y-2 -> space-y-1)
              <ul className="list-none pl-0 my-2 space-y-1" {...props}>
                 {validChildren.map((child, index) => {
                    return React.cloneElement(child as React.ReactElement, { 
                      key: index,
                      // @ts-ignore - Custom prop
                      markerType: 'bullet' 
                    });
                 })}
              </ul>
            );
          },
          ol: ({node, children, ...props}) => {
            const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
            return (
              // CHANGED: Reduced vertical margins (my-4 -> my-2) and spacing (space-y-2 -> space-y-1)
              <ol className="list-none pl-0 my-2 space-y-1" {...props}>
                 {validChildren.map((child, index) => {
                    return React.cloneElement(child as React.ReactElement, { 
                      key: index,
                      // @ts-ignore - Custom prop
                      listIndex: index 
                    });
                 })}
              </ol>
            );
          },
          li: ({node, ...props}: any) => {
            // Destructure custom props so they don't get passed to the DOM <li>
            const { listIndex, markerType, children, ...rest } = props;
            
            // Determine the marker text
            let marker = "";
            if (typeof listIndex === 'number') {
               marker = String(listIndex + 1).padStart(2, '0');
            } else if (markerType === 'bullet') {
               marker = "–";
            } else {
               // Fallback if rendered outside of our ul/ol overrides (rare)
               marker = "•"; 
            }

            return (
              <li className="flex gap-4 items-baseline" {...rest}>
                  {/* Explicit Marker Rendering for Image Generation Stability */}
                  <span className="text-[10px] font-mono opacity-40 shrink-0 select-none w-4 text-right">
                    {marker}
                  </span>
                  <span className="flex-1 min-w-0 block">{children}</span>
              </li>
            );
          },
          // CHANGED: Slightly tighter header margins
          h1: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-widest mb-2 mt-3 opacity-80" {...props} />,
          h2: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-wide mb-1 mt-3 opacity-80" {...props} />,
          // CHANGED: Reduced blockquote margins
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

  // 1. CLASSIC: The original Dieter Rams-esque grid layout
  const renderClassic = () => (
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
      {/* CHANGED: p-8 to p-6 for more horizontal space, kept pt-8 for visual balance */}
      <div className="flex-1 relative flex flex-col p-6 pt-8 overflow-hidden">
        {!isCover && <div className={`absolute top-0 left-8 w-[1px] h-full ${gridColor}`}></div>}
        <div className={`flex-1 relative z-10 flex flex-col h-full ${isCover ? 'justify-center' : 'pl-6'}`}>
          {isCover ? (
             <div className="w-full flex flex-col justify-center animate-in fade-in zoom-in-95 duration-500">
               <div className="flex gap-6 md:gap-8">
                  <div className="w-1.5 shrink-0 opacity-80" style={{ backgroundColor: config.accentColor }}></div>
                  <div className="flex flex-col gap-6 w-full">
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
             </div>
          ) : (
            <>
              <div className="shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="mb-6"> {/* CHANGED: mb-8 -> mb-6 */}
                  {showNumber && (
                    <div className="flex items-center gap-3 mb-2 opacity-60"> {/* CHANGED: mb-3 -> mb-2 */}
                      <div className="w-2 h-2 border border-current opacity-50"></div>
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em]">Segment {displayIndex}</span>
                    </div>
                  )}
                  {isEditing ? (
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="(No Title)"
                      className={`w-full bg-transparent text-[1.75rem] font-bold leading-tight outline-none border-b border-dashed border-current/30 py-1 ${inputBgColor} placeholder:text-current/20 ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && <h2 className={`text-[1.75rem] font-bold leading-tight whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>{editTitle}</h2> )}
                </div>
                {(isEditing || editTitle) && <div className="w-12 h-[2px] mb-6 opacity-20 shrink-0" style={{ backgroundColor: config.accentColor }}></div>} {/* CHANGED: mb-8 -> mb-6 */}
              </div>
              <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                {isEditing ? <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded leading-relaxed text-sm opacity-90 ${inputBgColor}`} style={{ color: config.textColor }} /> : renderMarkdownContent()}
                {renderOverflowBtn()}
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
  );


  // 2. SWISS: Bold, Asymmetric, Huge Typography, High Tension
  const renderSwiss = () => (
    <div className="flex flex-col h-full w-full relative">
       
       {isCover ? (
         <div className="flex-1 flex flex-col p-8 relative overflow-hidden">
             {/* Massive Background Decor */}
             {showNumber && (
               <div className="absolute -right-10 -top-20 text-[20rem] font-bold opacity-[0.03] select-none pointer-events-none font-sans leading-none tracking-tighter">
                 {displayIndex}
               </div>
             )}
             
             <div className="mt-auto mb-12 relative z-10">
               <div className="w-24 h-4 mb-8" style={{ backgroundColor: config.accentColor }}></div>
               {isEditing ? (
                  <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="TITLE"
                    className={`w-full bg-transparent text-6xl md:text-7xl font-bold leading-none outline-none border-b-4 border-current py-4 ${inputBgColor} ${getFontClass(config.fontStyle)} tracking-tighter uppercase`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
               ) : (
                 <h2 className={`text-6xl md:text-7xl font-bold leading-[0.9] tracking-tighter uppercase break-words whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
                   {editTitle || "UNTITLED"}
                 </h2>
               )}
             </div>
         </div>
       ) : (
         <div className="flex-1 flex flex-col relative">
            {/* Top Section: Massive Index + Title */}
            {/* CHANGED: min-h reduced from 35% to 30%, padding reduced from pb-6 to pb-4 */}
            <div className={`p-8 pb-4 flex flex-col justify-end min-h-[30%] border-b-4 ${borderColor}`}>
               <div className="flex justify-between items-end">
                  {showNumber && (
                    <div className={`text-[8rem] leading-[0.7] font-bold tracking-tighter -ml-1 ${getFontClass(FontStyle.SANS)}`} style={{ color: config.textColor, opacity: 1 }}>
                       {displayIndex}
                    </div>
                  )}
                  {config.title && (
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest opacity-40 max-w-[100px] text-right leading-tight">
                       {config.title}
                    </div>
                  )}
               </div>
               
               {/* Subtitle / Section Title inside the bold header area */}
               <div className="mt-6">
                 {isEditing ? (
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="(Section Title)"
                      className={`w-full bg-transparent text-xl font-bold uppercase tracking-wide outline-none border-b border-current/30 ${inputBgColor} ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && (
                    <h2 className={`text-xl font-bold uppercase tracking-wide leading-tight opacity-90 whitespace-pre-wrap ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
                      {editTitle}
                    </h2>
                  ))}
               </div>
            </div>

            {/* Bottom Section: Content in a strict grid */}
            <div className="flex-1 p-8 pt-6 relative min-h-0 flex flex-col">
               <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                {isEditing ? <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded leading-relaxed text-sm opacity-90 ${inputBgColor}`} style={{ color: config.textColor }} /> : renderMarkdownContent()}
                {renderOverflowBtn()}
              </div>
            </div>
         </div>
       )}
    </div>
  );

  // 4. TECHNICAL: Inspired by "Polymer 48" / "Detroit Fault Line" / "AR/17"
  const renderTechnical = () => {
    // Force Sans or Mono usually looks best, but let's respect config if possible, or lean towards Sans/Mono mix.
    const baseFont = getFontClass(FontStyle.SANS); 

    return (
      <div className={`flex flex-col h-full w-full relative ${baseFont} overflow-hidden select-none`}>
         
         {/* --- HEADER STRIP (Like the "POLLUX INDUSTRIES / SERIES 7 / 17" line) --- */}
         <div className="h-10 shrink-0 flex items-end justify-between px-6 border-b-2 border-current pb-2 font-bold uppercase tracking-tighter text-[10px] leading-none z-20 bg-inherit">
            <div className="flex gap-4 items-baseline">
               <span>{config.authorName || "SYS_OP"}</span>
               <span className="opacity-30">/</span>
               {showNumber && <span>SERIES {displayIndex}</span>}
            </div>
            {/* Functional Badge */}
            <div className={`font-mono text-[9px] px-1 py-0.5 text-white font-bold uppercase`} style={{ backgroundColor: config.accentColor }}>
               RUN_{new Date().getFullYear()}
            </div>
         </div>

         {/* SHARED BIG NUMBER - ABSOLUTE POSITIONED */}
         {/* User wants it "tight to bottom edge" and fully displayed. */}
         {showNumber && (
           <div 
              className={`absolute bottom-2 right-5 font-bold tracking-tighter leading-[0.8] select-none pointer-events-none z-0 transition-opacity duration-300`}
              style={{ 
                 fontSize: '8rem', 
                 color: isCover ? config.accentColor : 'currentColor',
                 opacity: isCover ? 1 : 0.1 // Low opacity for body (watermark style)
              }}
           >
              {displayIndex}
           </div>
         )}

         {isCover ? (
           <div className="flex-1 flex flex-col relative p-6 z-10">
              {/* Minimal Geometric Decoration (Replaces Progress Bar) */}
              <div className="mb-8 flex items-center gap-1 opacity-40">
                  <div className="w-1 h-4 bg-current"></div>
                  <div className="w-1 h-4 border border-current"></div>
                  <div className="w-24 h-[1px] bg-current ml-2"></div>
              </div>

              {/* MASSIVE TITLE (Like "POLYMER") */}
              <div className="flex-1 flex flex-col justify-center mb-8">
                 {isEditing ? (
                    <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                      className={`w-full bg-transparent text-6xl font-bold uppercase tracking-tighter outline-none ${inputBgColor} leading-[1.0]`} rows={4} style={{ color: config.textColor, resize: 'none' }} />
                 ) : (
                   <h1 className="text-6xl font-bold uppercase tracking-tighter leading-[1.0] break-words hyphens-auto whitespace-pre-wrap">
                     {editTitle || "UNTITLED"}
                   </h1>
                 )}
              </div>

              {/* Bottom Info Area - Number removed from here as it is now absolute */}
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
              
              {/* Left Sidebar (Metadata) - SIMPLIFIED & DECORATIVE ONLY */}
              <div className="w-10 border-r border-current/20 flex flex-col items-center py-6 shrink-0 relative overflow-hidden bg-inherit">
                  <div className="absolute inset-0 opacity-5 pointer-events-none" 
                     style={{backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`, backgroundSize: '4px 4px'}}></div>

                 {/* Minimal Geometric Decoration - No Text */}
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
                     {/* Decorative element instead of SECT text */}
                    <div className="w-2 h-2 opacity-100" style={{ backgroundColor: config.accentColor }}></div>
                 </div>
                 
                 {/* Text Body - Vertically Centered via renderMarkdownContent style logic */}
                 <div className={`flex-1 min-h-0 relative flex flex-col justify-center leading-relaxed ${config.fontStyle === FontStyle.SERIF ? 'font-serif-sc' : 'font-mono'}`} style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                    {isEditing ? (
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 ${inputBgColor}`} style={{ color: config.textColor }} />
                    ) : renderMarkdownContent()}
                    {renderOverflowBtn()}
                 </div>
              </div>
           </div>
         )}
      </div>
    );
  };

  // 5. ZEN: Minimalist, "Muji", Breathable, Orange Dot
  const renderZen = () => {
    return (
      <div className="flex flex-col h-full w-full relative p-8">
         
         {/* The Anchor Point */}
         <div className="absolute top-8 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full z-10" style={{ backgroundColor: config.accentColor }}></div>

         {isCover ? (
            <div className="flex-1 flex flex-col justify-center items-center text-center relative z-0">
               {showNumber && (
                 <div className="mt-8 mb-8 opacity-60 font-ming-light">
                    <span className="text-xs uppercase tracking-[0.3em]">No. {displayIndex}</span>
                 </div>
               )}
               
               {isEditing ? (
                  <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title"
                    className={`w-full text-center bg-transparent text-3xl font-ming-light outline-none ${inputBgColor}`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
               ) : (
                 <h2 className="text-3xl font-ming-light leading-relaxed tracking-wide opacity-90 whitespace-pre-wrap">
                   {editTitle || "The Essence"}
                 </h2>
               )}
            </div>
         ) : (
            <div className="flex-1 flex flex-col pt-8 min-h-0 relative z-0">
               {/* Minimal Title */}
               <div className="text-center mb-6 shrink-0"> {/* CHANGED: mb-8 -> mb-6 */}
                  {isEditing ? (
                     <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                      className={`bg-transparent text-base text-center font-ming-light uppercase tracking-widest w-full outline-none opacity-60 ${inputBgColor}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && (
                     <h2 className="text-base font-ming-light uppercase tracking-widest opacity-60 whitespace-pre-wrap">{editTitle}</h2>
                  ))}
               </div>

               {/* Content - Justified but with breathing room */}
               <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                   {isEditing ? (
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 text-center leading-relaxed font-ming-light ${inputBgColor}`} style={{ color: config.textColor }} />
                   ) : (
                     <div className="text-justify leading-loose opacity-80 font-ming-light">
                       {renderMarkdownContent()}
                     </div>
                   )}
                   {renderOverflowBtn()}
               </div>
               
               {/* Minimal Pagination */}
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

  // 9. NEO: Modern Digital, Glassmorphism, Clean, Soft Glows -> Apple Design x Dieter Rams Refined
  const renderNeo = () => {
    // We want the accent color to be more dominant in a "Classy" way.
    // Use Mesh Gradients instead of simple blurs.
    
    // Calculate light/dark specifics for the "Glass" effect
    const isDark = config.colorway === 'carbon' || config.colorway === 'neon';
    
    // Apple-esque semi-transparent materials
    const glassBg = isDark ? 'bg-black/10 backdrop-blur-xl' : 'bg-white/40 backdrop-blur-2xl';
    const glassBorder = isDark ? 'border-white/10' : 'border-white/40';
    const textColor = config.textColor;
    
    // Mesh Gradient Logic: Use the Accent Color to wash the background
    // If it's Snow (Light), we use a softer wash. If Carbon/Neon (Dark), we use a deeper glow.
    const gradientOpacity = isDark ? 0.35 : 0.6; 

    return (
       <div className="flex flex-col h-full w-full relative overflow-hidden select-none">
          
          {/* --- LAYER 0: THE MESH BACKGROUND (The "Theme" carrier) --- */}
          <div className="absolute inset-0 z-0">
             <div className="absolute inset-0" style={{backgroundColor: config.backgroundColor}}></div>
             
             {/* Large Gradient Orb 1 (Top Right) */}
             <div 
               className="absolute -top-[30%] -right-[20%] w-[100%] h-[100%] rounded-full blur-[90px] mix-blend-multiply dark:mix-blend-screen pointer-events-none transition-colors duration-500"
               style={{ 
                  backgroundColor: config.accentColor, 
                  opacity: gradientOpacity
               }}
             ></div>
             
             {/* Large Gradient Orb 2 (Bottom Left) */}
             <div 
               className="absolute -bottom-[20%] -left-[20%] w-[80%] h-[80%] rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen pointer-events-none transition-colors duration-500"
               style={{ 
                  backgroundColor: config.accentColor, 
                  opacity: gradientOpacity * 0.8
               }}
             ></div>
          </div>

          {/* --- LAYER 1: THE GLASS SURFACE --- */}
          {/* A floating surface that holds the content. "Less but better" - clean lines. */}
          <div className={`relative z-10 flex-1 m-4 rounded-[20px] ${glassBg} border ${glassBorder} flex flex-col overflow-hidden shadow-sm`}>
             
             {/* Header: Minimal Capsule Style (Apple UI Element) */}
             <div className="h-16 shrink-0 flex items-center justify-between px-6 pt-2">
                {/* Index Capsule */}
                {showNumber ? (
                  <div className={`
                      h-6 px-3 rounded-full flex items-center justify-center gap-1.5 
                      ${isDark ? 'bg-white/10 text-white' : 'bg-black/5 text-black'} 
                      backdrop-blur-md border ${isDark ? 'border-white/5' : 'border-black/5'}
                  `}>
                      <span className="text-[10px] font-bold font-mono opacity-60">NO.</span>
                      <span className="text-[10px] font-bold font-mono tracking-wider">{displayIndex}</span>
                  </div>
                ) : (
                  <div></div> /* Spacer */
                )}
                
                {/* Decorative Dot */}
                <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_10px_currentColor]" style={{backgroundColor: config.textColor, opacity: 0.8}}></div>
             </div>

             {/* Content Body */}
             <div className="flex-1 px-8 pb-8 flex flex-col relative min-h-0">
                
                {isCover ? (
                   <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                      {/* Sub-label */}
                      <div className="mb-4 flex items-center gap-2 opacity-60">
                         <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Collection</span>
                         <div className="h-[1px] w-8 bg-current opacity-50"></div>
                      </div>

                      {/* Main Title - Apple Style: Tight Tracking, Large Scale */}
                      {isEditing ? (
                         <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Object"
                           className={`w-full bg-transparent text-5xl font-semibold tracking-tight leading-[1.1] outline-none ${inputBgColor} rounded-lg p-2`} rows={3} style={{ color: textColor, resize: 'none' }} />
                      ) : (
                        <h1 className="text-5xl font-semibold tracking-tight leading-[1.1] whitespace-pre-wrap drop-shadow-sm" style={{color: textColor}}>
                          {editTitle || "Untitled"}
                        </h1>
                      )}
                      
                      {/* Author pill */}
                      {config.authorName && (
                        <div className="mt-8 flex items-center gap-2">
                           <div className="w-6 h-[1px] bg-current opacity-40"></div>
                           <span className="text-xs font-medium tracking-wide opacity-80 uppercase">{config.authorName}</span>
                        </div>
                      )}
                   </div>
                ) : (
                   <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-500">
                      
                      {/* Title Section */}
                      {/* CHANGED: mb-4 -> mb-6 for slightly cleaner look but reduced border spacing */}
                      <div className="shrink-0 mb-4 pb-2 border-b border-current/10"> 
                         {isEditing ? (
                            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                             className={`bg-transparent text-xl font-semibold tracking-tight w-full outline-none ${inputBgColor} rounded px-1`} style={{ color: textColor }} placeholder="Header" />
                         ) : ( editTitle && (
                            <h2 className="text-xl font-semibold tracking-tight leading-tight" style={{color: textColor}}>{editTitle}</h2>
                         ))}
                      </div>

                      {/* Text Content */}
                      <div className="flex-1 min-h-0 relative font-sans antialiased" style={{ fontSize: `${config.fontSize}rem`, color: textColor }}>
                         {isEditing ? (
                            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-3 rounded-xl ${inputBgColor}`} style={{ color: textColor }} />
                         ) : renderMarkdownContent()}
                         {renderOverflowBtn()}
                      </div>
                   </div>
                )}
             </div>

             {/* Footer: Progress Bar (Functional Decoration) */}
             <div className="h-1 w-full bg-current/5 relative">
                <div 
                  className="absolute left-0 top-0 bottom-0 transition-all duration-300 ease-out" 
                  style={{ 
                    width: `${((index + 1) / total) * 100}%`, 
                    backgroundColor: config.accentColor,
                    boxShadow: `0 0 10px ${config.accentColor}`
                  }}
                ></div>
             </div>
             
          </div>
       </div>
    );
  }

  // 10. FLUX: The FUSION style (Swiss Structure + Neo Glass/Gradient)
  const renderFlux = () => {
    // 1. Foundation: The Neo-like Mesh Background (But lighter/subtler as requested)
    const isDark = config.colorway === 'carbon' || config.colorway === 'neon';
    // Reduced opacities for a "lighter" liquid effect
    const gradientOpacity = isDark ? 0.25 : 0.4; 
    const glassBg = isDark ? 'bg-black/20 backdrop-blur-2xl' : 'bg-white/50 backdrop-blur-3xl';
    const glassBorder = isDark ? 'border-white/10' : 'border-white/50';
    const textColor = config.textColor;

    return (
       <div className="flex flex-col h-full w-full relative overflow-hidden select-none">
          
          {/* --- LAYER 0: FLUX BACKGROUND (Soft Liquid) --- */}
          <div className="absolute inset-0 z-0">
             <div className="absolute inset-0" style={{backgroundColor: config.backgroundColor}}></div>
             
             {/* Fluid Gradient 1 */}
             <div 
               className="absolute -top-[10%] -right-[10%] w-[80%] h-[80%] rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
               style={{ backgroundColor: config.accentColor, opacity: gradientOpacity }}
             ></div>
             
             {/* Fluid Gradient 2 */}
             <div 
               className="absolute bottom-0 left-0 w-[100%] h-[60%] rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
               style={{ backgroundColor: config.accentColor, opacity: gradientOpacity * 0.6 }}
             ></div>
          </div>

          {/* --- LAYER 1: GLASS CARD (Neo Container) --- */}
          <div className={`relative z-10 flex-1 m-4 rounded-[24px] ${glassBg} border ${glassBorder} flex flex-col overflow-hidden shadow-sm`}>
             
             {/* --- LAYER 2: SWISS TYPOGRAPHY STRUCTURE --- */}
             {isCover ? (
                <div className="flex-1 flex flex-col p-8 relative">
                   {/* Massive Index Watermark (Swiss Trait) */}
                   {showNumber && (
                     <div className="absolute top-0 right-4 text-[12rem] font-bold leading-none tracking-tighter opacity-[0.05] pointer-events-none select-none">
                       {displayIndex}
                     </div>
                   )}

                   <div className="mt-auto mb-8 relative z-20">
                     <div className="w-16 h-2 mb-6 rounded-full" style={{ backgroundColor: config.accentColor }}></div>
                     {isEditing ? (
                        <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="TITLE"
                          className={`w-full bg-transparent text-6xl font-bold leading-[0.9] outline-none ${inputBgColor} ${getFontClass(config.fontStyle)} tracking-tighter uppercase rounded-lg p-2`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
                     ) : (
                       <h1 className={`text-6xl font-bold leading-[0.9] tracking-tighter uppercase break-words whitespace-pre-wrap drop-shadow-sm ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
                         {editTitle || "UNTITLED"}
                       </h1>
                     )}
                     
                     {/* Clean Author Line */}
                     {config.authorName && (
                        <div className="mt-6 flex items-center gap-3">
                           <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">By {config.authorName}</span>
                        </div>
                     )}
                   </div>
                </div>
             ) : (
                <div className="flex-1 flex flex-col relative">
                   {/* SWISS HEADER: Big Index + Bold Title */}
                   <div className="p-8 pb-4 border-b border-current/10 flex flex-col gap-1">
                      <div className="flex justify-between items-baseline">
                         {/* Huge Index Number */}
                         {showNumber ? (
                           <span className="text-6xl font-bold tracking-tighter leading-none opacity-90" style={{color: textColor}}>
                              {displayIndex}
                           </span>
                         ) : <div></div>}
                         {/* Small Project Ref */}
                         <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">
                            {config.title || "FLUX"}
                         </span>
                      </div>
                      
                      {/* Bold Section Title */}
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
                   <div className="flex-1 p-8 pt-6 relative min-h-0 flex flex-col">
                      <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: textColor }}>
                         {isEditing ? (
                            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded ${inputBgColor}`} style={{ color: textColor }} />
                         ) : renderMarkdownContent()}
                         {renderOverflowBtn()}
                      </div>
                   </div>

                   {/* Swiss/Neo Hybrid Footer: Accent Bar */}
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
  
  // Custom container styles based on composition
  const getContainerStyle = () => {
    const baseStyle = {
      backgroundColor: config.backgroundColor,
      color: config.textColor,
    };

    if (config.composition === 'technical') {
      return {
        ...baseStyle,
        borderRadius: '2px', // Slight rounding for tech feel
        boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
      }
    }
    
    if (config.composition === 'zen') {
      return {
        ...baseStyle,
        borderRadius: '2px',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)', // Very soft float
      }
    }

    // Neo and Flux share similar container physics (Apple/Modern style)
    if (config.composition === 'neo' || config.composition === 'flux') {
      return {
        ...baseStyle,
        borderRadius: '32px', // More curvature like modern iOS UI
        boxShadow: isDark
           ? '0 20px 40px -10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)'
           : '0 25px 50px -12px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(0,0,0,0.03)',
      }
    }

    // Default (Classic/Swiss)
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
       {/* Add a utility class for vertical writing mode which Tailwind doesn't have by default but modern browsers support */}
       <style>{`.writing-vertical-rl { writing-mode: vertical-rl; }`}</style>

       {config.composition === 'swiss' && renderSwiss()}
       {config.composition === 'classic' && renderClassic()}
       {config.composition === 'technical' && renderTechnical()}
       {config.composition === 'zen' && renderZen()}
       {config.composition === 'neo' && renderNeo()}
       {config.composition === 'flux' && renderFlux()}
       
    </div>
  );
});