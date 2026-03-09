import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider } from '@/lib/ai-provider';
import { buildMockupPrompt } from '@/lib/prompt-engine';
import { resolveToBuffer, storeFile } from '@/lib/blob-storage';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '@/lib/api-auth';
import { getUserApiKey } from '@/lib/get-user-api-key';

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    const body = await request.json();
    const { templates, variations, prompt: customPrompt, imageSize, aspectRatio } = body;

    if (!templates || !Array.isArray(templates) || templates.length === 0) {
        return NextResponse.json({ error: 'templates[] is required' }, { status: 400 });
    }
    if (!variations || !Array.isArray(variations) || variations.length === 0) {
        return NextResponse.json({ error: 'variations[] is required' }, { status: 400 });
    }

    // Provider priority: request body > user DB setting > env
    const bodyProvider = body.provider as string | undefined;
    const userProvider = await getUserApiKey('ai_provider').catch(() => null);
    const providerName = bodyProvider || userProvider || process.env.AI_PROVIDER || 'mock';
    const apiKeyName = providerName.startsWith('ideogram') ? 'ideogram_api_key' : 'gemini_api_key';
    const dbApiKey = await getUserApiKey(apiKeyName).catch(() => null);
    const envKey = providerName.startsWith('ideogram') ? process.env.IDEOGRAM_API_KEY : process.env.GEMINI_API_KEY;
    const finalApiKey = dbApiKey || envKey || undefined;
    const provider = createAIProvider(providerName, finalApiKey);

    const results = [];

    for (const template of templates) {
        for (const variation of variations) {
            try {
                // Load images as base64
                const templateBuffer = await resolveToBuffer(template.imageUrl);
                const designBuffer = await resolveToBuffer(variation.imageUrl);
                const templateBase64 = templateBuffer.toString('base64');
                const designBase64 = designBuffer.toString('base64');

                const prompt = buildMockupPrompt(template.name, variation.name, customPrompt);
                const resultBase64 = await provider.generateMockup(templateBase64, designBase64, prompt, {
                    imageSize: imageSize || '2K',
                    aspectRatio: aspectRatio || '1:1',
                });

                // Store result
                const filename = `ai-mockup-${uuidv4()}.png`;
                const imageBuffer = Buffer.from(resultBase64, 'base64');
                const { url } = await storeFile('mockups', filename, imageBuffer);

                results.push({
                    id: uuidv4(),
                    templateId: template.id,
                    variationId: variation.id,
                    templateName: template.name,
                    variationName: variation.name,
                    imageUrl: url,
                });
            } catch (err) {
                results.push({
                    id: uuidv4(),
                    templateId: template.id,
                    variationId: variation.id,
                    templateName: template.name,
                    variationName: variation.name,
                    imageUrl: '',
                    error: err instanceof Error ? err.message : 'AI generation failed',
                });
            }
        }
    }

    return NextResponse.json({ results });
}
