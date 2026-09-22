const state = {
  user: null,
  bootstrap: null,
  assignments: [],
  students: [],
  levels: [],
  classesByLevel: {},
  currentPage: 'assignments',
  sidebarCollapsed: false,
  selectedLevel: '',
  selectedClass: '',
  selectedAssignment: '',
  individualLevel: '',
  individualClass: '',
  selectedPreviewStudent: '',
  submissions: [],
  reviewSelectMode: false,
  selectedSubmissionIds: new Set(),
  duplicateGroups: [],
  selectedDuplicateRows: new Set(),
  scoreTable: null,
  studentWorkByAssignment: new Map(),
  submissionRequestIds: new Map(),
  submissionsInFlight: new Set()
};
const ALL_OPTION = '__ALL__';
const MATRIX_V2_WEB_VERSION = '2026.09.21-central-login-token';
const MATRIX_V2_WEB_UPDATED_AT = '2026-09-21 17:30:00 +07';

const PAGE_TITLES = {
  assignments: 'คำสั่งงาน',
  reviewAll: 'ตรวจงานรวม',
  reviewOne: 'ตรวจงานรายบุคคล',
  duplicates: 'จัดการงานซ้ำ',
  studentView: 'มุมมองนักเรียน',
  scoreTable: 'ตารางคะแนน',
  settings: 'อื่นๆ',
  studentWork: 'งานของฉัน',
  studentReturned: 'งานที่ถูกส่งคืน',
  studentTheme: 'เปลี่ยนสี'
};

window.addEventListener('load', restoreSession);
window.addEventListener('resize', syncToolbarHeight);

function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function csv(v) { return String(v || '').split(',').map(x => x.trim()).filter(Boolean); }
let toastTimer = null;
let activeOperations = 0;
let lastToastAt = 0;

function showToast(msg, options={}) {
  const t = $('toast');
  if (!t) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  t.textContent = msg;
  t.classList.add('show');
  t.classList.toggle('loading', !!options.loading);
  lastToastAt = Date.now();
  if (!options.persistent && activeOperations === 0) {
    toastTimer = setTimeout(() => {
      t.classList.remove('show', 'loading');
      toastTimer = null;
    }, options.duration || 3500);
  }
}

function beginOperationStatus(fallback='กำลังดำเนินการ...') {
  activeOperations += 1;
  document.body.classList.add('is-busy');
  document.body.setAttribute('aria-busy', 'true');
  const toast = $('toast');
  const recentMessage = toast?.classList.contains('show') && Date.now() - lastToastAt < 400
    ? toast.textContent
    : '';
  showToast(recentMessage || fallback, { persistent: true, loading: true });
}

function endOperationStatus() {
  activeOperations = Math.max(0, activeOperations - 1);
  if (activeOperations > 0) return;
  document.body.classList.remove('is-busy');
  document.body.removeAttribute('aria-busy');
  const toast = $('toast');
  if (!toast) return;
  toast.classList.remove('loading');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show', 'loading');
    toastTimer = null;
  }, 3500);
}
function setLoading(msg='กำลังโหลด...') { $('content').innerHTML = `<div class="hero-empty">${escapeHtml(msg)}</div>`; }

function normalizeHexColor(value, fallback='#22C55E') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback;
}

function hexToRgb(hex) {
  const safe = normalizeHexColor(hex).replace('#', '');
  return [parseInt(safe.slice(0, 2), 16), parseInt(safe.slice(2, 4), 16), parseInt(safe.slice(4, 6), 16)];
}

