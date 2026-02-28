import '@/styles/landing.css';
import {
  UploadCloud, Sparkles, Layers, Film, ArrowRight, Zap, Shield, Boxes,
  Paintbrush, Wand, Image, MousePointerClick, Download, Eye, Grip, Cpu,
} from '@/components/ui-icons';

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* Ambient glows */}
      <div className="landing-glow landing-glow-1" />
      <div className="landing-glow landing-glow-2" />
      <div className="landing-glow landing-glow-3" />

      {/* ─── Header ─── */}
      <header className="landing-header">
        <div className="landing-logo">
          <div className="landing-logo-icon"><Sparkles size={18} /></div>
          Design Tool
        </div>
        <a href="/login" className="landing-btn landing-btn-primary">
          Đăng nhập <ArrowRight size={16} />
        </a>
      </header>

      {/* ─── Hero ─── */}
      <section className="landing-hero">
        <div className="landing-hero-badge">
          <span className="landing-hero-badge-dot" />
          Nền tảng thiết kế AI — Nhanh, mạnh, chuyên nghiệp
        </div>
        <h1>
          Từ ý tưởng đến<br />
          <span className="gradient-text">mockup hoàn chỉnh</span><br />
          chỉ trong vài phút
        </h1>
        <p className="landing-hero-desc">
          Upload thiết kế gốc — AI tạo hàng chục biến thể phong cách — ghép lên mockup chuyên nghiệp —
          xuất batch hoặc tạo video. Tất cả tự động, không cần Photoshop.
        </p>
        <div className="landing-hero-actions">
          <a href="/login" className="landing-btn landing-btn-primary landing-btn-lg">
            Bắt đầu ngay <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* ─── App Preview ─── */}
      <div className="landing-preview">
        <div className="landing-preview-window">
          <div className="landing-preview-bar">
            <div className="landing-preview-dots">
              <span className="landing-preview-dot red" />
              <span className="landing-preview-dot yellow" />
              <span className="landing-preview-dot green" />
            </div>
            <div className="landing-preview-url">
              <span className="landing-preview-url-icon"><Shield size={10} /></span>
              designtool.app
            </div>
          </div>
          <div className="landing-preview-body">
            <div className="landing-preview-sidebar">
              <div className="landing-preview-sidebar-item active"><UploadCloud size={14} /></div>
              <div className="landing-preview-sidebar-item"><Sparkles size={14} /></div>
              <div className="landing-preview-sidebar-item"><Layers size={14} /></div>
              <div className="landing-preview-sidebar-item"><Film size={14} /></div>
            </div>
            <div className="landing-preview-main">
              <div className="landing-preview-toolbar">
                <div className="landing-preview-toolbar-left">
                  <div className="landing-preview-tab active">Biến thể</div>
                  <div className="landing-preview-tab">Mockup</div>
                </div>
                <div className="landing-preview-toolbar-right">
                  <div className="landing-preview-toolbar-btn"><Download size={11} /></div>
                  <div className="landing-preview-toolbar-btn"><Eye size={11} /></div>
                  <div className="landing-preview-toolbar-btn"><Grip size={11} /></div>
                </div>
              </div>
              <div className="landing-preview-content">
                <div className="landing-preview-card shimmer" />
                <div className="landing-preview-card shimmer" style={{ animationDelay: '0.2s' }} />
                <div className="landing-preview-card shimmer" style={{ animationDelay: '0.4s' }} />
                <div className="landing-preview-card shimmer" style={{ animationDelay: '0.6s' }} />
                <div className="landing-preview-card shimmer" style={{ animationDelay: '0.8s' }} />
                <div className="landing-preview-card shimmer" style={{ animationDelay: '1.0s' }} />
              </div>
            </div>
          </div>
        </div>
        <div className="landing-preview-reflection" />
      </div>

      {/* ─── Trusted badges ─── */}
      <div className="landing-trust">
        <div className="landing-trust-item">
          <Zap size={16} />
          <span>Tạo biến thể trong vài giây</span>
        </div>
        <div className="landing-trust-divider" />
        <div className="landing-trust-item">
          <Shield size={16} />
          <span>Workspace riêng tư & bảo mật</span>
        </div>
        <div className="landing-trust-divider" />
        <div className="landing-trust-item">
          <Boxes size={16} />
          <span>Xuất batch mockup ZIP</span>
        </div>
        <div className="landing-trust-divider" />
        <div className="landing-trust-item">
          <Cpu size={16} />
          <span>Gemini AI tích hợp sẵn</span>
        </div>
      </div>

      {/* ─── Workflow 4 steps ─── */}
      <section className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-label">Quy trình làm việc</div>
          <h2 className="landing-section-title">4 bước từ thiết kế đến sản phẩm</h2>
          <p className="landing-section-desc">
            Quy trình tối ưu cho designer — không cần chuyển đổi công cụ, mọi thứ nằm trong một giao diện duy nhất.
          </p>
        </div>

        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-header">
              <div className="landing-step-number">01</div>
              <div className="landing-step-icon-box blue"><UploadCloud size={22} /></div>
            </div>
            <h3>Upload thiết kế</h3>
            <p>Kéo thả file hoặc chọn từ máy tính. Hỗ trợ PNG, JPG, WebP, SVG — tự động xử lý và tối ưu kích thước.</p>
            <div className="landing-step-tags">
              <span className="landing-tag">Drag & Drop</span>
              <span className="landing-tag">Multi-format</span>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-header">
              <div className="landing-step-number">02</div>
              <div className="landing-step-icon-box purple"><Sparkles size={22} /></div>
            </div>
            <h3>AI tạo biến thể</h3>
            <p>Mô tả phong cách bạn muốn bằng text prompt. Gemini AI sẽ tạo hàng loạt biến thể màu sắc, layout, typography.</p>
            <div className="landing-step-tags">
              <span className="landing-tag">Gemini AI</span>
              <span className="landing-tag">Text prompt</span>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-header">
              <div className="landing-step-number">03</div>
              <div className="landing-step-icon-box emerald"><Layers size={22} /></div>
            </div>
            <h3>Ghép mockup</h3>
            <p>Chọn mẫu mockup có sẵn, kéo thả thiết kế vào đúng vị trí với trình chỉnh sửa Fabric.js canvas trực quan.</p>
            <div className="landing-step-tags">
              <span className="landing-tag">Canvas editor</span>
              <span className="landing-tag">Templates</span>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-header">
              <div className="landing-step-number">04</div>
              <div className="landing-step-icon-box orange"><Film size={22} /></div>
            </div>
            <h3>Xuất & chia sẻ</h3>
            <p>Tải mockup đơn lẻ, xuất hàng loạt dạng ZIP, hoặc tạo video trình diễn sản phẩm — sẵn sàng chia sẻ.</p>
            <div className="landing-step-tags">
              <span className="landing-tag">Batch ZIP</span>
              <span className="landing-tag">Video</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features detail ─── */}
      <section className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-label">Tính năng</div>
          <h2 className="landing-section-title">Mọi thứ bạn cần, trong một nơi</h2>
          <p className="landing-section-desc">
            Công cụ được xây dựng dành riêng cho quy trình tạo biến thể thiết kế và mockup — không thừa, không thiếu.
          </p>
        </div>

        <div className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature-icon blue"><Wand size={20} /></div>
            <div>
              <h4>Prompt thông minh</h4>
              <p>Hệ thống prompt engine tự động xây dựng prompt tối ưu cho Gemini AI dựa trên thiết kế gốc của bạn.</p>
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon purple"><Paintbrush size={20} /></div>
            <div>
              <h4>Xoá nền tự động</h4>
              <p>Tích hợp rembg AI — xoá nền ảnh chỉ bằng một click, giữ lại chủ thể sắc nét cho mockup.</p>
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon emerald"><Image size={20} /></div>
            <div>
              <h4>Thư viện mockup template</h4>
              <p>Upload và quản lý bộ sưu tập mẫu mockup riêng cho từng workspace — tái sử dụng không giới hạn.</p>
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon orange"><MousePointerClick size={20} /></div>
            <div>
              <h4>Canvas editor trực quan</h4>
              <p>Fabric.js canvas cho phép kéo thả, resize, xoay thiết kế trên mockup — WYSIWYG hoàn toàn.</p>
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon blue"><Boxes size={20} /></div>
            <div>
              <h4>Batch export</h4>
              <p>Chọn nhiều biến thể + nhiều template, xuất tất cả mockup thành ZIP chỉ trong một thao tác.</p>
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon purple"><Shield size={20} /></div>
            <div>
              <h4>Multi-workspace</h4>
              <p>Tạo workspace riêng cho từng dự án — tách biệt template, biến thể và mockup hoàn toàn.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Tech stack ─── */}
      <section className="landing-section landing-section-center">
        <div className="landing-section-label">Công nghệ</div>
        <h2 className="landing-section-title">Được xây dựng với stack hiện đại</h2>
        <p className="landing-section-desc" style={{ margin: '0 auto 48px' }}>
          Kiến trúc mạnh mẽ, tối ưu hiệu suất — sẵn sàng cho production.
        </p>

        <div className="landing-tech-grid">
          <div className="landing-tech-item">
            <div className="landing-tech-name">Next.js 16</div>
            <div className="landing-tech-desc">App Router + React 19</div>
          </div>
          <div className="landing-tech-item">
            <div className="landing-tech-name">Gemini AI</div>
            <div className="landing-tech-desc">Tạo biến thể hình ảnh</div>
          </div>
          <div className="landing-tech-item">
            <div className="landing-tech-name">Fabric.js v7</div>
            <div className="landing-tech-desc">Canvas mockup editor</div>
          </div>
          <div className="landing-tech-item">
            <div className="landing-tech-name">Sharp</div>
            <div className="landing-tech-desc">Xử lý ảnh server-side</div>
          </div>
          <div className="landing-tech-item">
            <div className="landing-tech-name">rembg</div>
            <div className="landing-tech-desc">AI xoá nền ảnh</div>
          </div>
          <div className="landing-tech-item">
            <div className="landing-tech-name">Zustand</div>
            <div className="landing-tech-desc">State management</div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="landing-cta">
        <div className="landing-cta-glow" />
        <div className="landing-cta-icon"><Sparkles size={28} /></div>
        <h2>Sẵn sàng tạo mockup<br /><span className="gradient-text">chuyên nghiệp</span>?</h2>
        <p>Đăng nhập và bắt đầu sử dụng ngay — quy trình từ upload đến mockup hoàn chỉnh chỉ mất vài phút.</p>
        <a href="/login" className="landing-btn landing-btn-primary landing-btn-lg">
          Đăng nhập ngay <ArrowRight size={18} />
        </a>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="landing-footer-logo">
          <Sparkles size={14} /> Design Tool
        </div>
        <div className="landing-footer-links">
          <span>Next.js 16</span>
          <span className="landing-footer-sep" />
          <span>Gemini AI</span>
          <span className="landing-footer-sep" />
          <span>Fabric.js</span>
        </div>
        <span>© 2026 All rights reserved.</span>
      </footer>
    </div>
  );
}
