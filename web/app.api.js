/* ========= Mini Forum (Front-only demo) =========
   - ข้อมูลจำลองอยู่ในตัวแปร state
   - ไม่มีแบ็กเอนด์จริง ใช้สำหรับเทส UX/UI และ flow
   - พร้อมเชื่อมต่อ API ภายหลังได้เลย
*/
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- Data (Mock) ----------
const state = {
  me: null, // {id, name, email, role: 'user'|'admin', active: true}
  users: [
    { id: 1, name: "Admin", email: "admin@demo.com", role: "admin", active: true, bio: "I keep the forum tidy.", social: "" },
    { id: 2, name: "User",  email: "user@demo.com",  role: "user",  active: true, bio: "Just a member.", social: "" },
  ],
  categories: ["ทั่วไป", "ซอฟต์แวร์", "ฮาร์ดแวร์"],
  threads: [
    {
      id: 101,
      userId: 1,
      category: "ซอฟต์แวร์",
      title: "เริ่มต้น Node.js + Express ยังไงดี?",
      body: "ขอพื้นฐานและตัวอย่างเล็ก ๆ สำหรับเริ่มทำ API",
      createdAt: Date.now() - 1000 * 60 * 60 * 3, // 3 ชม.ก่อน
      updatedAt: null,
      deleted: false,
      comments: [
        { id: 1001, userId: 2, body: "แนะนำเรียนรู้ routing, middleware, error handler ก่อนครับ", createdAt: Date.now() - 1000 * 60 * 60 },
      ],
      reports: [] // {userId, reason, createdAt}
    },
    {
      id: 102,
      userId: 2,
      category: "ฮาร์ดแวร์",
      title: "Arduino ต่อ DHT11 + LCD I2C แล้วขึ้น ???",
      body: "จอมืด ๆ กระพริบ ๆ ช่วยชี้ทางที",
      createdAt: Date.now() - 1000 * 60 * 30,
      updatedAt: null,
      deleted: false,
      comments: [],
      reports: []
    }
  ],
  lastViewedThreadId: null,
};

// ---------- Utilities ----------
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "เมื่อสักครู่";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.floor(h / 24);
  return `${d} วันที่แล้ว`;
}
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
}
function requireLogin() {
  if (!state.me) {
    new bootstrap.Modal($('#loginModal')).show();
    return false;
  }
  if (!state.me.active) {
    alert("บัญชีของคุณถูกระงับการใช้งาน");
    return false;
  }
  return true;
}
function isOwner(uId){ return state.me && state.me.id === uId; }
function isAdmin(){ return state.me && state.me.role === 'admin'; }

// ---------- Navbar / Categories ----------
function renderNav() {
  const nav = $('#navActions');
  nav.innerHTML = '';

  if (!state.me) {
    nav.insertAdjacentHTML('beforeend', `
      <button class="btn btn-outline-primary" data-bs-toggle="modal" data-bs-target="#loginModal">เข้าสู่ระบบ</button>
      <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#registerModal">สมัครสมาชิก</button>
    `);
  } else {
    nav.insertAdjacentHTML('beforeend', `
      <div class="dropdown">
        <button class="btn btn-white border dropdown-toggle d-flex align-items-center gap-2" data-bs-toggle="dropdown">
          <div class="avatar">${initials(state.me.name)}</div>
          <span>${state.me.name}</span>
        </button>
        <div class="dropdown-menu dropdown-menu-end">
          <button class="dropdown-item" data-bs-toggle="modal" data-bs-target="#profileModal">โปรไฟล์</button>
          ${isAdmin() ? `<button class="dropdown-item" id="menuAdmin">แอดมินพาเนล</button>` : ''}
          <div class="dropdown-divider"></div>
          <button class="dropdown-item text-danger" id="menuLogout">ออกจากระบบ</button>
        </div>
      </div>
    `);
    $('#menuLogout')?.addEventListener('click', () => { state.me = null; renderAll(); });
    $('#menuAdmin')?.addEventListener('click', () => openAdmin());
    $('#btnGoAdmin').style.display = isAdmin() ? '' : 'none';
  }
}

function renderCategories() {
  const ul = $('#categoryTabs');
  ul.innerHTML = '';
  const cats = ["ทั้งหมด", ...state.categories];
  cats.forEach((c, idx) => {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `
      <a class="nav-link ${idx===0?'active':''}" href="#" data-cat="${c}">${c}</a>
    `;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      $$('#categoryTabs .nav-link').forEach(a => a.classList.remove('active'));
      e.target.classList.add('active');
      renderThreads();
    });
    ul.appendChild(li);
  });

  // thread form category
  const sel = $('#threadCategory');
  sel.innerHTML = state.categories.map(c => `<option>${c}</option>`).join('');
}

