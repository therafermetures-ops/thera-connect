/* ==================================================================
   THERA CONNECT — script.js v3.0
   Phase 3 : Rôles 4 niveaux · ESP32/Bluetooth · Planning Calendrier · Invitations
================================================================== */

/* ==================================================================
   CHAPITRE 0 : INITIALISATION & ÉTAT GLOBAL
================================================================== */

let supabaseClient = null;

let state = {
    acces:      [],
    profils:    [],
    historique: [],
    trash:      [],
    alertRules: [],
    alertLogs:  []
};

let currentTargetId        = null;
let currentEditingId       = null;
let currentEditingProfilId = null;
let currentKeyFilter       = 'all';

// Bluetooth
let bluetoothDevice  = null;
let bluetoothCharac  = null;
const BT_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BT_CHAR_UUID    = '0000ffe1-0000-1000-8000-00805f9b34fb';

// Planning
let planningAccId    = null;
let planningSlots    = {};
let planningDragData = null;

/* ==================================================================
   CHAPITRE 1 : SUPABASE
================================================================== */

function initSupabase(url, key) {
    if (!url || !key) return;
    supabaseClient = supabase.createClient(url, key);
    console.log('🔌 Supabase initialisé.');
}

window.addEventListener('DOMContentLoaded', () => {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (url && key) initSupabase(url, key);
});

async function loadAllData() {
    if (!supabaseClient) return;
    try {
        const [{ data: accesData, error: e1 }, { data: profilsData, error: e2 }] = await Promise.all([
            supabaseClient.from('access_points').select('*'),
            supabaseClient.from('profiles').select('*')
        ]);
        if (e1) throw e1;
        if (e2) throw e2;

        state.acces   = (accesData   || []).filter(a => !a.is_deleted);
        state.profils = (profilsData || []).filter(p => !p.is_deleted);
        state.trash   = [
            ...(accesData   || []).filter(a => a.is_deleted).map(a => ({ type: 'acces',  data: a, date: new Date() })),
            ...(profilsData || []).filter(p => p.is_deleted).map(p => ({ type: 'profil', data: p, date: new Date() }))
        ];
        const { data: rulesData } = await supabaseClient.from('alert_rules').select('*').catch(() => ({ data: [] }));
        if (rulesData) state.alertRules = rulesData;
        console.log('✅ Données chargées:', state.acces.length, 'accès,', state.profils.length, 'profils');
    } catch (err) {
        console.error('Erreur loadAllData:', err.message);
        showToast('Erreur chargement : ' + err.message, 'error');
    }
}

/* ==================================================================
   CHAPITRE 2 : PERMISSIONS & RÔLES (4 niveaux)
================================================================== */

function applyPermissions(userRole, expiryDate = null) {
    const navButtons  = document.querySelectorAll('.nav-btn');
    const contentArea = document.querySelector('.content-area');

    navButtons.forEach(btn => btn.classList.remove('admin-only'));
    document.querySelectorAll('.expiry-notice').forEach(el => el.remove());

    const role = (userRole || '').toLowerCase().replace(/\s/g, '_');

    if (role === 'super_admin') {
        _injectSuperAdminBadge();

    } else if (role === 'administrateur') {
        navButtons.forEach(btn => {
            if ((btn.getAttribute('onclick') || '').includes('page-systeme'))
                btn.classList.add('admin-only');
        });

    } else if (role === 'regulier' || role === 'régulier') {
        _applyRestrictedView(navButtons);

    } else if (role === 'visiteur') {
        _applyRestrictedView(navButtons);
        if (expiryDate) {
            const exp    = new Date(expiryDate);
            const diff   = Math.round((exp - Date.now()) / 3600000);
            const notice = document.createElement('div');
            notice.className = 'expiry-notice';
            notice.innerHTML = `⏱️ Accès temporaire · Expire le <strong>${exp.toLocaleString('fr-FR')}</strong>${diff > 0 && diff < 72 ? ` <span style="opacity:.7">(dans ${diff}h)</span>` : ''}`;
            contentArea.insertAdjacentElement('afterbegin', notice);
        }
    }
}

function _applyRestrictedView(navButtons) {
    navButtons.forEach(btn => {
        if (!(btn.getAttribute('onclick') || '').includes('page-accueil'))
            btn.classList.add('admin-only');
    });
}

function _injectSuperAdminBadge() {
    const header = document.querySelector('.sidebar-header');
    if (!header || header.querySelector('.super-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'super-badge';
    badge.style.cssText = 'margin-top:8px;padding:3px 10px;border-radius:99px;background:linear-gradient(135deg,#f0883e,#e05c1a);color:white;font-size:.7rem;font-weight:700;letter-spacing:.08em;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(240,136,62,.4);';
    badge.textContent = '★ SUPER ADMIN';
    header.appendChild(badge);
}

function getCurrentRole() {
    const p = typeof getCurrentProfil === 'function' ? getCurrentProfil() : null;
    return (p?.type || p?.role || 'visiteur').toLowerCase().replace(/\s/g, '_');
}

function isAdmin() { const r = getCurrentRole(); return r === 'administrateur' || r === 'super_admin'; }
function isSuperAdmin() { return getCurrentRole() === 'super_admin'; }

/* ==================================================================
   CHAPITRE 3 : NAVIGATION
================================================================== */

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((btn.getAttribute('onclick') || '').includes(pageId)) btn.classList.add('active');
    });

    switch (pageId) {
        case 'page-accueil':    renderAccueil();       break;
        case 'page-acces':      renderAccesList();     break;
        case 'page-profils':    renderProfilsList();   break;
        case 'page-cles':       renderKeysList();      break;
        case 'page-historique': renderHistory();       break;
        case 'page-alerts':     renderAlertsSetup();   break;
        case 'page-corbeille':  renderCorbeille();     break;
        case 'page-systeme':    renderSystemModules(); break;
        case 'page-reglages':
            document.getElementById('sb-url').value = localStorage.getItem('supabase_url') || '';
            document.getElementById('sb-key').value = localStorage.getItem('supabase_key') || '';
            break;
    }

    document.getElementById('sidebar')?.classList.remove('open');
    const btnBack = document.getElementById('btn-back');
    if (btnBack) btnBack.style.display = pageId === 'page-accueil' ? 'none' : 'block';
    if (window.lucide) lucide.createIcons();
}

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); }

