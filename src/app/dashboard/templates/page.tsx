'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useToastStore } from '@/store/toast-store';

interface TemplateInfo {
    id: string;
    name: string;
    imageUrl: string;
}

export default function TemplatesPage() {
    const { workspaces, activeId } = useWorkspaceStore();
    const addToast = useToastStore((s) => s.addToast);
    const [selectedWs, setSelectedWs] = useState(activeId);
    const [templates, setTemplates] = useState<TemplateInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const fetchTemplates = useCallback(() => {
        setLoading(true);
        fetch(`/api/templates?workspace=${encodeURIComponent(selectedWs)}`)
            .then(r => r.ok ? r.json() : [])
            .then(t => { setTemplates(Array.isArray(t) ? t : []); })
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, [selectedWs]);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    const saveTemplates = async (updated: TemplateInfo[]) => {
        const res = await fetch(`/api/templates?workspace=${encodeURIComponent(selectedWs)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error('Save failed');
        setTemplates(updated);
    };

    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        try {
            const updated = templates.map(t => t.id === id ? { ...t, name: editName.trim() } : t);
            await saveTemplates(updated);
            setEditingId(null);
            addToast('success', 'Đã đổi tên template');
        } catch {
            addToast('error', 'Đổi tên thất bại');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Xoá template "${name || 'Untitled'}"?`)) return;
        try {
            const updated = templates.filter(t => t.id !== id);
            await saveTemplates(updated);
            addToast('success', 'Đã xoá template');
        } catch {
            addToast('error', 'Xoá thất bại');
        }
    };

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
                        <p className="dash-empty-hint">Mở Editor để thêm template mockup.</p>
                    </div>
                ) : (
                    <div className="dash-cards">
                        {templates.map((t) => (
                            <div key={t.id} className="dash-card dash-card--media">
                                {t.imageUrl && (
                                    <img
                                        src={t.imageUrl}
                                        alt={t.name}
                                        className="dash-card-img"
                                    />
                                )}
                                <div className="dash-card-body">
                                    {editingId === t.id ? (
                                        <form onSubmit={(e) => { e.preventDefault(); handleRename(t.id); }} className="dash-inline-edit">
                                            <input
                                                className="dash-form-input"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                autoFocus
                                            />
                                            <button type="submit" className="btn-primary btn-sm">Lưu</button>
                                            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingId(null)}>Huỷ</button>
                                        </form>
                                    ) : (
                                        <>
                                            <div className="dash-card-title">{t.name || 'Untitled'}</div>
                                            <div className="dash-card-sub">ID: {t.id.slice(0, 8)}...</div>
                                            <div className="dash-card-actions">
                                                <button
                                                    className="btn-secondary btn-sm"
                                                    onClick={() => { setEditingId(t.id); setEditName(t.name || ''); }}
                                                >
                                                    Đổi tên
                                                </button>
                                                <button
                                                    className="btn-danger btn-sm"
                                                    onClick={() => handleDelete(t.id, t.name)}
                                                >
                                                    Xoá
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
