'use client';

import { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import UploadZone from '@/components/UploadZone';
import VariationGrid from '@/components/VariationGrid';
import MockupEditor from '@/components/MockupEditor';
import VideoGenerator from '@/components/VideoGenerator';
import { Sparkles, LogOut, Plus, X, Folder, UploadCloud, Layers, Film } from '@/components/ui-icons';
import type { WorkflowStep } from '@/types';

const NAV_ITEMS: { id: WorkflowStep; icon: typeof UploadCloud; label: string }[] = [
    { id: 'upload', icon: UploadCloud, label: 'Upload' },
    { id: 'variations', icon: Sparkles, label: 'Biến thể' },
    { id: 'mockup', icon: Layers, label: 'Mockup' },
    { id: 'video', icon: Film, label: 'Video' },
];

function UserMenu() {
    const [username, setUsername] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('design-tool-user') || '';
        }
        return '';
    });

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('design-tool-user');
        window.location.href = '/login';
    };

    if (!username) return null;

    return (
        <div className="app-user">
            <div className="app-user-avatar">{username.charAt(0)}</div>
            <span className="app-user-name">{username}</span>
            <button onClick={handleLogout} className="app-user-logout" title="Đăng xuất">
                <LogOut size={14} />
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
        <div className="app-ws">
            <span className="app-ws-icon"><Folder size={14} /></span>
            <select
                value={activeId}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="app-ws-select"
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
                        placeholder="Tên workspace"
                        className="app-ws-input"
                        onBlur={() => { if (!newName.trim()) setShowNew(false); }}
                    />
                    <button type="submit" className="app-toolbar-btn">OK</button>
                </form>
            ) : (
                <button onClick={() => setShowNew(true)} title="Tạo workspace mới" className="app-toolbar-btn">
                    <Plus size={14} />
                </button>
            )}

            {activeId !== 'default' && (
                <button
                    onClick={() => { if (confirm('Xoá workspace này?')) deleteWorkspace(activeId); }}
                    title="Xoá workspace"
                    className="app-toolbar-btn app-toolbar-btn-danger"
                ><X size={14} /></button>
            )}
        </div>
    );
}

function useExtensionUpload() {
    const handled = useRef(false);
    const { addSourceDesign, setStep } = useWorkflowStore();

    useEffect(() => {
        if (handled.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('ext-upload') !== '1') return;
        handled.current = true;

        const id = params.get('file-id');
        const name = params.get('file-name');
        const url = params.get('file-url');

        if (id && url) {
            const img = new Image();
            img.onload = () => {
                addSourceDesign({ id, name: name || 'extension-upload.png', url, width: img.naturalWidth, height: img.naturalHeight });
                setStep('variations');
            };
            img.onerror = () => {
                addSourceDesign({ id, name: name || 'extension-upload.png', url, width: 0, height: 0 });
                setStep('variations');
            };
            img.src = url;
        }

        window.history.replaceState({}, '', '/');
    }, [addSourceDesign, setStep]);
}

export default function Home() {
    useExtensionUpload();
    const { currentStep, setStep, sourceDesigns } = useWorkflowStore();

    const canNavigate = (stepId: WorkflowStep) => {
        if (stepId === 'upload') return true;
        if (stepId === 'variations') return sourceDesigns.length > 0;
        if (stepId === 'mockup') return true;
        if (stepId === 'video') return true;
        return false;
    };

    return (
        <div className="app-shell">
            {/* Sidebar */}
            <aside className="app-sidebar">
                <div className="app-sidebar-logo">
                    <Sparkles size={16} />
                </div>
                <nav className="app-sidebar-nav">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = currentStep === item.id;
                        const enabled = canNavigate(item.id);
                        return (
                            <button
                                key={item.id}
                                className={`app-sidebar-item ${active ? 'active' : ''}`}
                                onClick={() => enabled && setStep(item.id)}
                                title={item.label}
                                disabled={!enabled}
                            >
                                <Icon size={18} />
                            </button>
                        );
                    })}
                </nav>
            </aside>

            {/* Main area */}
            <div className="app-body">
                {/* Toolbar */}
                <header className="app-toolbar">
                    <div className="app-toolbar-left">
                        <WorkspaceSwitcher />
                        <div className="app-toolbar-sep" />
                        <div className="app-toolbar-step">
                            {NAV_ITEMS.find((n) => n.id === currentStep)?.label}
                        </div>
                    </div>
                    <div className="app-toolbar-right">
                        <UserMenu />
                    </div>
                </header>

                {/* Content */}
                <main className="app-content">
                    {currentStep === 'upload' && <UploadZone />}
                    {currentStep === 'variations' && <VariationGrid />}
                    {currentStep === 'mockup' && <MockupEditor />}
                    {currentStep === 'video' && <VideoGenerator />}
                </main>
            </div>
        </div>
    );
}
