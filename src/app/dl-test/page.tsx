'use client';

import { useState } from 'react';

export default function DlTestPage() {
    const [log, setLog] = useState<string[]>([]);
    const addLog = (s: string) => setLog(p => [...p, s]);

    const mockupUrl = '/api/files/mockups/5df3a5fb-2b7c-4c8e-b7fe-77c345cfc466.png';
    const zipUrl = '/api/files/mockups/7e0b253f-36ac-4526-91fc-92e29fbb3aef.zip';

    const downloadFetchBlob = async (url: string, name: string) => {
        addLog(`fetch+blob: ${url}`);
        try {
            const res = await fetch(url);
            addLog(`  status=${res.status} content-type=${res.headers.get('content-type')}`);
            if (!res.ok) { addLog('  ERROR: ' + res.status); return; }
            const blob = await res.blob();
            addLog(`  blob: size=${blob.size} type=${blob.type}`);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); }, 3000);
            addLog('  DONE');
        } catch (e) {
            addLog('  ERROR: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div style={{ padding: 40, background: '#111', color: '#eee', minHeight: '100vh', fontFamily: 'sans-serif' }}>
            <h2>React Download Test (same URLs as static page)</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                <button onClick={() => downloadFetchBlob(mockupUrl, 'test-react.png')}
                    style={{ padding: '10px 20px', background: '#4dacff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                    PNG fetch+blob (React)
                </button>
                <button onClick={() => downloadFetchBlob(zipUrl, 'test-react.zip')}
                    style={{ padding: '10px 20px', background: '#ffb84d', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                    ZIP fetch+blob (React)
                </button>
            </div>
            <pre style={{ background: '#222', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {log.join('\n') || 'Click buttons...'}
            </pre>
        </div>
    );
}
