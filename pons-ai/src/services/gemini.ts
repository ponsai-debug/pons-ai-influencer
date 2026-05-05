import { GoogleGenAI } from "@google/genai";

export interface GenerationParams {
  faceImage: string; // base64
  location: string;
  outfit: string;
  count: number;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

export async function generateInfluencerCarousel(params: GenerationParams): Promise<GeneratedImage[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const { faceImage, location, outfit, count } = params;

  const variations = [
    "close-up portrait, looking at camera, confident expression",
    "half-body shot, candid pose, relaxed expression",
    "full-body shot, walking towards camera, smiling",
    "sitting pose, looking away, thoughtful expression",
    "side profile, golden hour lighting, cinematic angle",
    "over-the-shoulder shot, urban background, stylish pose",
    "low angle shot, powerful stance, serious expression",
    "high angle shot, playful pose, laughing",
    "medium shot, leaning against a wall, relaxed",
    "wide shot, integrated into the environment, natural pose"
  ];

  // Parallel generation for speed, mapping indices to variations
  const generationTasks = Array.from({ length: count }).map(async (_, i) => {
    const variation = variations[i % variations.length];
    const prompt = `Generate ONE photorealistic image of the person in the attached reference image.
    
    CORE REQUIREMENTS (MANDATORY):
    - IDENTITY: The subject MUST have the EXACT facial features, bone structure, and appearance of the person in the reference image.
    - SCENE SETTING: The image must be explicitly set in: ${location}. Integrated naturally.
    - OUTFIT: The subject MUST be wearing: ${outfit}.
    - VARIATION: ${variation}
    
    TECHNICAL QUALITY:
    - 8k resolution, photorealistic, cinematic lighting.
    - Natural skin textures, realistic depth of field.
    - High fashion photography style.
    
    NEGATIVE PROMPT:
    different person, face distortion, identity drift, generic background, inconsistent features, CGI, cartoon, bad anatomy, text, logo, blurry.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            {
              inlineData: {
                data: faceImage.split(",")[1],
                mimeType: "image/jpeg",
              },
            },
            { text: prompt },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "9:16",
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (part?.inlineData) {
        return {
          url: `data:image/png;base64,${part.inlineData.data}`,
          prompt: prompt
        };
      }
      return null;
    } catch (error) {
      console.error(`Error generating image ${i + 1}:`, error);
      return null;
    }
  });

  const results = await Promise.all(generationTasks);
  const filteredResults = results.filter((img): img is GeneratedImage => img !== null);

  if (filteredResults.length === 0) {
    throw new Error("No images were successfully generated.");
  }

  return filteredResults;
}
