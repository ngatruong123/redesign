'use client';

import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import StepIndicator from '@/components/StepIndicator';
import UploadZone from '@/components/UploadZone';
import VariationGrid from '@/components/VariationGrid';
import MockupEditor from '@/components/MockupEditor';
import VideoGenerator from '@/components/VideoGenerator';

function UserMenu() {
    const [username, setUsername] = useState('');

    useEffect(() => {
        const user = localStorage.getItem('design-tool-user') || '';
        setUsername(user);
    }, []);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('design-tool-user');
        window.location.href = '/login';
    };

    if (!username) return null;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                {username}
            </span>
            <button
                onClick={handleLogout}
                style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 13,
                    cursor: 'pointer',
                }}
            >
                Đăng xuất
            </button>
        </div>
    );
}

function WorkspaceSwitcher() {
    const { workspaces, activeId, createWorkspace, deleteWorkspace, switchWorkspace } = useWorkspaceStore();
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) return;
        createWorkspace(name);
        setNewName('');
        setShowNew(false);
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
                value={activeId}
                onChange={(e) => switchWorkspace(e.target.value)}
                style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'inherit',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                }}
            >
                {workspaces.map((w) => (
                    <option key={w.id} value={w.id} style={{ color: '#000' }}>{w.name}</option>
                ))}
            </select>

            {showNew ? (
                <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} style={{ display: 'flex', gap: '4px' }}>
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Name"
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            color: 'inherit',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '13px',
                            width: '120px',
                        }}
                        onBlur={() => { if (!newName.trim()) setShowNew(false); }}
                    />
                    <button type="submit" style={{ background: 'rgba(255,255,255,0.15)', color: 'inherit', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '13px' }}>OK</button>
                </form>
            ) : (
                <button
                    onClick={() => setShowNew(true)}
                    title="Tạo workspace mới"
                    style={{ background: 'rgba(255,255,255,0.15)', color: 'inherit', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}
                >+</button>
            )}

            {activeId !== 'default' && (
                <button
                    onClick={() => { if (confirm('Xoá workspace này?')) deleteWorkspace(activeId); }}
                    title="Xoá workspace"
                    style={{ background: 'rgba(255,100,100,0.25)', color: 'inherit', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}
                >×</button>
            )}
        </div>
    );
}

export default function Home() {
    const { currentStep } = useWorkflowStore();

    // Cleanup removed: state now persists across reloads, so we keep uploaded files

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="app-logo">
                    <div className="logo-icon">🎨</div>
                    Công cụ thiết kế
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <WorkspaceSwitcher />
                    <UserMenu />
                </div>
            </header>

            <StepIndicator />

            <main className="app-main">
                {currentStep === 'upload' && <UploadZone />}
                {currentStep === 'variations' && <VariationGrid />}
                {currentStep === 'mockup' && <MockupEditor />}
                {currentStep === 'video' && <VideoGenerator />}
            </main>
        </div>
    );
}
