'use client';

import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';
import Link from 'next/link';

export default function DashboardPage() {
    const { workspaces } = useWorkspaceStore();
    const [stats, setStats] = useState({ templates: 0, mockups: 0 });

    useEffect(() => {
        // Fetch basic stats
        fetch('/api/templates?workspace=default')
            .then(r => r.ok ? r.json() : [])
            .then(t => setStats(s => ({ ...s, templates: Array.isArray(t) ? t.length : 0 })))
            .catch(() => {});
    }, []);

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
                    <div className="dash-cards">
                        {workspaces.map((ws) => (
                            <div key={ws.id} className="dash-card">
                                <div className="dash-card-label">{ws.id === 'default' ? 'Mặc định' : ws.id}</div>
                                <div className="dash-card-value" style={{ fontSize: 18 }}>{ws.name}</div>
                                {ws.createdAt > 0 && (
                                    <div className="dash-card-sub">
                                        Tạo: {new Date(ws.createdAt).toLocaleDateString('vi')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
