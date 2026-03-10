import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';
import { hexToRgb, deltaE } from '@/lib/color-science';
import { composeBg } from '@/lib/bg-compose';
import { removeBgSchema } from '@/lib/validators';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

const REMBG_PATH = process.env.REMBG_PATH || '/home/ngatruong/.local/bin/rembg';
const REMBG_MODEL = process.env.REMBG_MODEL || 'u2net';

async function removeBackgroundRembg(inputBuffer: Buffer): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const id = uuidv4();
    const inputPath = path.join(tmpDir, `rembg-in-${id}.png`);
    const outputPath = path.join(tmpDir, `rembg-out-${id}.png`);

    try {
        await writeFile(inputPath, inputBuffer);
        const rembgEnv = { ...process.env };
        // Ensure rembg can find its Python packages and model files
        if (process.env.REMBG_PYTHONPATH) {
            rembgEnv.PYTHONPATH = process.env.REMBG_PYTHONPATH;
        }
        if (process.env.U2NET_HOME) {
            rembgEnv.U2NET_HOME = process.env.U2NET_HOME;
        }
        await execFileAsync(REMBG_PATH, ['i', '-m', REMBG_MODEL, inputPath, outputPath], { timeout: 60000, env: rembgEnv });
        const result = await readFile(outputPath);
        return result;
    } finally {
        await unlink(inputPath).catch(() => {});
        await unlink(outputPath).catch(() => {});
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const parsed = removeBgSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
        }
        const { imageUrl, mode = 'transparent', bgColor, gradientId, customBgUrl, edgeSmooth = false, keyColor, tolerance: toleranceRaw, softEdge: softEdgeRaw } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: 'No image URL' }, { status: 400 });
        }

        let fileBuffer: Buffer;
        try {
            fileBuffer = await resolveToBuffer(imageUrl);
        } catch {
            return NextResponse.json({ error: 'Không tìm thấy ảnh gốc. Vui lòng tải lại ảnh.' }, { status: 404 });
        }

        const meta = await sharp(fileBuffer).metadata();
        const imgW = meta.width || 1024;
        const imgH = meta.height || 1024;

        // Color key modes
        const protectSubject = body.protectSubject === true;

        if (mode === 'colorkey') {
            const target = hexToRgb(keyColor || '#00ff00');
            const tol = Math.max(0, Math.min(100, Number(toleranceRaw) || 30));
            const soft = Math.max(0, Math.min(50, Number(softEdgeRaw) || 15));
            const { data, info } = await sharp(fileBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const px = new Uint8Array(data.buffer, data.byteOffset, data.length);

            // If protectSubject is enabled, get AI mask to protect the subject area
            let subjectMask: Uint8Array | null = null;
            if (protectSubject) {
                try {
                    const pngInput = await sharp(fileBuffer).png().toBuffer();
                    const aiResult = await removeBackgroundRembg(pngInput);
                    // Extract alpha channel from AI result as subject mask
                    const aiRaw = await sharp(aiResult)
                        .resize(info.width, info.height)
                        .ensureAlpha()
                        .raw()
                        .toBuffer();
                    const aiPx = new Uint8Array(aiRaw.buffer, aiRaw.byteOffset, aiRaw.length);
                    subjectMask = new Uint8Array(info.width * info.height);
                    for (let i = 0; i < subjectMask.length; i++) {
                        subjectMask[i] = aiPx[i * 4 + 3]; // alpha channel = subject confidence
                    }
                } catch (err) {
                    console.error('AI mask failed, falling back to basic colorkey:', err);
                }
            }

            const th = tol * 0.5, sz = soft * 0.5;
            for (let i = 0; i < px.length; i += 4) {
                const pixelIdx = i / 4;
                // If subject mask exists and pixel is part of subject, skip it
                if (subjectMask && subjectMask[pixelIdx] > 128) continue;

                const d = deltaE(px[i], px[i + 1], px[i + 2], target.r, target.g, target.b);
                if (d <= th) px[i + 3] = 0;
                else if (sz > 0 && d <= th + sz) {
                    const t = (d - th) / sz;
                    // Blend with subject mask for smooth transitions near edges
                    const maskFactor = subjectMask ? subjectMask[pixelIdx] / 128 : 0;
                    const alpha = Math.round(t * t * (3 - 2 * t) * px[i + 3]);
                    px[i + 3] = Math.min(px[i + 3], Math.max(alpha, Math.round(maskFactor * px[i + 3])));
                }
            }
            let out = await sharp(Buffer.from(px.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
            if (edgeSmooth) out = await sharp(out).blur(1.5).png().toBuffer();
            const { url } = await storeFile('variations', `${uuidv4()}.png`, out);
            return NextResponse.json({ url });
        }

        // Background removal via rembg (AI model)
        let subjectBuffer: Buffer;
        try {
            // Ensure input is PNG for rembg
            const pngInput = await sharp(fileBuffer).png().toBuffer();
            subjectBuffer = await removeBackgroundRembg(pngInput);
            if (edgeSmooth) subjectBuffer = await sharp(subjectBuffer).blur(1.5).png().toBuffer();
        } catch (err) {
            console.error('Background removal error:', err);
            return NextResponse.json({ error: 'Tách nền thất bại. Vui lòng thử lại.' }, { status: 500 });
        }

        // Compose final output
        const outputBuffer = await composeBg(subjectBuffer, fileBuffer, imgW, imgH, mode, { bgColor, gradientId, customBgUrl });
        const { url } = await storeFile('variations', `${uuidv4()}.png`, outputBuffer);
        return NextResponse.json({ url });
    } catch (error) {
        console.error('Remove BG error:', error);
        return NextResponse.json({ error: 'Remove BG failed' }, { status: 500 });
    }
}
