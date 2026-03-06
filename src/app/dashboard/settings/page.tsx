'use client';

import { useState, useSyncExternalStore } from 'react';
import { useToastStore } from '@/store/toast-store';

function useUsername() {
    return useSyncExternalStore(
        (cb) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb); },
        () => localStorage.getItem('design-tool-user') || '',
        () => '',
    );
}

export default function SettingsPage() {
    const username = useUsername();
    const addToast = useToastStore((s) => s.addToast);
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [saving, setSaving] = useState(false);

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
            addToast('success', 'Đã đổi mật khẩu!');
            setCurrentPw('');
            setNewPw('');
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <header className="dash-topbar">
                <h1>Cài đặt</h1>
            </header>
            <div className="dash-content">
                <div className="dash-section">
                    <h2>Tài khoản</h2>
                    <div className="dash-form-group">
                        <label className="dash-form-label">Username</label>
                        <input className="dash-form-input" value={username} disabled />
                    </div>
                </div>

                <div className="dash-section">
                    <h2>Đổi mật khẩu</h2>
                    <form onSubmit={handleChangePassword}>
                        <div className="dash-form-group">
                            <label className="dash-form-label">Mật khẩu hiện tại</label>
                            <input
                                className="dash-form-input"
                                type="password"
                                value={currentPw}
                                onChange={(e) => setCurrentPw(e.target.value)}
                            />
                        </div>
                        <div className="dash-form-group">
                            <label className="dash-form-label">Mật khẩu mới</label>
                            <input
                                className="dash-form-input"
                                type="password"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                            />
                            <div className="dash-form-hint">Tối thiểu 8 ký tự</div>
                        </div>
                        <button className="btn-primary" type="submit" disabled={saving}>
                            {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
