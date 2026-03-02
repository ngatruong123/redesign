// ─── Design Tool Extension — Background Service Worker ───

const DEFAULT_URL = 'http://35.240.160.250';

async function getServerUrl() {
  const data = await chrome.storage.local.get('serverUrl');
  return data.serverUrl || DEFAULT_URL;
}

// ─── Context Menu ───

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendToDesignTool',
    title: 'Gửi ảnh vào Design Tool',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'sendToDesignTool') return;
  await uploadFromUrl(info.srcUrl);
});

// ─── Message handler (return true to keep sendResponse channel open) ───

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'uploadImageData') {
    uploadDataUrl(msg.dataUrl).then(
      (ok) => sendResponse({ success: ok }),
      () => sendResponse({ success: false })
    );
    return true; // async
  }

  if (msg.action === 'uploadImageUrl') {
    uploadFromUrl(msg.url).then(
      (ok) => sendResponse({ success: ok }),
      () => sendResponse({ success: false })
    );
    return true;
  }

  if (msg.action === 'captureAndCrop') {
    // Small delay to let content script hide its overlay
    setTimeout(() => {
      captureAndCrop(msg.rect, sender.tab).then(
        (ok) => sendResponse({ success: ok }),
        () => sendResponse({ success: false })
      );
    }, 100);
    return true;
  }

  if (msg.action === 'captureFullPage') {
    // Message from popup — no sender.tab, use active tab
    captureFullPage().then(
      (ok) => sendResponse({ success: ok }),
      () => sendResponse({ success: false })
    );
    return true;
  }
});

// ─── Upload helpers ───

async function uploadDataUrl(dataUrl) {
  const serverUrl = await getServerUrl();
  try {
    const blob = dataUrlToBlob(dataUrl);
    return await uploadBlob(serverUrl, blob, `design-${Date.now()}.png`);
  } catch (err) {
    console.error('Upload dataUrl failed:', err);
    return false;
  }
}

async function uploadFromUrl(imageUrl) {
  const serverUrl = await getServerUrl();
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    return await uploadBlob(serverUrl, blob, `design-${Date.now()}.${ext}`);
  } catch (err) {
    console.error('Upload URL failed:', err);
    return false;
  }
}

async function uploadBlob(serverUrl, blob, filename) {
  console.log(`[DT] Uploading ${filename} (${blob.size} bytes, ${blob.type}) to ${serverUrl}/api/upload`);
  const formData = new FormData();
  formData.append('file', blob, filename);
  try {
    const res = await fetch(`${serverUrl}/api/upload`, { method: 'POST', body: formData });
    const text = await res.text();
    console.log(`[DT] Upload response ${res.status}:`, text);
    if (res.ok) {
      const data = JSON.parse(text);
      const params = new URLSearchParams({
        'ext-upload': '1',
        'file-id': data.id,
        'file-name': data.name,
        'file-url': data.url,
      });
      chrome.tabs.create({ url: `${serverUrl}?${params}` });
      return true;
    }
    return false;
  } catch (err) {
    console.error('[DT] Upload fetch error:', err);
    return false;
  }
}

// Convert data URL to Blob without fetch()
function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ─── Screenshot capture & crop ───

async function captureFullPage() {
  const serverUrl = await getServerUrl();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[DT] captureFullPage — tab:', tab?.id, tab?.url);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    console.log('[DT] Captured dataUrl length:', dataUrl.length);
    const blob = dataUrlToBlob(dataUrl);
    return await uploadBlob(serverUrl, blob, `screenshot-${Date.now()}.png`);
  } catch (err) {
    console.error('Full screenshot failed:', err);
    return false;
  }
}

async function captureAndCrop(rect, tab) {
  const serverUrl = await getServerUrl();
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const blob = dataUrlToBlob(dataUrl);
    const img = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(Math.round(rect.w), Math.round(rect.h));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img,
      Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h),
      0, 0, Math.round(rect.w), Math.round(rect.h)
    );

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return await uploadBlob(serverUrl, croppedBlob, `screenshot-crop-${Date.now()}.png`);
  } catch (err) {
    console.error('Screenshot crop failed:', err);
    return false;
  }
}