/* ==================================================================
   CHAPITRE 4 : TABLEAU DE BORD
================================================================== */

function renderAccueil() {
    const role   = getCurrentRole();
    const profil = typeof getCurrentProfil === 'function' ? getCurrentProfil() : null;
    if (role === 'super_admin' || role === 'administrateur') {
        _renderAdminDashboard();
    } else {
        _renderUserDashboard(profil);
    }
}

function _renderAdminDashboard() {
    const vals = document.querySelectorAll('.stat-value');
    if (vals[0]) vals[0].textContent = state.acces.length;
    if (vals[1]) vals[1].textContent = state.alertLogs.filter(l => (Date.now() - new Date(l.timestamp)) < 86400000).length;
    renderFavorites();
}

function _renderUserDashboard(profil) {
    const container = document.getElementById('favorites-container');
    if (!container) return;
    container.innerHTML = '';

    const authorizedIds = profil?.authorized_access || [];
    const myAccess = authorizedIds.length > 0
        ? state.acces.filter(a => authorizedIds.includes(a.id))
        : state.acces;

    if (myAccess.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Aucun accès autorisé pour votre profil.</p></div>';
        return;
    }

    myAccess.forEach(acc => {
        const allowed = _isAccessAllowedNow(acc);
        const card    = document.createElement('div');
        card.className = 'card access-tile animate-in';
        card.style.borderLeftColor = allowed ? 'var(--green)' : 'var(--border)';
        card.innerHTML = `
            <div class="tile-header">
                <div class="tile-info">
                    <h4>${acc.name}</h4>
                    <span class="status-indicator" style="color:${allowed ? 'var(--green)' : 'var(--text-muted)'}">
                        ${allowed ? 'Accès autorisé' : 'Hors plage horaire'}
                    </span>
                </div>
            </div>
            <div class="tile-body"><div class="ip-badge"><i data-lucide="network"></i> ${acc.ip}</div></div>
            <div class="tile-actions">
                ${allowed
                    ? `<button class="btn-action-primary" onclick="openControlModal('${acc.id}', '${acc.name}')"><i data-lucide="unplug"></i> Contrôler</button>`
                    : `<span style="font-size:.8rem;color:var(--text-muted)">⏰ Hors horaires</span>`}
            </div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

function _isAccessAllowedNow(acc) {
    if (!acc.planning?.slots) return true;
    const now  = new Date();
    const day  = now.getDay();
    const time = now.getHours() * 60 + now.getMinutes();
    return (acc.planning.slots[day] || []).some(slot => {
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        return time >= sh * 60 + sm && time <= eh * 60 + em;
    });
}

function renderFavorites() {
    const container = document.getElementById('favorites-container');
    if (!container) return;
    container.innerHTML = '';
    const favs = state.acces.filter(a => a.is_favorite);
    if (!favs.length) {
        container.innerHTML = '<div class="empty-state"><p>Aucun favori — marquez un accès ★ pour le voir ici.</p></div>';
        return;
    }
    favs.forEach(acc => {
        const card = document.createElement('div');
        card.className = 'card access-tile animate-in';
        card.innerHTML = `
            <div class="tile-header"><div class="tile-info">
                <h4>${acc.name}</h4>
                <span class="status-indicator online">Opérationnel</span>
            </div></div>
            <div class="tile-body"><div class="ip-badge"><i data-lucide="network"></i> ${acc.ip}</div></div>
            <div class="tile-actions">
                <button class="btn-action-primary" onclick="openControlModal('${acc.id}', '${acc.name}')">
                    <i data-lucide="unplug"></i> Contrôler
                </button>
            </div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

/* ==================================================================
   CHAPITRE 5 : COMMANDES ESP32 — HTTP + BLUETOOTH
================================================================== */

function openModal(id)  { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

function openControlModal(accId, accName) {
    currentTargetId = accId;
    const el = document.getElementById('modal-title-target');
    if (el) el.textContent = accName;
    openModal('modal-control');
}

async function confirmCommand(action) {
    const acc = state.acces.find(a => a.id === currentTargetId);
    if (!acc) return;
    closeModal('modal-control');

    const httpOk = await _sendHttpCommand(acc, action);
    if (!httpOk) {
        showToast('WiFi indisponible — tentative Bluetooth...', 'info');
        const btOk = await _sendBluetoothCommand(acc, action);
        if (!btOk) { showToast(`Commande ${action} échouée sur tous les canaux`, 'error'); return; }
    }

    const profil = typeof getCurrentProfil === 'function' ? getCurrentProfil() : null;
    addHistoryEntry(profil?.name || 'Système', acc.name, action, httpOk ? 'WiFi' : 'Bluetooth');
    showToast(`✅ ${acc.name} — ${action}`, 'success');
    renderAccueil();
}

async function _sendHttpCommand(acc, action) {
    if (!acc.ip) return false;
    const status = action === 'OUVRIR' ? '1' : '0';
    const url    = `http://${acc.ip}/relay?id=${acc.relay_id || 1}&status=${status}`;
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 4000);
        await fetch(url, { signal: ctrl.signal, mode: 'no-cors' });
        return true;
    } catch (err) {
        console.warn('HTTP erreur:', err.message);
        return false;
    }
}

async function _sendBluetoothCommand(acc, action) {
    if (!navigator.bluetooth) { showToast('Bluetooth : Chrome requis', 'error'); return false; }
    try {
        if (!bluetoothDevice?.gatt?.connected) {
            bluetoothDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: acc.bt_name || 'KC868' }],
                optionalServices: [BT_SERVICE_UUID]
            });
            const server   = await bluetoothDevice.gatt.connect();
            const service  = await server.getPrimaryService(BT_SERVICE_UUID);
            bluetoothCharac = await service.getCharacteristic(BT_CHAR_UUID);
        }
        const cmd = action === 'OUVRIR' ? `RELAY:${acc.relay_id || 1}:ON\r\n` : `RELAY:${acc.relay_id || 1}:OFF\r\n`;
        await bluetoothCharac.writeValue(new TextEncoder().encode(cmd));
        return true;
    } catch (err) {
        console.warn('BT erreur:', err.message);
        bluetoothDevice = null;
        return false;
    }
}