function applyTheme(user) {
  const accent = normalizeHexColor(user?.AccentColor || '#22C55E');
  const bg = normalizeHexColor(user?.BackgroundColor || '#000000', '#000000');
  const navigation = normalizeHexColor(user?.NavigationColor || '#001407', '#001407');
  const [r, g, b] = hexToRgb(accent);
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--line', accent);
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  document.documentElement.style.setProperty('--bg', bg);
  document.documentElement.style.setProperty('--nav-bg', navigation);
  document.documentElement.style.setProperty('--toolbar-bg', `rgba(${r}, ${g}, ${b}, .34)`);
  document.documentElement.style.setProperty('--toolbar-border', `rgba(${r}, ${g}, ${b}, .96)`);
  document.documentElement.style.setProperty('--layout-panel-bg', `rgba(${r}, ${g}, ${b}, .24)`);
  document.documentElement.style.setProperty('--score-head-bg', `rgba(${r}, ${g}, ${b}, .52)`);
  document.documentElement.style.setProperty('--score-name-bg', `rgba(${r}, ${g}, ${b}, .28)`);
  document.documentElement.style.setProperty('--score-cell-bg', `rgba(${r}, ${g}, ${b}, .13)`);
  if (user?.BackgroundImageURL) {
    document.body.classList.add('with-bg-image');
    document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,.72)), url('${user.BackgroundImageURL}')`;
  } else {
    document.body.classList.remove('with-bg-image');
    document.body.style.backgroundImage = '';
  }
}

async function login() {
  const userId = $('loginUser').value.trim();
  const password = $('loginPass').value.trim();
  $('loginMsg').textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const data = await apiGet({ action: 'login', userId, password, portal: APP_PORTAL });
    startSession(data.user, data.bootstrap);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user, bootstrap: data.bootstrap, savedAt: Date.now() }));
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
}

async function restoreSession() {
  const token = new URLSearchParams(location.search).get('loginToken');
  if (token) {
    $('loginScreen').classList.remove('hidden');
    $('loginMsg').textContent = 'กำลังยืนยันการเข้าสู่ระบบ...';
    try {
      const data = await apiGet({ action: 'consumePortalToken', token, portal: APP_PORTAL });
      history.replaceState({}, document.title, location.pathname + location.hash);
      startSession(data.user, data.bootstrap);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user, bootstrap: data.bootstrap, savedAt: Date.now() }));
      return;
    } catch (err) {
      $('loginMsg').innerHTML = escapeHtml(err.message) + '<br><button onclick="goToCentralLogin()">กลับไปหน้าเข้าสู่ระบบกลาง</button>';
      return;
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.user) {
      startSession(saved.user, saved.bootstrap || null);
      refreshBootstrap(false);
      return;
    }
  } catch (err) {}
  goToCentralLogin();
}

function goToCentralLogin() {
  if (!LOGIN_URL || LOGIN_URL.includes('PASTE_YOUR')) {
    $('loginScreen').classList.remove('hidden');
    $('loginMsg').textContent = 'กรุณาตั้งค่า LOGIN_URL ใน js/config.js';
    return;
  }
  location.replace(LOGIN_URL);
}

function startSession(user, bootstrap) {
  if (APP_PORTAL === 'teacher' && user.Role !== 'teacher' && user.Role !== 'admin') {
    localStorage.removeItem(SESSION_KEY); $('loginScreen').classList.remove('hidden'); $('loginMsg').textContent = 'บัญชีนี้ไม่มีสิทธิ์เข้าเว็บครู'; return;
  }
  state.user = user;
  state.bootstrap = bootstrap;
  if (bootstrap) consumeBootstrap(bootstrap);
  applyTheme(user);
  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  $('teacherNav')?.classList.toggle('hidden', user.Role !== 'teacher' && user.Role !== 'admin');
  $('studentNav')?.classList.toggle('hidden', user.Role === 'teacher' || user.Role === 'admin');
  const startPage = (user.Role === 'teacher' || user.Role === 'admin') ? 'assignments' : 'studentWork';
  switchPage(startPage);
}

function consumeBootstrap(b) {
  state.bootstrap = b;
  state.assignments = b.assignments || [];
  state.students = b.students || [];
  state.levels = b.levels || [];
  state.classesByLevel = b.classesByLevel || {};
}

async function refreshBootstrap(show=true) {
  if (!state.user) return;
  try {
    const b = await apiGet({ action: 'bootstrap', userId: state.user.UserID, role: state.user.Role });
    consumeBootstrap(b);
    if (b.user) { state.user = b.user; applyTheme(state.user); }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.user, bootstrap: b, savedAt: Date.now() }));
    renderCurrentPage();
    if (show) showToast('รีเฟรชข้อมูลแล้ว');
  } catch (err) {
    if (show) showToast(err.message);
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  goToCentralLogin();
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  $('appShell').classList.toggle('collapsed', state.sidebarCollapsed);
  setTimeout(syncToolbarHeight, 220);
}

function switchPage(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('pageTitle').textContent = PAGE_TITLES[page] || page;
  renderCurrentPage();
}

function renderCurrentPage() {
  const page = state.currentPage;
  if (!state.user) return;
  if (page === 'assignments') return renderAssignmentsPage();
  if (page === 'reviewAll') return renderReviewAllPage();
  if (page === 'reviewOne') return renderReviewOnePage();
  if (page === 'duplicates') return renderDuplicateManagerPage();
  if (page === 'studentView') return renderStudentViewPage();
  if (page === 'scoreTable') return renderScoreTablePage();
  if (page === 'settings') return renderSettingsPage();
  if (page === 'studentWork') return renderStudentPage(false);
  if (page === 'studentReturned') return renderStudentPage(true);
  if (page === 'studentTheme') return renderStudentThemePage();
}

function syncToolbarHeight() {
  const tb = $('pageToolbar');
  if (!tb) return;
  const hasContent = tb.childElementCount > 0 || String(tb.textContent || '').trim() !== '';
  tb.classList.toggle('toolbar-empty', !hasContent);
  if (!hasContent) {
    document.documentElement.style.setProperty('--toolbar-h', '0px');
    return;
  }
  // ล้างค่าความสูงจากหน้าก่อนก่อนวัด ไม่เช่นนั้น min-height เดิมจะทำให้
  // แถบเครื่องมือหน้าที่มีเนื้อหาน้อยยังคงสูงเกินจำเป็น
  document.documentElement.style.setProperty('--toolbar-h', '0px');
  const h = Math.max(tb.scrollHeight, 76);
  document.documentElement.style.setProperty('--toolbar-h', `${h}px`);
}

function levelOptions(selected='') {
  return `<option value="">เลือกระดับชั้น</option>` + state.levels.map(l => `<option ${l===selected?'selected':''} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
}
function classOptions(level, selected='') {
  const classes = state.classesByLevel[level] || [];
  return `<option value="">เลือกห้อง</option>` + classes.map(c => `<option ${c===selected?'selected':''} value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}
function reviewAllClassOptions(level, selected='') {
  const classes = level === ALL_OPTION
    ? Array.from(new Set(Object.values(state.classesByLevel).flat())).sort((a, b) => String(a).localeCompare(String(b), 'th'))
    : (state.classesByLevel[level] || []);
  return `<option value="" ${selected===''?'selected':''}>ทุกห้อง</option>` + classes.map(c => `<option ${c===selected?'selected':''} value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}
function reviewAllLevelOptions(selected='') {
  return `<option value="">เลือกระดับชั้น</option><option value="${ALL_OPTION}" ${selected===ALL_OPTION?'selected':''}>ทุกระดับชั้น</option>`
    + state.levels.map(l => `<option ${l===selected?'selected':''} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
}
function reviewAllAssignmentOptions(level='', selected='') {
  const arr = state.assignments.filter(a => !level || level === ALL_OPTION || a.Level === level);
  return `<option value="">เลือกใบงาน</option><option value="${ALL_OPTION}" ${selected===ALL_OPTION?'selected':''}>ทุกงาน</option>`
    + arr.map(a => `<option ${a.AssignmentID===selected?'selected':''} value="${escapeHtml(a.AssignmentID)}">${escapeHtml(a.Topic)}</option>`).join('');
}
function assignmentOptions(level='', selected='') {
  const arr = state.assignments.filter(a => !level || a.Level === level);
  return `<option value="">เลือกใบงาน</option>` + arr.map(a => `<option ${a.AssignmentID===selected?'selected':''} value="${escapeHtml(a.AssignmentID)}">${escapeHtml(a.Topic)}</option>`).join('');
}
function getAssignment(id) { return state.assignments.find(a => a.AssignmentID === id); }
function studentOptions(level='', className='', selected='') {
  const arr = state.students
    .filter(u => (!level || u.Level === level) && (!className || u.ClassName === className))
    .sort((a, b) => Number(a.No || 9999) - Number(b.No || 9999));
  return `<option value="">เลือกนักเรียน</option>` + arr.map(u => `<option ${u.UserID===selected?'selected':''} value="${escapeHtml(u.UserID)}">เลขที่ ${escapeHtml(u.No || '-')} - ${escapeHtml(u.Name)} (${escapeHtml(u.UserID)})</option>`).join('');
}
function getStudent(id) { return state.students.find(u => u.UserID === id); }

function assignmentInstructionType(a) {
  const raw = String(a?.InstructionType || '').trim();
  if (String(a?.AssignmentMode || '').trim() === 'ใบงานออนไลน์') return 'ใบงานออนไลน์';
  if (['ข้อความ', 'ไฟล์ใบงาน', 'ข้อความและไฟล์', 'ใบงานออนไลน์'].includes(raw)) return raw;
  const hasText = !!String(a?.Description || '').trim();
  const hasUrl = !!String(a?.WorksheetURL || '').trim();
  if (hasText && hasUrl) return 'ข้อความและไฟล์';
  if (hasUrl) return 'ไฟล์ใบงาน';
  return 'ข้อความ';
}

function isOnlineWorksheet(a) {
  return assignmentInstructionType(a) === 'ใบงานออนไลน์';
}

function parseWorksheetSchema(a) {
  try {
    const parsed = typeof a?.WorksheetSchema === 'string' ? JSON.parse(a.WorksheetSchema || '{}') : (a?.WorksheetSchema || {});
    return { version: 1, questions: Array.isArray(parsed.questions) ? parsed.questions : [] };
  } catch (err) { return { version: 1, questions: [] }; }
}

function parseWorksheetAnswers(submission) {
  try {
    const parsed = typeof submission?.WorksheetAnswers === 'string' ? JSON.parse(submission.WorksheetAnswers || '{}') : (submission?.WorksheetAnswers || {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) { return {}; }
}

function renderWorksheetAnswerSummary(assignment, submission) {
  const schema = parseWorksheetSchema(assignment);
  const answers = parseWorksheetAnswers(submission);
  if (!schema.questions.length || !Object.keys(answers).length) return '';
  return `<div class="worksheet-answer-summary"><h4>คำตอบใบงานออนไลน์</h4>${schema.questions.map((q, index) => {
    const value = Array.isArray(answers[q.id]) ? answers[q.id].join(', ') : String(answers[q.id] ?? '').trim();
    return `<div class="worksheet-answer-row"><b>${index + 1}. ${escapeHtml(q.label)}</b><div>${value ? escapeHtml(value).replace(/\n/g, '<br>') : '<span class="answer-empty">ไม่ได้ตอบ</span>'}</div></div>`;
  }).join('')}</div>`;
}

function worksheetIsVisible(a) {
  const value = a?.WorksheetVisible;
  return value === true || String(value || '').toUpperCase() === 'TRUE' || String(value || '').trim() === 'จริง' || String(value || '').trim() === 'แสดง';
}

function hasWorksheetFile(a) {
  return !!String(a?.WorksheetURL || '').trim() && assignmentInstructionType(a) !== 'ข้อความ';
}

function renderInstructionText(a, emptyText='ยังไม่มีคำสั่งงาน') {
  const description = String(a?.Description || '').trim();
  return `<div class="text-work instruction-work">
    <div class="instruction-badge">คำสั่งงานแบบข้อความ</div>
    <strong>${escapeHtml(a?.Topic || 'คำสั่งงาน')}</strong>
    <div>${escapeHtml(description || emptyText).replace(/\n/g, '<br>')}</div>
  </div>`;
}

function renderAssignmentPreview(a, label='ใบงาน') {
  if (hasWorksheetFile(a) && worksheetIsVisible(a)) return drivePreview(a.WorksheetURL, label);
  if (!hasWorksheetFile(a)) return renderInstructionText(a);
  return `<strong>${escapeHtml(label)}ถูกซ่อนไว้</strong>`;
}

function renderWorkOrAssignmentPreview(workOrSubmission, assignment) {
  const fileUrls = getSubmissionFileUrls(workOrSubmission);
  const text = getSubmissionTextWithoutOnlyLinks(workOrSubmission);
  const onlineAnswers = renderWorksheetAnswerSummary(assignment, workOrSubmission);
  if (fileUrls.length) return onlineAnswers + renderSubmittedFilePreview(fileUrls, text, {
    submissionId: workOrSubmission?.SubmissionID,
    sourceRow: workOrSubmission?.SourceRow,
    allowDelete: state.user?.Role === 'teacher' || state.user?.Role === 'admin'
  });
  if (onlineAnswers) return onlineAnswers;
  if (String(workOrSubmission?.WorkText || '').trim()) return `<div class="text-work">${escapeHtml(workOrSubmission.WorkText).replace(/\n/g, '<br>')}</div>`;
  return renderAssignmentPreview(assignment, 'ใบงาน');
}

function renderStudentAssignmentPreview(w) {
  const a = w?.assignment || {};
  return renderAssignmentPreview(a, 'ใบงาน');
}

function splitFileList(value) {
  if (Array.isArray(value)) return value.map(x => String(x || '').trim()).filter(Boolean);
  return String(value || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
}

function extractUrlsFromText(text) {
  const found = String(text || '').match(/https?:\/\/[^\s<>'"]+/g) || [];
  return found.map(url => url.replace(/[),.;]+$/g, '')).filter(Boolean);
}

function uniqueList(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach(item => {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function uniqueSubmissionFileList(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach(item => {
    const value = String(item || '').trim();
    if (!value) return;
    const driveId = extractDriveId(value);
    // URL ของ Drive อาจอยู่หลายรูปแบบ แต่ถ้า File ID เดียวกันให้ถือเป็นไฟล์เดียวกัน
    const key = driveId ? `drive:${driveId}` : `url:${value.replace(/#.*$/, '').replace(/\/$/, '')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function fileIdToDriveUrl(id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return '';
  if (/^https?:\/\//i.test(cleanId)) return cleanId;
  return `https://drive.google.com/file/d/${cleanId}/view`;
}

function getSubmissionFileUrls(submission) {
  if (!submission) return [];
  const urls = [];
  urls.push(...splitFileList(submission.fileUrls));
  urls.push(...splitFileList(submission.FileURLs));
  urls.push(...splitFileList(submission.FileURL));
  urls.push(...splitFileList(submission.FileUrl));
  urls.push(...splitFileList(submission.WorkURL));
  urls.push(...splitFileList(submission.WorkLink));
  splitFileList(submission.FileIDs).forEach(id => urls.push(fileIdToDriveUrl(id)));
  splitFileList(submission.FileID).forEach(id => urls.push(fileIdToDriveUrl(id)));
  urls.push(...extractUrlsFromText(submission.WorkText));
  return uniqueSubmissionFileList(urls);
}

function getSubmissionTextWithoutOnlyLinks(submission) {
  const text = String(submission?.WorkText || '').trim();
  if (!text) return '';
  const urls = extractUrlsFromText(text);
  const stripped = urls.reduce((acc, url) => acc.replace(url, ''), text).trim();
  return stripped || '';
}

function firstSubmissionFileUrl(submission) {
  return getSubmissionFileUrls(submission)[0] || '';
}

function renderSubmittedFilePreview(fileUrls, text='', options={}) {
  const urls = uniqueSubmissionFileList(fileUrls);
  if (!urls.length) return '';
  const removeButton = (url, i) => options.allowDelete && options.submissionId && urls.length > 1
    ? `<button class="remove-file-btn danger" onclick="removeSubmissionFile('${escapeHtml(options.submissionId)}', ${Number(options.sourceRow || 0)}, '${encodeURIComponent(url)}', ${i}); event.preventDefault(); event.stopPropagation();">ลบไฟล์นี้</button>`
    : '';
  const previews = urls.map((url, i) => {
    const label = `ไฟล์งาน ${i + 1}${urls.length > 1 ? ` จาก ${urls.length}` : ''}`;
    const body = `<div class="submitted-file-actions">${removeButton(url, i)}</div>${drivePreview(url, `ไฟล์งาน ${i + 1}`)}`;
    if (i === 0) return `<section class="submitted-file-item submitted-file-first">
      <div class="submitted-file-label">${label}</div>${body}
    </section>`;
    return `<details class="submitted-file-item submitted-file-collapsible">
      <summary>${label} — กดเพื่อแสดง</summary>
      <div class="submitted-file-collapsible-body">${body}</div>
    </details>`;
  }).join('');
  return `<div class="submitted-file-preview">
    ${previews}
    ${text ? `<div class="text-work submitted-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div>` : ''}
  </div>`;
}

async function removeSubmissionFile(submissionId, sourceRow, encodedUrl, fileIndex) {
  const fileUrl = decodeURIComponent(encodedUrl || '');
  if (!fileUrl) return showToast('ไม่พบข้อมูลไฟล์ที่ต้องการลบ');
  if (!confirm(`นำไฟล์งาน ${Number(fileIndex) + 1} ออกจากรายการส่งงานหรือไม่\n\nไฟล์จริงจะยังเก็บอยู่ใน Google Drive`)) return;
  try {
    showToast(`กำลังนำไฟล์งาน ${Number(fileIndex) + 1} ออกจากรายการ...`);
    const data = await apiPost({ action: 'removeSubmissionFile', submissionId, sourceRow, fileUrl, userId: state.user.UserID });
    if (!data.removed) throw new Error('ระบบยังไม่สามารถยืนยันการลบไฟล์นี้ได้');
    showToast('นำไฟล์ออกจากรายการส่งงานแล้ว');
    if (state.currentPage === 'duplicates') await loadDuplicateSubmissions();
    else await loadSubmissions(getReviewSearchParams());
  } catch (err) { showToast(err.message); }
}

function renderSubmittedWorkSummary(submission) {
  if (!submission) return '';
  const fileUrls = getSubmissionFileUrls(submission);
  const fileLinks = fileUrls.map((url, i) => `<a href="${escapeHtml(url)}" target="_blank">เปิดไฟล์ที่ส่ง ${i + 1}</a>`).join(' ');
  const text = getSubmissionTextWithoutOnlyLinks(submission);
  if (!fileLinks && !text) return '';
  return `<div class="submitted-summary">
    <b>งานที่ส่งแล้ว</b>
    ${text ? `<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>` : ''}
    ${fileLinks ? `<div class="submitted-links">${fileLinks}</div>` : ''}
  </div>`;
}

function materialToggleLabel(a) {
  return hasWorksheetFile(a) ? 'แสดง/ซ่อนใบงาน' : 'แสดง/ซ่อนคำสั่ง';
}

function materialOpenButton(a) {
  return hasWorksheetFile(a) ? `<button onclick="window.open('${escapeHtml(a.WorksheetURL)}','_blank')">เปิดใบงาน</button>` : '';
}

function renderAssignmentsPage() {
  $('pageToolbar').innerHTML = `
    <select id="levelFilter" onchange="state.selectedLevel=this.value; state.selectedAssignment=''; renderAssignmentsPage()">${levelOptions(state.selectedLevel)}</select>
    <select id="assignmentFilter" class="toolbar-assignment-select" title="เลือกงาน" onchange="state.selectedAssignment=this.value; renderAssignmentsPage()">${assignmentOptions(state.selectedLevel, state.selectedAssignment)}</select>
    <button onclick="openCreateAssignment()">เพิ่มงาน</button>
    <button onclick="refreshBootstrap()">รีเฟรช</button>
  `;
  syncToolbarHeight();
  const list = state.assignments.filter(a => (!state.selectedLevel || a.Level === state.selectedLevel) && (!state.selectedAssignment || a.AssignmentID === state.selectedAssignment));
  $('content').innerHTML = `<div class="card-list">${list.map(renderAssignmentCard).join('') || '<div class="hero-empty">ยังไม่มีงานในเงื่อนไขนี้</div>'}</div>`;
}

function renderAssignmentCard(a) {
  const inactive = a.Status === 'ปิดใช้งาน';
  const type = assignmentInstructionType(a);
  return `<article class="layout-card" data-assignment="${escapeHtml(a.AssignmentID)}">
    <div class="work-preview" id="worksheetBox_${escapeHtml(a.AssignmentID)}">
      ${renderAssignmentPreview(a, 'ใบงาน')}
    </div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div><b>สถานะงาน:</b> <span class="status-pill">${escapeHtml(a.Status || 'เปิดใช้งาน')}</span></div>
      <div><b>ระดับชั้น:</b> ${escapeHtml(a.Level)} | <b>คะแนนเต็ม:</b> ${escapeHtml(a.FullScore || '')}</div>
      <div><b>ประเภทงาน:</b> ${escapeHtml(a.WorkType)} | <b>กลุ่ม:</b> ${escapeHtml(a.GroupMode)}</div>
      <div><b>รูปแบบคำสั่ง:</b> ${escapeHtml(type)}</div>
      <div><b>ห้องที่สั่งงาน:</b> ${escapeHtml(a.AssignedClasses)}</div>
      <div><b>คำอธิบาย:</b><br>${escapeHtml(a.Description || 'ไม่มีคำอธิบาย').replace(/\n/g, '<br>')}</div>
      <div class="detail-actions">
        <button onclick="openAssignmentEditor('${a.AssignmentID}')">แก้ไขงาน</button>
        <button onclick="toggleWorksheet('${a.AssignmentID}')">${materialToggleLabel(a)}</button>
        ${materialOpenButton(a)}
        <button class="${inactive?'':'warn'}" onclick="toggleAssignmentStatus('${a.AssignmentID}', '${inactive?'เปิดใช้งาน':'ปิดใช้งาน'}')">${inactive?'เปิดใช้งาน':'ปิดการใช้งาน'}</button>
      </div>
    </div>
  </article>`;
}

function drivePreview(url, label='ไฟล์') {
  const previewUrl = getGooglePreviewUrl(url);
  const safeUrl = escapeHtml(url);
  if (!previewUrl) return `<a href="${safeUrl}" target="_blank">เปิด${label}</a>`;
  return `<div class="preview-frame-wrap">
    <iframe loading="lazy" src="${escapeHtml(previewUrl)}"></iframe>
    <a class="preview-open-link" href="${safeUrl}" target="_blank">เปิด${label}ในแท็บใหม่</a>
  </div>`;
}

function getGooglePreviewUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/docs\.google\.com\/document\/d\//.test(raw)) return raw.split(/[?#]/)[0].replace(/\/edit.*$/, '/preview');
  if (/docs\.google\.com\/spreadsheets\/d\//.test(raw)) return raw.split(/[?#]/)[0].replace(/\/edit.*$/, '/preview');
  if (/docs\.google\.com\/presentation\/d\//.test(raw)) return raw.split(/[?#]/)[0].replace(/\/edit.*$/, '/preview');
  const id = extractDriveId(raw);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  return '';
}

function extractDriveId(url) {
  const text = String(url || '');
  const m = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function toggleWorksheet(id) {
  const box = $(`worksheetBox_${id}`);
  const a = getAssignment(id);
  if (!box || !a) return;
  if (box.dataset.hidden === '1') {
    box.innerHTML = renderAssignmentPreview(a, 'ใบงาน');
    box.dataset.hidden = '0';
  } else {
    box.innerHTML = `<strong>${hasWorksheetFile(a) ? 'ใบงานถูกซ่อนไว้' : 'คำสั่งงานถูกซ่อนไว้'}</strong>`;
    box.dataset.hidden = '1';
  }
}
function showAssignmentInfo(id) {
  const a = getAssignment(id);
  if (!a) return;
  const scoreLine = state.user?.Role === 'student' ? '' : `\nคะแนนเต็ม: ${a.FullScore || '-'}`;
  alert(`คำสั่งงาน

${a.Topic}

${a.Description || 'ไม่มีคำอธิบาย'}

รูปแบบคำสั่ง: ${assignmentInstructionType(a)}
${scoreLine}
ห้อง: ${a.AssignedClasses || '-'}`);
}
async function toggleAssignmentStatus(id, status) {
  if (!confirm(`${status} งานนี้ใช่ไหม`)) return;
  try {
    await apiPost({ action: 'setAssignmentStatus', assignmentId: id, status, userId: state.user.UserID });
    await refreshBootstrap(false);
    showToast('บันทึกสถานะงานแล้ว');
  } catch (err) { showToast(err.message); }
}
function openCreateAssignment() {
  openAssignmentEditor();
}

function assignmentEditorClasses(level, selected=[]) {
  return (state.classesByLevel[level] || []).map(c => `<label class="inline-check"><input type="checkbox" name="assignmentClass" value="${escapeHtml(c)}" ${selected.includes(c) ? 'checked' : ''}> ${escapeHtml(c)}</label>`).join('') || '<span>เลือกระดับชั้นก่อน</span>';
}

function openAssignmentEditor(assignmentId='') {
  const a = assignmentId ? getAssignment(assignmentId) : null;
  const level = a?.Level || state.selectedLevel || state.levels[0] || '';
  const modal = document.createElement('div');
  modal.id = 'assignmentEditorModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal-card assignment-editor">
    <div class="modal-head"><h2>${a ? 'แก้ไขงาน' : 'เพิ่มงาน'}</h2><button type="button" onclick="closeAssignmentEditor()">✕</button></div>
    <div class="assignment-form-grid">
      <label>ระดับชั้น<select id="aeLevel" onchange="$('aeClasses').innerHTML=assignmentEditorClasses(this.value, [])">${levelOptions(level)}</select></label>
      <label>ชื่องาน<input id="aeTopic" value="${escapeHtml(a?.Topic || '')}"></label>
      <label>คะแนนเต็ม<input id="aeFullScore" type="number" min="0" step="0.01" value="${escapeHtml(a?.FullScore ?? '')}"></label>
      <label>ประเภทงาน<select id="aeWorkType"><option ${a?.WorkType !== 'งานกลุ่ม' ? 'selected' : ''}>งานเดี่ยว</option><option ${a?.WorkType === 'งานกลุ่ม' ? 'selected' : ''}>งานกลุ่ม</option></select></label>
      <label class="full-row">ห้องที่มอบหมาย<div id="aeClasses" class="class-checks">${assignmentEditorClasses(level, csv(a?.AssignedClasses))}</div></label>
      <label class="full-row">รูปแบบงาน<select id="aeMode" onchange="toggleAssignmentModeFields()"><option value="งานแนบไฟล์" ${!isOnlineWorksheet(a) ? 'selected' : ''}>งานปกติ (ข้อความ/แนบไฟล์)</option><option value="ใบงานออนไลน์" ${isOnlineWorksheet(a) ? 'selected' : ''}>ใบงานออนไลน์ (พิมพ์ตอบในเว็บ)</option></select></label>
      <label class="full-row">คำชี้แจง<textarea id="aeDescription">${escapeHtml(a?.Description || '')}</textarea></label>
      <label class="full-row">ลิงก์ภาพ/ไฟล์ใบงาน Google Drive (ไม่บังคับ)<input id="aeWorksheetURL" value="${escapeHtml(a?.WorksheetURL || '')}" placeholder="https://drive.google.com/..."></label>
    </div>
    <section id="aeQuestionSection" class="question-builder"><div class="builder-head"><h3>ช่องคำตอบใบงาน</h3><button type="button" onclick="addWorksheetQuestion()">+เพิ่มคำถาม</button></div><div id="aeQuestions"></div></section>
    <div class="modal-actions"><button type="button" onclick="closeAssignmentEditor()">ยกเลิก</button><button type="button" onclick="saveAssignmentEditor('${escapeHtml(assignmentId)}')">บันทึกงาน</button></div>
  </div>`;
  document.body.appendChild(modal);
  parseWorksheetSchema(a).questions.forEach(addWorksheetQuestion);
  toggleAssignmentModeFields();
}

function closeAssignmentEditor() { $('assignmentEditorModal')?.remove(); }
function toggleAssignmentModeFields() { $('aeQuestionSection')?.classList.toggle('hidden', $('aeMode')?.value !== 'ใบงานออนไลน์'); }
function addWorksheetQuestion(q={}) {
  const box = document.createElement('div');
  box.className = 'question-builder-row';
  box.dataset.questionId = q.id || `Q${Date.now()}${Math.floor(Math.random()*1000)}`;
  box.innerHTML = `<label>คำถาม<input class="qb-label" value="${escapeHtml(q.label || '')}" placeholder="เช่น เป็นเทคโนโลยีหรือไม่"></label><label>ชนิด<select class="qb-type" onchange="this.closest('.question-builder-row').querySelector('.qb-options-wrap').classList.toggle('hidden', !['radio','checkbox'].includes(this.value))"><option value="short" ${q.type==='short'?'selected':''}>ข้อความสั้น</option><option value="long" ${!q.type||q.type==='long'?'selected':''}>ข้อความยาว</option><option value="radio" ${q.type==='radio'?'selected':''}>เลือกได้ 1 คำตอบ</option><option value="checkbox" ${q.type==='checkbox'?'selected':''}>เลือกได้หลายคำตอบ</option><option value="number" ${q.type==='number'?'selected':''}>ตัวเลข</option></select></label><label class="qb-options-wrap ${['radio','checkbox'].includes(q.type)?'':'hidden'}">ตัวเลือก (คั่นด้วย |)<input class="qb-options" value="${escapeHtml((q.options || []).join(' | '))}" placeholder="เป็น | ไม่เป็น"></label><label class="inline-check"><input class="qb-required" type="checkbox" ${q.required?'checked':''}> บังคับตอบ</label><button type="button" class="danger" onclick="this.closest('.question-builder-row').remove()">ลบข้อนี้</button>`;
  $('aeQuestions')?.appendChild(box);
}

async function saveAssignmentEditor(assignmentId='') {
  const classes = Array.from(document.querySelectorAll('[name="assignmentClass"]:checked')).map(x => x.value);
  const mode = $('aeMode').value;
  const questions = Array.from(document.querySelectorAll('.question-builder-row')).map(row => ({ id: row.dataset.questionId, label: row.querySelector('.qb-label').value.trim(), type: row.querySelector('.qb-type').value, options: row.querySelector('.qb-options').value.split('|').map(x => x.trim()).filter(Boolean), required: row.querySelector('.qb-required').checked }));
  const existingAssignment = assignmentId ? getAssignment(assignmentId) : null;
  const assignment = { Level: $('aeLevel').value, Topic: $('aeTopic').value.trim(), FullScore: $('aeFullScore').value, WorkType: $('aeWorkType').value, GroupMode: $('aeWorkType').value === 'งานกลุ่ม' ? (existingAssignment?.GroupMode || 'ใช้กลุ่มประจำห้อง') : 'ไม่ใช้กลุ่ม', AssignedClasses: classes.join(','), Description: $('aeDescription').value.trim(), WorksheetURL: $('aeWorksheetURL').value.trim(), WorksheetVisible: true, AssignmentMode: mode, InstructionType: mode === 'ใบงานออนไลน์' ? 'ใบงานออนไลน์' : ($('aeWorksheetURL').value.trim() ? 'ข้อความและไฟล์' : 'ข้อความ'), WorksheetSchema: mode === 'ใบงานออนไลน์' ? JSON.stringify({version:1, questions}) : '' };
  if (existingAssignment?.GroupSetID) assignment.GroupSetID = existingAssignment.GroupSetID;
  if (!assignment.Level || !assignment.Topic || !classes.length) return showToast('กรุณาระบุระดับชั้น ชื่องาน และห้องที่มอบหมาย');
  if (mode === 'ใบงานออนไลน์' && (!questions.length || questions.some(q => !q.label))) return showToast('กรุณาเพิ่มคำถามและใส่ข้อความให้ครบ');
  try {
    showToast('กำลังบันทึกงาน...', {persistent:true, loading:true});
    await apiPost(assignmentId ? {action:'updateAssignment', assignmentId, updates:assignment, userId:state.user.UserID} : {action:'createAssignment', assignment, userId:state.user.UserID});
    closeAssignmentEditor(); await refreshBootstrap(false); renderAssignmentsPage(); showToast('บันทึกงานแล้ว');
  } catch (err) { showToast(err.message); }
}

function renderReviewAllPage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedAssignment=''; state.selectedClass=''; state.submissions=[]; clearSelectedSubmissions(false); renderReviewAllPage()">${reviewAllLevelOptions(state.selectedLevel)}</select>
    <select class="toolbar-assignment-select" title="เลือกงาน — รายการเมื่อเปิดจะแสดงชื่อเต็ม" onchange="state.selectedAssignment=this.value; state.submissions=[]; clearSelectedSubmissions(false); renderReviewAllPage()">${reviewAllAssignmentOptions(state.selectedLevel, state.selectedAssignment)}</select>
    <select onchange="state.selectedClass=this.value; state.submissions=[]; clearSelectedSubmissions(false); renderReviewAllPage()">${reviewAllClassOptions(state.selectedLevel, state.selectedClass)}</select>
    <button onclick="loadSubmissions()">โหลดงาน</button>
    <button onclick="loadSubmissions()">รีเฟรช</button>
    <button class="${state.reviewSelectMode ? 'warn' : ''}" onclick="toggleReviewSelectMode()">${state.reviewSelectMode ? 'ปิดโหมดเลือกหลายงาน' : 'เลือกหลายงาน'}</button>
    <button class="toolbar-gear-btn" title="ตัวเลือกการแสดงงาน" aria-label="ตัวเลือกการแสดงงาน" aria-expanded="false" onclick="toggleReviewFilterOptions(this)">⚙</button>
    <div id="reviewFilterOptions" class="review-filter-options hidden">
      <label><input id="hideChecked" type="checkbox" checked> ซ่อนงานที่ตรวจแล้ว</label>
      <label><input id="hideGraded" type="checkbox"> ซ่อนงานที่ให้คะแนนแล้ว</label>
    </div>
    ${state.reviewSelectMode ? renderBulkReviewToolbar() : ''}
  `;
  syncToolbarHeight();
  if (!state.submissions.length) $('content').innerHTML = '<div class="hero-empty">เลือกเงื่อนไขแล้วกดโหลดงาน</div>';
  else renderSubmissionCards(state.submissions);
}

function toggleReviewFilterOptions(button) {
  const options = $('reviewFilterOptions');
  if (!options) return;
  const opening = options.classList.contains('hidden');
  options.classList.toggle('hidden', !opening);
  if (button) {
    button.classList.toggle('warn', opening);
    button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }
  syncToolbarHeight();
}

function renderBulkReviewToolbar() {
  return `<div class="bulk-review-toolbar">
    <span id="bulkSelectedCount">เลือกแล้ว ${state.selectedSubmissionIds.size} งาน</span>
    <button onclick="selectAllVisibleSubmissions()">เลือกทั้งหมดที่แสดง</button>
    <button onclick="clearSelectedSubmissions()">ยกเลิกการเลือก</button>
    <button onclick="batchMarkCheckedSelected()">ตรวจแล้ว</button>
    <button onclick="batchFullScoreSelected()">ให้คะแนนเต็ม</button>
    <input id="bulkReviewScore" class="score-bulk-input" placeholder="คะแนน">
    <button onclick="batchCustomScoreSelected()">ให้คะแนน</button>
    <button onclick="batchReturnSelected()">ส่งคืนงาน</button>
    <button class="danger" onclick="batchDeleteSelected()">ลบงานที่เลือก</button>
  </div>`;
}

function toggleReviewSelectMode() {
  state.reviewSelectMode = !state.reviewSelectMode;
  if (!state.reviewSelectMode) state.selectedSubmissionIds.clear();
  renderReviewAllPage();
}

function updateBulkSelectedCount() {
  const el = $('bulkSelectedCount');
  if (el) el.textContent = `เลือกแล้ว ${state.selectedSubmissionIds.size} งาน`;
  document.querySelectorAll('.submission-select-checkbox').forEach(cb => {
    cb.checked = state.selectedSubmissionIds.has(cb.value);
  });
}

function toggleSubmissionSelection(id, checked) {
  if (checked) state.selectedSubmissionIds.add(id);
  else state.selectedSubmissionIds.delete(id);
  updateBulkSelectedCount();
}

function selectAllVisibleSubmissions() {
  (state.submissions || []).forEach(s => {
    if (s.SubmissionID) state.selectedSubmissionIds.add(String(s.SubmissionID));
  });
  updateBulkSelectedCount();
}

function clearSelectedSubmissions(render=true) {
  state.selectedSubmissionIds.clear();
  if (render && state.currentPage === 'reviewAll') renderReviewAllPage();
}

function selectedSubmissionIds() {
  return Array.from(state.selectedSubmissionIds).filter(Boolean);
}

function selectedSubmissionObjects() {
  const ids = new Set(selectedSubmissionIds());
  return (state.submissions || []).filter(s => ids.has(String(s.SubmissionID)));
}

function batchFailureDetail(failed) {
  const messages = (failed || []).map(result => String(result.error || '').trim()).filter(Boolean);
  if (!messages.length) return '';
  const unique = Array.from(new Set(messages));
  return `: ${unique.slice(0, 3).join(' | ')}${unique.length > 3 ? ' | ...' : ''}`;
}

async function batchPostSelected(makePayload, successMessage) {
  const ids = selectedSubmissionIds();
  if (!ids.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  try {
    const payloads = ids.map(id => makePayload(id));
    showToast(`กำลังดำเนินการ ${ids.length} งาน...`);
    let data = null;
    if (payloads.every(payload => payload.action === 'updateSubmission')) {
      data = await apiPost({ action: 'batchUpdateSubmissions', userId: state.user.UserID, updates: payloads });
    } else {
      for (const payload of payloads) {
        const result = await apiPost(payload);
        if (payload.action === 'deleteSubmission' && (!result.deleted || String(result.submissionId) !== String(payload.submissionId))) {
          throw new Error(`ระบบยังไม่สามารถยืนยันการลบรายการ ${payload.submissionId} ได้`);
        }
      }
    }
    if (data?.results) {
      const succeeded = data.results.filter(result => result.ok && result.submission);
      const failed = data.results.filter(result => !result.ok);
      succeeded.forEach(result => {
        applySavedSubmission(result.submission);
        state.selectedSubmissionIds.delete(String(result.submissionId));
      });
      showToast(data.warning || (failed.length
        ? `บันทึกสำเร็จ ${succeeded.length} งาน, ไม่สำเร็จ ${failed.length} งาน${batchFailureDetail(failed)} — คงรายการที่ไม่สำเร็จไว้แล้ว`
        : `${successMessage || 'ดำเนินการกับงานที่เลือกแล้ว'} (${succeeded.length} งาน)`));
      updateBulkSelectedCount();
    } else {
      state.selectedSubmissionIds.clear();
      await loadSubmissions();
    }
  } catch (err) { showToast(err.message); }
}

function batchMarkCheckedSelected() {
  batchPostSelected(id => ({ action: 'updateSubmission', submissionId: id, userId: state.user.UserID, CheckedStatus: 'ตรวจแล้ว' }), 'เปลี่ยนสถานะงานที่เลือกเป็นตรวจแล้ว');
}

function batchFullScoreSelected() {
  const items = selectedSubmissionObjects();
  if (!items.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  batchPostSelected(id => {
    const s = items.find(x => String(x.SubmissionID) === String(id));
    const a = s?.assignment || getAssignment(s?.AssignmentID) || {};
    return { action: 'updateSubmission', submissionId: id, assignmentId: s?.AssignmentID || '', userId: state.user.UserID, Score: a.FullScore ?? '', CheckedStatus: 'ตรวจแล้ว', requireScore: true };
  }, 'ให้คะแนนเต็มกับงานที่เลือกแล้ว');
}

function batchCustomScoreSelected() {
  const score = $('bulkReviewScore')?.value ?? '';
  if (!String(score).trim()) return showToast('กรุณาใส่คะแนนก่อน');
  batchPostSelected(id => ({
    action: 'updateSubmission',
    submissionId: id,
    userId: state.user.UserID,
    Score: score,
    CheckedStatus: 'ตรวจแล้ว'
  }), 'ให้คะแนนงานที่เลือกแล้ว');
}

function batchReturnSelected() {
  const ids = selectedSubmissionIds();
  if (!ids.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  const note = prompt(`หมายเหตุส่งคืนงานที่เลือก ${ids.length} งาน`);
  if (note === null) return;
  batchPostSelected(id => ({ action: 'updateSubmission', submissionId: id, userId: state.user.UserID, ReturnStatus: 'ส่งคืน', ReturnNote: note, CheckedStatus: 'ยังไม่ตรวจ' }), 'ส่งคืนงานที่เลือกแล้ว');
}

function batchDeleteSelected() {
  const ids = selectedSubmissionIds();
  if (!ids.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  if (!confirm(`ลบงานที่เลือก ${ids.length} งานใช่ไหม`)) return;
  batchPostSelected(id => ({ action: 'deleteSubmission', submissionId: id, userId: state.user.UserID }), 'ลบงานที่เลือกแล้ว');
}

async function loadSubmissions(extra={}) {
  if (!state.selectedAssignment && state.currentPage === 'reviewAll') return showToast('กรุณาเลือกใบงาน');
  try {
    setLoading('กำลังโหลดงาน...');
    const hideChecked = $('hideChecked') ? $('hideChecked').checked : false;
    const hideGraded = $('hideGraded') ? $('hideGraded').checked : false;
    const assignmentId = state.selectedAssignment === ALL_OPTION ? '' : state.selectedAssignment;
    const level = state.selectedLevel === ALL_OPTION ? '' : state.selectedLevel;
    const data = await apiGet({ action: 'submissions', assignmentId, level, className: state.selectedClass, hideChecked, hideGraded, ...extra });
    state.submissions = data.submissions || [];
    state.selectedSubmissionIds.clear();
    renderSubmissionCards(state.submissions);
  } catch (err) { showToast(err.message); }
}

function renderSubmissionCards(items) {
  if (state.currentPage === 'reviewAll' && state.selectedAssignment === ALL_OPTION && items.length) {
    const groups = {};
    items.forEach(item => {
      const level = item.Level || item.assignment?.Level || 'ไม่ระบุระดับชั้น';
      if (!groups[level]) groups[level] = [];
      groups[level].push(item);
    });
    const levels = Object.keys(groups).sort((a, b) => String(a).localeCompare(String(b), 'th', { numeric: true }));
    $('content').innerHTML = levels.map(level => `<section class="review-level-group">
      <h2 class="review-level-heading">ระดับชั้น ${escapeHtml(level)} <span>${groups[level].length} งานส่ง</span></h2>
      <div class="card-list">${groups[level].map(renderSubmissionCard).join('')}</div>
    </section>`).join('');
    return;
  }
  $('content').innerHTML = `<div class="card-list">${items.map(renderSubmissionCard).join('') || '<div class="hero-empty">ไม่พบงานที่ส่ง</div>'}</div>`;
}

function renderSubmissionCard(s) {
  const a = s.assignment || getAssignment(s.AssignmentID) || {};
  const left = renderWorkOrAssignmentPreview(s, a);
  const selected = state.selectedSubmissionIds.has(String(s.SubmissionID));
  return `<article id="submissionCard_${escapeHtml(s.SubmissionID)}" class="layout-card ${state.reviewSelectMode ? 'select-mode' : ''}" data-submission="${escapeHtml(s.SubmissionID)}">
    ${state.reviewSelectMode ? `<label class="submission-select"><input class="submission-select-checkbox" type="checkbox" value="${escapeHtml(s.SubmissionID)}" ${selected ? 'checked' : ''} onchange="toggleSubmissionSelection('${escapeHtml(s.SubmissionID)}', this.checked)"> เลือกงานนี้</label>` : ''}
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนงาน" onclick="toggleSubmissionPreview('${s.SubmissionID}')">👁</button>
      <button class="icon-btn" title="แสดงคำสั่งงาน" onclick="showAssignmentInfo('${s.AssignmentID}')">📄</button>
      <button class="icon-btn" title="ลบงานที่ส่ง" onclick="deleteSubmission('${s.SubmissionID}')">🗑</button>
    </div>
    <div class="work-preview" id="subPreview_${escapeHtml(s.SubmissionID)}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic || 'งานที่ส่ง')}</h3>
      <div>ห้อง ${escapeHtml(s.Class)} เลขที่ ${escapeHtml(s.No || '-')}</div>
      <div>ชื่อ ${escapeHtml(s.StudentName)} เลขประจำตัว ${escapeHtml(s.StudentID)}</div>
      ${s.GroupName ? `<div>กลุ่ม ${escapeHtml(s.GroupName)}<br>สมาชิก: ${escapeHtml(s.MemberNames)}</div>` : ''}
      <div>สถานะ <span class="status-pill">${escapeHtml(s.CheckedStatus || 'ยังไม่ตรวจ')}</span> <span class="status-pill">${escapeHtml(s.LateStatus || '')}</span></div>
      <label>คะแนน <input id="score_${s.SubmissionID}" class="score-input" value="${escapeHtml(s.Score || '')}" placeholder="คะแนน"></label>
      <label>หมายเหตุครู <textarea id="note_${s.SubmissionID}">${escapeHtml(s.TeacherNote || '')}</textarea></label>
      ${renderIndividualGroupScorePanel(s)}
      <div class="detail-actions">
        <button onclick="saveScore('${s.SubmissionID}')">บันทึกคะแนน</button>
        <button onclick="markChecked('${s.SubmissionID}')">ตรวจแล้ว</button>
        <button onclick="returnWork('${s.SubmissionID}')">คืนงาน</button>
        <button onclick="fillFullScore('${s.SubmissionID}', '${escapeHtml(a.FullScore || '')}')">ให้คะแนนเต็ม</button>
        ${materialOpenButton(a)}
      </div>
    </div>
  </article>`;
}

function submissionShouldBeHidden(submission) {
  if (state.currentPage !== 'reviewAll') return false;
  const hasScore = String(submission?.Score ?? '').trim() !== '';
  const checked = String(submission?.CheckedStatus || '') === 'ตรวจแล้ว' || hasScore;
  return ($('hideChecked')?.checked && checked) || ($('hideGraded')?.checked && hasScore);
}

function refreshVisibleReviewCounts() {
  document.querySelectorAll('.review-level-group').forEach(section => {
    const count = section.querySelectorAll('.layout-card[data-submission]').length;
    const label = section.querySelector('.review-level-heading span');
    if (label) label.textContent = `${count} งานส่ง`;
    if (!count) section.remove();
  });
}

function applySavedSubmission(saved, options={}) {
  if (!saved?.SubmissionID) return;
  const id = String(saved.SubmissionID);
  const index = state.submissions.findIndex(item => String(item.SubmissionID) === id);
  const current = index >= 0 ? state.submissions[index] : {};
  const merged = { ...current, ...saved, assignment: saved.assignment || current.assignment };
  const card = $(`submissionCard_${id}`);
  if (submissionShouldBeHidden(merged)) {
    if (index >= 0) state.submissions.splice(index, 1);
    if (card) card.remove();
    refreshVisibleReviewCounts();
    if (!state.submissions.length) $('content').innerHTML = '<div class="hero-empty">ไม่พบงานที่ส่งตามตัวกรองนี้</div>';
    return;
  }
  if (index >= 0) state.submissions[index] = merged;
  else state.submissions.push(merged);
  if (!card) return;
  const individualWasOpen = options.reopenIndividual || !!card.querySelector('.individual-score-panel[open]');
  card.outerHTML = renderSubmissionCard(merged);
  if (individualWasOpen) $(`submissionCard_${id}`)?.querySelector('.individual-score-panel')?.setAttribute('open', '');
}

function parsedIndividualScores(s) {
  try { return JSON.parse(s?.IndividualScores || '{}') || {}; } catch (err) { return {}; }
}

function parsedStudentParticipation(s) {
  if (s?.StudentParticipation && typeof s.StudentParticipation === 'object') return s.StudentParticipation;
  try { return JSON.parse(s?.StudentParticipation || '{}') || {}; } catch (err) { return {}; }
}

function renderIndividualGroupScorePanel(s) {
  if (String(s.SubmitMode || '') !== 'กลุ่ม') return '';
  const ids = csv(s.MemberIDs);
  const names = csv(s.MemberNames);
  const saved = parsedIndividualScores(s);
  const studentReported = parsedStudentParticipation(s);
  if (!ids.length) return '<div class="group-warning">งานกลุ่มนี้ยังไม่มีรหัสสมาชิก กรุณาซิงก์ข้อมูลกลุ่มก่อน</div>';
  const rows = ids.map((id, index) => {
    const item = saved[id] || {};
    const participation = item.participation || 'ปกติ';
    return `<div class="individual-score-row" data-student-id="${escapeHtml(id)}">
      <div><b>${escapeHtml(names[index] || id)}</b><small>${escapeHtml(id)}</small><small>นักเรียนแจ้งว่า: ${escapeHtml(studentReported[id] || 'ยังไม่ระบุ')}</small></div>
      <select class="member-participation">
        ${['มาก','ปกติ','น้อย'].map(value => `<option ${participation===value?'selected':''}>${value}</option>`).join('')}
      </select>
      <input class="member-adjustment" type="number" step="0.01" value="${escapeHtml(item.adjustment ?? 0)}" placeholder="ปรับ +/-" oninput="updateIndividualFinalPreview(this)">
      <input class="member-final-score" type="number" step="0.01" value="${escapeHtml(item.finalScore ?? '')}" placeholder="คะแนนสุดท้าย">
      <input class="member-score-note" value="${escapeHtml(item.note || '')}" placeholder="หมายเหตุรายคน">
    </div>`;
  }).join('');
  return `<details class="individual-score-panel">
    <summary>คะแนนรายบุคคลตามการมีส่วนร่วม</summary>
    <div class="individual-score-head"><span>สมาชิก</span><span>การมีส่วนร่วม</span><span>ปรับคะแนน</span><span>คะแนนสุดท้าย</span><span>หมายเหตุ</span></div>
    <div id="individual_${escapeHtml(s.SubmissionID)}">${rows}</div>
    <button onclick="saveIndividualGroupScores('${escapeHtml(s.SubmissionID)}')">บันทึกคะแนนรายบุคคล</button>
  </details>`;
}

function updateIndividualFinalPreview(input) {
  const row = input.closest('.individual-score-row');
  const card = input.closest('.layout-card');
  if (!row || !card) return;
  const scoreInput = card.querySelector('.score-input');
  const finalInput = row.querySelector('.member-final-score');
  const groupScore = Number(scoreInput?.value || 0);
  const adjustment = Number(input.value || 0);
  if (finalInput) finalInput.value = groupScore + adjustment;
}

async function saveIndividualGroupScores(submissionId) {
  const container = $(`individual_${submissionId}`);
  if (!container) return;
  const groupScore = $(`score_${submissionId}`)?.value || '';
  if (!String(groupScore).trim()) return showToast('กรุณาใส่คะแนนกลุ่มก่อน');
  const members = Array.from(container.querySelectorAll('.individual-score-row')).map(row => ({
    studentId: row.dataset.studentId || '',
    participation: row.querySelector('.member-participation')?.value || 'ปกติ',
    adjustment: row.querySelector('.member-adjustment')?.value || 0,
    finalScore: row.querySelector('.member-final-score')?.value || '',
    note: row.querySelector('.member-score-note')?.value || ''
  }));
  try {
    showToast('กำลังบันทึกคะแนนรายบุคคล...');
    const data = await apiPost({
      action: 'saveIndividualGroupScores',
      submissionId,
      userId: state.user.UserID,
      groupScore,
      teacherNote: $(`note_${submissionId}`)?.value || '',
      members
    });
    showToast('บันทึกคะแนนรายบุคคลแล้ว');
    applySavedSubmission(data.submission, { reopenIndividual: true });
  } catch (err) { showToast(err.message); }
}

function toggleSubmissionPreview(id) {
  const box = $(`subPreview_${id}`);
  if (!box) return;
  if (box.style.visibility === 'hidden') box.style.visibility = 'visible';
  else box.style.visibility = 'hidden';
}
function togglePreviewBox(id) {
  const box = $(id);
  if (!box) return;
  if (box.style.visibility === 'hidden') box.style.visibility = 'visible';
  else box.style.visibility = 'hidden';
}
function fillFullScore(submissionId, fullScore) { const el=$(`score_${submissionId}`); if (el) el.value = fullScore; }
async function saveScore(id, extra={}) {
  try {
    const data = await apiPost({ action: 'updateSubmission', submissionId: id, userId: state.user.UserID, Score: $(`score_${id}`)?.value || '', TeacherNote: $(`note_${id}`)?.value || '', ...extra });
    showToast('บันทึกแล้ว');
    applySavedSubmission(data.submission);
  } catch (err) { showToast(err.message); }
}
function markChecked(id) { saveScore(id, { CheckedStatus: 'ตรวจแล้ว' }); }
async function returnWork(id) {
  const note = prompt('หมายเหตุส่งคืนงาน');
  if (note === null) return;
  await saveScore(id, { ReturnStatus: 'ส่งคืน', ReturnNote: note, CheckedStatus: 'ยังไม่ตรวจ' });
}
async function deleteSubmission(id) {
  if (!confirm('ลบงานที่ส่งนี้ใช่ไหม')) return;
  try {
    const data = await apiPost({ action: 'deleteSubmission', submissionId: id, userId: state.user.UserID });
    if (!data.deleted || String(data.submissionId) !== String(id)) throw new Error('ระบบยังไม่สามารถยืนยันการลบรายการนี้ได้');
    showToast('ลบงานแล้ว');
    await loadSubmissions(getReviewSearchParams());
  } catch (err) { showToast(err.message); }
}

function renderReviewOnePage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.individualLevel=this.value; state.individualClass=''; renderReviewOnePage()">${levelOptions(state.individualLevel)}</select>
    <select onchange="state.individualClass=this.value; renderReviewOnePage()">${classOptions(state.individualLevel, state.individualClass)}</select>
    <input id="personSearch" placeholder="ชื่อ / เลขที่ / รหัส / ชื่อกลุ่ม">
    <button onclick="loadIndividualWork()">ค้นหา</button>
    <button onclick="loadIndividualWork()">รีเฟรช</button>
  `;
  syncToolbarHeight();
  $('content').innerHTML = '<div class="hero-empty">เลือกห้อง แล้วค้นหานักเรียนหรือกลุ่ม</div>';
}
function getReviewSearchParams() {
  if (state.currentPage === 'reviewOne') {
    return {
      assignmentId: '',
      level: state.individualLevel,
      className: state.individualClass,
      hideChecked: false,
      hideGraded: false,
      search: $('personSearch')?.value || ''
    };
  }
  return {};
}
async function loadIndividualWork() {
  const search = $('personSearch')?.value || '';
  if (!state.individualLevel || !state.individualClass || !search.trim()) return showToast('กรุณาเลือกระดับชั้น ห้อง และคำค้นหา');
  await loadSubmissions({
    assignmentId: '',
    level: state.individualLevel,
    className: state.individualClass,
    hideChecked: false,
    hideGraded: false,
    search
  });
}

function renderStudentViewPage() {
  const selectedStudent = getStudent(state.selectedPreviewStudent);
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedClass=''; state.selectedPreviewStudent=''; renderStudentViewPage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedClass=this.value; state.selectedPreviewStudent=''; renderStudentViewPage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <select onchange="state.selectedPreviewStudent=this.value; renderStudentViewPage()">${studentOptions(state.selectedLevel, state.selectedClass, state.selectedPreviewStudent)}</select>
    <button onclick="loadStudentPreviewWork()">ดูมุมมองนักเรียน</button>
    <button onclick="loadStudentPreviewWork()">รีเฟรช</button>
  `;
  syncToolbarHeight();
  $('content').innerHTML = selectedStudent
    ? `<div class="hero-empty">เลือก ${escapeHtml(selectedStudent.Name)} แล้วกดดูมุมมองนักเรียน</div>`
    : '<div class="hero-empty">เลือกระดับชั้น ห้อง และนักเรียน เพื่อดูหน้าฝั่งนักเรียน</div>';
}

async function loadStudentPreviewWork() {
  if (!state.selectedPreviewStudent) return showToast('กรุณาเลือกนักเรียน');
  const previewUser = getStudent(state.selectedPreviewStudent);
  try {
    setLoading('กำลังโหลดมุมมองนักเรียน...');
    const data = await apiGet({ action: 'studentWork', userId: state.selectedPreviewStudent });
    const list = data.work || [];
    $('content').innerHTML = `
      <div class="student-preview-note">โหมดครูดูตัวอย่าง: ${escapeHtml(previewUser?.Name || '')} / ${escapeHtml(previewUser?.ClassName || '')} ไม่สามารถส่งงานแทนนักเรียนได้</div>
      <div class="card-list">${list.map(w => renderStudentPreviewCard(w, previewUser)).join('') || '<div class="hero-empty">ไม่พบงานของนักเรียนคนนี้</div>'}</div>`;
  } catch (err) { showToast(err.message); }
}

function renderStudentPreviewCard(w, previewUser) {
  const a = w.assignment;
  const s = w.submission;
  const left = s ? renderWorkOrAssignmentPreview(s, a) : renderStudentAssignmentPreview(w);
  const previewId = `studentPreview_${a.AssignmentID}`;
  return `<article class="layout-card">
    <div class="slot-note">${s ? '(งานที่นักเรียนส่ง)' : '(มุมมองนักเรียน)'}</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อน${s ? 'งานนักเรียน' : 'ใบงานหรือคำสั่ง'}" onclick="togglePreviewBox('${previewId}')">👁</button>
    </div>
    <div class="work-preview" id="${previewId}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div><b>นักเรียน:</b> ${escapeHtml(previewUser?.Name || '')} / ${escapeHtml(previewUser?.ClassName || '')}</div>
      <div>คะแนนเต็ม ${escapeHtml(a.FullScore || '-')} | สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} | รูปแบบคำสั่ง: ${escapeHtml(assignmentInstructionType(a))} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || '')}</span> <span class="status-pill">คะแนน ${escapeHtml(s.Score || '-')}</span>` : ''}</div>
      ${s ? '<div class="submitted-summary"><b>งานที่ส่งแล้วจะแสดงอยู่ฝั่งซ้าย</b></div>' : ''}
      <label>คำตอบ/หมายเหตุ <textarea disabled>${escapeHtml(s?.WorkText || '')}</textarea></label>
      <div class="detail-actions">
        <button disabled>โหมดดูตัวอย่าง</button>
        <button onclick="showAssignmentInfo('${a.AssignmentID}')">ดูคำสั่งงาน</button>
        ${materialOpenButton(a)}
      </div>
      ${s?.ReturnStatus === 'ส่งคืน' ? `<div><b>ครูส่งคืน:</b> ${escapeHtml(s.ReturnNote || '')}</div>` : ''}
    </div>
  </article>`;
}

function renderScoreTablePage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedClass=''; state.scoreTable=null; renderScoreTablePage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedClass=this.value; state.scoreTable=null; renderScoreTablePage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <button onclick="loadScoreTable()">โหลดตาราง</button>
    <button onclick="loadScoreTable()">รีเฟรช</button>
    <button onclick="exportScoreImage()">บันทึกตารางเป็นรูปภาพ</button>
    <div class="score-tools">
      <span id="scoreSelectedCount">เลือกแล้ว 0 ช่อง</span>
      <button onclick="clearScoreCellSelection()">ยกเลิกการเลือก</button>
      <button onclick="batchScoreMarkChecked()">ตรวจแล้ว</button>
      <button onclick="batchScoreFullScore()">ให้คะแนนเต็ม</button>
      <input id="scoreBulkValue" class="score-bulk-input" placeholder="คะแนน">
      <button onclick="batchScoreCustomScore()">ให้คะแนน</button>
    </div>
  `;
  syncToolbarHeight();
  $('content').innerHTML = state.scoreTable ? scoreTableHtml(state.scoreTable) : '<div class="hero-empty">เลือกระดับชั้น/ห้อง แล้วกดโหลดตาราง</div>';
  updateScoreSelectedCount();
}
async function loadScoreTable() {
  if (!state.selectedLevel || !state.selectedClass) return showToast('กรุณาเลือกระดับชั้นและห้อง');
  try {
    setLoading('กำลังโหลดตารางคะแนน...');
    const data = await apiGet({ action: 'scoreTable', level: state.selectedLevel, className: state.selectedClass });
    state.scoreTable = data;
    $('content').innerHTML = scoreTableHtml(data);
    updateScoreSelectedCount();
  } catch (err) { showToast(err.message); }
}
function firstNameOnly(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
function shortTopic(topic, max=24) {
  const text = String(topic || '').trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}
function assignmentWorkNumber(a, index) {
  const raw = String(a?.SortOrder || '').trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return raw;
  return String(index + 1);
}
function scoreCellDisplay(c) {
  const score = String(c?.score ?? '').trim();
  if (score) return escapeHtml(score);
  const status = String(c?.checkedStatus || '').trim();
  if (status === 'ตรวจแล้ว') return 'ตรวจแล้ว';
  if (status === 'ยังไม่ส่ง') return '<span class="score-empty">ยังไม่ส่ง</span>';
  return '';
}
function scoreTableHtml(data) {
  const assignments = data.assignments || [];
  const rows = data.rows || [];
  const head = assignments.map((a, idx) => {
    const workNo = assignmentWorkNumber(a, idx);
    return `<th class="score-assignment-head">
      <label class="score-check-label"><input type="checkbox" class="score-col-check" data-assignment-id="${escapeHtml(a.AssignmentID)}" onchange="toggleScoreColumn('${escapeHtml(a.AssignmentID)}', this.checked)"></label>
      <div class="score-head-title">${escapeHtml(shortTopic(a.Topic || workNo))}</div>
    </th>`;
  }).join('');
  const body = rows.map(r => {
    const u = r.user || {};
    const name = firstNameOnly(u.Name);
    const cells = (r.cells || []).map(c => {
      const hasSubmission = !!c.submissionId;
      return `<td class="score-cell ${hasSubmission ? '' : 'score-cell-disabled'}" data-assignment-id="${escapeHtml(c.assignmentId || '')}" data-submission-id="${escapeHtml(c.submissionId || '')}">
        <div class="score-cell-inner">
          <label class="score-check-label"><input type="checkbox" class="score-cell-check" ${hasSubmission ? '' : 'disabled'} data-submission-id="${escapeHtml(c.submissionId || '')}" data-assignment-id="${escapeHtml(c.assignmentId || '')}" onchange="updateScoreSelectedCount()"></label>
          <div class="score-value-box">${scoreCellDisplay(c)}</div>
        </div>
      </td>`;
    }).join('');
    return `<tr>
      <td class="score-student-name">
        <div>เลขที่ ${escapeHtml(u.No || '-')} ${escapeHtml(u.UserID || '')}</div>
        <div>${escapeHtml(name || '-')}</div>
      </td>
      ${cells}
    </tr>`;
  }).join('');
  return `<div class="score-wrap"><table class="score-table"><thead><tr><th class="score-name-head">รายชื่อ</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function getSelectedScoreCells() {
  const map = new Map();
  document.querySelectorAll('.score-cell-check:checked').forEach(cb => {
    const submissionId = cb.dataset.submissionId || '';
    if (!submissionId) return;
    map.set(submissionId, { submissionId, assignmentId: cb.dataset.assignmentId || '' });
  });
  return Array.from(map.values());
}
function updateScoreSelectedCount() {
  const el = $('scoreSelectedCount');
  if (el) el.textContent = `เลือกแล้ว ${getSelectedScoreCells().length} ช่อง`;
}
function clearScoreCellSelection() {
  document.querySelectorAll('.score-cell-check,.score-col-check').forEach(cb => cb.checked = false);
  updateScoreSelectedCount();
}
function toggleScoreColumn(assignmentId, checked) {
  document.querySelectorAll(`.score-cell-check[data-assignment-id="${CSS.escape(String(assignmentId))}"]`).forEach(cb => {
    if (!cb.disabled) cb.checked = checked;
  });
  updateScoreSelectedCount();
}
function getScoreAssignment(assignmentId) {
  return (state.scoreTable?.assignments || []).find(a => String(a.AssignmentID) === String(assignmentId)) || getAssignment(assignmentId) || {};
}

function individualScoreForStudent(submission, studentId) {
  const individual = parsedIndividualScores(submission)[String(studentId || '')];
  if (individual && String(individual.finalScore ?? '').trim() !== '') return individual.finalScore;
  return submission?.Score ?? '';
}

function applySavedSubmissionToScoreTable(submission) {
  if (!submission?.SubmissionID || !state.scoreTable) return;
  const id = String(submission.SubmissionID);
  (state.scoreTable.rows || []).forEach(row => {
    (row.cells || []).forEach(cell => {
      if (String(cell.submissionId || '') !== id) return;
      cell.score = individualScoreForStudent(submission, row.user?.UserID);
      cell.checkedStatus = submission.CheckedStatus || (String(cell.score).trim() ? 'ตรวจแล้ว' : 'ยังไม่ตรวจ');
    });
  });
  document.querySelectorAll(`.score-cell[data-submission-id="${CSS.escape(id)}"]`).forEach(cellEl => {
    const rowEl = cellEl.closest('tr');
    const studentId = rowEl ? String((state.scoreTable.rows || [])[rowEl.rowIndex - 1]?.user?.UserID || '') : '';
    const score = individualScoreForStudent(submission, studentId);
    const box = cellEl.querySelector('.score-value-box');
    if (box) box.innerHTML = scoreCellDisplay({ score, checkedStatus: submission.CheckedStatus });
    const checkbox = cellEl.querySelector('.score-cell-check');
    if (checkbox) checkbox.checked = false;
  });
}

async function batchUpdateScoreCells(makePayload, successMessage) {
  const selected = getSelectedScoreCells();
  if (!selected.length) return showToast('กรุณาเลือกช่องคะแนนก่อน');
  const buttons = Array.from(document.querySelectorAll('.score-tools button'));
  try {
    buttons.forEach(button => button.disabled = true);
    showToast(`กำลังบันทึก ${selected.length} ช่อง...`);
    const updates = selected.map(item => makePayload(item));
    const data = await apiPost({ action: 'batchUpdateSubmissions', userId: state.user.UserID, updates });
    const succeeded = (data.results || []).filter(result => result.ok && result.submission);
    const failed = (data.results || []).filter(result => !result.ok);
    succeeded.forEach(result => applySavedSubmissionToScoreTable(result.submission));
    showToast(data.warning || (failed.length
      ? `บันทึกสำเร็จ ${succeeded.length} งาน, ไม่สำเร็จ ${failed.length} งาน${batchFailureDetail(failed)} — รายการที่ไม่สำเร็จยังถูกเลือกอยู่`
      : `${successMessage || 'บันทึกคะแนนแล้ว'} (${succeeded.length} งาน)`));
    document.querySelectorAll('.score-col-check').forEach(cb => cb.checked = false);
    updateScoreSelectedCount();
    buttons.forEach(button => button.disabled = false);
  } catch (err) {
    showToast('บันทึกไม่สำเร็จ: ' + err.message);
    buttons.forEach(button => button.disabled = false);
  }
}
function batchScoreMarkChecked() {
  batchUpdateScoreCells(item => ({ action: 'updateSubmission', submissionId: item.submissionId, userId: state.user.UserID, CheckedStatus: 'ตรวจแล้ว' }), 'เปลี่ยนสถานะเป็นตรวจแล้ว');
}
function batchScoreFullScore() {
  batchUpdateScoreCells(item => {
    const a = getScoreAssignment(item.assignmentId);
    return { action: 'updateSubmission', submissionId: item.submissionId, assignmentId: item.assignmentId, userId: state.user.UserID, Score: a.FullScore ?? '', CheckedStatus: 'ตรวจแล้ว', requireScore: true };
  }, 'ให้คะแนนเต็มกับช่องที่เลือกแล้ว');
}
function batchScoreCustomScore() {
  const score = $('scoreBulkValue')?.value ?? '';
  if (!String(score).trim()) return showToast('กรุณาใส่คะแนนก่อน');
  batchUpdateScoreCells(item => ({ action: 'updateSubmission', submissionId: item.submissionId, userId: state.user.UserID, Score: score, CheckedStatus: 'ตรวจแล้ว' }), 'ให้คะแนนกับช่องที่เลือกแล้ว');
}
function scoreImageCellText(cell) {
  const score = String(cell?.score ?? '').trim();
  if (score) return score;
  const status = String(cell?.checkedStatus || '').trim();
  if (status === 'ตรวจแล้ว') return 'ตรวจแล้ว';
  if (status === 'ยังไม่ส่ง') return 'ยังไม่ส่ง';
  return 'ส่งแล้ว';
}

function canvasWrappedLines(ctx, text, maxWidth, maxLines=4) {
  const source = String(text || '-').trim() || '-';
  const chars = Array.from(source);
  const lines = [];
  let line = '';
  chars.forEach(char => {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else line = next;
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const shortened = lines.slice(0, maxLines);
    let last = shortened[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    shortened[maxLines - 1] = (last || '') + '…';
    return shortened;
  }
  return lines;
}

function drawCenteredCanvasText(ctx, text, x, y, width, height, options={}) {
  const fontSize = options.fontSize || 20;
  const lineHeight = options.lineHeight || Math.round(fontSize * 1.35);
  ctx.save();
  ctx.fillStyle = options.color || '#111827';
  ctx.font = `${options.bold ? '700' : '400'} ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = canvasWrappedLines(ctx, text, Math.max(20, width - 20), options.maxLines || 4);
  const total = lines.length * lineHeight;
  lines.forEach((line, index) => ctx.fillText(line, x + width / 2, y + (height - total) / 2 + lineHeight * index + lineHeight / 2));
  ctx.restore();
}

async function exportScoreImage() {
  const data = state.scoreTable;
  if (!data?.rows?.length || !data?.assignments?.length) return showToast('กรุณาโหลดตารางคะแนนก่อนบันทึกเป็นรูปภาพ');
  try {
    showToast('กำลังสร้างรูปตารางคะแนนเต็ม กรุณารอสักครู่...', { persistent: true, loading: true });
    if (document.fonts?.ready) await document.fonts.ready;
    const assignments = data.assignments || [];
    const rows = data.rows || [];
    const margin = 28;
    const titleHeight = 94;
    const headerHeight = 126;
    const rowHeight = 70;
    const nameWidth = 320;
    const workWidth = 190;
    const footerHeight = 38;
    const logicalWidth = margin * 2 + nameWidth + workWidth * assignments.length;
    const logicalHeight = margin * 2 + titleHeight + headerHeight + rowHeight * rows.length + footerHeight;
    const maxSide = 16000;
    const maxPixels = 64000000;
    const scale = Math.max(.5, Math.min(2, maxSide / logicalWidth, maxSide / logicalHeight, Math.sqrt(maxPixels / (logicalWidth * logicalHeight))));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(logicalWidth * scale));
    canvas.height = Math.max(1, Math.floor(logicalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('อุปกรณ์นี้ไม่สามารถสร้างรูปภาพได้');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#22c55e';
    const xStart = margin;
    const tableTop = margin + titleHeight;
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`ตารางคะแนน ${state.selectedLevel || ''} ห้อง ${state.selectedClass || ''}`, margin, margin);
    ctx.font = '400 16px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`นักเรียน ${rows.length} คน | งาน ${assignments.length} งาน`, margin, margin + 44);

    const drawCell = (x, y, width, height, fill, stroke='#cbd5e1') => {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
    };
    drawCell(xStart, tableTop, nameWidth, headerHeight, accent, '#ffffff');
    drawCenteredCanvasText(ctx, 'รายชื่อ', xStart, tableTop, nameWidth, headerHeight, { color:'#ffffff', bold:true, fontSize:22, maxLines:2 });
    assignments.forEach((assignment, index) => {
      const x = xStart + nameWidth + index * workWidth;
      drawCell(x, tableTop, workWidth, headerHeight, accent, '#ffffff');
      drawCenteredCanvasText(ctx, assignment.Topic || assignmentWorkNumber(assignment, index), x, tableTop, workWidth, headerHeight, { color:'#ffffff', bold:true, fontSize:17, maxLines:5, lineHeight:22 });
    });
    rows.forEach((row, rowIndex) => {
      const y = tableTop + headerHeight + rowIndex * rowHeight;
      const user = row.user || {};
      drawCell(xStart, y, nameWidth, rowHeight, rowIndex % 2 ? '#e2e8f0' : '#f1f5f9');
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(`เลขที่ ${user.No || '-'}  ${user.Name || '-'}`, xStart + 14, y + 25);
      ctx.font = '400 14px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(`รหัส ${user.UserID || '-'}`, xStart + 14, y + 50);
      ctx.restore();
      assignments.forEach((assignment, colIndex) => {
        const x = xStart + nameWidth + colIndex * workWidth;
        const value = scoreImageCellText((row.cells || [])[colIndex]);
        const fill = value === 'ยังไม่ส่ง' ? '#fee2e2' : (rowIndex % 2 ? '#f8fafc' : '#ffffff');
        drawCell(x, y, workWidth, rowHeight, fill);
        drawCenteredCanvasText(ctx, value, x, y, workWidth, rowHeight, { bold: value !== 'ยังไม่ส่ง', fontSize:18, maxLines:2 });
      });
    });
    ctx.fillStyle = '#64748b';
    ctx.font = '400 14px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`สร้างจาก Class Flow V.2 • ${new Date().toLocaleString('th-TH')}`, logicalWidth - margin, logicalHeight - 10);

    const filenamePart = value => String(value || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'ไม่ระบุ';
    const filename = `ตารางคะแนน_${filenamePart(state.selectedLevel)}_${filenamePart(state.selectedClass)}.png`;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
    if (!blob) throw new Error('สร้างไฟล์ PNG ไม่สำเร็จ');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    showToast(`บันทึกรูปตารางคะแนนแล้ว (${rows.length} คน × ${assignments.length} งาน)`);
  } catch (err) {
    showToast('บันทึกรูปไม่สำเร็จ: ' + err.message);
  }
}

function renderThemeSettingsCard(user, studentMode=false) {
  return `<div class="system-card theme-system-card">
    <h3>${studentMode ? 'ตกแต่งหน้าของฉัน' : 'เปลี่ยนสีธีม'}</h3>
    <p>สีที่เลือกจะบันทึกเฉพาะบัญชีนี้ ไม่กระทบบัญชีอื่น</p>
    <div class="theme-form">
      <div class="theme-primary-row">
        <label>สีธีมหลัก<input id="themeAccent" type="color" value="${escapeHtml(normalizeHexColor(user.AccentColor || '#22C55E'))}"></label>
        <label>สีพื้นหลัง<input id="themeBg" type="color" value="${escapeHtml(normalizeHexColor(user.BackgroundColor || '#000000', '#000000'))}"></label>
        <button type="button" onclick="previewThemeFromForm()">แสดงตัวอย่างธีม</button>
      </div>
      <label>สีแถบเมนูและส่วนหัว (บริเวณที่วงสีชมพู)<input id="themeNavigation" type="color" value="${escapeHtml(normalizeHexColor(user.NavigationColor || '#001407', '#001407'))}"></label>
      <label>ลิงก์รูปพื้นหลัง<input id="themeBgImage" value="${escapeHtml(user.BackgroundImageURL || '')}" placeholder="https://..."></label>
      <div class="theme-swatch-list">${themeSwatch('#22C55E')}${themeSwatch('#38BDF8')}${themeSwatch('#A855F7')}${themeSwatch('#EC4899')}${themeSwatch('#F97316')}${themeSwatch('#FACC15')}${themeSwatch('#EF4444')}</div>
      <small>สีธีมใช้กับปุ่ม กรอบการ์ด และตารางคะแนน ส่วนสีแถบเมนูจะใช้กับแถบซ้ายและส่วนหัวด้านบน</small>
      <div class="theme-card-actions theme-reset-row"><button type="button" onclick="resetThemeForm()">กลับค่าเริ่มต้น</button><button type="button" onclick="saveThemeSettings()">${studentMode ? 'บันทึกสีของฉัน' : 'บันทึกธีมบัญชี'}</button></div>
    </div>
  </div>`;
}

function renderSettingsPage() {
  const user = state.user || {};
  $('pageToolbar').innerHTML = '';
  syncToolbarHeight();
  $('content').innerHTML = `
    <div class="settings-grid">
      ${renderThemeSettingsCard(user, false)}
      <div class="system-card system-card-wide">
        <h3>ดึงงานเก่าจากระบบเดิม</h3>
        <p>ใช้สำหรับนำข้อมูลงานที่นักเรียนเคยส่งในระบบเดิมมาเก็บรวมในชีต <b>Submissions</b> ของ V2</p>
        <div class="theme-form">
          <label>ลิงก์หรือ Spreadsheet ID ของชีตหลักระบบเก่า
            <input id="legacySheetUrl" placeholder="วางลิงก์ Google Sheet ระบบเก่า หรือ Spreadsheet ID">
          </label>
          <label style="display:flex;align-items:center;gap:8px;color:var(--text);">
            <input id="legacyCreateMissing" type="checkbox"> สร้างงานใน Main ให้อัตโนมัติ ถ้าไม่พบงานชื่อเดียวกันใน V2
          </label>
          <small>ระบบจะจับคู่จาก <b>Level + Topic</b> เป็นหลัก และจะข้ามรายการที่เคยดึงเข้ามาแล้ว</small>
          <div class="detail-actions">
            <button onclick="previewLegacyImport()">ตรวจสอบก่อนดึง</button>
            <button onclick="importLegacyWork()">ดึงงานเก่าเข้า V2</button>
          </div>
          <div id="legacyImportResult" class="student-preview-note">ยังไม่ได้ตรวจสอบไฟล์ระบบเก่า</div>
          <hr>
          <h3>ตรวจสอบและซิงก์ข้อมูลงานกลุ่ม</h3>
          <p>จับคู่งานส่งด้วย GroupID หรือชุด MemberIDs แล้วปรับชื่อกลุ่ม ชื่อสมาชิก และผู้ส่งให้ตรงกับระบบปัจจุบัน</p>
          <div class="detail-actions"><button onclick="previewGroupSync()">ตรวจสอบก่อนซิงก์</button><button onclick="applyGroupSync()">ยืนยันการซิงก์</button></div>
          <div id="groupSyncResult" class="student-preview-note">ยังไม่ได้ตรวจสอบข้อมูลงานกลุ่ม</div>
        </div>
      </div>
      <div class="system-card">
        <h3>ข้อมูลการอัปเดตระบบ</h3>
        <div class="update-meta">
          <div class="update-meta-row"><b>หน้าเว็บ GitHub</b><span>${escapeHtml(MATRIX_V2_WEB_UPDATED_AT)}</span></div>
          <div class="update-meta-row"><b>เวอร์ชันหน้าเว็บ</b><span>${escapeHtml(MATRIX_V2_WEB_VERSION)}</span></div>
          <div class="update-meta-row"><b>Apps Script</b><span>${escapeHtml(state.bootstrap?.backendUpdatedAt || 'ยังไม่ได้ Deploy ชุดรองรับเวอร์ชัน')}</span></div>
          <div class="update-meta-row"><b>เวอร์ชัน Backend</b><span>${escapeHtml(state.bootstrap?.backendVersion || '-')}</span></div>
          <div class="update-meta-row"><b>สถานะเวอร์ชัน</b><span class="status-pill">${state.bootstrap?.backendVersion === MATRIX_V2_WEB_VERSION ? 'ตรงกัน' : 'ควรตรวจสอบ/รีเฟรช'}</span></div>
        </div>
      </div>
    </div>`;
}

function renderDuplicateManagerPage() {
  $('pageToolbar').innerHTML = `<button onclick="loadDuplicateSubmissions()">ตรวจหางานซ้ำ</button><button onclick="loadDuplicateSubmissions()">รีเฟรช</button><button onclick="repairDuplicateSubmissionIds()">ซ่อมรหัสงานที่ซ้ำ</button>`;
  syncToolbarHeight();
  loadDuplicateSubmissions();
}

async function loadDuplicateSubmissions() {
  try {
    setLoading('กำลังตรวจหางานซ้ำ...');
    const data = await apiGet({ action: 'duplicateSubmissions' });
    const groups = data.duplicateGroups || [];
    state.duplicateGroups = groups;
    state.selectedDuplicateRows.clear();
    $('content').innerHTML = groups.length
      ? `<div class="duplicate-bulk-toolbar">
          <strong id="duplicateSelectedCount">เลือกแล้ว 0 รายการ</strong>
          <span>ซ้ำสมบูรณ์ ${escapeHtml(data.exactGroups || 0)} ชุด / ลบได้ ${escapeHtml(data.exactExtraRows || 0)} แถว</span>
          <button onclick="selectAllExactDuplicateExtras()">เลือกแถวซ้ำสมบูรณ์</button>
          <button onclick="selectAllDuplicateExtras()">เลือกงานซ้ำทั้งหมด</button>
          <button onclick="clearDuplicateSelection()">ยกเลิกการเลือก</button>
          <button class="danger" onclick="deleteSelectedDuplicates()">ลบรายการที่เลือก</button>
        </div><div class="duplicate-list">${groups.map(renderDuplicateGroup).join('')}</div>`
      : '<div class="hero-empty">ไม่พบงานนักเรียนที่ซ้ำกันในระบบ</div>';
  } catch (err) { showToast(err.message); }
}

function renderDuplicateGroup(group) {
  const isExact = group.duplicateType === 'exact';
  const exactKeepRows = new Set((state.duplicateGroups || [])
    .filter(item => item.duplicateType === 'exact')
    .map(item => Number(item.recommendedKeepRow)));
  const assignment = group.submissions?.[0]?.assignment || {};
  const worksheet = hasWorksheetFile(assignment)
    ? drivePreview(assignment.WorksheetURL, 'ใบงาน')
    : renderInstructionText(assignment, 'ยังไม่มีใบงานหรือคำสั่งงาน');
  const entries = (group.submissions || []).map((submission, index) => {
    const files = getSubmissionFileUrls(submission);
    const isKeep = isExact && Number(submission.SourceRow) === Number(group.recommendedKeepRow);
    const protectedKeep = exactKeepRows.has(Number(submission.SourceRow));
    return `<div class="duplicate-entry">
      <label class="duplicate-select"><input type="checkbox" class="duplicate-row-check" data-source-row="${Number(submission.SourceRow || 0)}" ${protectedKeep ? 'disabled' : ''} onchange="toggleDuplicateSelection(${Number(submission.SourceRow || 0)}, this.checked)"> ${protectedKeep ? (isKeep ? 'เก็บไว้' : 'แถวหลักชุดซ้ำ') : 'เลือก'}</label>
      <div class="duplicate-entry-info">
        <b>${isExact ? (isKeep ? 'แถวหลัก' : 'สำเนาซ้ำสมบูรณ์') : (index === 0 ? 'รายการล่าสุด' : 'รายการซ้ำ')} — ${escapeHtml(submission.SubmissionID)}</b>
        <span>แถวที่ ${escapeHtml(submission.SourceRow || '-')}</span>
        <span>วันที่ส่ง: ${escapeHtml(submission.Timestamp || '-')} | สถานะ: ${escapeHtml(submission.CheckedStatus || 'ยังไม่ตรวจ')} | คะแนน: ${escapeHtml(submission.Score || '-')}</span>
        <span>ผู้ส่ง: ${escapeHtml(submission.StudentName || '-')} ${submission.GroupName ? `| กลุ่ม: ${escapeHtml(submission.GroupName)}` : ''}</span>
        ${files.length ? `<div class="duplicate-submitted-previews">${renderSubmittedFilePreview(files, getSubmissionTextWithoutOnlyLinks(submission), { submissionId: submission.SubmissionID, sourceRow: submission.SourceRow, allowDelete: true })}</div>` : ''}
      </div>
      <div class="duplicate-entry-actions">
        ${files[0] ? `<button onclick="window.open('${escapeHtml(files[0])}','_blank')">เปิดงาน</button>` : ''}
        ${protectedKeep ? '<button class="danger" disabled title="ต้องเก็บแถวหลักของชุดซ้ำสมบูรณ์ไว้">ห้ามลบแถวหลัก</button>' : `<button class="danger" onclick="deleteDuplicateSubmission('${escapeHtml(submission.SubmissionID)}', ${Number(submission.SourceRow || 0)})">ลบรายการนี้</button>`}
      </div>
    </div>`;
  }).join('');
  return `<section class="duplicate-group">
    <h3>${isExact ? '✅ ซ้ำเหมือนกันทุกช่อง — ' : '⚠️ งานซ้ำแต่ข้อมูลอาจต่างกัน — '}${escapeHtml(group.topic || group.assignmentId)}</h3>
    <div>${escapeHtml(group.level || '')} / ${escapeHtml(group.className || '')} — ${escapeHtml(group.owner || '')} — พบ ${escapeHtml(group.count || 0)} รายการ</div>
    <div class="student-preview-note">${isExact
      ? 'ระบบตรวจแล้วว่าค่าทุกคอลัมน์ใน Submissions เหมือนกัน โดยกำหนดแถวแรกเป็นแถวหลักและไม่ให้เลือกแถวนั้น ไฟล์จริงใน Drive จะไม่ถูกลบ'
      : 'ข้อมูลบางช่องแตกต่างกัน กรุณาตรวจสอบวันที่ ไฟล์ คะแนน และสถานะก่อนเลือกลบ ระบบจะไม่ตัดสินใจแทนครู'}</div>
    <div class="duplicate-group-body">
      <div class="duplicate-worksheet">
        <h4>ใบงาน/คำสั่งงานต้นฉบับ</h4>
        <div class="work-preview">${worksheet}</div>
      </div>
      <div class="duplicate-entries">${entries}</div>
    </div>
  </section>`;
}

function duplicateEntryByRow(sourceRow) {
  for (const group of state.duplicateGroups || []) {
    const submission = (group.submissions || []).find(item => Number(item.SourceRow) === Number(sourceRow));
    if (submission) return { group, submission };
  }
  return null;
}

function updateDuplicateSelectedCount() {
  const el = $('duplicateSelectedCount');
  if (el) el.textContent = `เลือกแล้ว ${state.selectedDuplicateRows.size} รายการ`;
}

function toggleDuplicateSelection(sourceRow, checked) {
  const found = duplicateEntryByRow(sourceRow);
  if (!found) return;
  const groupRows = (found.group.submissions || []).map(item => Number(item.SourceRow));
  const alreadySelected = groupRows.filter(row => state.selectedDuplicateRows.has(row)).length;
  if (checked && alreadySelected >= groupRows.length - 1) {
    document.querySelectorAll(`.duplicate-row-check[data-source-row="${Number(sourceRow)}"]`).forEach(checkbox => { checkbox.checked = false; });
    showToast('ต้องเหลืองานไว้อย่างน้อย 1 รายการในชุดนี้');
    return;
  }
  if (checked) state.selectedDuplicateRows.add(Number(sourceRow));
  else state.selectedDuplicateRows.delete(Number(sourceRow));
  updateDuplicateSelectedCount();
}

function selectAllDuplicateExtras() {
  state.selectedDuplicateRows.clear();
  const exactKeepRows = new Set((state.duplicateGroups || [])
    .filter(group => group.duplicateType === 'exact')
    .map(group => Number(group.recommendedKeepRow)));
  (state.duplicateGroups || []).forEach(group => {
    // รายการแรกเป็นรายการล่าสุด จึงเลือกเฉพาะรายการลำดับถัดไป
    (group.submissions || []).slice(1).forEach(item => {
      const row = Number(item.SourceRow);
      if (!exactKeepRows.has(row)) state.selectedDuplicateRows.add(row);
    });
  });
  document.querySelectorAll('.duplicate-row-check').forEach(box => {
    const row = Number(box.dataset.sourceRow || 0);
    box.checked = state.selectedDuplicateRows.has(row);
  });
  updateDuplicateSelectedCount();
}

function selectAllExactDuplicateExtras() {
  state.selectedDuplicateRows.clear();
  (state.duplicateGroups || []).filter(group => group.duplicateType === 'exact').forEach(group => {
    (group.submissions || []).forEach(item => {
      if (Number(item.SourceRow) !== Number(group.recommendedKeepRow)) {
        state.selectedDuplicateRows.add(Number(item.SourceRow));
      }
    });
  });
  document.querySelectorAll('.duplicate-row-check').forEach(box => {
    const row = Number(box.dataset.sourceRow || 0);
    box.checked = state.selectedDuplicateRows.has(row);
  });
  updateDuplicateSelectedCount();
  showToast(state.selectedDuplicateRows.size
    ? `เลือกแถวซ้ำสมบูรณ์แล้ว ${state.selectedDuplicateRows.size} แถว ตรวจสอบแล้วกดลบรายการที่เลือก`
    : 'ไม่พบแถวซ้ำสมบูรณ์');
}

function clearDuplicateSelection() {
  state.selectedDuplicateRows.clear();
  document.querySelectorAll('.duplicate-row-check').forEach(box => { box.checked = false; });
  updateDuplicateSelectedCount();
}

async function deleteSelectedDuplicates() {
  const rows = Array.from(state.selectedDuplicateRows);
  if (!rows.length) return showToast('กรุณาเลือกรายการที่ต้องการลบก่อน');
  const items = rows.map(sourceRow => {
    const found = duplicateEntryByRow(sourceRow);
    return found ? { submissionId: found.submission.SubmissionID, sourceRow } : null;
  }).filter(Boolean);
  if (items.length !== rows.length) return showToast('ข้อมูลรายการเปลี่ยนไปแล้ว กรุณารีเฟรชก่อน');
  if (!confirm(`ยืนยันลบงานซ้ำที่เลือก ${items.length} รายการหรือไม่\n\nระบบจะเก็บไฟล์แนบใน Google Drive ไว้`)) return;
  try {
    showToast(`กำลังลบ ${items.length} รายการ...`);
    const data = await apiPost({ action: 'deleteSubmissionsBatch', userId: state.user.UserID, items });
    if (Number(data.deleted) !== items.length) throw new Error('จำนวนรายการที่ลบไม่ตรงกับรายการที่เลือก');
    showToast(`ลบงานซ้ำแล้ว ${data.deleted} รายการ`);
    await loadDuplicateSubmissions();
  } catch (err) {
    showToast(err.message);
    await loadDuplicateSubmissions();
  }
}

async function deleteDuplicateSubmission(submissionId, sourceRow) {
  if (!confirm(`ยืนยันลบงานซ้ำรายการ ${submissionId} หรือไม่\n\nควรเปิดตรวจไฟล์และคะแนนก่อนลบ`)) return;
  try {
    showToast('กำลังลบรายการที่เลือก...');
    const data = await apiPost({ action: 'deleteSubmission', submissionId, sourceRow, userId: state.user.UserID });
    if (!data.deleted || String(data.submissionId) !== String(submissionId) || Number(data.sourceRow) !== Number(sourceRow)) throw new Error('ระบบยังไม่สามารถยืนยันการลบรายการนี้ได้');
    showToast('ลบรายการแล้ว และปรับตารางคะแนนใหม่แล้ว');
    await loadDuplicateSubmissions();
  } catch (err) { showToast(err.message); }
}

async function repairDuplicateSubmissionIds() {
  if (!confirm('ซ่อม SubmissionID ที่ซ้ำกันหรือไม่\n\nระบบจะเก็บรายการแรกไว้ และสร้างรหัสใหม่ให้รายการถัดไป โดยไม่ลบงานหรือไฟล์แนบ')) return;
  try {
    showToast('กำลังซ่อมรหัสงานที่ซ้ำ...');
    const data = await apiPost({ action: 'repairDuplicateSubmissionIds', userId: state.user.UserID });
    showToast(data.repaired ? `ซ่อมรหัสงานซ้ำแล้ว ${data.repaired} รายการ` : 'ไม่พบ SubmissionID ที่ต้องซ่อม');
    await loadDuplicateSubmissions();
  } catch (err) { showToast(err.message); }
}

function renderStudentThemePage() {
  const user = state.user || {};
  $('pageToolbar').innerHTML = '';
  syncToolbarHeight();
  $('content').innerHTML = `<div class="settings-grid">${renderThemeSettingsCard(user, true)}</div>`;
}

function renderGroupSyncResult(data) {
  const box = $('groupSyncResult');
  if (!box) return;
  const changes = data.changes || [];
  const issues = data.issues || [];
  box.innerHTML = `<div><b>รายการที่ตรวจทั้งหมด:</b> ${escapeHtml(data.total || 0)}</div>
    <div><b>งานกลุ่ม:</b> ${escapeHtml(data.groupTotal || 0)} | <b>งานเก่าที่นำเข้า:</b> ${escapeHtml(data.legacyTotal || 0)}</div>
    <div><b>จับคู่กลุ่มได้:</b> ${escapeHtml(data.matched || 0)}</div>
    <div><b>รายการที่จะปรับ/ปรับแล้ว:</b> ${escapeHtml(data.changed || 0)}</div>
    <div><b>จับคู่ไม่ได้:</b> ${escapeHtml(data.unmatched || 0)}</div>
    ${changes.length ? `<div class="sync-list"><b>ตัวอย่างรายการเปลี่ยนแปลง</b>${changes.slice(0,20).map(x => `<div>${escapeHtml(x.submissionId)}: ${escapeHtml(x.oldGroupName || '-')} → ${escapeHtml(x.newGroupName || '-')} (${escapeHtml(x.fields)})</div>`).join('')}</div>` : ''}
    ${issues.length ? `<div class="issue"><b>รายการที่ต้องตรวจเอง</b>${issues.slice(0,20).map(x => `<div>${escapeHtml(x.submissionId)}: ${escapeHtml(x.detail)}</div>`).join('')}</div>` : ''}`;
}

async function previewGroupSync() {
  try {
    $('groupSyncResult').textContent = 'กำลังตรวจสอบโดยยังไม่แก้ข้อมูล...';
    const data = await apiGet({ action: 'groupSyncPreview' });
    renderGroupSyncResult(data);
    showToast('ตรวจสอบข้อมูลงานกลุ่มแล้ว');
  } catch (err) { showToast(err.message); }
}

async function applyGroupSync() {
  if (!confirm('ยืนยันซิงก์ชื่อกลุ่ม สมาชิก และข้อมูลผู้ส่งตามรายการที่ตรวจสอบหรือไม่')) return;
  try {
    $('groupSyncResult').textContent = 'กำลังซิงก์ข้อมูลงานกลุ่ม...';
    const data = await apiPost({ action: 'applyGroupSync', userId: state.user.UserID });
    renderGroupSyncResult(data);
    await refreshBootstrap(false);
    showToast('ซิงก์ข้อมูลงานกลุ่มแล้ว');
  } catch (err) { showToast(err.message); }
}

function themeSwatch(color) {
  return `<button class="theme-swatch" style="background:${color}" title="${color}" onclick="setThemeAccent('${color}')"></button>`;
}
function setThemeAccent(color) {
  const el = $('themeAccent');
  if (el) el.value = normalizeHexColor(color);
  previewThemeFromForm();
}
function getThemeFromForm() {
  return {
    AccentColor: normalizeHexColor($('themeAccent')?.value || state.user?.AccentColor || '#22C55E'),
    BackgroundColor: normalizeHexColor($('themeBg')?.value || state.user?.BackgroundColor || '#000000', '#000000'),
    BackgroundImageURL: $('themeBgImage')?.value?.trim() || '',
    NavigationColor: normalizeHexColor($('themeNavigation')?.value || state.user?.NavigationColor || '#001407', '#001407'),
    ThemeColor: normalizeHexColor($('themeAccent')?.value || state.user?.AccentColor || '#22C55E')
  };
}
function previewThemeFromForm() {
  const theme = getThemeFromForm();
  applyTheme({ ...(state.user || {}), ...theme });
  showToast('แสดงตัวอย่างธีมแล้ว');
}
function resetThemeForm() {
  if ($('themeAccent')) $('themeAccent').value = '#22C55E';
  if ($('themeBg')) $('themeBg').value = '#000000';
  if ($('themeBgImage')) $('themeBgImage').value = '';
  if ($('themeNavigation')) $('themeNavigation').value = '#001407';
  previewThemeFromForm();
}
async function saveThemeSettings() {
  try {
    const theme = getThemeFromForm();
    const data = await apiPost({ action: 'updateUserTheme', userId: state.user.UserID, theme });
    state.user = data.user || { ...state.user, ...theme };
    applyTheme(state.user);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.user, bootstrap: state.bootstrap, savedAt: Date.now() }));
    showToast('บันทึกธีมของบัญชีแล้ว');
  } catch (err) { showToast(err.message); }
}


function getLegacyImportForm() {
  return {
    legacySpreadsheetUrl: $('legacySheetUrl')?.value?.trim() || '',
    createMissingAssignments: $('legacyCreateMissing')?.checked || false,
    userId: state.user?.UserID || ''
  };
}
function renderLegacyImportResult(data) {
  const box = $('legacyImportResult');
  if (!box) return;
  const skipped = data.skippedAssignments || [];
  const errors = data.errors || [];
  box.innerHTML = `
    <div><b>พบงานใน Main เดิม:</b> ${escapeHtml(data.legacyAssignments || 0)} งาน</div>
    <div><b>จับคู่กับ V2 ได้:</b> ${escapeHtml(data.matchedAssignments || 0)} งาน</div>
    <div><b>พบรายการงานส่ง:</b> ${escapeHtml(data.foundSubmissions || 0)} รายการ</div>
    <div><b>นำเข้าแล้ว:</b> ${escapeHtml(data.imported || 0)} รายการ</div>
    <div><b>ข้ามรายการซ้ำ:</b> ${escapeHtml(data.skippedDuplicates || 0)} รายการ</div>
    ${skipped.length ? `<div class="issue"><b>งานที่ยังไม่ถูกนำเข้า:</b><br>${skipped.slice(0, 12).map(x => escapeHtml(`${x.level || '-'} / ${x.topic || '-'}: ${x.reason || ''}`)).join('<br>')}${skipped.length > 12 ? '<br>...' : ''}</div>` : ''}
    ${errors.length ? `<div class="issue error"><b>ข้อผิดพลาด:</b><br>${errors.slice(0, 8).map(x => escapeHtml(x)).join('<br>')}${errors.length > 8 ? '<br>...' : ''}</div>` : ''}
  `;
}
async function previewLegacyImport() {
  try {
    const form = getLegacyImportForm();
    if (!form.legacySpreadsheetUrl) return showToast('กรุณาวางลิงก์หรือ Spreadsheet ID ของชีตระบบเก่า');
    $('legacyImportResult').textContent = 'กำลังตรวจสอบข้อมูลระบบเก่า...';
    const data = await apiGet({
      action: 'legacyImportPreview',
      legacySpreadsheetUrl: form.legacySpreadsheetUrl,
      createMissingAssignments: form.createMissingAssignments ? 'true' : ''
    });
    renderLegacyImportResult(data);
    showToast('ตรวจสอบข้อมูลเก่าแล้ว');
  } catch (err) { showToast(err.message); }
}
async function importLegacyWork() {
  try {
    const form = getLegacyImportForm();
    if (!form.legacySpreadsheetUrl) return showToast('กรุณาวางลิงก์หรือ Spreadsheet ID ของชีตระบบเก่า');
    if (!confirm('ดึงงานเก่าเข้า Submissions ของ V2 ใช่ไหม\nระบบจะข้ามรายการที่เคยดึงแล้ว')) return;
    $('legacyImportResult').textContent = 'กำลังดึงงานเก่าเข้า V2...';
    const data = await apiPost({ action: 'importLegacySubmissions', ...form });
    renderLegacyImportResult(data);
    await refreshBootstrap(false);
    showToast('ดึงงานเก่าเสร็จแล้ว');
  } catch (err) { showToast(err.message); }
}

async function runSystemCheck() {
  try {
    const data = await apiGet({ action: 'systemCheck' });
    const box = $('checkResult');
    box.innerHTML = data.issues.length ? data.issues.map(i => `<div class="issue ${i.type==='error'?'error':''}"><b>${escapeHtml(i.sheet)}</b>: ${escapeHtml(i.detail)}</div>`).join('') : 'ไม่พบปัญหาสำคัญ';
  } catch (err) { showToast(err.message); }
}

async function renderStudentPage(returnedOnly=false) {
  $('pageToolbar').innerHTML = `<button onclick="loadStudentWork(${returnedOnly})">รีเฟรชงาน</button><span style="color:white;">${escapeHtml(state.user.Name || '')} / ${escapeHtml(state.user.ClassName || '')}</span>`;
  syncToolbarHeight();
  await loadStudentWork(returnedOnly);
}
async function loadStudentWork(returnedOnly=false) {
  try {
    setLoading('กำลังโหลดงานของฉัน...');
    const data = await apiGet({ action: 'studentWork', userId: state.user.UserID });
    const list = (data.work || []).filter(w => !returnedOnly || w.submission?.ReturnStatus === 'ส่งคืน');
    state.studentWorkByAssignment = new Map(list.map(w => [String(w.assignment?.AssignmentID || ''), w]));
    $('content').innerHTML = `<div class="card-list">${list.map(renderStudentWorkCard).join('') || '<div class="hero-empty">ไม่พบงาน</div>'}</div>`;
  } catch (err) { showToast(err.message); }
}
function renderStudentWorkCard(w) {
  const a = w.assignment;
  const s = w.submission;
  const groupMissing = a.WorkType === 'งานกลุ่ม' && !w.group;
  const canSubmit = a.Status === 'เปิดใช้งาน' && !groupMissing;
  const previewId = `studentWorkPreview_${a.AssignmentID}`;
  const online = isOnlineWorksheet(a);
  return `<article class="layout-card">
    <div class="slot-note">${s ? '(งานที่ส่งแล้ว)' : '(ใบงาน)'}</div>
    <div class="card-icons">
      <button class="icon-btn" title="โหลด/ซ่อน${s ? 'งานที่ส่งแล้ว' : 'ใบงานหรือคำสั่ง'}" onclick="toggleStudentWorkPreview('${a.AssignmentID}')">👁</button>
    </div>
    <div class="work-preview" id="${previewId}" data-loaded="0"><button onclick="toggleStudentWorkPreview('${a.AssignmentID}')">กดเพื่อแสดง${s ? 'งานที่ส่งแล้ว' : 'ใบงานหรือคำสั่ง'}</button></div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div>สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} | รูปแบบคำสั่ง: ${escapeHtml(assignmentInstructionType(a))} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      ${groupMissing ? '<div class="group-warning"><b>ยังไม่ได้จัดกลุ่ม</b><br>กรุณาแจ้งครูก่อนกรอกหรือส่งงาน</div>' : ''}
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || 'ยังไม่ตรวจ')}</span>${s.ReturnStatus === 'ส่งคืน' ? ' <span class="status-pill">ส่งคืน</span>' : ''}` : ''}</div>
      ${a.WorkType === 'งานกลุ่ม' && w.group ? renderStudentParticipationControl(a, s) : ''}
      ${s ? '<div class="submitted-summary"><b>งานที่ส่งแล้วจะแสดงอยู่ฝั่งซ้าย</b></div>' : ''}
      ${online ? renderOnlineWorksheetForm(a, s, canSubmit) : `<label>คำตอบ/ข้อความส่งงาน <textarea id="workText_${a.AssignmentID}" ${canSubmit?'':'disabled'}>${escapeHtml(s?.WorkText || '')}</textarea></label><label>แนบไฟล์ <input id="file_${a.AssignmentID}" type="file" multiple ${canSubmit?'':'disabled'}></label>`}
      <div class="detail-actions">
        ${canSubmit ? `<button onclick="submitStudentWork('${a.AssignmentID}')">${s ? 'ส่งแก้ไข/ส่งใหม่' : 'ส่งงาน'}</button>` : `<button disabled>${groupMissing ? 'ยังไม่ได้จัดกลุ่ม' : 'งานปิดการใช้งาน'}</button>`}
        <button onclick="showAssignmentInfo('${a.AssignmentID}')">ดูคำสั่งงาน</button>
        ${materialOpenButton(a)}
      </div>
      ${s?.ReturnStatus === 'ส่งคืน' ? `<div><b>ครูส่งคืน:</b> ${escapeHtml(s.ReturnNote || '')}</div>` : ''}
    </div>
  </article>`;
}

