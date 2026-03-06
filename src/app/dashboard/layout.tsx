'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Sparkles, Layers, LogOut } from '@/components/ui-icons';

const NAV = [
    { href: '/dashboard', label: 'Tổng quan', icon: '📊' },
    { href: '/dashboard/templates', label: 'Templates', icon: '🖼️' },
    { href: '/dashboard/settings', label: 'Cài đặt', icon: '⚙️' },
];

function useUsername() {
    return useSyncExternalStore(
        (cb) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb); },
        () => localStorage.getItem('design-tool-user') || '',
        () => '',
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const username = useUsername();

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('design-tool-user');
        window.location.href = '/login';
    };

    return (
        <div className="dash-shell">
            <aside className="dash-sidebar">
                <div className="dash-sidebar-header">
                    <Sparkles size={16} />
                    Design Tool
                </div>
                <nav className="dash-sidebar-nav">
                    {NAV.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`dash-nav-item ${pathname === item.href ? 'dash-nav-item--active' : ''}`}
                        >
                            <span>{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}
                    <div style={{ flex: 1 }} />
                    <Link href="/" className="dash-nav-item">
                        <Layers size={16} />
                        Editor
                    </Link>
                </nav>
                <div className="dash-sidebar-footer">
                    <div className="app-user">
                        <div className="app-user-avatar">{username.charAt(0)}</div>
                        <span className="app-user-name">{username}</span>
                        <button onClick={handleLogout} className="app-user-logout" title="Đăng xuất">
                            <LogOut size={14} />
                        </button>
                    </div>
                </div>
            </aside>
            <div className="dash-main">
                {children}
            </div>
        </div>
    );
}