async function connectBluetooth() {
    if (!navigator.bluetooth) { showToast('WebBluetooth requis (Chrome)', 'error'); return; }
    try {
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [BT_SERVICE_UUID]
        });
        bluetoothDevice.addEventListener('gattserverdisconnected', () => {
            showToast('📶 Bluetooth déconnecté', 'error');
            bluetoothDevice = null; bluetoothCharac = null;
            _updateBtStatus(false);
        });
        const server   = await bluetoothDevice.gatt.connect();
        const service  = await server.getPrimaryService(BT_SERVICE_UUID);
        bluetoothCharac = await service.getCharacteristic(BT_CHAR_UUID);
        showToast(`📶 Bluetooth connecté : ${bluetoothDevice.name}`, 'success');
        _updateBtStatus(true, bluetoothDevice.name);

        await bluetoothCharac.startNotifications();
        bluetoothCharac.addEventListener('characteristicvaluechanged', (e) => {
            const msg = new TextDecoder().decode(e.target.value).trim();
            console.log('📶 BT reçu:', msg);
            if (msg.startsWith('SENSOR:') && msg.includes(':ALARM')) {
                const id  = msg.split(':')[1];
                const nom = state.acces.find(a => a.relay_id == id)?.name || `Capteur ${id}`;
                addAlertLog(`⚠️ Alarme capteur — ${nom}`);
                showToast(`⚠️ Alerte : ${nom}`, 'error');
            }
            if (msg.startsWith('INPUT:') && msg.includes(':OPEN')) {
                const id  = msg.split(':')[1];
                const acc = state.acces.find(a => a.sensor_id == id);
                if (acc) addAlertLog(`🚪 Portail ouvert détecté — ${acc.name}`);
            }
        });
    } catch (err) {
        showToast('Connexion Bluetooth annulée', 'error');
    }
}

function _updateBtStatus(connected, name = '') {
    const el = document.getElementById('bt-status-indicator');
    if (!el) return;
    el.textContent = connected ? `📶 ${name}` : '📶 Déconnecté';
    el.style.color = connected ? 'var(--green)' : 'var(--text-muted)';
}

/* ==================================================================
   CHAPITRE 6 : PLANNING CALENDRIER (drag & drop créneaux)
================================================================== */

const DAYS  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_H = 40; // px par heure

function openPlanningEditor(accId) {
    planningAccId = accId;
    const acc = state.acces.find(a => a.id === accId);
    if (!acc) return;
    planningSlots = acc.planning?.slots ? JSON.parse(JSON.stringify(acc.planning.slots)) : {};
    const titleEl = document.getElementById('planning-editor-title');
    if (titleEl) titleEl.textContent = `Planning — ${acc.name}`;
    openModal('modal-planning');
    _renderCalendar();
}

function _renderCalendar() {
    const grid = document.getElementById('planning-calendar-grid');
    if (!grid) return;

    grid.innerHTML = `
        <div class="cal-layout">
            <div class="cal-hours-col">
                ${HOURS.map(h => `<div class="cal-hour-label" style="height:${SLOT_H}px">${String(h).padStart(2,'0')}:00</div>`).join('')}
            </div>
            ${DAYS.map((day, di) => `
                <div class="cal-day-col" data-day="${di}"
                    style="position:relative;height:${24*SLOT_H}px;"
                    ondragover="event.preventDefault()"
                    ondrop="_calDrop(event,${di})">
                    ${HOURS.map(h => `<div class="cal-grid-line" style="top:${h*SLOT_H}px" title="Double-clic pour ajouter" ondblclick="_calAddSlot(${di},${h})"></div>`).join('')}
                    ${_renderDaySlots(di)}
                </div>`).join('')}
        </div>`;

    const header = document.getElementById('planning-calendar-header');
    if (header) header.innerHTML = `<div class="cal-th-empty"></div>${DAYS.map(d => `<div class="cal-th-day">${d}</div>`).join('')}`;
    if (window.lucide) lucide.createIcons();
}

function _renderDaySlots(di) {
    return (planningSlots[di] || []).map((slot, i) => {
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        const top    = (sh + sm / 60) * SLOT_H;
        const height = Math.max(((eh + em / 60) - (sh + sm / 60)) * SLOT_H, 20);
        return `
            <div class="cal-slot" draggable="true" style="top:${top}px;height:${height}px"
                data-day="${di}" data-idx="${i}"
                ondragstart="_calDragStart(event,${di},${i})">
                <span class="cal-slot-label">${slot.start}<br><small>${slot.end}</small></span>
                <button class="cal-slot-del" onclick="event.stopPropagation();_calDeleteSlot(${di},${i})">×</button>
                <div class="cal-slot-resize" onmousedown="_calResizeStart(event,${di},${i})"></div>
            </div>`;
    }).join('');
}

function _calAddSlot(di, h) {
    if (!planningSlots[di]) planningSlots[di] = [];
    planningSlots[di].push({ start: `${String(h).padStart(2,'0')}:00`, end: `${String(Math.min(h+2,23)).padStart(2,'0')}:00` });
    _renderCalendar();
}

function _calDeleteSlot(di, i) { planningSlots[di].splice(i, 1); _renderCalendar(); }

function _calDragStart(e, di, i) { planningDragData = { di, i }; e.dataTransfer.effectAllowed = 'move'; }

