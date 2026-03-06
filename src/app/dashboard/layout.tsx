'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { LogOut } from '@/components/ui-icons';

const NAV = [
    { href: '/dashboard', label: 'Tổng quan' },
    { href: '/dashboard/templates', label: 'Templates' },
    { href: '/dashboard/settings', label: 'Cài đặt' },
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
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('design-tool-user');
        window.location.href = '/login';
    };

    return (
        <div className="dash-shell">
            {sidebarOpen && (
                <div
                    className="dash-sidebar-backdrop"
                    onClick={() => setSidebarOpen(false)}
                />
            )}
            <aside className={`dash-sidebar ${sidebarOpen ? 'dash-sidebar--open' : ''}`}>
                <div className="dash-sidebar-header">
                    Design Tool
                    <button
                        className="dash-menu-toggle"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => setSidebarOpen(false)}
                    >
                        ✕
                    </button>
                </div>
                <nav className="dash-sidebar-nav">
                    {NAV.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`dash-nav-item ${pathname === item.href ? 'dash-nav-item--active' : ''}`}
                            onClick={() => setSidebarOpen(false)}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <div style={{ flex: 1 }} />
                    <Link href="/" className="dash-nav-item">
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
                <div className="dash-mobile-header">
                    <button className="dash-menu-toggle" onClick={() => setSidebarOpen(true)}>
                        ☰
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
