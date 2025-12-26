import { GoogleGenAI, Type } from "@google/genai";
import { SplitResponse, CardSegment } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const splitTextIntoCards = async (text: string): Promise<CardSegment[]> => {
  try {
    const model = "gemini-3-flash-preview";

    const prompt = `
      You are an expert editor and typographer.
      Your task is to split the provided text into a specific sequence of presentation cards: 
      1. A Title Card (with no body text)
      2. Multiple Content Cards (containing the actual body text)
      3. An End Card (with no body text)
      
      Rules:
      1. PRESERVE MARKDOWN: Keep all bold (**text**), italic (*text*), and lists (- item) intact.
      2. PRESERVE WORDING: Do not change the author's words in the content.
      3. SPLIT LOGIC: Create segments of roughly 50-80 words for the Content Cards.
      4. STRUCTURE:
         - **Segment 1 (The Title Card)**:
           - Title: Generate a compelling, short main title for the piece.
           - Content: MUST BE AN EMPTY STRING "". Do not put the first paragraph here. Move it to Segment 2.
           - Layout: "cover".
         - **Middle Segments (The Body)**:
           - Distribute ALL the input text here.
           - Title: 
             - For the very first body segment (Segment 2), provide a subtitle if applicable (e.g. "Introduction" or "Chapter 1"), otherwise leave empty.
             - For subsequent segments, use a title ONLY if a new distinct topic starts.
           - Content: The text chunk.
           - Layout: "standard".
         - **Last Segment (The End Card)**:
           - Title: A closing phrase (e.g., "THE END", "FIN", or a short summary phrase).
           - Content: MUST BE AN EMPTY STRING "".
           - Layout: "cover".
      5. Avoid breaking sentences awkwardly between body segments.
      6. Return ONLY the JSON object.
      
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
                  title: { type: Type.STRING, description: "Card title/subtitle." },
                  content: { type: Type.STRING, description: "Card content. Empty for First/Last cards." },
                  layout: { type: Type.STRING, enum: ["standard", "cover"], description: "Visual layout style." }
                },
                required: ["title", "content", "layout"]
              },
              description: "The sequence of cards: Title Card -> Body Cards -> End Card."
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
    
    // 1. Title Card
    segments.push({
      title: "Project Text",
      content: "",
      layout: "cover"
    });

    // 2. Body Cards
    const parts = text.split("\n\n").filter(t => t.trim().length > 0);
    parts.forEach(part => {
      segments.push({
        title: "",
        content: part,
        layout: "standard"
      });
    });

    // 3. End Card
    segments.push({
      title: "The End",
      content: "",
      layout: "cover"
    });

    return segments;
  }
};