function _calDrop(e, targetDay) {
    e.preventDefault();
    if (!planningDragData) return;
    const { di: src, i } = planningDragData;
    const slot = planningSlots[src]?.[i];
    if (!slot) return;
    const rect    = e.currentTarget.getBoundingClientRect();
    const relY    = e.clientY - rect.top;
    const newH    = Math.max(0, Math.min(22, Math.floor(relY / SLOT_H)));
    const dur     = _slotDuration(slot);
    planningSlots[src].splice(i, 1);
    if (!planningSlots[targetDay]) planningSlots[targetDay] = [];
    planningSlots[targetDay].push({ start: `${String(newH).padStart(2,'0')}:00`, end: `${String(Math.min(newH+dur,24)).padStart(2,'0')}:00` });
    planningDragData = null;
    _renderCalendar();
}

function _calResizeStart(e, di, i) {
    e.preventDefault(); e.stopPropagation();
    const startY  = e.clientY;
    const slot    = planningSlots[di][i];
    const [eh, em] = slot.end.split(':').map(Number);
    const startEnd = eh + em / 60;
    const [sh]    = slot.start.split(':').map(Number);
    function onMove(ev) {
        const newEnd = Math.max(sh + 0.5, Math.min(24, startEnd + (ev.clientY - startY) / SLOT_H));
        const h = Math.floor(newEnd);
        const m = Math.round((newEnd - h) * 60 / 15) * 15;
        slot.end = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        _renderCalendar();
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function _slotDuration(slot) {
    const [sh, sm] = slot.start.split(':').map(Number);
    const [eh, em] = slot.end.split(':').map(Number);
    return (eh + em / 60) - (sh + sm / 60);
}

async function savePlanning() {
    const acc = state.acces.find(a => a.id === planningAccId);
    if (!acc) return;
    Object.keys(planningSlots).forEach(d => planningSlots[d].sort((a, b) => a.start.localeCompare(b.start)));
    const planning = { slots: planningSlots };
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('access_points').update({ planning }).eq('id', planningAccId);
            if (error) throw error;
        }
        const idx = state.acces.findIndex(a => a.id === planningAccId);
        if (idx !== -1) state.acces[idx].planning = planning;
        closeModal('modal-planning');
        showToast(`✅ Planning enregistré pour ${acc.name}`);
    } catch (err) { showToast('Erreur planning : ' + err.message, 'error'); }
}

function clearPlanning() { if (confirm('Effacer tous les créneaux ?')) { planningSlots = {}; _renderCalendar(); } }

/* ==================================================================
   CHAPITRE 7 : GESTION DES ACCÈS
================================================================== */

