'use client';

import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import StepIndicator from '@/components/StepIndicator';
import UploadZone from '@/components/UploadZone';
import VariationGrid from '@/components/VariationGrid';
import MockupEditor from '@/components/MockupEditor';
import VideoGenerator from '@/components/VideoGenerator';
import { Sparkles, LogOut, Plus, X, Folder } from '@/components/ui-icons';

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
        <div className="user-menu">
            <div className="user-avatar">{username.charAt(0)}</div>
            <span className="user-name">{username}</span>
            <button onClick={handleLogout} className="user-logout" title="Đăng xuất">
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
        <div className="ws-switcher">
            <span className="ws-icon"><Folder size={14} /></span>
            <select
                value={activeId}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="ws-select"
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
                        className="ws-input"
                        onBlur={() => { if (!newName.trim()) setShowNew(false); }}
                    />
                    <button type="submit" className="ws-btn">OK</button>
                </form>
            ) : (
                <button
                    onClick={() => setShowNew(true)}
                    title="Tạo workspace mới"
                    className="ws-btn"
                ><Plus size={14} /></button>
            )}

            {activeId !== 'default' && (
                <button
                    onClick={() => { if (confirm('Xoá workspace này?')) deleteWorkspace(activeId); }}
                    title="Xoá workspace"
                    className="ws-btn ws-btn-danger"
                ><X size={14} /></button>
            )}
        </div>
    );
}

export default function Home() {
    const { currentStep } = useWorkflowStore();

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="app-logo">
                    <div className="logo-icon"><Sparkles size={16} /></div>
                    Design Tool
                </div>
                <div className="app-header-right">
                    <WorkspaceSwitcher />
                    <div className="app-header-sep" />
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
