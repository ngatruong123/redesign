// ─── Design Tool Extension — Content Script ───

const BADGE_ATTR = 'data-dt-badge';
let badgesActive = false;
let screenshotActive = false;
let badgeElements = [];
let observer = null;
let debounceTimer = null;

// ─── Listen for messages ───

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'toggleBadges') {
    if (badgesActive) removeBadges();
    else createBadges();
    sendResponse({ active: badgesActive });
    return false;
  }
  if (msg.action === 'startScreenshot') {
    startRegionScreenshot();
    sendResponse({ ok: true });
    return false;
  }
  if (msg.action === 'getBadgeState') {
    sendResponse({ active: badgesActive });
    return false;
  }
});

// ═══════════════════════════════════════
// IMAGE BADGES
// ═══════════════════════════════════════

function createBadges() {
  badgesActive = true;

  document.querySelectorAll('img').forEach((img) => {
    if (img.hasAttribute(BADGE_ATTR)) return;

    // Handle images not yet loaded
    if (!img.complete) {
      img.addEventListener('load', () => addBadgeToImg(img), { once: true });
      return;
    }
    addBadgeToImg(img);
  });

  startObserver();
}

function addBadgeToImg(img) {
  if (!badgesActive) return;
  if (img.hasAttribute(BADGE_ATTR)) return;

  // Skip tiny/invisible images
  const r = img.getBoundingClientRect();
  if (r.width < 50 || r.height < 50) return;

  img.setAttribute(BADGE_ATTR, '1');

  // Create badge as a fixed-position element tracked to image
  const badge = document.createElement('div');
  Object.assign(badge.style, {
    position: 'fixed',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: '2147483640',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  });
  badge.innerHTML = uploadSVG();
  badge.title = 'Gửi vào Design Tool';
  document.body.appendChild(badge);

  function positionBadge() {
    const rect = img.getBoundingClientRect();
    badge.style.top = (rect.top + 6) + 'px';
    badge.style.left = (rect.right - 34) + 'px';
  }

  function showBadge() {
    if (!badgesActive) return;
    positionBadge();
    badge.style.display = 'flex';
  }

  function hideBadge(e) {
    if (e.relatedTarget === badge) return;
    badge.style.display = 'none';
  }

  img.addEventListener('mouseenter', showBadge);
  img.addEventListener('mouseleave', hideBadge);
  badge.addEventListener('mouseenter', () => {
    badge.style.display = 'flex';
    badge.style.transform = 'scale(1.12)';
    badge.style.boxShadow = '0 4px 16px rgba(59,130,246,0.5)';
  });
  badge.addEventListener('mouseleave', (e) => {
    badge.style.transform = 'scale(1)';
    badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    if (e.relatedTarget !== img) badge.style.display = 'none';
  });

  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleBadgeClick(img, badge);
  });

  badgeElements.push({ badge, img, showBadge, hideBadge });
}

async function handleBadgeClick(img, badge) {
  const origHTML = badge.innerHTML;
  badge.style.background = '#f59e0b';
  badge.innerHTML = spinnerSVG();

  try {
    let dataUrl;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      // CORS — send URL for background to fetch
      chrome.runtime.sendMessage({ action: 'uploadImageUrl', url: img.src }, (res) => {
        showBadgeResult(badge, origHTML, res?.success);
      });
      return;
    }

    chrome.runtime.sendMessage({ action: 'uploadImageData', dataUrl }, (res) => {
      showBadgeResult(badge, origHTML, res?.success);
    });
  } catch {
    showBadgeResult(badge, origHTML, false);
  }
}

function showBadgeResult(badge, origHTML, success) {
  badge.style.background = success ? '#22c55e' : '#ef4444';
  badge.innerHTML = success ? checkSVG() : crossSVG();
  setTimeout(() => {
    badge.innerHTML = origHTML;
    badge.style.background = 'linear-gradient(135deg, #3b82f6, #60a5fa)';
    badge.style.display = 'none';
  }, 1500);
}

function removeBadges() {
  badgesActive = false;
  stopObserver();
  badgeElements.forEach(({ badge, img, showBadge, hideBadge }) => {
    img.removeEventListener('mouseenter', showBadge);
    img.removeEventListener('mouseleave', hideBadge);
    img.removeAttribute(BADGE_ATTR);
    badge.remove();
  });
  badgeElements = [];
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (!badgesActive) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (badgesActive) createBadges();
    }, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  clearTimeout(debounceTimer);
  if (observer) { observer.disconnect(); observer = null; }
}

// ═══════════════════════════════════════
// REGION SCREENSHOT
// ═══════════════════════════════════════

function startRegionScreenshot() {
  if (screenshotActive) return;
  screenshotActive = true;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483645',
    cursor: 'crosshair',
  });

  const selBox = document.createElement('div');
  Object.assign(selBox.style, {
    position: 'fixed', zIndex: '2147483646',
    border: '2px solid #3b82f6', borderRadius: '2px',
    display: 'none', pointerEvents: 'none',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
  });

  const sizeLabel = document.createElement('div');
  Object.assign(sizeLabel.style, {
    position: 'fixed', zIndex: '2147483647',
    background: '#09090b', color: '#e4e4e7',
    padding: '3px 8px', borderRadius: '4px',
    fontSize: '11px', fontFamily: 'monospace',
    pointerEvents: 'none', display: 'none',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  });

  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'fixed', top: '16px', left: '50%',
    transform: 'translateX(-50%)', zIndex: '2147483647',
    background: '#09090b', color: '#e4e4e7',
    padding: '8px 16px', borderRadius: '8px',
    fontSize: '13px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
  });
  tooltip.textContent = 'Kéo chuột để chọn vùng chụp (ESC để huỷ)';

  document.body.appendChild(overlay);
  document.body.appendChild(selBox);
  document.body.appendChild(sizeLabel);
  document.body.appendChild(tooltip);

  let startX = 0, startY = 0, dragging = false;

  overlay.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    selBox.style.display = 'block';
    sizeLabel.style.display = 'block';
    tooltip.style.display = 'none';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(selBox.style, {
      left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px',
    });
    sizeLabel.textContent = `${w} × ${h}`;
    sizeLabel.style.left = (x + w + 8) + 'px';
    sizeLabel.style.top = (y - 4) + 'px';
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    if (w < 10 || h < 10) {
      cleanupAll();
      return;
    }

    // Hide everything first
    [overlay, selBox, sizeLabel, tooltip].forEach(el => el.style.display = 'none');

    const dpr = window.devicePixelRatio || 1;

    // Wait for repaint then capture
    requestAnimationFrame(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'captureAndCrop',
          rect: {
            x: Math.round(x * dpr),
            y: Math.round(y * dpr),
            w: Math.round(w * dpr),
            h: Math.round(h * dpr),
          },
        });
        cleanupAll();
      }, 200);
    });
  });

  function cleanupAll() {
    screenshotActive = false;
    [overlay, selBox, sizeLabel, tooltip].forEach(el => el.remove());
    document.removeEventListener('keydown', onEsc, true);
  }

  function onEsc(e) {
    if (e.key === 'Escape') cleanupAll();
  }
  document.addEventListener('keydown', onEsc, true);
}

// ─── SVG helpers ───

function uploadSVG() {
  return `<svg width="14" height="14" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
}

function spinnerSVG() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" opacity=".3"/><path d="M12 2a10 10 0 0 1 10 10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg>`;
}

function checkSVG() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function crossSVG() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
}
