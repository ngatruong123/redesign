export interface AIProvider {
    generateVariation(
        sourceImageBase64: string,
        prompt: string,
    ): Promise<string>; // returns base64 image (PNG)
}

export function createAIProvider(provider: string): AIProvider {
    switch (provider) {
        case 'gemini':
            return new GeminiProvider();
        case 'banana-pro':
            return new GeminiProvider(); // Banana Pro = Nano Banana Pro = Gemini
        case 'mock':
            return new MockProvider();
        default:
            return new MockProvider();
    }
}

/**
 * Google Gemini (Nano Banana Pro) image generation via REST API.
 * Model: gemini-3-pro-image-preview (Nano Banana Pro)
 * Supports both text-to-image and image editing (text+image-to-image).
 */
class GeminiProvider implements AIProvider {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.model = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }

    async generateVariation(sourceImageBase64: string, prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is not set. Add it to .env.local');
        }

        const url = `${this.baseUrl}/models/${this.model}:generateContent`;

        console.log(`[GeminiProvider] Prompt (first 200 chars): ${prompt.slice(0, 200)}`);

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: `Here is a reference design image. I want you to CREATE A COMPLETELY NEW IMAGE based on it.\n\n${prompt}\n\nDo NOT return the original image. Do NOT make minor edits. Generate a BRAND NEW image that is clearly different from the reference while following the instructions above.`,
                        },
                        {
                            inlineData: {
                                mimeType: 'image/png',
                                data: sourceImageBase64,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                temperature: 2.0,
                imageConfig: { imageSize: '2K' },
            },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // Extract image from response
        const candidates = data?.candidates;
        if (!candidates || candidates.length === 0) {
            throw new Error('No candidates returned from Gemini API');
        }

        const parts = candidates[0]?.content?.parts;
        if (!parts || parts.length === 0) {
            throw new Error('No parts in Gemini response');
        }

        // Find the image part
        for (const part of parts) {
            if (part.inlineData?.data) {
                return part.inlineData.data; // base64 image data
            }
        }

        throw new Error('No image data found in Gemini response');
    }
}

class MockProvider implements AIProvider {
    async generateVariation(_sourceImageBase64: string, _prompt: string): Promise<string> {
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
        const hue = Math.floor(Math.random() * 360);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(${hue},70%,60%)"/>
          <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360},70%,40%)"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill="url(#g)" rx="16"/>
      <text x="256" y="240" text-anchor="middle" fill="white" font-size="18" font-family="system-ui" opacity="0.9">AI Variation</text>
      <text x="256" y="280" text-anchor="middle" fill="white" font-size="14" font-family="system-ui" opacity="0.6">Mock Preview</text>
    </svg>`;
        return Buffer.from(svg).toString('base64');
    }
}
