function buildQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v);
  });
  return usp.toString();
}

async function apiGet(params) {
  if (!API_URL || API_URL.includes('PASTE_YOUR')) {
    throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน js/config.js');
  }
  const url = `${API_URL}?${buildQuery(params)}`;
  if (typeof beginOperationStatus === 'function') beginOperationStatus('กำลังโหลดข้อมูล...');
  try {
    const response = await fetch(url);
    const data = await parseApiResponse(response);
    if (!data.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    return data;
  } finally {
    if (typeof endOperationStatus === 'function') endOperationStatus();
  }
}

async function apiPost(payload) {
  if (!API_URL || API_URL.includes('PASTE_YOUR')) {
    throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน js/config.js');
  }
  if (typeof beginOperationStatus === 'function') beginOperationStatus('กำลังบันทึกข้อมูล...');
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {})
    });
    const data = await parseApiResponse(response);
    if (!data.ok) throw new Error(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
    return data;
  } finally {
    if (typeof endOperationStatus === 'function') endOperationStatus();
  }
}

async function parseApiResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const looksLikeHtml = /^\s*</.test(text || '');
    throw new Error(looksLikeHtml
      ? 'เซิร์ฟเวอร์ส่งหน้าเว็บกลับมาแทนข้อมูล กรุณารอสักครู่แล้วลองใหม่ หากยังไม่หายให้แจ้งครูตรวจ Apps Script deployment'
      : 'เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ กรุณาลองใหม่');
  }
  if (!response.ok) throw new Error(data?.error || `เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (${response.status})`);
  return data;
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', base64: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
