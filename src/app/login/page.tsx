"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import '@/styles/auth.css';
import { UploadCloud, Sparkles, Layers, Film, User, Lock, ChevronRight } from '@/components/ui-icons';

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      localStorage.setItem("design-tool-user", username);
      window.location.href = "/";
      return;
    } else {
      const data = await res.json();
      setError(data.error || "Đăng nhập thất bại");
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-panel-content">
          <div className="auth-panel-logo"><Sparkles size={24} /></div>
          <h2>Chào mừng trở lại</h2>
          <p>Đăng nhập để tiếp tục tạo biến thể thiết kế và mockup chuyên nghiệp với AI.</p>
          <ul className="auth-panel-features">
            <li>
              <span className="auth-panel-feature-icon"><UploadCloud size={16} /></span>
              Upload thiết kế gốc
            </li>
            <li>
              <span className="auth-panel-feature-icon"><Sparkles size={16} /></span>
              Tạo biến thể bằng AI
            </li>
            <li>
              <span className="auth-panel-feature-icon"><Layers size={16} /></span>
              Ghép lên mockup chuyên nghiệp
            </li>
            <li>
              <span className="auth-panel-feature-icon"><Film size={16} /></span>
              Xuất video trình diễn
            </li>
          </ul>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <div className="auth-logo"><Sparkles size={22} /></div>
          <h1 className="auth-title">Đăng nhập</h1>
          <p className="auth-subtitle">Nhập thông tin tài khoản của bạn</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-input-wrapper">
              <span className="auth-input-icon"><User size={16} /></span>
              <input
                type="text"
                placeholder="Tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
              />
            </div>
            <div className="auth-input-wrapper">
              <span className="auth-input-icon"><Lock size={16} /></span>
              <input
                type="password"
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="auth-footer">
            <a href="/landing" className="auth-explore">
              Khám phá tính năng <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