function renderAccesList() {
    const container = document.getElementById('list-acces-grid');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'responsive-grid';
    if (!state.acces.length) { container.innerHTML = '<div class="empty-state"><p>Aucun point d\'accès.</p></div>'; return; }
    state.acces.forEach(acc => {
        const card = document.createElement('div');
        card.className = 'card item-card animate-in';
        card.onclick = () => openAccesEdit(acc.id);
        card.innerHTML = `
            <div class="main-info">
                <div class="avatar"><i data-lucide="cpu"></i></div>
                <div>
                    <div style="font-weight:700">${acc.name}</div>
                    <div class="ip-badge"><i data-lucide="network"></i>${acc.ip}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn-small" onclick="event.stopPropagation();openPlanningEditor('${acc.id}')">
                    <i data-lucide="calendar"></i> Planning
                </button>
                <div class="card-arrow"><i data-lucide="chevron-right"></i></div>
            </div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

function openAccesEdit(id) {
    currentEditingId = id;
    const acc = state.acces.find(a => a.id === id);
    if (!acc) return;
    document.getElementById('acces-list-view').style.display = 'none';
    document.getElementById('acces-edit-view').style.display = 'block';
    document.getElementById('edit-acc-name').value = acc.name || '';
    document.getElementById('edit-acc-ip').value   = acc.ip   || '';
    const relayEl = document.getElementById('edit-acc-relay');
    const btEl    = document.getElementById('edit-acc-bt');
    if (relayEl) relayEl.value = acc.relay_id || '1';
    if (btEl)    btEl.value   = acc.bt_name  || '';
    toggleEditMode(false);
}

function closeAccesEdit() {
    document.getElementById('acces-list-view').style.display = 'block';
    document.getElementById('acces-edit-view').style.display = 'none';
}

function toggleEditMode(isEditable) {
    ['edit-acc-name','edit-acc-ip','edit-acc-relay','edit-acc-bt'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isEditable;
    });
    document.getElementById('btn-unlock-edit').style.display = isEditable ? 'none'  : 'block';
    document.getElementById('btn-save-edit').style.display   = isEditable ? 'block' : 'none';
}

async function saveAccesModifications() {
    const updates = {
        name:     document.getElementById('edit-acc-name').value.trim(),
        ip:       document.getElementById('edit-acc-ip').value.trim(),
        relay_id: parseInt(document.getElementById('edit-acc-relay')?.value || 1),
        bt_name:  document.getElementById('edit-acc-bt')?.value.trim() || ''
    };
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('access_points').update(updates).eq('id', currentEditingId);
            if (error) throw error;
        }
        const idx = state.acces.findIndex(a => a.id === currentEditingId);
        if (idx !== -1) Object.assign(state.acces[idx], updates);
        toggleEditMode(false);
        showToast('✅ Accès mis à jour');
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

function openAddAccesForm() {
    ['new-acc-name','new-acc-ip'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    openModal('modal-add-acces');
}

async function createNewAcces() {
    const name = document.getElementById('new-acc-name').value.trim();
    const ip   = document.getElementById('new-acc-ip').value.trim();
    if (!name || !ip) { showToast('Remplissez tous les champs', 'error'); return; }
    if (!supabaseClient) { showToast('Supabase non connecté', 'error'); return; }
    try {
        const entry = { name, ip, relay_id: 1, is_favorite: false, planning: { slots: {} } };
        const { data, error } = await supabaseClient.from('access_points').insert([entry]).select();
        if (error) throw error;
        state.acces.push(data[0]);
        closeModal('modal-add-acces');
        showToast('✅ Accès créé');
        renderAccesList();
    } catch (err) { showToast('Erreur création : ' + err.message, 'error'); }
}

/* ==================================================================
   CHAPITRE 8 : PROFILS & INVITATIONS
================================================================== */

function renderProfilsList() {
    const container = document.getElementById('list-profils-grid');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'responsive-grid';
    const colors = { 'super_admin': '#f0883e', 'Administrateur': 'var(--blue)', 'Régulier': 'var(--green)', 'Visiteur': 'var(--text-muted)' };
    state.profils.forEach(prof => {
        const role  = prof.type || prof.role || 'Régulier';
        const color = colors[role] || 'var(--text-muted)';
        const card  = document.createElement('div');
        card.className = 'card item-card animate-in';
        card.onclick = () => openProfilEdit(prof.id);
        card.innerHTML = `
            <div class="main-info">
                <div class="avatar" style="background:${color}20;color:${color}">
                    <i data-lucide="user"></i>
                </div>
                <div>
                    <div style="font-weight:700">${prof.name}</div>
                    <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
                        <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block"></span>
                        <span style="font-size:.8rem;color:var(--text-sub)">${role}</span>
                        ${prof.expires_at ? `<span style="font-size:.75rem;color:var(--orange)">· ${new Date(prof.expires_at).toLocaleDateString('fr-FR')}</span>` : ''}
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn-small" onclick="event.stopPropagation();resendInvitation('${prof.email}','${prof.name}','${role}','${prof.phone||''}')">
                    <i data-lucide="mail"></i> Inviter
                </button>
                <div class="card-arrow"><i data-lucide="chevron-right"></i></div>
            </div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

function openAddProfilForm() {
    ['new-prof-name','new-prof-email','new-prof-phone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    toggleDateInput();
    openModal('modal-add-profil');
}

function toggleDateInput() {
    const type = document.getElementById('new-prof-type').value;
    const el   = document.getElementById('expiry-date-container');
    if (el) el.style.display = type === 'Visiteur' ? 'block' : 'none';
}

async function createNewProfil() {
    const name   = document.getElementById('new-prof-name').value.trim();
    const email  = document.getElementById('new-prof-email').value.trim();
    const type   = document.getElementById('new-prof-type').value;
    const expiry = document.getElementById('new-prof-expiry')?.value || null;
    if (!name || !email) { showToast('Nom et email requis', 'error'); return; }

    const newProfil = { name, email, phone, type, is_active: true, expires_at: type === 'Visiteur' ? expiry : null };
    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.from('profiles').insert([newProfil]).select();
            if (error) throw error;
            if (data?.[0]) state.profils.push(data[0]);
        } else {
            newProfil.id = Date.now();
            state.profils.push(newProfil);
        }
        await _sendInvitation(email, name, type);
        closeModal('modal-add-profil');
        renderProfilsList();
        showToast(`✅ Profil créé · Invitation envoyée à ${email}`);
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

/* — Invitation : choix du canal — */
function resendInvitation(email, name, role, phone) {
    openInvitationModal({ email, name, role, phone });
}

function openInvitationModal(profil) {
    // Créer ou réutiliser la modale d'invitation
    let modal = document.getElementById('modal-invitation');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-invitation';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const inviteUrl = `${window.location.origin}?setup=1&role=${encodeURIComponent(profil.role)}&name=${encodeURIComponent(profil.name)}`;
    const msg       = `Bonjour ${profil.name}, voici votre lien d'accès Thera Connect : ${inviteUrl}`;
    const msgEnc    = encodeURIComponent(msg);
    const phone     = (profil.phone || '').replace(/\s/g, '');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <h3 style="margin-bottom:6px;">📨 Inviter ${profil.name}</h3>
            <p style="color:var(--text-sub);font-size:.85rem;margin-bottom:20px;">
                Rôle : <strong>${profil.role}</strong><br>
                Choisissez comment envoyer le lien de connexion.
            </p>

            <!-- Lien à copier -->
            <div style="background:var(--card-inner);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
                <code style="font-size:.75rem;font-family:'DM Mono',monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-sub);">${inviteUrl}</code>
                <button class="btn-small" onclick="_copyInviteLink('${inviteUrl}')">Copier</button>
            </div>

            <!-- Boutons canal -->
            <div style="display:flex;flex-direction:column;gap:10px;">

                <!-- Email -->
                ${profil.email ? `
                <a href="mailto:${profil.email}?subject=Votre accès Thera Connect&body=${msgEnc}"
                   style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:var(--radius);border:1.5px solid var(--border);background:white;color:var(--text-main);text-decoration:none;font-weight:600;font-size:.9rem;transition:all .2s;"
                   onmouseover="this.style.borderColor='var(--blue)';this.style.background='rgba(76,156,248,.06)'"
                   onmouseout="this.style.borderColor='var(--border)';this.style.background='white'">
                    <span style="font-size:1.3rem;">📧</span>
                    <div>
                        <div>Envoyer par Email</div>
                        <div style="font-size:.75rem;color:var(--text-muted);font-weight:400">${profil.email}</div>
                    </div>
                </a>` : `<div style="padding:12px;border-radius:var(--radius);background:var(--card-inner);color:var(--text-muted);font-size:.85rem;text-align:center;">Email non renseigné</div>`}

                <!-- SMS -->
                ${phone ? `
                <a href="sms:${phone}?body=${msgEnc}"
                   style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:var(--radius);border:1.5px solid var(--border);background:white;color:var(--text-main);text-decoration:none;font-weight:600;font-size:.9rem;transition:all .2s;"
                   onmouseover="this.style.borderColor='var(--green)';this.style.background='rgba(62,207,142,.06)'"
                   onmouseout="this.style.borderColor='var(--border)';this.style.background='white'">
                    <span style="font-size:1.3rem;">💬</span>
                    <div>
                        <div>Envoyer par SMS</div>
                        <div style="font-size:.75rem;color:var(--text-muted);font-weight:400">${profil.phone}</div>
                    </div>
                </a>` : `<div style="padding:12px;border-radius:var(--radius);background:var(--card-inner);color:var(--text-muted);font-size:.85rem;text-align:center;">Téléphone non renseigné — ajoutez-le dans le profil</div>`}

                <!-- WhatsApp -->
                ${phone ? `
                <a href="https://wa.me/${phone.replace('+','')}?text=${msgEnc}" target="_blank"
                   style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:var(--radius);border:1.5px solid var(--border);background:white;color:var(--text-main);text-decoration:none;font-weight:600;font-size:.9rem;transition:all .2s;"
                   onmouseover="this.style.borderColor='#25d366';this.style.background='rgba(37,211,102,.06)'"
                   onmouseout="this.style.borderColor='var(--border)';this.style.background='white'">
                    <span style="font-size:1.3rem;">🟢</span>
                    <div>
                        <div>Envoyer par WhatsApp</div>
                        <div style="font-size:.75rem;color:var(--text-muted);font-weight:400">${profil.phone}</div>
                    </div>
                </a>` : ''}
            </div>

            <button class="btn-cancel" style="width:100%;margin-top:16px;justify-content:center;" onclick="closeModal('modal-invitation')">Fermer</button>
        </div>`;

    modal.style.display = 'flex';

    // Envoyer aussi l'email Supabase Auth si email présent
    if (profil.email && supabaseClient) {
        supabaseClient.auth.resetPasswordForEmail(profil.email, {
            redirectTo: inviteUrl
        }).catch(() => {});
    }
}

function _copyInviteLink(url) {
    navigator.clipboard?.writeText(url).then(() => showToast('✅ Lien copié !'))
        .catch(() => {
            const el = document.createElement('textarea');
            el.value = url;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            el.remove();
            showToast('✅ Lien copié !');
        });
}

function openProfilEdit(id) {
    currentEditingProfilId = id;
    const prof = state.profils.find(p => p.id === id);
    if (!prof) return;
    document.getElementById('profils-list-view').style.display = 'none';
    document.getElementById('profil-edit-view').style.display  = 'block';
    document.getElementById('edit-prof-name').value   = prof.name   || '';
    document.getElementById('edit-prof-email').value  = prof.email  || '';
    document.getElementById('edit-prof-type').value   = prof.type   || prof.role || 'Régulier';
    document.getElementById('edit-prof-code').value   = prof.code   || '';
    document.getElementById('edit-prof-badge').value  = prof.badge  || '';
    document.getElementById('edit-prof-remote').value = prof.remote || '';
    _renderProfilAccessRights(prof);
    toggleProfilEditMode(false);
}

function _renderProfilAccessRights(prof) {
    const container = document.getElementById('profil-permissions-container');
    if (!container) return;
    const authorized = prof.authorized_access || [];
    container.innerHTML = state.acces.map(acc => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid var(--border)">
            <input type="checkbox" id="perm-${acc.id}" value="${acc.id}"
                ${authorized.includes(acc.id) ? 'checked' : ''} disabled
                style="width:16px;height:16px;accent-color:var(--primary)">
            <span style="font-size:.9rem;flex:1">${acc.name}</span>
            <span class="ip-badge">${acc.ip}</span>
        </label>`).join('') || '<p style="color:var(--text-muted);font-size:.85rem">Aucun accès configuré.</p>';
}

function closeProfilEdit() {
    document.getElementById('profils-list-view').style.display = 'block';
    document.getElementById('profil-edit-view').style.display  = 'none';
}

function toggleProfilEditMode(isEditable) {
    ['edit-prof-name','edit-prof-email','edit-prof-type','edit-prof-code','edit-prof-badge','edit-prof-remote'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isEditable;
    });
    document.querySelectorAll('#profil-permissions-container input[type="checkbox"]').forEach(cb => cb.disabled = !isEditable);
    document.getElementById('btn-unlock-prof').style.display = isEditable ? 'none'  : 'block';
    document.getElementById('btn-save-prof').style.display   = isEditable ? 'block' : 'none';
}

async function saveProfilModifications() {
    const code = document.getElementById('edit-prof-code').value;
    if (state.profils.some(p => p.code === code && p.id !== currentEditingProfilId && code !== '')) {
        showToast('⚠️ Ce code est déjà utilisé', 'error'); return;
    }
    const authorized = Array.from(document.querySelectorAll('#profil-permissions-container input:checked')).map(cb => cb.value);
    const updates = {
        name: document.getElementById('edit-prof-name').value,
        email: document.getElementById('edit-prof-email').value,
        type: document.getElementById('edit-prof-type').value,
        code, badge: document.getElementById('edit-prof-badge').value,
        remote: document.getElementById('edit-prof-remote').value,
        authorized_access: authorized
    };
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('profiles').update(updates).eq('id', currentEditingProfilId);
            if (error) throw error;
        }
        const idx = state.profils.findIndex(p => p.id === currentEditingProfilId);
        if (idx !== -1) Object.assign(state.profils[idx], updates);
        toggleProfilEditMode(false);
        showToast('✅ Profil mis à jour');
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

/* ==================================================================
   CHAPITRE 9 : ALERTES
================================================================== */

function renderAlertsSetup() {
    document.getElementById('alert-setup-view').style.display = 'block';
    document.getElementById('alert-logs-view').style.display  = 'none';
    prepareAlertSetup();
}

function showAlertSubPage(view) {
    document.getElementById('alert-setup-view').style.display = view === 'setup' ? 'block' : 'none';
    document.getElementById('alert-logs-view').style.display  = view === 'logs'  ? 'block' : 'none';
    if (view === 'setup') prepareAlertSetup(); else renderAlertLogs();
}

function prepareAlertSetup() {
    const select = document.getElementById('alert-target-access');
    if (select) select.innerHTML = state.acces.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    const dg = document.getElementById('alert-days-grid');
    if (dg) dg.innerHTML = ['L','M','M','J','V','S','D'].map((d,i) =>
        `<label><input type="checkbox" class="alert-day-check" value="${(i+1)%7}"> ${d}</label>`).join('');
    toggleAlertFields();
}

function toggleAlertFields() {
    const type = document.getElementById('alert-type-select')?.value;
    const fd   = document.getElementById('field-duration');
    const fp   = document.getElementById('field-planning');
    if (!fd || !fp) return;
    const showDur = ['stay_open','hardware_cell'].includes(type);
    fd.style.display = showDur ? 'block' : 'none';
    fp.style.display = showDur ? 'none'  : 'block';
}

async function saveNewAlertRule() {
    const rule = {
        id: Date.now(),
        accessId: document.getElementById('alert-target-access')?.value,
        type:     document.getElementById('alert-type-select')?.value,
        limit:    document.getElementById('alert-limit-time')?.value,
        days:     Array.from(document.querySelectorAll('.alert-day-check:checked')).map(cb => cb.value),
        start:    document.getElementById('alert-start')?.value,
        end:      document.getElementById('alert-end')?.value,
        created:  new Date().toISOString()
    };
    if (supabaseClient) await supabaseClient.from('alert_rules').insert([rule]).catch(() => {});
    state.alertRules.push(rule);
    showToast('✅ Règle d\'alerte enregistrée');
    showAlertSubPage('logs');
}

function addAlertLog(message) {
    state.alertLogs.unshift({ timestamp: new Date(), text: message });
    const limit = new Date();
    limit.setDate(limit.getDate() - 15);
    state.alertLogs = state.alertLogs.filter(l => l.timestamp > limit);
    renderAlertLogs();
}

function renderAlertLogs() {
    const container = document.getElementById('alert-history-list');
    if (!container) return;
    container.innerHTML = state.alertLogs.length
        ? state.alertLogs.map(l => `<div class="alert-item"><small>${new Date(l.timestamp).toLocaleString('fr-FR')}</small><div>${l.text}</div></div>`).join('')
        : '<p style="text-align:center;color:var(--text-muted);padding:24px">Aucune alerte récente.</p>';
}

/* ==================================================================
   CHAPITRE 10 : CLÉS & BADGES
================================================================== */

function setKeyFilter(f) {
    currentKeyFilter = f;
    document.querySelectorAll('.chip').forEach(btn => {
        const map = { all:'Tout', code:'Codes', badge:'Badges', remote:'Télécommandes' };
        btn.classList.toggle('active', btn.textContent.trim() === map[f]);
    });
    renderKeysList();
}

function renderKeysList() {
    const tbody  = document.getElementById('keys-table-body');
    if (!tbody) return;
    const search = document.getElementById('search-key-input')?.value.toLowerCase() || '';
    tbody.innerHTML = '';
    state.profils.forEach(prof => {
        [{ type:'code', val:prof.code, icon:'🔢' },
         { type:'badge', val:prof.badge, icon:'🪪' },
         { type:'remote', val:prof.remote, icon:'📡' }].forEach(k => {
            if (!k.val) return;
            if (currentKeyFilter !== 'all' && k.type !== currentKeyFilter) return;
            if (search && !k.val.toLowerCase().includes(search) && !prof.name.toLowerCase().includes(search)) return;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${k.icon} ${k.type.toUpperCase()}</td>
                <td><code style="font-family:'DM Mono',monospace;font-size:.85rem">${k.val}</code></td>
                <td>${prof.name}</td>
                <td><button class="btn-small" onclick="openProfilEdit('${prof.id}')"><i data-lucide="eye"></i> Voir</button></td>`;
            tbody.appendChild(tr);
        });
    });
    if (!tbody.innerHTML) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">Aucune clé trouvée.</td></tr>';
    if (window.lucide) lucide.createIcons();
}

function filterKeys() { renderKeysList(); }

/* ==================================================================
   CHAPITRE 11 : HISTORIQUE
================================================================== */

function addHistoryEntry(user, access, action, source = 'App') {
    state.historique.unshift({ id: Date.now(), timestamp: new Date(), user, access, action, source });
    const limit = new Date();
    limit.setDate(limit.getDate() - 15);
    state.historique = state.historique.filter(i => new Date(i.timestamp) > limit);
    if (supabaseClient) {
        const acc = state.acces.find(a => a.name === access);
        supabaseClient.from('logs').insert([{
            portal_id: acc?.id || null,
            action,
            operator: user,
            source,
            details: `${access} — ${action}`
        }]).catch(() => {});
    }
}

function renderHistory() {
    const tbody    = document.getElementById('history-table-body');
    const emptyMsg = document.getElementById('history-empty-msg');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!state.historique.length) { if (emptyMsg) emptyMsg.style.display = 'block'; return; }
    if (emptyMsg) emptyMsg.style.display = 'none';
    state.historique.forEach(item => {
        const d  = new Date(item.timestamp);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><small>${d.toLocaleDateString('fr-FR')}</small> <b>${d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</b></td>
            <td>${item.user||'Système'}</td>
            <td>${item.access||'Général'}</td>
            <td><span class="badge-${(item.action||'info').toLowerCase()}">${item.action}</span></td>
            <td><small>${item.source||'App'}</small></td>`;
        tbody.appendChild(tr);
    });
}

function exportHistory() {
    if (!state.historique.length) { showToast('Rien à exporter', 'error'); return; }
    const csv  = 'Date;Heure;Utilisateur;Accès;Action;Source\n' +
        state.historique.map(h => {
            const d = new Date(h.timestamp);
            return `${d.toLocaleDateString('fr-FR')};${d.toLocaleTimeString('fr-FR')};${h.user};${h.access};${h.action};${h.source}`;
        }).join('\n');
    const link = document.createElement('a');
    link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `historique_thera_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

/* ==================================================================
   CHAPITRE 12 : CORBEILLE
================================================================== */

function renderCorbeille() {
    const tbody    = document.getElementById('corbeille-table-body');
    const emptyMsg = document.getElementById('corbeille-empty-msg');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!state.trash.length) { if (emptyMsg) emptyMsg.style.display = 'block'; return; }
    if (emptyMsg) emptyMsg.style.display = 'none';
    state.trash.forEach((item, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge-info">${item.type.toUpperCase()}</span></td>
            <td><b>${item.data?.name||'Sans nom'}</b></td>
            <td><small>${new Date(item.date).toLocaleDateString('fr-FR')}</small></td>
            <td><button class="btn-success btn-small" onclick="restoreFromTrash(${i})"><i data-lucide="rotate-ccw"></i> Restaurer</button></td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}

async function restoreFromTrash(i) {
    const item  = state.trash[i];
    if (!item) return;
    const table = item.type === 'acces' ? 'access_points' : 'profiles';
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from(table).update({ is_deleted: false }).eq('id', item.data.id);
            if (error) throw error;
        }
        if (item.type === 'acces') state.acces.push(item.data);
        else state.profils.push(item.data);
        state.trash.splice(i, 1);
        showToast('✅ Élément restauré');
        renderCorbeille();
    } catch (err) { showToast('Erreur restauration : ' + err.message, 'error'); }
}

function deleteCurrentAcces()  { if (confirm('Envoyer à la corbeille ?')) _deleteToTrash('acces',  currentEditingId); }
function deleteCurrentProfil() { if (confirm('Envoyer à la corbeille ?')) _deleteToTrash('profil', currentEditingProfilId); }

async function _deleteToTrash(type, id) {
    const list  = type === 'acces' ? state.acces : state.profils;
    const table = type === 'acces' ? 'access_points' : 'profiles';
    const idx   = list.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item  = list[idx];
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from(table).update({ is_deleted: true }).eq('id', id);
            if (error) throw error;
        }
        state.trash.push({ type, date: new Date().toISOString(), data: item });
        list.splice(idx, 1);
        showToast('🗑️ Déplacé dans la corbeille');
        showPage(type === 'acces' ? 'page-acces' : 'page-profils');
    } catch (err) { showToast('Erreur suppression : ' + err.message, 'error'); }
}

/* ==================================================================
   CHAPITRE 13 : SYSTÈME & RÉGLAGES
================================================================== */

function renderSystemModules() {
    const container = document.getElementById('system-modules-list');
    if (!container) return;
    container.innerHTML = '';
    state.acces.forEach(acc => {
        const div = document.createElement('div');
        div.className = 'card-inner';
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
        div.innerHTML = `
            <div>
                <strong>${acc.name}</strong><br>
                <small style="font-family:'DM Mono',monospace">IP: ${acc.ip} · Relay: ${acc.relay_id||1}</small>
                ${acc.bt_name ? `<br><small>BT: ${acc.bt_name}</small>` : ''}
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn-outline btn-small" onclick="pingModule('${acc.ip}')">Ping</button>
                <button class="btn-small" onclick="rebootModule('${acc.name}','${acc.ip}')">Reboot</button>
            </div>`;
        container.appendChild(div);
    });
}

async function pingModule(ip) {
    showToast(`📡 Ping ${ip}...`, 'info');
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 3000);
        await fetch(`http://${ip}/`, { signal: ctrl.signal, mode: 'no-cors' });
        showToast(`✅ ${ip} répond`, 'success');
    } catch { showToast(`❌ ${ip} injoignable`, 'error'); }
}

function rebootModule(name, ip) {
    if (!confirm(`Redémarrer "${name}" (${ip}) ?`)) return;
    fetch(`http://${ip}/reboot`, { mode: 'no-cors' }).catch(() => {});
    showToast(`🔄 Reboot envoyé à ${name}`);
}

function restartApp() { if (confirm('Recharger l\'application ?')) location.reload(); }

function saveAppSettings() {
    const name = document.getElementById('setting-app-name').value;
    const logo = document.getElementById('setting-app-logo').value;
    if (name) { document.querySelector('.logo-text').innerHTML = name; document.title = name; }
    if (logo) { document.body.style.backgroundImage = `url('${logo}')`; document.body.style.backgroundSize = 'cover'; }
    showToast('✨ Apparence mise à jour');
}

function saveSupabaseConfig() {
    const url = document.getElementById('sb-url').value.trim();
    const key = document.getElementById('sb-key').value.trim();
    if (!url || !key) { showToast('Remplissez les deux champs', 'error'); return; }
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_key', key);
    initSupabase(url, key);
    showToast('💾 Configuration enregistrée');
}

function testCloudConnection() {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (!url || !key) { showToast('Aucune config', 'error'); return; }
    const client = supabase.createClient(url, key);
    client.from('access_points').select('id').limit(1)
        .then(({ error }) => showToast(error ? `❌ ${error.message}` : '✅ Connexion réussie !', error ? 'error' : 'success'));
}

/* ==================================================================
   CHAPITRE 14 : TOAST
================================================================== */

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    if (!document.getElementById('toast-style')) {
        const s = document.createElement('style');
        s.id = 'toast-style';
        s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateY(8px) scale(.95)}to{opacity:1;transform:none}}';
        document.head.appendChild(s);
    }
    const colors = { success:'#3ecf8e', error:'#f85149', info:'#4c9cf8' };
    const toast   = document.createElement('div');
    toast.style.cssText = `background:${colors[type]||colors.success};color:white;padding:11px 18px;border-radius:10px;font-size:.87rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:320px;animation:toastIn .3s cubic-bezier(.34,1.56,.64,1) both;pointer-events:auto;`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.cssText += 'opacity:0;transition:opacity .3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

/* ==================================================================
   INIT
================================================================== */

window.onload = async () => {
    console.log('🚀 Thera Connect v3');
    if (window.lucide) lucide.createIcons();
};