function renderStudentParticipationControl(assignment, submission) {
  const value = submission?.StudentParticipation || 'ปานกลาง';
  return `<div class="student-participation-box">
    <label><b>การมีส่วนร่วมของฉันในงานกลุ่ม</b>
      <select id="participation_${escapeHtml(assignment.AssignmentID)}">
        ${['มาก','ปานกลาง','น้อย'].map(item => `<option value="${item}" ${item===value?'selected':''}>${item}</option>`).join('')}
      </select>
    </label>
    ${submission?.SubmissionID ? `<button type="button" onclick="saveStudentGroupParticipation('${escapeHtml(submission.SubmissionID)}','${escapeHtml(assignment.AssignmentID)}')">บันทึกการมีส่วนร่วม</button>` : '<small>ข้อมูลนี้จะบันทึกพร้อมการส่งงาน</small>'}
  </div>`;
}

async function saveStudentGroupParticipation(submissionId, assignmentId) {
  const participation = $(`participation_${assignmentId}`)?.value || 'ปานกลาง';
  try {
    showToast('กำลังบันทึกการมีส่วนร่วม...', { persistent: true, loading: true });
    await apiPost({ action: 'saveStudentGroupParticipation', submissionId, userId: state.user.UserID, participation });
    showToast('บันทึกการมีส่วนร่วมแล้ว');
  } catch (err) { showToast(err.message); }
}

