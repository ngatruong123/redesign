'use client';

import { useState } from 'react';

export default function TestDownloadPage() {
    const [log, setLog] = useState<string[]>([]);
    const [mockupUrl, setMockupUrl] = useState('');
    const [zipUrl, setZipUrl] = useState('');
    const [imgVisible, setImgVisible] = useState(false);

    const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

    // Simulate full MockupEditor flow
    const runFullTest = async () => {
        setLog([]);
        try {
            // 1. Create & upload test image
            addLog('1. Creating test image...');
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 200;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ff6600'; ctx.fillRect(0, 0, 200, 200);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText('MOCKUP TEST', 20, 110);

            const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
            const formData = new FormData();
            formData.append('file', blob, 'test-mockup.png');

            const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();
            addLog('   Upload OK: ' + uploadData.url);

            // 2. Generate mockup batch (same image as template + design)
            addLog('2. Generating mockup batch...');
            const batchRes = await fetch('/api/mockup/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [{
                        mockupImagePath: uploadData.url,
                        designImagePath: uploadData.url,
                        mask: { x: 10, y: 10, width: 100, height: 100, rotation: 0 },
                        templateName: 'TestTemplate',
                        variationName: 'TestVariation',
                    }]
                }),
            });
            const batchData = await batchRes.json();
            addLog('   Batch response: ' + JSON.stringify(batchData));

            const result = batchData.results[0];
            setMockupUrl(result.imageUrl);
            setZipUrl(batchData.zipUrl);
            setImgVisible(true);
            addLog('   Mockup URL: ' + result.imageUrl);
            addLog('   ZIP URL: ' + batchData.zipUrl);
            addLog('');
            addLog('3. Ready! Now click download buttons below.');
        } catch (e) {
            addLog('ERROR: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    // Exact same triggerDownload as MockupEditor
    const triggerDownload = async (imageUrl: string, filename: string) => {
        try {
            addLog('--- triggerDownload ---');
            addLog('imageUrl: "' + imageUrl + '"');
            addLog('filename: "' + filename + '"');

            if (!imageUrl) {
                addLog('ERROR: imageUrl is empty!');
                return;
            }

            addLog('Fetching...');
            const res = await fetch(imageUrl);
            addLog('Status: ' + res.status);
            addLog('Content-Type: ' + res.headers.get('content-type'));

            if (!res.ok) {
                const text = await res.text();
                addLog('ERROR response: ' + text.substring(0, 200));
                return;
            }

            const blob = await res.blob();
            addLog('Blob: size=' + blob.size + ' type=' + blob.type);

            const url = URL.createObjectURL(blob);
            addLog('ObjectURL: ' + url);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 3000);
            addLog('DONE - check downloads folder');
        } catch (err) {
            addLog('CATCH ERROR: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const makeSafeFilename = (templateName: string, variationName: string) =>
        `${templateName}-${variationName}.png`.replace(/[^a-zA-Z0-9._-]/g, '_');

    return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', background: '#0a0a0f', color: '#f0f0f5', minHeight: '100vh' }}>
            <h2>MockupEditor Download Test</h2>
            <p style={{ color: '#9898aa' }}>Simulates exact MockupEditor flow: upload → batch mockup → download</p>

            <button onClick={runFullTest} style={{ padding: '12px 24px', margin: 8, background: '#00e68a', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
                Run Full Test
            </button>

            {mockupUrl && (
                <div style={{ marginTop: 20 }}>
                    <h3>Results:</h3>
                    {imgVisible && (
                        <div style={{ marginBottom: 12 }}>
                            <p>Image preview (proves URL works):</p>
                            <img src={mockupUrl} style={{ width: 150, border: '1px solid #333', borderRadius: 8 }} />
                        </div>
                    )}

                    <button
                        onClick={() => triggerDownload(mockupUrl, makeSafeFilename('TestTemplate', 'TestVariation'))}
                        style={{ padding: '10px 20px', margin: 8, background: '#4dacff', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                        Download Mockup PNG
                    </button>

                    <button
                        onClick={() => triggerDownload(zipUrl, 'mockups.zip')}
                        style={{ padding: '10px 20px', margin: 8, background: '#ffb84d', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                        Download ZIP
                    </button>
                </div>
            )}

            <pre style={{ background: '#1a1a26', padding: 16, borderRadius: 8, marginTop: 20, whiteSpace: 'pre-wrap', fontSize: 13, border: '1px solid rgba(255,255,255,0.06)', maxHeight: 400, overflow: 'auto' }}>
                {log.join('\n') || 'Click "Run Full Test" to begin...'}
            </pre>
        </div>
    );
}
