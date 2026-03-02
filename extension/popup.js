const DEFAULT_URL = 'http://35.240.160.250';

const $serverUrl = document.getElementById('serverUrl');
const $status = document.getElementById('statusText');
const $statusDot = document.getElementById('statusDot');
const $btnOpen = document.getElementById('btnOpen');
const $btnBadges = document.getElementById('btnBadges');
const $btnScreenshot = document.getElementById('btnScreenshot');
const $btnFullScreenshot = document.getElementById('btnFullScreenshot');
const $footerLink = document.getElementById('footerLink');
const $badgesLabel = document.getElementById('badgesLabel');
const $badgesHint = document.getElementById('badgesHint');

// --- Helpers ---

async function getServerUrl() {
  const data = await chrome.storage.local.get('serverUrl');
  return data.serverUrl || DEFAULT_URL;
}

function setStatus(text, online) {
  $status.textContent = text;
  $statusDot.className = online ? 'status-dot online' : 'status-dot';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const raw = atob(parts[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Ensure content script is injected
async function ensureContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'getBadgeState' }, (res) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ['content.js'] },
          () => {
            if (chrome.runtime.lastError) {
              resolve(false);
            } else {
              setTimeout(() => resolve(true), 300);
            }
          }
        );
      } else {
        resolve(true);
      }
    });
  });
}

// --- Init ---

async function init() {
  const url = await getServerUrl();
  $serverUrl.value = url;
  checkStatus(url);

  try {
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'getBadgeState' }, (res) => {
        if (!chrome.runtime.lastError && res) updateBadgeUI(res.active);
      });
    }
  } catch {}
}

$serverUrl.addEventListener('change', async () => {
  const url = $serverUrl.value.trim().replace(/\/+$/, '') || DEFAULT_URL;
  $serverUrl.value = url;
  await chrome.storage.local.set({ serverUrl: url });
  checkStatus(url);
});

// --- Status check ---

async function checkStatus(url) {
  setStatus('Đang kiểm tra...', false);
  try {
    const res = await fetch(`${url}/api/upload`, { method: 'OPTIONS' });
    if (res.ok || res.status === 204) {
      setStatus('Server đang chạy', true);
    } else {
      setStatus('Server lỗi (' + res.status + ')', false);
    }
  } catch {
    setStatus('Không kết nối được', false);
  }
}

function updateBadgeUI(active) {
  if (active) {
    $btnBadges.classList.add('active');
    $badgesLabel.textContent = 'Tắt chọn ảnh';
    $badgesHint.textContent = 'Đang hiện icon trên ảnh — click để tắt';
  } else {
    $btnBadges.classList.remove('active');
    $badgesLabel.textContent = 'Bật chọn ảnh trên trang';
    $badgesHint.textContent = 'Hiện icon trên mỗi ảnh — click để gửi vào tool';
  }
}

// --- Open app ---

$btnOpen.addEventListener('click', async () => {
  chrome.tabs.create({ url: await getServerUrl() });
});

$footerLink.addEventListener('click', async (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: await getServerUrl() });
});

// --- Toggle image badges ---

$btnBadges.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) { setStatus('Không có tab', false); return; }

  setStatus('Đang inject script...', true);
  const ok = await ensureContentScript(tab.id);
  if (!ok) { setStatus('Không inject được — trang không hỗ trợ', false); return; }

  setStatus('Đang gửi lệnh...', true);
  chrome.tabs.sendMessage(tab.id, { action: 'toggleBadges' }, (res) => {
    if (chrome.runtime.lastError) {
      setStatus('Lỗi: ' + chrome.runtime.lastError.message, false);
      return;
    }
    updateBadgeUI(res?.active);
    setStatus(res?.active ? 'Đã bật — hover ảnh để thấy icon' : 'Đã tắt', true);
  });
});

// --- Region screenshot ---

$btnScreenshot.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) { setStatus('Không có tab', false); return; }

  const ok = await ensureContentScript(tab.id);
  if (!ok) { setStatus('Không inject được', false); return; }

  chrome.tabs.sendMessage(tab.id, { action: 'startScreenshot' });
  window.close();
});

// --- Full page screenshot ---

$btnFullScreenshot.addEventListener('click', async () => {
  // Step 1: capture
  setStatus('1/3 Đang chụp màn hình...', true);

  let dataUrl;
  try {
    const tab = await getActiveTab();
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (err) {
    setStatus('LỖI CHỤP: ' + err.message, false);
    return;
  }

  // Step 2: convert
  setStatus('2/3 Đang xử lý ảnh (' + Math.round(dataUrl.length / 1024) + 'KB)...', true);

  let blob;
  try {
    blob = dataUrlToBlob(dataUrl);
  } catch (err) {
    setStatus('LỖI CONVERT: ' + err.message, false);
    return;
  }

  // Step 3: upload
  const serverUrl = await getServerUrl();
  setStatus('3/3 Đang upload tới ' + serverUrl + '...', true);

  try {
    const formData = new FormData();
    formData.append('file', blob, `screenshot-${Date.now()}.png`);
    const res = await fetch(`${serverUrl}/api/upload`, { method: 'POST', body: formData });
    const text = await res.text();

    if (res.ok) {
      const data = JSON.parse(text);
      const params = new URLSearchParams({
        'ext-upload': '1',
        'file-id': data.id,
        'file-name': data.name,
        'file-url': data.url,
      });
      setStatus('THÀNH CÔNG! Đang mở app...', true);
      setTimeout(() => chrome.tabs.create({ url: `${serverUrl}?${params}` }), 800);
    } else {
      setStatus('UPLOAD FAIL ' + res.status + ': ' + text, false);
    }
  } catch (err) {
    setStatus('LỖI UPLOAD: ' + err.message, false);
  }
});

init();