function renderOnlineWorksheetForm(a, submission, enabled) {
  const schema = parseWorksheetSchema(a);
  const answers = parseWorksheetAnswers(submission);
  if (!schema.questions.length) return '<div class="group-warning">ใบงานนี้ยังไม่มีช่องคำตอบ กรุณาแจ้งครู</div>';
  return `<div class="online-worksheet-form" data-assignment-id="${escapeHtml(a.AssignmentID)}">${schema.questions.map((q, index) => {
    const value = answers[q.id];
    const disabled = enabled ? '' : 'disabled';
    const required = q.required ? '<span class="required-mark">*</span>' : '';
    let input = '';
    if (q.type === 'long') input = `<textarea data-question-id="${escapeHtml(q.id)}" ${disabled}>${escapeHtml(value || '')}</textarea>`;
    else if (q.type === 'radio') input = `<div class="answer-options">${(q.options || []).map(opt => `<label><input type="radio" name="answer_${escapeHtml(a.AssignmentID)}_${escapeHtml(q.id)}" data-question-id="${escapeHtml(q.id)}" value="${escapeHtml(opt)}" ${String(value||'')===String(opt)?'checked':''} ${disabled}> ${escapeHtml(opt)}</label>`).join('')}</div>`;
    else if (q.type === 'checkbox') input = `<div class="answer-options">${(q.options || []).map(opt => `<label><input type="checkbox" data-question-id="${escapeHtml(q.id)}" value="${escapeHtml(opt)}" ${Array.isArray(value)&&value.includes(opt)?'checked':''} ${disabled}> ${escapeHtml(opt)}</label>`).join('')}</div>`;
    else input = `<input type="${q.type === 'number' ? 'number' : 'text'}" data-question-id="${escapeHtml(q.id)}" value="${escapeHtml(value || '')}" ${disabled}>`;
    return `<div class="online-question" data-question-type="${escapeHtml(q.type)}"><label><b>${index + 1}. ${escapeHtml(q.label)} ${required}</b>${input}</label></div>`;
  }).join('')}</div>`;
}

