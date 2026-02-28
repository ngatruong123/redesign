"use client";

import { useState } from "react";
import '@/styles/auth.css';
import { UploadCloud, Sparkles, Layers, Film, User, Lock, ChevronRight } from '@/components/ui-icons';

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/register", {
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
      setError(data.error || "Đăng ký thất bại");
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-panel-content">
          <div className="auth-panel-logo"><Sparkles size={24} /></div>
          <h2>Bắt đầu miễn phí</h2>
          <p>Tạo tài khoản để sử dụng công cụ thiết kế biến thể và mockup AI.</p>
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
          <h1 className="auth-title">Tạo tài khoản</h1>
          <p className="auth-subtitle">Đăng ký miễn phí, bắt đầu ngay</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-input-wrapper">
              <span className="auth-input-icon"><User size={16} /></span>
              <input
                type="text"
                placeholder="Tên đăng nhập (3-20 ký tự)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
              />
            </div>
            <div className="auth-input-wrapper">
              <span className="auth-input-icon"><Lock size={16} /></span>
              <input
                type="password"
                placeholder="Mật khẩu (ít nhất 8 ký tự)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
              />
            </div>
            <div className="auth-input-wrapper">
              <span className="auth-input-icon"><Lock size={16} /></span>
              <input
                type="password"
                placeholder="Xác nhận mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="auth-input"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-link">
              Đã có tài khoản?{' '}
              <a href="/login">Đăng nhập</a>
            </p>
            <a href="/landing" className="auth-explore">
              Khám phá tính năng <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