// ---------- Threads ----------
function currentFilterText(){ return $('#searchInput').value.trim().toLowerCase(); }
function currentFilterCat(){
  const active = $('#categoryTabs .nav-link.active');
  return active ? active.dataset.cat : "ทั้งหมด";
}
function currentSort(){
  return $('#sortSelect').value;
}

function renderThreads() {
  const list = $('#threadList');
  const empty = $('#emptyState');
  list.innerHTML = '';

  let arr = state.threads.filter(t => !t.deleted);

  // filter by category
  const cat = currentFilterCat();
  if (cat && cat !== "ทั้งหมด") arr = arr.filter(t => t.category === cat);

  // filter by text
  const q = currentFilterText();
  if (q) arr = arr.filter(t =>
    t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q)
  );

  // sort
  const s = currentSort();
  if (s === 'newest') arr.sort((a,b) => b.createdAt - a.createdAt);
  if (s === 'active') arr.sort((a,b) => {
    const aLast = Math.max(a.createdAt, ...a.comments.map(c => c.createdAt));
    const bLast = Math.max(b.createdAt, ...b.comments.map(c => c.createdAt));
    return bLast - aLast;
  });
  if (s === 'popular') arr.sort((a,b) => b.comments.length - a.comments.length);

  if (arr.length === 0) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  arr.forEach(t => {
    const user = state.users.find(u => u.id === t.userId);
    const lastAct = Math.max(t.createdAt, ...t.comments.map(c => c.createdAt));
    const card = document.createElement('div');
    card.className = 'card thread-card';
    card.innerHTML = `
      <div class="card-body">
        <div class="d-flex align-items-start justify-content-between gap-3">
          <div class="d-flex gap-3">
            <div class="avatar">${initials(user.name)}</div>
            <div>
              <a href="#" class="thread-title fw-semibold link-underline link-underline-opacity-0" data-open="${t.id}">
                ${t.title}
              </a>
              <div class="text-muted small">
                โดย <span class="fw-semibold">${user.name}</span> · ${timeAgo(t.createdAt)}
                · <span class="badge rounded-pill badge-category">${t.category}</span>
              </div>
            </div>
          </div>
          <div class="text-muted small">
            <span class="me-3">💬 ${t.comments.length}</span>
            ${isOwner(t.userId) || isAdmin() ? `
              <div class="dropdown d-inline">
                <button class="btn btn-sm btn-soft dropdown-toggle" data-bs-toggle="dropdown">จัดการ</button>
                <div class="dropdown-menu dropdown-menu-end">
                  <button class="dropdown-item" data-edit="${t.id}">แก้ไข</button>
                  <button class="dropdown-item text-danger" data-del="${t.id}">ลบ</button>
                </div>
              </div>
            `:''}
          </div>
        </div>
      </div>
    `;
    card.querySelector('[data-open]')?.addEventListener('click', (e) => { e.preventDefault(); openThread(t.id); });
    card.querySelector('[data-edit]')?.addEventListener('click', () => openThreadForm(t.id));
    card.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirm('ยืนยันลบกระทู้?')) return;
      t.deleted = true;
      renderThreads();
    });
    list.appendChild(card);
  });
}

// ---------- Thread Form ----------
let editingThreadId = null;
function openThreadForm(id = null){
  if (!requireLogin()) return;
  editingThreadId = id;
  $('#threadModalTitle').textContent = id ? 'แก้ไขกระทู้' : 'สร้างกระทู้';
  if (id) {
    const t = state.threads.find(x => x.id === id);
    $('#threadCategory').value = t.category;
    $('#threadTitleInput').value = t.title;
    $('#threadBodyInput').value = t.body;
  } else {
    $('#threadForm').reset();
  }
  new bootstrap.Modal($('#threadModal')).show();
}