function collectWorksheetAnswers(assignmentId) {
  const root = document.querySelector(`.online-worksheet-form[data-assignment-id="${CSS.escape(String(assignmentId))}"]`);
  const answers = {};
  if (!root) return answers;
  root.querySelectorAll('.online-question').forEach(question => {
    const inputs = Array.from(question.querySelectorAll('[data-question-id]'));
    if (!inputs.length) return;
    const id = inputs[0].dataset.questionId;
    if (question.dataset.questionType === 'checkbox') answers[id] = inputs.filter(input => input.checked).map(input => input.value);
    else if (question.dataset.questionType === 'radio') answers[id] = inputs.find(input => input.checked)?.value || '';
    else answers[id] = inputs[0].value;
  });
  return answers;
}

function toggleStudentWorkPreview(assignmentId) {
  const box = $(`studentWorkPreview_${assignmentId}`);
  const work = state.studentWorkByAssignment.get(String(assignmentId));
  if (!box || !work) return;
  if (box.dataset.loaded !== '1') {
    box.innerHTML = work.submission
      ? renderWorkOrAssignmentPreview(work.submission, work.assignment)
      : renderStudentAssignmentPreview(work);
    box.dataset.loaded = '1';
    box.style.display = '';
    return;
  }
  box.style.display = box.style.display === 'none' ? '' : 'none';
}

