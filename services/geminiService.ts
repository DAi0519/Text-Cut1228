import { GoogleGenAI, Type } from "@google/genai";
import { SplitResponse, CardSegment, CardConfig, AspectRatio } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getCapacityGuide = (
  config?: Pick<CardConfig, "aspectRatio" | "fontSize" | "cardScale">,
) => {
  const aspectRatio = config?.aspectRatio ?? AspectRatio.PORTRAIT;
  const fontSize = config?.fontSize ?? 1;
  const cardScale = config?.cardScale ?? 1;

  const aspectMultiplier =
    aspectRatio === AspectRatio.WIDE
      ? 1.35
      : aspectRatio === AspectRatio.SQUARE
        ? 1.15
        : 1;
  const scaleMultiplier =
    (cardScale / 1.35) * Math.pow(1.05 / Math.max(fontSize, 0.8), 0.55);
  const words = Math.max(
    130,
    Math.round(180 * aspectMultiplier * scaleMultiplier),
  );
  const cjk = Math.max(
    240,
    Math.round(340 * aspectMultiplier * scaleMultiplier),
  );

  return {
    words,
    cjk,
    targetWordsMin: Math.max(100, Math.round(words * 0.72)),
    targetCjkMin: Math.max(180, Math.round(cjk * 0.72)),
    wordsRange: `${Math.max(115, words - 20)}-${words}`,
    cjkRange: `${Math.max(220, cjk - 40)}-${cjk}`,
  };
};

export const splitTextIntoCards = async (
  text: string,
  config?: Pick<CardConfig, "aspectRatio" | "fontSize" | "cardScale">,
): Promise<CardSegment[]> => {
  try {
    const model = "gemini-3-flash-preview";
    const capacity = getCapacityGuide(config);

    const prompt = `
      You are an expert digital typesetter and editor.
      Your goal is to split the input text into a sequence of readable cards.
      Current card format:
      - Aspect ratio: ${config?.aspectRatio ?? AspectRatio.PORTRAIT}
      - Font scale: ${config?.fontSize ?? 1}
      - Card size scale: ${config?.cardScale ?? 1}
      
      *** CRITICAL RULES FOR SPLITTING ***

      1. **STRICT VISUAL CAPACITY (THE MOST IMPORTANT RULE)**:
         - Keep each card airy and readable. **DO NOT CREATE WALLS OF TEXT.**
         - **Preferred Length per Card**: 
           - English: ~${capacity.wordsRange} words.
           - Chinese/CJK: ~${capacity.cjkRange} characters.
         - Try to fill each body card to at least:
           - English: ~${capacity.targetWordsMin} words when the source allows it.
           - Chinese/CJK: ~${capacity.targetCjkMin} characters when the source allows it.
         - Prefer **fewer, fuller cards** over many sparse cards.
         - If two adjacent paragraphs fit comfortably on one card, KEEP THEM TOGETHER.
         - Only split when a card would become visually crowded or hard to scan.

      2. **INTELLIGENT CONTINUITY**:
         - When splitting a long paragraph or section across multiple cards:
           - End the first card at a logical pause (period, comma).
           - Add sequence markers to titles: "Introduction (1/2)", "Introduction (2/2)".
           - Do not leave "orphaned" sentences or tiny leftover cards if possible.
           - Do not create continuation cards unless the section truly cannot fit in one card.

      3. **MANDATORY TITLES**:
         - **Every single card must have a title.**
         - If the text has a header (e.g., "## 1. Overview"), use it as the title and **REMOVE IT from the content**.
         - If no header exists for a section, generate a short (2-5 word) summary title.
         - Titles must be single-line plain text.

      4. **VERBATIM BODY TEXT**:
         - The "content" field must contain the **exact original text** (minus the moved headers).
         - Do not summarize. Do not rewrite.
         - Preserve existing markdown formatting (bold, italics, lists).

      5. **STRUCTURE**:
         - **Card 1 (Cover)**: Title = Project Title, Content = "", Layout = "cover".
         - **Card 2..N (Body)**: Title = Segment Title, Content = Segment Text, Layout = "standard".
         - **Card N+1 (End)**: Title = "FIN", Content = "", Layout = "cover".

      Input Text:
      ${text}
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: { 
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Card title. Max 20 chars." },
                  content: { type: Type.STRING, description: "Body text sized to the current card capacity." },
                  layout: { type: Type.STRING, enum: ["standard", "cover"] }
                },
                required: ["title", "content", "layout"]
              }
            }
          }
        }
      }
    });

    const jsonStr = response.text ? response.text.replace(/```json|```/g, "").trim() : "";
    
    if (!jsonStr) {
      throw new Error("Empty response from Gemini");
    }

    const parsedData = JSON.parse(jsonStr) as SplitResponse;
    return parsedData.segments;

  } catch (error) {
    console.error("Error splitting text:", error);
    const capacity = getCapacityGuide(config);
    
    // Fallback: Manually create structure if API fails
    const segments: CardSegment[] = [];
    const MAX_CHARS = Math.round(capacity.cjk * 1.1);
    
    // 1. Title Card
    segments.push({
      title: "Project Text",
      content: "",
      layout: "cover"
    });

    // 2. Body Cards - Robust Splitting
    const rawParagraphs = text.split("\n\n").filter(t => t.trim().length > 0);
    
    let currentChunk = "";
    let currentTitle = "Note Sequence";
    let partCounter = 1;

    rawParagraphs.forEach((part) => {
      // Heuristic: Short lines without punctuation might be headers
      if (part.length < 50 && !part.match(/[.,;!?。，；！？]/)) {
         if (currentChunk) {
            segments.push({
              title: partCounter > 1 ? `${currentTitle} (${partCounter})` : currentTitle,
              content: currentChunk,
              layout: "standard"
            });
            currentChunk = "";
            partCounter = 1;
         }
         currentTitle = part.replace(/#|\*/g, '').trim();
         return; 
      }

      if ((currentChunk.length + part.length) > MAX_CHARS) {
        segments.push({
          title: partCounter > 1 ? `${currentTitle} (${partCounter})` : currentTitle,
          content: currentChunk,
          layout: "standard"
        });
        
        currentChunk = part;
        partCounter++;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + part;
      }
    });
    
    if (currentChunk) {
        segments.push({
          title: partCounter > 1 ? `${currentTitle} (${partCounter})` : currentTitle,
          content: currentChunk,
          layout: "standard"
        });
    }

    // 3. End Card
    segments.push({
      title: "The End",
      content: "",
      layout: "cover"
    });

    return segments;
  }
};
