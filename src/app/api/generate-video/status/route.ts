import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ensureStorageDir } from '@/lib/storage';

const API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

export async function GET(req: NextRequest) {
    try {
        if (!API_KEY) {
            return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
        }

        const op = req.nextUrl.searchParams.get('op');
        if (!op) {
            return NextResponse.json({ error: 'op parameter required' }, { status: 400 });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/${op}?key=${API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: `Poll error: ${err}` }, { status: res.status });
        }

        const data = await res.json();

        if (!data.done) {
            return NextResponse.json({ status: 'generating' });
        }

        // Log raw response structure for debugging
        console.log('[Veo status] Raw response keys:', JSON.stringify(Object.keys(data)));
        console.log('[Veo status] data.response keys:', data.response ? JSON.stringify(Object.keys(data.response)) : 'null');
        console.log('[Veo status] Full response (truncated):', JSON.stringify(data).slice(0, 2000));

        // Try multiple known response structures
        const videos = data.response?.generateVideoResponse?.generatedSamples
            || data.response?.generatedSamples
            || data.response?.videos
            || data.response?.predictions
            || [];

        if (videos.length === 0) {
            return NextResponse.json({
                error: 'No video generated',
                status: 'error',
                debug: JSON.stringify(data.response || data).slice(0, 1000),
            }, { status: 500 });
        }

        const videoB64 = videos[0].video?.bytesBase64Encoded
            || videos[0].bytesBase64Encoded
            || videos[0].video?.uri;
        if (!videoB64) {
            return NextResponse.json({
                error: 'No video data in response',
                status: 'error',
                debug: JSON.stringify(videos[0]).slice(0, 1000),
            }, { status: 500 });
        }

        // Save video to disk (always local to avoid CORS issues)
        const dir = await ensureStorageDir('videos');
        const filename = `${uuidv4()}.mp4`;
        const filePath = `${dir}/${filename}`;

        if (typeof videoB64 === 'string' && videoB64.startsWith('http')) {
            // Download from GCS URI to local disk (append API key if needed)
            const downloadUrl = new URL(videoB64);
            if (!downloadUrl.searchParams.has('key')) {
                downloadUrl.searchParams.set('key', API_KEY!);
            }
            console.log('[Veo status] Downloading video from:', downloadUrl.origin + downloadUrl.pathname);
            const videoRes = await fetch(downloadUrl.toString());
            if (!videoRes.ok) {
                const errBody = await videoRes.text().catch(() => '');
                console.error('[Veo status] Download failed:', videoRes.status, errBody.slice(0, 500));
                return NextResponse.json({
                    error: `Failed to download video from Google Cloud (${videoRes.status})`,
                    status: 'error',
                    debug: errBody.slice(0, 500),
                }, { status: 500 });
            }
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            await writeFile(filePath, videoBuffer);
        } else {
            await writeFile(filePath, Buffer.from(videoB64, 'base64'));
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