const STUDENT_UPLOAD_MAX_FILE_BYTES = 8 * 1024 * 1024;
const STUDENT_UPLOAD_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function validateStudentUploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length > 5) throw new Error('แนบไฟล์ได้สูงสุด 5 ไฟล์ต่อครั้ง');
  const tooLarge = files.find(file => Number(file.size || 0) > STUDENT_UPLOAD_MAX_FILE_BYTES);
  if (tooLarge) throw new Error(`ไฟล์ ${tooLarge.name} ใหญ่เกิน 8 MB กรุณาลดขนาดไฟล์ก่อนส่ง`);
  const total = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (total > STUDENT_UPLOAD_MAX_TOTAL_BYTES) throw new Error('ไฟล์รวมใหญ่เกิน 20 MB กรุณาลดขนาดหรือแบ่งส่ง');
  return files;
}

function createSubmissionRequestId(assignmentId) {
  if (window.crypto?.randomUUID) return `${assignmentId}-${window.crypto.randomUUID()}`;
  return `${assignmentId}-${state.user?.UserID || ''}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function submissionRequestStorageKey(assignmentId) {
  return `matrix_submit_request_${state.user?.UserID || ''}_${assignmentId}`;
}

function getOrCreateSubmissionRequestId(assignmentId) {
  const key = String(assignmentId);
  let requestId = state.submissionRequestIds.get(key) || '';
  try { requestId = requestId || sessionStorage.getItem(submissionRequestStorageKey(assignmentId)) || ''; } catch (err) {}
  if (!requestId) requestId = createSubmissionRequestId(assignmentId);
  state.submissionRequestIds.set(key, requestId);
  try { sessionStorage.setItem(submissionRequestStorageKey(assignmentId), requestId); } catch (err) {}
  return requestId;
}

function clearSubmissionRequestId(assignmentId) {
  state.submissionRequestIds.delete(String(assignmentId));
  try { sessionStorage.removeItem(submissionRequestStorageKey(assignmentId)); } catch (err) {}
}
async function submitStudentWork(assignmentId) {
  const key = String(assignmentId);
  if (state.submissionsInFlight.has(key)) return showToast('กำลังส่งงานนี้อยู่ กรุณารอจนกว่าจะเสร็จ');
  state.submissionsInFlight.add(key);
  const requestId = getOrCreateSubmissionRequestId(assignmentId);
  let submissionConfirmed = false;
  try {
    const assignment = getAssignment(assignmentId);
    const online = isOnlineWorksheet(assignment);
    const input = $(`file_${assignmentId}`);
    const selectedFiles = online ? [] : validateStudentUploadFiles(input?.files);
    const files = [];
    for (let i = 0; i < selectedFiles.length; i += 1) {
      showToast(`กำลังเตรียมไฟล์ ${i + 1} จาก ${selectedFiles.length}...`, { persistent: true, loading: true });
      files.push(await fileToPayload(selectedFiles[i]));
    }
    const workText = online ? '' : ($(`workText_${assignmentId}`)?.value || '');
    const worksheetAnswers = online ? collectWorksheetAnswers(assignmentId) : null;
    if (!online && !String(workText || '').trim() && !files.length) return showToast('กรุณาพิมพ์คำตอบหรือแนบไฟล์ก่อนส่งงาน');
    const submitMode = assignment.WorkType === 'งานกลุ่ม' ? 'กลุ่ม' : 'เดี่ยว';
    showToast('กำลังอัปโหลดและบันทึกงาน กรุณาอย่าปิดหน้านี้...', { persistent: true, loading: true });
    const participation = submitMode === 'กลุ่ม' ? ($(`participation_${assignmentId}`)?.value || 'ปานกลาง') : '';
    const data = await apiPost({ action: 'submitWork', requestId, userId: state.user.UserID, assignmentId, submitMode, participation, workText, worksheetAnswers, files });
    if (!data.verified || !data.submission?.SubmissionID) throw new Error('ระบบยังยืนยันงานที่บันทึกไม่ได้ กรุณาอย่ากดส่งซ้ำและแจ้งครู');
    submissionConfirmed = true;
    clearSubmissionRequestId(assignmentId);
    showToast(`${data.warning ? data.warning + ' — ' : ''}ส่งงานแล้ว เลขที่รับงาน ${data.submission.SubmissionID}`);
    await loadStudentWork(false);
  } catch (err) {
    showToast(submissionConfirmed
      ? `ส่งงานสำเร็จแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ: ${err.message} — กดรีเฟรชงานได้โดยไม่ต้องส่งซ้ำ`
      : `${err.message} — หากลองใหม่ ระบบจะใช้คำขอเดิมเพื่อป้องกันงานซ้ำ`);
  } finally {
    state.submissionsInFlight.delete(key);
  }
}