$('#threadForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!requireLogin()) return;

  const category = $('#threadCategory').value.trim();
  const title = $('#threadTitleInput').value.trim();
  const body = $('#threadBodyInput').value.trim();
  if (!title || !body) return;

  if (editingThreadId) {
    const t = state.threads.find(x => x.id === editingThreadId);
    t.category = category; t.title = title; t.body = body; t.updatedAt = Date.now();
  } else {
    state.threads.unshift({
      id: Date.now(),
      userId: state.me.id,
      category, title, body,
      createdAt: Date.now(), updatedAt: null,
      deleted: false, comments: [], reports: []
    });
  }
  bootstrap.Modal.getInstance($('#threadModal')).hide();
  renderThreads();
});

// ---------- View Thread ----------
function openThread(id){
  const t = state.threads.find(x => x.id === id);
  if (!t || t.deleted) return;
  state.lastViewedThreadId = id;

  const user = state.users.find(u => u.id === t.userId);

  $('#viewThreadTitle').textContent = t.title;
  $('#viewThreadCategory').textContent = t.category;
  $('#viewThreadBody').textContent = t.body;
  $('#viewThreadMeta').textContent = `โดย ${user.name} · ${timeAgo(t.createdAt)}`;

  const actions = $('#viewThreadActions');
  actions.innerHTML = `
    <button class="btn btn-outline-danger btn-sm" id="btnReport">รายงาน</button>
    ${(isOwner(t.userId) || isAdmin()) ? `
      <button class="btn btn-outline-secondary btn-sm" id="btnEditT">แก้ไข</button>
      <button class="btn btn-outline-secondary btn-sm text-danger" id="btnDeleteT">ลบ</button>
    `:''}
  `;
  $('#btnReport')?.addEventListener('click', () => {
    if (!requireLogin()) return;
    t.reports.push({ userId: state.me.id, reason: 'ไม่เหมาะสม', createdAt: Date.now() });
    alert('ส่งรายงานแล้ว ขอบคุณครับ');
  });
  $('#btnEditT')?.addEventListener('click', () => openThreadForm(t.id));
  $('#btnDeleteT')?.addEventListener('click', () => {
    if (!confirm('ยืนยันลบกระทู้นี้?')) return;
    t.deleted = true;
    bootstrap.Modal.getInstance($('#viewThreadModal')).hide();
    renderThreads();
  });

  const list = $('#commentList');
  list.innerHTML = '';
  t.comments.forEach(c => {
    const u = state.users.find(x => x.id === c.userId);
    const item = document.createElement('div');
    item.className = 'comment';
    item.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-1">
        <div class="d-flex align-items-center gap-2">
          <div class="avatar" style="width:32px;height:32px">${initials(u.name)}</div>
          <div class="small text-muted">${u.name} · ${timeAgo(c.createdAt)}</div>
        </div>
        ${(isOwner(c.userId) || isAdmin()) ? `
        <div class="dropdown">
          <button class="btn btn-sm btn-soft dropdown-toggle" data-bs-toggle="dropdown">จัดการ</button>
          <div class="dropdown-menu dropdown-menu-end">
            <button class="dropdown-item" data-editc="${c.id}">แก้ไข</button>
            <button class="dropdown-item text-danger" data-delc="${c.id}">ลบ</button>
          </div>
        </div>`:''}
      </div>
      <div class="mt-1" data-bodyc="${c.id}">${c.body}</div>
    `;
    item.querySelector('[data-editc]')?.addEventListener('click', () => {
      const bodyEl = item.querySelector(`[data-bodyc="${c.id}"]`);
      const nv = prompt('แก้ไขความคิดเห็น', c.body);
      if (nv !== null) { c.body = nv.trim(); bodyEl.textContent = c.body; }
    });
    item.querySelector('[data-delc]')?.addEventListener('click', () => {
      if (!confirm('ลบความคิดเห็นนี้?')) return;
      t.comments = t.comments.filter(x => x.id !== c.id);
      openThread(t.id);
      renderThreads();
    });
    list.appendChild(item);
  });

  // comment form
  $('#commentForm').style.display = state.me ? '' : 'none';
  $('#commentForm').onsubmit = (e) => {
    e.preventDefault();
    if (!requireLogin()) return;
    const text = $('#commentInput').value.trim();
    if (!text) return;
    t.comments.push({ id: Date.now(), userId: state.me.id, body: text, createdAt: Date.now() });
    $('#commentInput').value = '';
    openThread(t.id);
    renderThreads();
  };

  new bootstrap.Modal($('#viewThreadModal')).show();
}

// ---------- Auth (Mock) ----------
$('#loginForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get('email'); const pass = fd.get('password');

  // เดโม่: สองบัญชีนี้เท่านั้น
  if (email === 'admin@demo.com' && pass === '123456') {
    state.me = { ...state.users[0] };
  } else if (email === 'user@demo.com' && pass === '123456') {
    state.me = { ...state.users[1] };
  } else {
    alert('อีเมลหรือรหัสผ่านไม่ถูกต้อง (เดโม่)');
    return;
  }
  bootstrap.Modal.getInstance($('#loginModal')).hide();
  renderAll();
});

$('#registerForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get('name')).trim();
  const email = String(fd.get('email')).trim();
  const password = String(fd.get('password')).trim();
  if (!name || !email || password.length < 6) return alert('กรอกข้อมูลให้ครบ');

  const exists = state.users.some(u => u.email === email);
  if (exists) return alert('อีเมลนี้ถูกใช้แล้ว');

  const u = { id: Date.now(), name, email, role:'user', active:true, bio:'', social:'' };
  state.users.push(u);
  state.me = { ...u };
  bootstrap.Modal.getInstance($('#registerModal')).hide();
  renderAll();
});

// ---------- Profile ----------
$('#profileForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  if (!requireLogin()) return;
  const u = state.users.find(x => x.id === state.me.id);
  u.name = $('#profileName').value.trim();
  u.bio = $('#profileBio').value.trim();
  u.social = $('#profileSocial').value.trim();

  const p1 = $('#profileNewPass').value, p2 = $('#profileNewPass2').value;
  if (p1 || p2) {
    if (p1 !== p2 || p1.length < 6) {
      alert('รหัสผ่านใหม่ไม่ถูกต้อง (ต้องยาว ≥ 6 และตรงกัน)');
      return;
    }
    // เดโม่: ไม่ได้เก็บรหัสจริง
  }
  state.me = { ...u };
  bootstrap.Modal.getInstance($('#profileModal')).hide();
  renderAll();
});
function openProfile(){
  if (!requireLogin()) return;
  $('#profileInitials').textContent = initials(state.me.name);
  $('#profileName').value = state.me.name || '';
  $('#profileBio').value = state.me.bio || '';
  $('#profileSocial').value = state.me.social || '';
}

// ---------- Admin ----------
function openAdmin(){
  if (!isAdmin()) return alert('ต้องเป็นแอดมิน');
  renderAdmin();
  new bootstrap.Modal($('#adminModal')).show();
}

function renderAdmin(){
  // stats
  const stats = [
    { label:'ผู้ใช้ทั้งหมด', val: state.users.length },
    { label:'กระทู้ทั้งหมด', val: state.threads.length },
    { label:'คอมเมนต์ทั้งหมด', val: state.threads.reduce((a,t)=>a+t.comments.length,0) },
    { label:'รายงานค้าง', val: state.threads.reduce((a,t)=>a+t.reports.length,0) },
  ];
  const wrap = $('#adminStats'); wrap.innerHTML = '';
  stats.forEach(s=>{
    wrap.insertAdjacentHTML('beforeend', `
      <div class="col-6 col-md-3">
        <div class="card shadow-sm">
          <div class="card-body text-center">
            <div class="display-6">${s.val}</div>
            <div class="text-muted small">${s.label}</div>
          </div>
        </div>
      </div>
    `);
  });

  // categories
  const list = $('#categoryAdminList'); list.innerHTML = '';
  state.categories.forEach((c, i)=>{
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <span>${c}</span>
      <div class="actions d-flex gap-2">
        <button class="btn btn-sm btn-soft" data-up="${i}">ขึ้น</button>
        <button class="btn btn-sm btn-soft" data-down="${i}">ลง</button>
        <button class="btn btn-sm btn-outline-danger" data-del="${i}">ลบ</button>
      </div>
    `;
    li.querySelector('[data-up]')?.addEventListener('click', ()=>{ if(i>0){ [state.categories[i-1],state.categories[i]]=[state.categories[i],state.categories[i-1]]; renderAdmin(); renderCategories(); renderThreads(); } });
    li.querySelector('[data-down]')?.addEventListener('click', ()=>{ if(i<state.categories.length-1){ [state.categories[i+1],state.categories[i]]=[state.categories[i],state.categories[i+1]]; renderAdmin(); renderCategories(); renderThreads(); } });
    li.querySelector('[data-del]')?.addEventListener('click', ()=>{
      if (!confirm('ลบหมวดหมู่นี้?')) return;
      const name = state.categories[i];
      // ย้ายกระทู้ในหมวดนี้ไป "ทั่วไป"
      state.threads.forEach(t=>{ if(t.category===name) t.category='ทั่วไป'; });
      state.categories.splice(i,1);
      renderAdmin(); renderCategories(); renderThreads();
    });
    list.appendChild(li);
  });
  $('#btnAddCategory').onclick = ()=>{
    const name = prompt('ชื่อหมวดหมู่ใหม่'); if(!name) return;
    if (state.categories.includes(name)) return alert('มีชื่อนี้แล้ว');
    state.categories.push(name); renderAdmin(); renderCategories();
  };

  // users
  const userWrap = $('#userAdminList'); userWrap.innerHTML='';
  const q = ($('#adminUserSearch').value || '').toLowerCase();
  state.users
    .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .forEach(u=>{
      const el = document.createElement('div');
      el.className = 'border rounded p-2 d-flex justify-content-between align-items-center';
      el.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <div class="avatar">${initials(u.name)}</div>
          <div>
            <div class="fw-semibold">${u.name} ${!u.active?'<span class="badge text-bg-secondary">ระงับ</span>':''}</div>
            <div class="small text-muted">${u.email}</div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm w-auto" data-role="${u.id}">
            <option value="user" ${u.role==='user'?'selected':''}>user</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
          </select>
          <button class="btn btn-sm ${u.active?'btn-outline-danger':'btn-outline-success'}" data-toggle="${u.id}">
            ${u.active?'ระงับ':'ปลดระงับ'}
          </button>
        </div>
      `;
      el.querySelector(`[data-role="${u.id}"]`).addEventListener('change',(e)=>{
        u.role = e.target.value; if (state.me?.id===u.id) state.me.role = u.role; renderNav();
      });
      el.querySelector(`[data-toggle="${u.id}"]`).addEventListener('click',()=>{
        if (u.id === state.me?.id && u.active) return alert('ห้ามระงับตัวเอง');
        u.active = !u.active; renderAdmin();
      });
      userWrap.appendChild(el);
    });
  $('#adminUserSearch').oninput = ()=> renderAdmin();

  // reports
  const repWrap = $('#reportAdminList'); repWrap.innerHTML='';
  const reports = [];
  state.threads.forEach(t => t.reports.forEach(r => reports.push({thread:t, report:r})));
  if (reports.length===0) {
    repWrap.innerHTML = `<div class="text-muted small">ยังไม่มีรายงาน</div>`;
  } else {
    reports
      .sort((a,b)=> b.report.createdAt - a.report.createdAt)
      .forEach(({thread:t, report:r})=>{
        const u = state.users.find(x => x.id === r.userId);
        const item = document.createElement('div');
        item.className = 'border rounded p-2';
        item.innerHTML = `
          <div class="d-flex justify-content-between">
            <div>
              <div class="fw-semibold">${t.title}</div>
              <div class="small text-muted">รายงานโดย ${u.name} · ${timeAgo(r.createdAt)}</div>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-soft" data-open="${t.id}">เปิด</button>
              ${t.deleted? `<button class="btn btn-sm btn-outline-success" data-restore="${t.id}">กู้คืน</button>`
                         : `<button class="btn btn-sm btn-outline-danger" data-delete="${t.id}">ลบ</button>`}
            </div>
          </div>
        `;
        item.querySelector('[data-open]')?.addEventListener('click',()=> openThread(t.id));
        item.querySelector('[data-delete]')?.addEventListener('click',()=>{ t.deleted = true; renderAdmin(); renderThreads(); });
        item.querySelector('[data-restore]')?.addEventListener('click',()=>{ t.deleted = false; renderAdmin(); renderThreads(); });
        repWrap.appendChild(item);
      });
  }
}

// ---------- Events on load ----------
function renderAll(){
  renderNav();
  renderCategories();
  renderThreads();
  $('#btnNewThread').onclick = () => openThreadForm(null);
  $('#btnGoAdmin').onclick  = () => openAdmin();
  $$('#categoryTabs .nav-link').forEach(a => a.classList.remove('active'));
  $$('#categoryTabs .nav-link')[0]?.classList.add('active');
  $('#searchInput').oninput = () => renderThreads();
  $('#sortSelect').onchange = () => renderThreads();
  $('#profileModal')?.addEventListener('show.bs.modal', openProfile);
}
renderAll();

const API = (path, opts = {}) =>
  fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(window.__token ? { Authorization: 'Bearer ' + window.__token } : {})
    },
    ...opts
  }).then(r => r.json());
