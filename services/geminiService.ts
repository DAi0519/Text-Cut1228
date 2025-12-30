import { GoogleGenAI, Type } from "@google/genai";
import { SplitResponse, CardSegment } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const splitTextIntoCards = async (text: string): Promise<CardSegment[]> => {
  try {
    const model = "gemini-3-flash-preview";

    const prompt = `
      You are an expert knowledge curator and editor.
      Your task is to transform the provided text into a sequence of "Atomic Knowledge Cards" (3:4 aspect ratio).
      
      CORE PRINCIPLES:
      1. **ATOMIC INDEPENDENCE & SHORT TITLES**: 
         - Each card must stand alone as an independent unit of knowledge.
         - **EVERY CARD MUST HAVE A TITLE**.
         - **GENERATE CONCISE TITLES**: Titles must be short, punchy summaries (max 1 line). 
         - **NO NEWLINES IN TITLES**. If the original header is long, rewrite it to be shorter for the card title.
         - If a section is split, carry context in the title (e.g., "History (II)").
      
      2. **NO REDUNDANCY (CRITICAL)**:
         - **NEVER repeat the Title text inside the Content body.**
         - If you extract a Header, Subtitle, or Bolded Lead-in from the text to serve as the 'title', **YOU MUST REMOVE IT** from the 'content'.
         - The 'content' should start immediately with the body text *following* that header.
         - Example:
           [Original] "## 1. The Beginning\nIn the beginning..."
           [Card] Title: "1. The Beginning" | Content: "In the beginning..." (Header removed from body)
      
      3. **STRICT VISUAL CAPACITY**:
         - Target density: ~200-350 words (or ~400-600 CJK characters) per card.
         - **IF A SECTION IS TOO LONG**: You MUST split it into multiple cards. Do not try to cram it all into one.
      
      4. **STRICT VERBATIM (BODY ONLY)**: 
         - Do NOT change the author's wording within the content body paragraphs.
         - You are organizing structure, removing headers that moved to titles, but keeping the prose intact.

      STRUCTURE:
      1. **Title Card** (First Segment):
         - Title: Main Project Title (Shortened if needed).
         - Content: EMPTY STRING "". 
         - Layout: "cover".
      2. **Content Cards** (Sequence):
         - Title: Short, single-line extracted header or summary.
         - Content: The body text (minus the header).
         - Layout: "standard".
      3. **End Card** (Last Segment):
         - Title: "FIN".
         - Content: EMPTY STRING "".
         - Layout: "cover".

      Return ONLY the JSON object.
      
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
                  title: { type: Type.STRING, description: "Short, single-line title. No newlines." },
                  content: { type: Type.STRING, description: "Card body text. Header MUST be removed from here." },
                  layout: { type: Type.STRING, enum: ["standard", "cover"], description: "Visual layout style." }
                },
                required: ["title", "content", "layout"]
              },
              description: "The sequence of cards."
            }
          },
          required: ["segments"]
        }
      }
    });

    // Clean potential markdown code blocks if the model includes them
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
    const MAX_CHARS = 700; // Conservative limit for fallback
    
    // 1. Title Card
    segments.push({
      title: "Project Text",
      content: "",
      layout: "cover"
    });

    // 2. Body Cards - Robust Splitting
    const rawParagraphs = text.split("\n\n").filter(t => t.trim().length > 0);
    
    let currentChunk = "";
    let currentTitle = "Note Sequence"; // Default fallback title
    let partCounter = 1;

    // Check for headings in fallback mode to update titles
    rawParagraphs.forEach((part) => {
      // Simple heuristic: Short lines without punctuation might be headers
      if (part.length < 50 && !part.includes('.') && !part.includes('。')) {
         // It's likely a header, push current chunk if exists
         if (currentChunk) {
            segments.push({
              title: partCounter > 1 ? `${currentTitle} (${partCounter})` : currentTitle,
              content: currentChunk,
              layout: "standard"
            });
            currentChunk = "";
            partCounter = 1;
         }
         currentTitle = part.replace(/#|\*/g, '').trim(); // Update context for next cards
         // FALLBACK LOGIC: Return here means we SKIP adding this header to the next chunk's body
         // This mimics the AI "No Redundancy" rule in local logic
         return; 
      }

      // Logic: If adding this part exceeds max, push current and start new
      if ((currentChunk.length + part.length) > MAX_CHARS) {
        // Push the full card
        segments.push({
          title: partCounter > 1 ? `${currentTitle} (${partCounter})` : currentTitle,
          content: currentChunk,
          layout: "standard"
        });
        
        // Reset
        currentChunk = part;
        partCounter++;
      } else {
        // Append
        currentChunk += (currentChunk ? "\n\n" : "") + part;
      }
    });
    
    // Push remaining
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