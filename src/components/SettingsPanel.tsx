'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useToastStore } from '@/store/toast-store';
import { useWorkflowStore } from '@/store/workflow-store';

function useUsername() {
    return useSyncExternalStore(
        (cb) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb); },
        () => localStorage.getItem('design-tool-user') || '',
        () => '',
    );
}

interface TemplateInfo {
    id: string;
    name: string;
    imageUrl: string;
}

interface ServerWorkspace {
    id: string;
    name: string;
}

// ─── Tab navigation ───
type SettingsTab = 'general' | 'api-keys' | 'templates';

const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'Chung' },
    { id: 'api-keys', label: 'API Keys' },
    { id: 'templates', label: 'Templates' },
];

export default function SettingsPanel() {
    const [tab, setTab] = useState<SettingsTab>('general');

    return (
        <div className="settings-panel">
            <div className="settings-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        className={`settings-tab ${tab === t.id ? 'settings-tab--active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="settings-body">
                {tab === 'general' && <GeneralTab />}
                {tab === 'api-keys' && <ApiKeysTab />}
                {tab === 'templates' && <TemplatesTab />}
            </div>
        </div>
    );
}

// ─── General: account + password + workspaces ───
function GeneralTab() {
    const username = useUsername();
    const addToast = useToastStore((s) => s.addToast);
    const { workspaces, activeId, createWorkspace, deleteWorkspace, switchWorkspace } = useWorkspaceStore();
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [saving, setSaving] = useState(false);
    const [newWsName, setNewWsName] = useState('');

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPw || !newPw || newPw.length < 8) {
            addToast('error', 'Mật khẩu mới phải ít nhất 8 ký tự');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed');
            }
            addToast('success', 'Đã đổi mật khẩu');
            setCurrentPw('');
            setNewPw('');
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newWsName.trim()) return;
        try {
            await createWorkspace(newWsName.trim());
            addToast('success', `Đã tạo workspace "${newWsName.trim()}"`);
            setNewWsName('');
        } catch {
            addToast('error', 'Tạo workspace thất bại');
        }
    };

    return (
        <>
            <section className="settings-section">
                <h3 className="settings-section-title">Tài khoản</h3>
                <div className="settings-field">
                    <label className="settings-label">Username</label>
                    <input className="settings-input" value={username} disabled />
                </div>
            </section>

            <section className="settings-section">
                <h3 className="settings-section-title">Đổi mật khẩu</h3>
                <form onSubmit={handleChangePassword}>
                    <div className="settings-field">
                        <label className="settings-label">Mật khẩu hiện tại</label>
                        <input className="settings-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                    </div>
                    <div className="settings-field">
                        <label className="settings-label">Mật khẩu mới</label>
                        <input className="settings-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                        <span className="settings-hint">Tối thiểu 8 ký tự</span>
                    </div>
                    <button className="btn-primary" type="submit" disabled={saving}>
                        {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
                    </button>
                </form>
            </section>

            <section className="settings-section">
                <h3 className="settings-section-title">Workspaces</h3>
                <form onSubmit={handleCreateWorkspace} className="settings-row">
                    <input
                        className="settings-input"
                        placeholder="Tên workspace mới..."
                        value={newWsName}
                        onChange={(e) => setNewWsName(e.target.value)}
                    />
                    <button className="btn-primary" type="submit" disabled={!newWsName.trim()}>Tạo</button>
                </form>
                <div className="settings-list">
                    {workspaces.map((ws, i) => (
                        <div key={ws.id} className={`settings-list-item ${ws.id === activeId ? 'settings-list-item--active' : ''} ${i === 0 ? 'settings-list-item--first' : ''}`}>
                            <div className="settings-list-item-info">
                                <span className="settings-list-item-name">{ws.name}</span>
                                {ws.id === activeId && <span className="settings-badge">Đang dùng</span>}
                            </div>
                            <div className="settings-list-item-actions">
                                {ws.id !== activeId && (
                                    <button className="btn-ghost-sm" onClick={() => switchWorkspace(ws.id)}>Chuyển</button>
                                )}
                                {ws.id !== 'default' && (
                                    <button
                                        className="btn-ghost-sm settings-btn-danger"
                                        onClick={() => { if (confirm(`Xoá workspace "${ws.name}"?`)) deleteWorkspace(ws.id); }}
                                    >
                                        Xoá
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

function maskKey(value: string): string {
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '****' + value.slice(-4);
}

// ─── API Keys tab ───
function ApiKeysTab() {
    const addToast = useToastStore((s) => s.addToast);
    // Provider selection
    const [selectedProvider, setSelectedProvider] = useState('gemini');
    const [savingProvider, setSavingProvider] = useState(false);
    // Gemini
    const [geminiKey, setGeminiKey] = useState('');
    const [geminiMasked, setGeminiMasked] = useState('');
    const [hasEnvKey, setHasEnvKey] = useState(false);
    const [geminiLoading, setGeminiLoading] = useState(false);
    const [geminiTesting, setGeminiTesting] = useState(false);
    // Ideogram
    const [ideogramKey, setIdeogramKey] = useState('');
    const [ideogramMasked, setIdeogramMasked] = useState('');
    const [hasIdeogramEnvKey] = useState(false);
    const [ideogramLoading, setIdeogramLoading] = useState(false);
    const [ideogramTesting, setIdeogramTesting] = useState(false);

    useEffect(() => {
        // Load from localStorage first (works without DB)
        const localProvider = localStorage.getItem('ai_provider');
        if (localProvider) setSelectedProvider(localProvider);
        // Then try DB
        fetch('/api/user-settings')
            .then((r) => r.json())
            .then((data) => {
                if (data.settings?.gemini_api_key) setGeminiMasked(data.settings.gemini_api_key);
                if (data.settings?.ideogram_api_key) setIdeogramMasked(data.settings.ideogram_api_key);
                if (data.settings?.ai_provider) {
                    setSelectedProvider(data.settings.ai_provider);
                    localStorage.setItem('ai_provider', data.settings.ai_provider);
                }
                if (data.hasEnvKey) setHasEnvKey(true);
            })
            .catch(() => {});
    }, []);

    const handleProviderChange = async (provider: string) => {
        setSelectedProvider(provider);
        localStorage.setItem('ai_provider', provider);
        // Also try saving to DB (may fail on local dev without DB)
        setSavingProvider(true);
        try {
            const res = await fetch('/api/user-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'ai_provider', value: provider }),
            });
            if (!res.ok) console.warn('Failed to save provider to DB, using localStorage');
        } catch {
            // DB not available (local dev), localStorage is fine
        } finally {
            setSavingProvider(false);
        }
        addToast('success', `Đã chuyển sang ${provider === 'ideogram' ? 'Ideogram' : 'Gemini'}`);
    };

    // ─── Gemini handlers ───
    const handleGeminiSave = async () => {
        if (!geminiKey.trim()) return;
        setGeminiLoading(true);
        try {
            const res = await fetch('/api/user-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'gemini_api_key', value: geminiKey }),
            });
            const data = await res.json();
            if (res.ok) {
                setGeminiMasked(data.masked);
            } else {
                setGeminiMasked(maskKey(geminiKey));
            }
        } catch {
            setGeminiMasked(maskKey(geminiKey));
        }
        setGeminiKey('');
        addToast('success', 'Đã lưu Gemini API key');
        setGeminiLoading(false);
    };

    const handleGeminiDelete = async () => {
        setGeminiLoading(true);
        try {
            await fetch('/api/user-settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'gemini_api_key' }),
            });
        } catch { /* DB not available */ }
        setGeminiMasked('');
        addToast('success', 'Đã xoá Gemini API key');
        setGeminiLoading(false);
    };

    const handleGeminiTest = async () => {
        const keyToTest = geminiKey.trim() || null;
        if (!keyToTest && !geminiMasked && !hasEnvKey) {
            addToast('error', 'Chưa có Gemini API key để test');
            return;
        }
        setGeminiTesting(true);
        try {
            const res = await fetch('/api/user-settings/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyToTest || undefined, provider: 'gemini' }),
            });
            const data = await res.json();
            if (data.ok) addToast('success', 'Gemini API key hoạt động!');
            else addToast('error', data.error || 'API key không hợp lệ');
        } catch {
            addToast('error', 'Test thất bại');
        } finally {
            setGeminiTesting(false);
        }
    };

    // ─── Ideogram handlers ───
    const handleIdeogramSave = async () => {
        if (!ideogramKey.trim()) return;
        setIdeogramLoading(true);
        try {
            const res = await fetch('/api/user-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'ideogram_api_key', value: ideogramKey }),
            });
            const data = await res.json();
            if (res.ok) {
                setIdeogramMasked(data.masked);
            } else {
                setIdeogramMasked(maskKey(ideogramKey));
            }
        } catch {
            setIdeogramMasked(maskKey(ideogramKey));
        }
        setIdeogramKey('');
        addToast('success', 'Đã lưu Ideogram API key');
        setIdeogramLoading(false);
    };

    const handleIdeogramDelete = async () => {
        setIdeogramLoading(true);
        try {
            await fetch('/api/user-settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'ideogram_api_key' }),
            });
        } catch { /* DB not available */ }
        setIdeogramMasked('');
        addToast('success', 'Đã xoá Ideogram API key');
        setIdeogramLoading(false);
    };

    const handleIdeogramTest = async () => {
        const keyToTest = ideogramKey.trim() || null;
        if (!keyToTest && !ideogramMasked && !hasIdeogramEnvKey) {
            addToast('error', 'Chưa có Ideogram API key để test');
            return;
        }
        setIdeogramTesting(true);
        try {
            const res = await fetch('/api/user-settings/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyToTest || undefined, provider: 'ideogram' }),
            });
            const data = await res.json();
            if (data.ok) addToast('success', 'Ideogram API key hoạt động!');
            else addToast('error', data.error || 'API key không hợp lệ');
        } catch {
            addToast('error', 'Test thất bại');
        } finally {
            setIdeogramTesting(false);
        }
    };

    const hasGeminiKey = geminiMasked || hasEnvKey;
    const hasIdeogramKey = ideogramMasked || hasIdeogramEnvKey;

    return (
        <>
            {/* Provider selector */}
            <section className="settings-section">
                <h3 className="settings-section-title">AI Provider</h3>
                <div className="settings-field">
                    <label className="settings-label">Chọn provider để tạo variations</label>
                    <select
                        className="settings-select"
                        value={selectedProvider}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        disabled={savingProvider}
                    >
                        <option value="gemini">Gemini</option>
                        <option value="ideogram">Ideogram</option>
                    </select>
                </div>
            </section>

            {/* Gemini API Key */}
            <section className="settings-section">
                <h3 className="settings-section-title">Gemini API Key</h3>
                <div className={`settings-key-status ${hasGeminiKey ? 'settings-key-status--ok' : 'settings-key-status--warning'}`}>
                    {geminiMasked
                        ? <>Key riêng: <code className="settings-code">{geminiMasked}</code></>
                        : hasEnvKey
                            ? <>Đang dùng key từ cấu hình server (.env)</>
                            : <>Chưa có Gemini API key.</>
                    }
                </div>
                <div className="settings-field">
                    <label className="settings-label">{geminiMasked ? 'Thay đổi key' : 'Nhập API key'}</label>
                    <input
                        className="settings-input"
                        type="password"
                        placeholder="AIza..."
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                    />
                    <span className="settings-hint">
                        Key riêng sẽ được mã hoá trước khi lưu và ưu tiên hơn key server.
                    </span>
                </div>
                <div className="settings-row">
                    <button className="btn-primary" onClick={handleGeminiSave} disabled={geminiLoading || !geminiKey.trim()}>
                        {geminiLoading ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    <button className="btn-secondary" onClick={handleGeminiTest} disabled={geminiTesting}>
                        {geminiTesting ? 'Đang test...' : 'Test'}
                    </button>
                    {geminiMasked && (
                        <button className="btn-danger" onClick={handleGeminiDelete} disabled={geminiLoading}>Xoá</button>
                    )}
                </div>
            </section>

            {/* Ideogram API Key */}
            <section className="settings-section">
                <h3 className="settings-section-title">Ideogram API Key</h3>
                <div className={`settings-key-status ${hasIdeogramKey ? 'settings-key-status--ok' : 'settings-key-status--warning'}`}>
                    {ideogramMasked
                        ? <>Key riêng: <code className="settings-code">{ideogramMasked}</code></>
                        : <>Chưa có Ideogram API key.</>
                    }
                </div>
                <div className="settings-field">
                    <label className="settings-label">{ideogramMasked ? 'Thay đổi key' : 'Nhập API key'}</label>
                    <input
                        className="settings-input"
                        type="password"
                        placeholder="Ideogram API key..."
                        value={ideogramKey}
                        onChange={(e) => setIdeogramKey(e.target.value)}
                    />
                    <span className="settings-hint">
                        Key riêng sẽ được mã hoá trước khi lưu và ưu tiên hơn key server.
                    </span>
                </div>
                <div className="settings-row">
                    <button className="btn-primary" onClick={handleIdeogramSave} disabled={ideogramLoading || !ideogramKey.trim()}>
                        {ideogramLoading ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    <button className="btn-secondary" onClick={handleIdeogramTest} disabled={ideogramTesting}>
                        {ideogramTesting ? 'Đang test...' : 'Test'}
                    </button>
                    {ideogramMasked && (
                        <button className="btn-danger" onClick={handleIdeogramDelete} disabled={ideogramLoading}>Xoá</button>
                    )}
                </div>
            </section>
        </>
    );
}

// ─── Templates tab ───
function TemplatesTab() {
    const addToast = useToastStore((s) => s.addToast);
    const localWorkspaces = useWorkspaceStore((s) => s.workspaces);
    const activeWsId = useWorkspaceStore((s) => s.activeId);
    const [allWs, setAllWs] = useState<ServerWorkspace[]>([]);
    const [selectedWs, setSelectedWs] = useState('');
    const [templates, setTemplates] = useState<TemplateInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Merge local + server workspaces, ensure "default" exists on server
    useEffect(() => {
        (async () => {
            try {
                // Ensure default workspace exists on server
                await fetch('/api/workspaces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: 'default', name: 'Default' }),
                });
                const res = await fetch('/api/workspaces');
                const serverWs: ServerWorkspace[] = res.ok ? await res.json() : [];
                const merged: ServerWorkspace[] = [];
                const seen = new Set<string>();
                // Server workspaces first
                for (const ws of serverWs) {
                    if (!seen.has(ws.id)) { seen.add(ws.id); merged.push(ws); }
                }
                // Add local-only workspaces
                for (const lw of localWorkspaces) {
                    if (!seen.has(lw.id)) { seen.add(lw.id); merged.push({ id: lw.id, name: lw.name }); }
                }
                if (merged.length > 0) {
                    setAllWs(merged);
                    // Select active workspace or first
                    const hasActive = merged.some(w => w.id === activeWsId);
                    setSelectedWs(hasActive ? activeWsId : merged[0].id);
                } else {
                    setLoading(false);
                }
            } catch {
                setLoading(false);
            }
        })();
    }, [localWorkspaces, activeWsId]);

    // Zustand templates (for active workspace fallback)
    const storeTemplates = useWorkflowStore((s) => s.mockupTemplates);

    // Fetch templates when workspace selected
    useEffect(() => {
        if (!selectedWs) return;
        let cancelled = false;
        fetch(`/api/templates?workspace=${encodeURIComponent(selectedWs)}`)
            .then(r => r.ok ? r.json() : [])
            .then((t: TemplateInfo[]) => {
                if (cancelled) return;
                const serverList = Array.isArray(t) ? t : [];
                if (serverList.length > 0) {
                    setTemplates(serverList);
                } else if (selectedWs === activeWsId && storeTemplates.length > 0) {
                    // Server empty but zustand has templates — use them and re-sync
                    const mapped = storeTemplates.map(st => ({
                        id: st.id,
                        name: st.name || 'Untitled',
                        imageUrl: st.imageUrl || '',
                    }));
                    setTemplates(mapped);
                    // Re-sync to server
                    fetch(`/api/templates?workspace=${encodeURIComponent(selectedWs)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(mapped),
                    }).catch(() => {});
                } else {
                    setTemplates([]);
                }
            })
            .catch(() => { if (!cancelled) setTemplates([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [selectedWs, activeWsId, storeTemplates]);

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
            await saveTemplates(templates.map(t => t.id === id ? { ...t, name: editName.trim() } : t));
            setEditingId(null);
            addToast('success', 'Đã đổi tên');
        } catch {
            addToast('error', 'Đổi tên thất bại');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Xoá template "${name || 'Untitled'}"?`)) return;
        try {
            await saveTemplates(templates.filter(t => t.id !== id));
            addToast('success', 'Đã xoá template');
        } catch {
            addToast('error', 'Xoá thất bại');
        }
    };

    if (allWs.length === 0 && !loading) {
        return (
            <section className="settings-section">
                <div className="settings-empty">Chưa có workspace nào.</div>
            </section>
        );
    }

    return (
        <section className="settings-section">
            <div className="settings-section-header">
                <h3 className="settings-section-title">Templates</h3>
                {allWs.length > 0 && (
                    <select
                        value={selectedWs}
                        onChange={(e) => { setSelectedWs(e.target.value); setLoading(true); }}
                        className="settings-select"
                    >
                        {allWs.map(ws => (
                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                    </select>
                )}
            </div>
            {loading ? (
                <div className="settings-empty">Đang tải...</div>
            ) : templates.length === 0 ? (
                <div className="settings-empty">Chưa có template nào. Mở tab Mockup để thêm.</div>
            ) : (
                <div className="settings-grid">
                    {templates.map((t) => (
                        <div key={t.id} className="settings-template-card">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {t.imageUrl && <img src={t.imageUrl} alt={t.name} className="settings-template-img" />}
                            <div className="settings-template-body">
                                {editingId === t.id ? (
                                    <form onSubmit={(e) => { e.preventDefault(); handleRename(t.id); }} className="settings-row">
                                        <input className="settings-input settings-input--sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                                        <button type="submit" className="btn-ghost-sm">Lưu</button>
                                        <button type="button" className="btn-ghost-sm" onClick={() => setEditingId(null)}>Huỷ</button>
                                    </form>
                                ) : (
                                    <div className="settings-row">
                                        <span className="settings-template-name">{t.name || 'Untitled'}</span>
                                        <button className="btn-ghost-sm" onClick={() => { setEditingId(t.id); setEditName(t.name || ''); }}>Sửa</button>
                                        <button className="btn-ghost-sm settings-btn-danger" onClick={() => handleDelete(t.id, t.name)}>Xoá</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
