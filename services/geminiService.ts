import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateLobbyIntro = async (playerNames: string[]): Promise<string> => {
  try {
    const prompt = `
      You are the narrator of a gritty 1920s Mafia game. 
      The following people have gathered in a smoky speakeasy backroom: ${playerNames.join(', ')}.
      Write a short, suspenseful, 2-sentence intro setting the scene and mentioning a few of them by name. 
      Do not reveal roles. Keep it mysterious and dark.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "The room is quiet. Too quiet.";
  } catch (error) {
    console.error("Gemini Error:", JSON.stringify(error));
    return "The telegraph lines are down. The Godfather cannot speak right now.";
  }
};