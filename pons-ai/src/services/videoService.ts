import { GoogleGenAI } from "@google/genai";

export async function checkApiKey(): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    return await (window as any).aistudio.hasSelectedApiKey();
  }
  return true; 
}

export async function openApiKeySelector(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    await (window as any).aistudio.openSelectKey();
  }
}

export async function generateVideo(imageBase64: string): Promise<{ url: string; prompt: string }> {
  // Use the API_KEY for video generation as it might be a paid key
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("API key not found. Video generation requires a paid API key for high-fidelity output.");

  const ai = new GoogleGenAI({ apiKey });
  
  const imageData = imageBase64.split(",")[1];
  const mimeType = imageBase64.split(";")[0].split(":")[1] || "image/jpeg";

  const prompt = `Create a cinematic, high-fidelity video of the person in the reference image. 
  The subject should be in a subtle, natural pose—perhaps a slight smile or a look towards the camera. 
  Maintain absolute identity consistency. 
  Lighting: Warm, cinematic golden hour. 
  Resolution: Ultra HD, 8k textures.`;

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      prompt: prompt,
      image: {
        imageBytes: imageData,
        mimeType: mimeType
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("Failed to retrieve video URI from response.");
    }

    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    const blob = await response.blob();
    return { 
      url: URL.createObjectURL(blob),
      prompt: prompt
    };
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_EXPIRED");
    }
    throw error;
  }
}
