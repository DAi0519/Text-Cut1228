import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { CardConfig, AspectRatio, CardSegment, FontStyle, Composition } from '../types';
import { Pencil, Check, X, LayoutTemplate, Scissors, Crosshair } from 'lucide-react';

interface CardProps {
  content: string;
  sectionTitle: string;
  layout?: 'standard' | 'cover';
  index: number;
  total: number;
  config: CardConfig;
  cardRef?: React.Ref<HTMLDivElement>;
  onUpdate?: (data: CardSegment) => void;
  onSplit?: (contentToMove: string) => void;
}

export const Card: React.FC<CardProps> = ({ content, sectionTitle, layout = 'standard', index, total, config, cardRef, onUpdate, onSplit }) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sectionTitle);
  const [editContent, setEditContent] = useState(content);
  const [currentLayout, setCurrentLayout] = useState<'standard' | 'cover'>(layout);
  const [isOverflowing, setIsOverflowing] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);

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

  const getAspectRatioClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case AspectRatio.SQUARE: return 'aspect-square';
      case AspectRatio.WIDE: return 'aspect-[16/9]';
      case AspectRatio.PORTRAIT: default: return 'aspect-[3/4]';
    }
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
          p: ({node, ...props}) => <p className="mb-5 last:mb-0 text-justify hyphens-auto font-normal" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
          ul: ({node, ...props}) => <ul className="list-none pl-0 my-4 space-y-2 [counter-reset:list-counter]" {...props} />,
          ol: ({node, ...props}) => <ol className="list-none pl-0 my-4 space-y-2 [counter-reset:list-counter]" {...props} />,
          li: ({node, ...props}: any) => (
            <li className="flex gap-4 items-baseline [counter-increment:list-counter]" {...props}>
                <span className="text-[10px] font-mono opacity-40 shrink-0 after:content-[counter(list-counter,decimal-leading-zero)]"></span>
                <span>{props.children}</span>
            </li>
          ),
          h1: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-widest mb-3 mt-4 opacity-80" {...props} />,
          h2: ({node, ...props}) => <strong className="block text-sm font-bold uppercase tracking-wide mb-2 mt-4 opacity-80" {...props} />,
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-[3px] pl-5 my-6 italic opacity-75" style={{ borderColor: config.accentColor }} {...props} />
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

  const renderEditControls = () => (
    <>
      {!isEditing ? (
        <>
          {onUpdate && (
          <div className="flex items-center gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
              <button onClick={toggleLayout} className={`p-1.5 rounded-full hover:${inputBgColor}`} title="Toggle Layout">
                <LayoutTemplate size={12} className="opacity-60" />
              </button>
              <button onClick={() => setIsEditing(true)} className={`p-1.5 rounded-full hover:${inputBgColor}`} title="Edit Card">
                <Pencil size={12} className="opacity-60" />
              </button>
          </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1 z-50 bg-white/10 backdrop-blur rounded p-1">
          <button onClick={toggleLayout} className={`p-1.5 rounded hover:${inputBgColor} ${secondaryTextColor}`}><LayoutTemplate size={14} /></button>
          <div className={`h-4 w-[1px] ${borderColor} mx-1`}></div>
          <button onClick={handleCancel} className={`p-1.5 rounded hover:${inputBgColor} text-red-500`}><X size={14} /></button>
          <button onClick={handleSave} className={`p-1.5 rounded hover:${inputBgColor} text-green-500`}><Check size={14} /></button>
        </div>
      )}
    </>
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
           {renderEditControls()}
           <div className={`text-[10px] font-mono tracking-widest ${secondaryTextColor}`}>
             {String(index + 1).padStart(2, '0')}<span className="opacity-30 mx-1">/</span>{String(total).padStart(2, '0')}
           </div>
           <div className="w-2.5 h-2.5 rounded-full shadow-sm relative" style={{ backgroundColor: config.accentColor }}>
             <div className="absolute inset-0 rounded-full animate-pulse opacity-50 bg-white mix-blend-overlay"></div>
           </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative flex flex-col p-8 overflow-hidden">
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
                       <h2 className={`text-5xl font-bold leading-[1.05] text-left break-words ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>{editTitle || "UNTITLED"}</h2>
                     )}
                  </div>
               </div>
             </div>
          ) : (
            <>
              <div className="shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-3 opacity-60">
                    <div className="w-2 h-2 border border-current opacity-50"></div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em]">Segment {index + 1}</span>
                  </div>
                  {isEditing ? (
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="(No Title)"
                      className={`w-full bg-transparent text-[1.75rem] font-bold leading-tight outline-none border-b border-dashed border-current/30 py-1 ${inputBgColor} placeholder:text-current/20 ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && <h2 className={`text-[1.75rem] font-bold leading-tight ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>{editTitle}</h2> )}
                </div>
                {(isEditing || editTitle) && <div className="w-12 h-[2px] mb-8 opacity-20 shrink-0" style={{ backgroundColor: config.accentColor }}></div>}
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
       {/* Absolute Positioned Controls to not break the grid */}
       <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
         {renderEditControls()}
       </div>

       {isCover ? (
         <div className="flex-1 flex flex-col p-8 relative overflow-hidden">
             {/* Massive Background Decor */}
             <div className="absolute -right-10 -top-20 text-[20rem] font-bold opacity-[0.03] select-none pointer-events-none font-sans leading-none tracking-tighter">
               {String(index + 1).padStart(2,'0')}
             </div>
             
             <div className="mt-auto mb-12 relative z-10">
               <div className="w-24 h-4 mb-8" style={{ backgroundColor: config.accentColor }}></div>
               {isEditing ? (
                  <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="TITLE"
                    className={`w-full bg-transparent text-6xl md:text-7xl font-bold leading-none outline-none border-b-4 border-current py-4 ${inputBgColor} ${getFontClass(config.fontStyle)} tracking-tighter uppercase`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
               ) : (
                 <h2 className={`text-6xl md:text-7xl font-bold leading-[0.9] tracking-tighter uppercase break-words ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
                   {editTitle || "UNTITLED"}
                 </h2>
               )}
             </div>
         </div>
       ) : (
         <div className="flex-1 flex flex-col relative">
            {/* Top Section: Massive Index + Title */}
            <div className={`p-8 pb-6 flex flex-col justify-end min-h-[35%] border-b-4 ${borderColor}`}>
               <div className="flex justify-between items-end">
                  <div className={`text-[8rem] leading-[0.7] font-bold tracking-tighter -ml-1 ${getFontClass(FontStyle.SANS)}`} style={{ color: config.textColor, opacity: 1 }}>
                     {String(index + 1).padStart(2,'0')}
                  </div>
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
                    <h2 className={`text-xl font-bold uppercase tracking-wide leading-tight opacity-90 ${getFontClass(config.fontStyle)}`} style={{ color: config.textColor }}>
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
         {/* Controls */}
         <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
           {renderEditControls()}
         </div>

         {/* --- HEADER STRIP (Like the "POLLUX INDUSTRIES / SERIES 7 / 17" line) --- */}
         <div className="h-10 shrink-0 flex items-end justify-between px-6 border-b-2 border-current pb-2 font-bold uppercase tracking-tighter text-[10px] leading-none z-20 bg-inherit">
            <div className="flex gap-4 items-baseline">
               <span>{config.authorName || "SYS_OP"}</span>
               <span className="opacity-30">/</span>
               <span>SERIES {String(index + 1).padStart(2, '0')}</span>
            </div>
            {/* Functional Badge */}
            <div className={`font-mono text-[9px] px-1 py-0.5 text-white font-bold uppercase`} style={{ backgroundColor: config.accentColor }}>
               RUN_{new Date().getFullYear()}
            </div>
         </div>

         {/* SHARED BIG NUMBER - ABSOLUTE POSITIONED */}
         {/* User wants it "tight to bottom edge" and fully displayed. */}
         <div 
            className={`absolute bottom-2 right-5 font-bold tracking-tighter leading-[0.8] select-none pointer-events-none z-0 transition-opacity duration-300`}
            style={{ 
               fontSize: '8rem', 
               color: isCover ? config.accentColor : 'currentColor',
               opacity: isCover ? 1 : 0.1 // Low opacity for body (watermark style)
            }}
         >
            {String(index + 1).padStart(2, '0')}
         </div>

         {isCover ? (
           <div className="flex-1 flex flex-col relative p-6 z-10">
              {/* REPLACED Useless Info with Minimal Progress Visual */}
              <div className="w-full flex gap-1 mb-8 opacity-30">
                 {Array.from({ length: total }).map((_, i) => (
                    <div key={i} className={`h-1 flex-1 ${i <= index ? 'bg-current' : 'bg-current/20'}`}></div>
                 ))}
              </div>

              {/* MASSIVE TITLE (Like "POLYMER") */}
              <div className="flex-1 flex flex-col justify-center mb-8">
                 {isEditing ? (
                    <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                      className={`w-full bg-transparent text-6xl font-bold uppercase tracking-tighter outline-none ${inputBgColor} leading-[0.85]`} rows={4} style={{ color: config.textColor, resize: 'none' }} />
                 ) : (
                   <h1 className="text-6xl font-bold uppercase tracking-tighter leading-[0.85] break-words hyphens-auto" style={{ wordSpacing: '9999px' }}>
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
         {/* Controls */}
         <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
           {renderEditControls()}
         </div>

         {/* The Anchor Point */}
         <div className="absolute top-8 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full z-10" style={{ backgroundColor: config.accentColor }}></div>

         {isCover ? (
            <div className="flex-1 flex flex-col justify-center items-center text-center relative z-0">
               <div className="mt-8 mb-8 opacity-60 font-ming-light">
                  <span className="text-xs uppercase tracking-[0.3em]">No. {String(index + 1).padStart(2,'0')}</span>
               </div>
               
               {isEditing ? (
                  <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title"
                    className={`w-full text-center bg-transparent text-3xl font-ming-light outline-none ${inputBgColor}`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
               ) : (
                 <h2 className="text-3xl font-ming-light leading-relaxed tracking-wide opacity-90">
                   {editTitle || "The Essence"}
                 </h2>
               )}
            </div>
         ) : (
            <div className="flex-1 flex flex-col pt-8 min-h-0 relative z-0">
               {/* Minimal Title */}
               <div className="text-center mb-8 shrink-0">
                  {isEditing ? (
                     <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                      className={`bg-transparent text-base text-center font-ming-light uppercase tracking-widest w-full outline-none opacity-60 ${inputBgColor}`} style={{ color: config.textColor }} />
                  ) : ( editTitle && (
                     <h2 className="text-base font-ming-light uppercase tracking-widest opacity-60">{editTitle}</h2>
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
               <div className="absolute bottom-0 right-0 opacity-20 text-[10px] font-mono">
                 {index + 1}
               </div>
            </div>
         )}
      </div>
    );
  };

  // 9. NEO: Modern Digital, Glassmorphism, Clean, Soft Glows
  const renderNeo = () => {
    return (
       <div className="flex flex-col h-full w-full relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px] opacity-20 pointer-events-none" style={{backgroundColor: config.accentColor}}></div>
          
          {/* Controls */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            {renderEditControls()}
          </div>

          <div className="flex-1 p-8 flex flex-col relative z-10">
             {isCover ? (
                <div className="flex-1 flex flex-col justify-center">
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-current/10 bg-white/50 backdrop-blur-sm w-fit mb-6">
                      <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: config.accentColor}}></div>
                      <span className="text-[9px] uppercase tracking-widest font-medium opacity-60">Start Point</span>
                   </div>

                   {isEditing ? (
                      <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Object"
                        className={`w-full bg-transparent text-5xl font-light tracking-tighter leading-tight outline-none ${inputBgColor}`} rows={3} style={{ color: config.textColor, resize: 'none' }} />
                   ) : (
                     <h2 className="text-5xl font-light tracking-tighter leading-tight">
                       {editTitle || "Neo Object"}
                     </h2>
                   )}
                </div>
             ) : (
               <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex justify-between items-baseline mb-8 border-b border-current/10 pb-4">
                     {isEditing ? (
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} 
                         className={`bg-transparent text-lg font-light tracking-tight w-full outline-none ${inputBgColor}`} style={{ color: config.textColor }} placeholder="Header" />
                     ) : ( editTitle && (
                        <h2 className="text-lg font-light tracking-tight">{editTitle}</h2>
                     ))}
                     <span className="text-[10px] font-mono opacity-30 ml-4">{String(index + 1).padStart(2,'0')}</span>
                  </div>

                  <div className="flex-1 min-h-0 relative" style={{ fontSize: `${config.fontSize}rem`, color: config.textColor }}>
                     {isEditing ? (
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full h-full bg-transparent resize-none outline-none p-2 rounded-lg ${inputBgColor}`} style={{ color: config.textColor }} />
                     ) : renderMarkdownContent()}
                     {renderOverflowBtn()}
                  </div>
               </div>
             )}
          </div>

          {/* Bottom Bar */}
          <div className="h-1.5 w-full bg-current/5 mt-auto relative overflow-hidden">
             <div className="absolute top-0 left-0 h-full bg-current opacity-20" style={{width: `${((index + 1) / total) * 100}%`, backgroundColor: config.accentColor}}></div>
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

    if (config.composition === 'neo') {
      return {
        ...baseStyle,
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02)',
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
      ref={cardRef}
      className={`relative group/card ${getAspectRatioClass(config.aspectRatio)} ${getFontClass(config.fontStyle)} w-full shrink-0 overflow-hidden flex flex-col transition-all duration-300`}
      style={getContainerStyle()}
    >
       {/* Add a utility class for vertical writing mode which Tailwind doesn't have by default but modern browsers support */}
       <style>{`.writing-vertical-rl { writing-mode: vertical-rl; }`}</style>

       {config.composition === 'swiss' && renderSwiss()}
       {config.composition === 'classic' && renderClassic()}
       {config.composition === 'technical' && renderTechnical()}
       {config.composition === 'zen' && renderZen()}
       {config.composition === 'neo' && renderNeo()}
       
    </div>
  );
};