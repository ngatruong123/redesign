import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ensureStorageDir } from '@/lib/storage';

const API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export async function GET(req: NextRequest) {
    try {
        if (!API_KEY) {
            return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
        }

        const op = req.nextUrl.searchParams.get('op');
        if (!op) {
            return NextResponse.json({ error: 'op parameter required' }, { status: 400 });
        }

        // Poll operation status via REST
        const res = await fetch(`${BASE_URL}/${op}`, {
            headers: { 'x-goog-api-key': API_KEY! },
        });

        if (res.status === 429 || res.status === 503) {
            return NextResponse.json({ status: 'generating' });
        }

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: `Poll error: ${err}`, status: 'error' }, { status: res.status });
        }

        const data = await res.json();

        if (!data.done) {
            return NextResponse.json({ status: 'generating' });
        }

        console.log('[Veo status] Operation done:', JSON.stringify(data).slice(0, 2000));

        // Extract video from response - try known structures
        const videos = data.response?.generateVideoResponse?.generatedSamples
            || data.response?.generatedSamples
            || data.response?.generatedVideos
            || [];

        if (videos.length === 0) {
            return NextResponse.json({
                error: 'No video generated',
                status: 'error',
                debug: JSON.stringify(data.response || data).slice(0, 1000),
            }, { status: 500 });
        }

        // Get video data - could be base64 or URI
        const videoEntry = videos[0].video || videos[0];
        const videoUri = videoEntry.uri;
        const videoB64 = videoEntry.bytesBase64Encoded;

        const dir = await ensureStorageDir('videos');
        const filename = `${uuidv4()}.mp4`;
        const filePath = `${dir}/${filename}`;

        if (videoUri) {
            // Download from URI
            const downloadUrl = new URL(videoUri);
            if (!downloadUrl.searchParams.has('key')) {
                downloadUrl.searchParams.set('key', API_KEY!);
            }
            console.log('[Veo status] Downloading video from URI');
            const videoRes = await fetch(downloadUrl.toString());
            if (!videoRes.ok) {
                const errBody = await videoRes.text().catch(() => '');
                return NextResponse.json({
                    error: `Failed to download video (${videoRes.status})`,
                    status: 'error',
                    debug: errBody.slice(0, 500),
                }, { status: 500 });
            }
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            await writeFile(filePath, videoBuffer);
        } else if (videoB64) {
            await writeFile(filePath, Buffer.from(videoB64, 'base64'));
        } else {
            return NextResponse.json({
                error: 'No video data in response',
                status: 'error',
                debug: JSON.stringify(videoEntry).slice(0, 500),
            }, { status: 500 });
        }

        const videoUrl = `/api/files/videos/${filename}`;
        return NextResponse.json({ status: 'done', videoUrl });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error', status: 'error' },
            { status: 500 }
        );
    }
}
