import { GoogleGenAI, Type } from "@google/genai";
import { SplitResponse, CardSegment } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const splitTextIntoCards = async (text: string): Promise<CardSegment[]> => {
  try {
    const model = "gemini-3-flash-preview";

    const prompt = `
      You are an expert digital typesetter and editor.
      Your goal is to split the input text into a sequence of "Mobile Cards" (3:4 aspect ratio).
      
      *** CRITICAL RULES FOR SPLITTING ***

      1. **STRICT VISUAL CAPACITY (THE MOST IMPORTANT RULE)**:
         - Mobile screens are small. **DO NOT CREATE WALLS OF TEXT.**
         - **Max Length per Card**: 
           - English: ~100-120 words.
           - Chinese/CJK: ~180-220 characters.
         - **If a section exceeds this, YOU MUST SPLIT IT.** 
         - It is better to have 3 open, readable cards than 1 crowded card.

      2. **INTELLIGENT CONTINUITY**:
         - When splitting a long paragraph or section across multiple cards:
           - End the first card at a logical pause (period, comma).
           - Add sequence markers to titles: "Introduction (1/2)", "Introduction (2/2)".
           - Do not leave "orphaned" sentences (single lines) if possible.

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
                  content: { type: Type.STRING, description: "Body text. Max ~200 chars CJK or ~120 words EN." },
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
    
    // Fallback: Manually create structure if API fails
    const segments: CardSegment[] = [];
    // Significantly reduced MAX_CHARS from 700 to 300 to match visual capacity constraints
    const MAX_CHARS = 300; 
    
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