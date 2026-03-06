'use client';

import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useToastStore } from '@/store/toast-store';
import Link from 'next/link';

export default function DashboardPage() {
    const { workspaces, activeId, createWorkspace, deleteWorkspace, switchWorkspace } = useWorkspaceStore();
    const addToast = useToastStore((s) => s.addToast);
    const [stats, setStats] = useState({ templates: 0 });
    const [newWsName, setNewWsName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetch('/api/templates?workspace=default')
            .then(r => r.ok ? r.json() : [])
            .then(t => setStats(s => ({ ...s, templates: Array.isArray(t) ? t.length : 0 })))
            .catch(() => {});
    }, []);

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newWsName.trim()) return;
        setCreating(true);
        try {
            await createWorkspace(newWsName.trim());
            addToast('success', `Đã tạo workspace "${newWsName.trim()}"`);
            setNewWsName('');
        } catch {
            addToast('error', 'Tạo workspace thất bại');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteWorkspace = (id: string, name: string) => {
        if (id === 'default') return;
        if (!confirm(`Xoá workspace "${name}"? Dữ liệu sẽ bị mất.`)) return;
        deleteWorkspace(id);
        addToast('success', `Đã xoá workspace "${name}"`);
    };

    return (
        <>
            <header className="dash-topbar">
                <h1>Tổng quan</h1>
                <Link href="/" className="btn-primary">Mở Editor</Link>
            </header>
            <div className="dash-content">
                <div className="dash-cards">
                    <div className="dash-card">
                        <div className="dash-card-label">Workspaces</div>
                        <div className="dash-card-value">{workspaces.length}</div>
                        <div className="dash-card-sub">Không gian làm việc</div>
                    </div>
                    <div className="dash-card">
                        <div className="dash-card-label">Templates</div>
                        <div className="dash-card-value">{stats.templates}</div>
                        <div className="dash-card-sub">Mẫu mockup (workspace mặc định)</div>
                    </div>
                </div>

                <div className="dash-section">
                    <h2>Workspaces</h2>
                    <form onSubmit={handleCreateWorkspace} className="dash-inline-create">
                        <input
                            className="dash-form-input"
                            placeholder="Tên workspace mới..."
                            value={newWsName}
                            onChange={(e) => setNewWsName(e.target.value)}
                        />
                        <button className="btn-primary btn-sm" type="submit" disabled={creating || !newWsName.trim()}>
                            {creating ? 'Đang tạo...' : 'Tạo mới'}
                        </button>
                    </form>
                    <div className="dash-cards">
                        {workspaces.map((ws) => (
                            <div key={ws.id} className={`dash-card ${ws.id === activeId ? 'dash-card--active' : ''}`}>
                                <div className="dash-card-label">{ws.id === 'default' ? 'Mặc định' : ws.id}</div>
                                <div className="dash-card-value" style={{ fontSize: 18 }}>{ws.name}</div>
                                {ws.createdAt > 0 && (
                                    <div className="dash-card-sub">
                                        Tạo: {new Date(ws.createdAt).toLocaleDateString('vi')}
                                    </div>
                                )}
                                <div className="dash-card-actions">
                                    {ws.id !== activeId && (
                                        <button className="btn-secondary btn-sm" onClick={() => switchWorkspace(ws.id)}>
                                            Chuyển đến
                                        </button>
                                    )}
                                    {ws.id !== 'default' && (
                                        <button className="btn-danger btn-sm" onClick={() => handleDeleteWorkspace(ws.id, ws.name)}>
                                            Xoá
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
