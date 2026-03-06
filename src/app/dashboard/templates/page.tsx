'use client';

import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';

interface TemplateInfo {
    id: string;
    name: string;
    imageUrl: string;
}

export default function TemplatesPage() {
    const { workspaces, activeId } = useWorkspaceStore();
    const [selectedWs, setSelectedWs] = useState(activeId);
    const [templates, setTemplates] = useState<TemplateInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/templates?workspace=${encodeURIComponent(selectedWs)}`)
            .then(r => r.ok ? r.json() : [])
            .then(t => { setTemplates(Array.isArray(t) ? t : []); })
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, [selectedWs]);

    return (
        <>
            <header className="dash-topbar">
                <h1>Templates</h1>
                <select
                    value={selectedWs}
                    onChange={(e) => setSelectedWs(e.target.value)}
                    className="dash-form-input"
                    style={{ width: 'auto', maxWidth: 200 }}
                >
                    {workspaces.map(ws => (
                        <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                </select>
            </header>
            <div className="dash-content">
                {loading ? (
                    <div className="dash-empty">Đang tải...</div>
                ) : templates.length === 0 ? (
                    <div className="dash-empty">
                        <p>Chưa có template nào trong workspace này.</p>
                        <p style={{ marginTop: 8 }}>Mở Editor để thêm template mockup.</p>
                    </div>
                ) : (
                    <div className="dash-cards">
                        {templates.map((t) => (
                            <div key={t.id} className="dash-card" style={{ padding: 0, overflow: 'hidden' }}>
                                {t.imageUrl && (
                                    <img
                                        src={t.imageUrl}
                                        alt={t.name}
                                        style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                                    />
                                )}
                                <div style={{ padding: '12px 16px' }}>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name || 'Untitled'}</div>
                                    <div className="dash-card-sub">ID: {t.id.slice(0, 8)}...</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
