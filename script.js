/* ==================================================================
   THERA CONNECT — script.js v4.0
================================================================== */

/* ==================================================================
   ÉTAT GLOBAL
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

// Navigation
let pageHistory = ['page-accueil'];

// Planning calendrier
let planningAccId    = null;
let planningSlots    = {};
let planningDragData = null;
const SLOT_H = 40;
const DAYS   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/* ==================================================================
   SUPABASE
================================================================== */
function initSupabase(url, key) {
    if (!url || !key) return;
    supabaseClient = supabase.createClient(url, key);
    console.log('🔌 Supabase initialisé');
}

/* ==================================================================
   BARRE NAVIGATION MOBILE — hide/show au scroll
================================================================== */
function setBottomNavActive(id) {
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

(function initBottomNavScroll() {
    let lastY = 0, ticking = false;
    window.addEventListener('scroll', function () {
        if (!ticking) {
            requestAnimationFrame(function () {
                const nav = document.getElementById('bottom-nav');
                if (nav) {
                    const y = window.scrollY;
                    if (y > lastY + 10)      nav.classList.add('hidden');
                    else if (y < lastY - 5)  nav.classList.remove('hidden');
                    lastY = y;
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
})();

/* ==================================================================
   INIT AU CHARGEMENT
================================================================== */
window.addEventListener('DOMContentLoaded', () => {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    initSupabase(url || 'https://dekxcxlremxaynpezgmr.supabase.co', key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRla3hjeGxyZW14YXlucGV6Z21yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzMwMTQsImV4cCI6MjA5MDk0OTAxNH0.nQPQSQc4M7TVVFdlCWiqbpJ60V26a7EVS1h-RWHuEpI');
    loadAllData();
    setTimeout(checkCloudStatus, 1000); // Initial cloud status check
    startCloudHealthPolling();
});

/* ==================================================================
   CHARGEMENT DONNÉES
================================================================== */
async function loadAllData() {
    if (!supabaseClient) return;
    try {
        const [
            { data: accesData,   error: e1 },
            { data: profilsData, error: e2 }
        ] = await Promise.all([
            supabaseClient.from('access_points').select('*'),
            supabaseClient.from('profiles').select('*')
        ]);

        if (e1) throw e1;
        if (e2) throw e2;

        state.acces   = (accesData   || []).filter(a => !a.is_deleted);
        state.profils = (profilsData || []).filter(p => !p.is_deleted);
        state.trash   = [
            ...(accesData   || []).filter(a =>  a.is_deleted).map(a => ({ type: 'acces',  data: a, date: new Date() })),
            ...(profilsData || []).filter(p =>  p.is_deleted).map(p => ({ type: 'profil', data: p, date: new Date() }))
        ];

        const { data: rules } = await supabaseClient.from('alert_rules').select('*').then(r=>r).catch(() => ({ data: [] }));
        if (rules) state.alertRules = rules;

        // Logs 15 jours glissants
        const since15d = new Date(Date.now() - 15 * 86400000).toISOString();
        const { data: logsData } = await supabaseClient.from('logs')
            .select('*').gte('created_at', since15d)
            .order('created_at', { ascending: false }).limit(300)
            .then(r=>r)
            .catch(() => ({ data: [] }));

    // Load module status for favorites
    try {
        const { data: msData } = await supabaseClient.from('module_status').select('*').then(r=>r);
        state.moduleStatus = msData || [];
    } catch(e) { state.moduleStatus = []; }
    
        if (logsData) {
            state.historique = logsData.map(l => ({
                id: l.id, timestamp: l.created_at,
                user: l.operator, access: l.details,
                action: l.action, source: l.source
            }));
        }

        // Stats dashboard
        const statAcces = document.getElementById('stat-acces');
        if (statAcces) statAcces.textContent = state.acces.length;
        const statAlertes = document.getElementById('stat-alertes');
        if (statAlertes) {
            const since24h = new Date(Date.now() - 86400000);
            statAlertes.textContent = state.alertLogs.filter(l => new Date(l.timestamp) > since24h).length;
        }
        _updateAlertBadge();
        startRealtimeFeatures();

        console.log('✅ Données chargées :', state.acces.length, 'accès,', state.profils.length, 'profils');
    } catch (err) {
        console.error('loadAllData:', err.message);
        showToast('Erreur chargement : ' + err.message, 'error');
    }
}

/* ==================================================================
   PERMISSIONS & RÔLES
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

    } else if (role === 'régulier' || role === 'regulier') {
        _applyRestrictedView(navButtons);

    } else if (role === 'visiteur') {
        _applyRestrictedView(navButtons);
        if (expiryDate) {
            const exp  = new Date(expiryDate);
            const diff = Math.round((exp - Date.now()) / 3600000);
            let notice = document.getElementById('expiry-notice-permanent');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'expiry-notice-permanent';
                notice.className = 'expiry-notice';
                notice.style.cssText = 'position:sticky;top:0;z-index:500;margin:-36px -40px 24px;border-radius:0;';
                contentArea.insertAdjacentElement('afterbegin', notice);
            }
            notice.innerHTML = `⏱️ Accès temporaire · Expire le <strong>${exp.toLocaleString('fr-FR')}</strong>${diff > 0 && diff < 72 ? ` · <span style="color:var(--red)">dans ${diff}h</span>` : diff <= 0 ? ' · <span style="color:var(--red)">EXPIRÉ</span>' : ''}`;
        }
    }
}

function _applyRestrictedView(navButtons) {
    navButtons.forEach(btn => {
        if (!(btn.getAttribute('onclick') || '').includes('page-accueil'))
            btn.classList.add('admin-only');
    });
    document.querySelector('.main-layout')?.classList.add('sidebar-hidden');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) mobileBtn.style.display = 'none';
    ['bnav-acces','bnav-profils'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function _injectSuperAdminBadge() {
    const header = document.querySelector('.sidebar-header');
    if (!header || header.querySelector('.super-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'super-badge';
    badge.style.cssText = 'margin-top:8px;padding:3px 10px;border-radius:99px;background:linear-gradient(135deg,#f0883e,#e05c1a);color:white;font-size:.7rem;font-weight:700;letter-spacing:.08em;display:inline-flex;align-items:center;box-shadow:0 2px 8px rgba(240,136,62,.4);';
    badge.textContent = '★ SUPER ADMIN';
    header.appendChild(badge);
}

function getCurrentRole() {
    const p = typeof getCurrentProfil === 'function' ? getCurrentProfil() : null;
    return (p?.type || 'visiteur').toLowerCase().replace(/\s/g, '_');
}

function isAdmin() {
    const r = getCurrentRole();
    return r === 'administrateur' || r === 'super_admin';
}

/* ==================================================================
   NAVIGATION
================================================================== */
const _bnavMap = {
    'page-accueil': 'bnav-accueil',
    'page-acces':   'bnav-acces',
    'page-profils': 'bnav-profils'
};

function showPage(pageId, _addHistory = true) {
    if (_addHistory && pageHistory[pageHistory.length - 1] !== pageId)
        pageHistory.push(pageId);

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    // Sync sidebar
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((btn.getAttribute('onclick') || '').includes(pageId)) btn.classList.add('active');
    });

    // Sync bottom-nav
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    const bnavId = _bnavMap[pageId];
    if (bnavId) { const el = document.getElementById(bnavId); if (el) el.classList.add('active'); }

    switch (pageId) {
        case 'page-accueil':    renderAccueil();       break;
        case 'page-acces':      renderAccesList();     break;
        case 'page-profils':    renderProfilsList();   break;
        case 'page-cles':       renderKeysList();      break;
        case 'page-historique': renderHistory();       break;
        case 'page-alerts':     renderAlertsSetup();   break;
        case 'page-corbeille':  renderCorbeille();     break;
        case 'page-systeme':    renderSystemModules(); break;
        case 'page-reglages': {
            const sbUrl = document.getElementById('sb-url');
            const sbKey = document.getElementById('sb-key');
            if (sbUrl) sbUrl.value = localStorage.getItem('supabase_url') || '';
            if (sbKey) sbKey.value = localStorage.getItem('supabase_key') || '';
            break;
        }
    }

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    const btnBack = document.getElementById('btn-back');
    if (btnBack) btnBack.style.display = pageHistory.length > 1 ? 'block' : 'none';

    // Sync bottom navigation bar
    const _navIds = {'page-accueil':'bnav-accueil','page-acces':'bnav-acces','page-profils':'bnav-profils'};
    if (_navIds[pageId]) setBottomNavActive(_navIds[pageId]);
        if (window.lucide) lucide.createIcons();
}

function goBack() {
    if (pageHistory.length > 1) pageHistory.pop();
    showPage(pageHistory[pageHistory.length - 1], false);
}

function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('open');
}

function openModal(id)  { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

/* ==================================================================
   TABLEAU DE BORD
================================================================== */
function renderAccueil() {
    const role   = getCurrentRole();
    const profil = typeof getCurrentProfil === 'function' ? getCurrentProfil() : null;

    if (role === 'super_admin' || role === 'administrateur') {
        const statAcces = document.getElementById('stat-acces');
        if (statAcces) statAcces.textContent = state.acces.length;
        renderFavorites();
    } else {
        _renderUserDashboard(profil);
    }
}

function _renderUserDashboard(profil) {
    const container = document.getElementById('favorites-container');
    if (!container) return;
    container.innerHTML = '';

    const authorizedIds = profil?.authorized_access || [];
    const myAccess = authorizedIds.length > 0
        ? state.acces.filter(a => authorizedIds.includes(a.id))
        : state.acces;

    if (!myAccess.length) {
        container.innerHTML = '<div class="empty-state"><p>Aucun accès autorisé pour votre profil.</p></div>';
        return;
    }

    myAccess.forEach(acc => {
        const allowed = _isAccessAllowedNow(acc);
        const card    = document.createElement('div');
        card.className = 'card access-tile animate-in';
        card.style.borderLeftColor = allowed ? 'var(--green)' : 'var(--border)';
        card.innerHTML = `
            <div class="tile-header"><div class="tile-info">
                <h4>${acc.name}</h4>
                <span style="font-size:.78rem;color:${allowed ? 'var(--green)' : 'var(--text-muted)'}">
                    ${allowed ? '✅ Accès autorisé' : '⏰ Hors plage horaire'}
                </span>
            </div></div>
            <div class="tile-body"><div class="ip-badge"><i data-lucide="network"></i> ${acc.ip}</div></div>
            <div class="tile-actions">
                ${allowed
                    ? `<button class="btn-action-primary" onclick="openControlModal('${acc.id}','${acc.name}')"><i data-lucide="unplug"></i> Contrôler</button>`
                    : `<span style="font-size:.8rem;color:var(--text-muted)">Non disponible</span>`}
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
        container.innerHTML = '<div class="empty-state"><p>Aucun accès en favori. Ajoutez des étoiles ★ dans la page Accès.</p></div>';
        return;
    }

    const title = document.createElement('h3');
    title.textContent = '★ Accès favoris';
    title.style.marginBottom = '12px';
    container.appendChild(title);

    favs.forEach(acc => {
        // Determine real status from module_status
        const modStatus = state.moduleStatus ? state.moduleStatus.find(m => m.access_id === acc.id) : null;
        let statusLabel = 'DÉFAUT';
        let statusClass = 'status-defaut';
        let statusColor = '#888';

        if (modStatus) {
            if (modStatus.is_open === true) {
                statusLabel = 'OUVERT';
                statusClass = 'status-ouvert';
                statusColor = 'var(--orange, #f0883e)';
            } else if (modStatus.is_open === false && !modStatus.has_fault) {
                statusLabel = 'FERMÉ';
                statusClass = 'status-ferme';
                statusColor = 'var(--green, #3fb950)';
            } else if (modStatus.has_fault) {
                statusLabel = 'DÉFAUT';
                statusClass = 'status-defaut';
                statusColor = '#e74c3c';
            }
        } else {
            // Try to guess from last known state
            statusLabel = '—';
            statusColor = '#888';
        }

        const card = document.createElement('div');
        card.className = 'card item-card animate-in';
        card.style.cursor = 'pointer';
        card.onclick = () => openFavoriteModal(acc.id);
        card.innerHTML = `
            <div class="main-info">
                <div class="avatar" style="background:${statusColor}20;color:${statusColor}">
                    <i data-lucide="door-open"></i>
                </div>
                <div>
                    <div style="font-weight:700">${acc.name}</div>
                    <div class="ip-badge"><i data-lucide="network"></i>${acc.ip || '—'}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <span class="status-pill ${statusClass}" style="background:${statusColor}20;color:${statusColor};padding:3px 10px;border-radius:12px;font-size:.8rem;font-weight:600">
                    ${statusLabel}
                </span>
                <div class="card-arrow"><i data-lucide="chevron-right"></i></div>
            </div>`;
        container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

function openFavoriteModal(accId) {
    const acc = state.acces.find(a => a.id === accId);
    if (!acc) return;

    const modStatus = state.moduleStatus ? state.moduleStatus.find(m => m.access_id === accId) : null;
    const isOpen = modStatus ? modStatus.is_open : false;

    // Create modal overlay
    let overlay = document.getElementById('fav-modal-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'fav-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="card shadow" style="min-width:280px;max-width:360px;width:90%;padding:24px;border-radius:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h3 style="margin:0">${acc.name}</h3>
                <button onclick="document.getElementById('fav-modal-overlay').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-muted)">×</button>
            </div>
            <p style="color:var(--text-sub);font-size:.9rem;margin-bottom:20px">
                Statut actuel : <strong>${isOpen ? 'OUVERT' : modStatus ? 'FERMÉ' : '—'}</strong>
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <button class="btn-primary" onclick="confirmFavoriteCommand('${accId}', 'open')" style="padding:14px;font-size:1rem">
                    🔓 OUVRIR
                </button>
                <button class="btn-danger" onclick="confirmFavoriteCommand('${accId}', 'close')" style="padding:14px;font-size:1rem">
                    🔒 FERMER
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
}

function confirmFavoriteCommand(accId, action) {
    const acc = state.acces.find(a => a.id === accId);
    if (!acc) return;
    const label = action === 'open' ? 'ouvrir' : 'fermer';
    if (!confirm(`Confirmer : ${label} "${acc.name}" ?`)) return;

    document.getElementById('fav-modal-overlay')?.remove();

    // Send command
    const relay = acc.relay || 1;
    const cmd = action === 'open' ? 'open' : 'close';
    _sendHttpCommand(acc.ip, relay, cmd);
    showToast(`✓ Commande ${label} envoyée`);

    // Update local status optimistically
    if (!state.moduleStatus) state.moduleStatus = [];
    let mod = state.moduleStatus.find(m => m.access_id === accId);
    if (!mod) { mod = { access_id: accId }; state.moduleStatus.push(mod); }
    mod.is_open = action === 'open';
    mod.has_fault = false;

    // Re-render favorites after a short delay
    setTimeout(renderFavorites, 800);
}

/* ==================================================================
   COMMANDES ESP32 — Modale + Slider de confirmation
================================================================== */
function openControlModal(accId, accName) {
    currentTargetId = accId;
    const el = document.getElementById('modal-title-target');
    if (el) el.textContent = accName;
    // Réinitialiser l'état de la modale
    const btns = document.getElementById('modal-btns');
    const wrap = document.getElementById('modal-slider-wrap');
    if (btns) btns.style.display = 'flex';
    if (wrap) wrap.style.display = 'none';
    _resetSlider();
    openModal('modal-control');
}

function startOpenSlider() {
    document.getElementById('modal-btns').style.display = 'none';
    document.getElementById('modal-slider-wrap').style.display = 'block';
    _resetSlider();
    _initSlider();
}

function _resetSlider() {
    const thumb = document.getElementById('slider-thumb');
    const fill  = document.getElementById('slider-fill');
    const label = document.getElementById('slider-label');
    if (!thumb) return;
    thumb.style.transition = '';
    fill.style.transition  = '';
    thumb.style.transform  = 'translateX(0)';
    fill.style.width       = '0px';
    fill.style.background  = 'var(--primary)';
    if (label) { label.textContent = 'Glissez pour ouvrir →'; label.style.opacity = '1'; label.style.color = ''; }
}

function _initSlider() {
    const track = document.getElementById('slider-track');
    const thumb = document.getElementById('slider-thumb');
    const fill  = document.getElementById('slider-fill');
    const label = document.getElementById('slider-label');
    if (!track || !thumb) return;

    let dragging = false;
    let startX   = 0;
    let completed = false;
    const maxX   = track.offsetWidth - thumb.offsetWidth - 4;

    function setPos(raw) {
        if (completed) return;
        const x = Math.max(0, Math.min(raw, maxX));
        thumb.style.transform = `translateX(${x}px)`;
        fill.style.width      = `${x + thumb.offsetWidth / 2}px`;
        const pct = x / maxX;
        if (label) label.style.opacity = Math.max(0, 1 - pct * 2);
        if (pct >= 0.9) complete();
    }

    function complete() {
        completed = true;
        thumb.style.transform = `translateX(${maxX}px)`;
        fill.style.width      = '100%';
        fill.style.background = 'var(--green)';
        if (label) { label.textContent = 'Confirmé ✅'; label.style.opacity = '1'; label.style.color = 'white'; }
        navigator.vibrate?.(60);
        cleanup();
        setTimeout(() => {
            closeModal('modal-control');
            _executeCommand('OUVRIR');
        }, 450);
    }

    function reset() {
        thumb.style.transition = 'transform 0.4s var(--ease)';
        fill.style.transition  = 'width 0.4s var(--ease)';
        thumb.style.transform  = 'translateX(0)';
        fill.style.width       = '0px';
        if (label) { label.style.opacity = '1'; }
        setTimeout(() => { thumb.style.transition = ''; fill.style.transition = ''; }, 420);
    }

    function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        setPos(clientX - startX);
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        if (!completed) {
            const x = parseFloat(thumb.style.transform.replace('translateX(', '')) || 0;
            if (x / maxX < 0.9) reset();
        }
        cleanup();
    }

    function onDown(e) {
        dragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const cur     = parseFloat(thumb.style.transform.replace('translateX(', '')) || 0;
        startX = clientX - cur;
        thumb.style.transition = '';
        fill.style.transition  = '';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend',  onUp);
    }

    function cleanup() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onUp);
    }

    thumb.addEventListener('mousedown',  onDown);
    thumb.addEventListener('touchstart', onDown, { passive: true });
}

async function _executeCommand(action) {
    const acc = state.acces.find(a => a.id === currentTargetId);
    if (!acc) return;

    const httpOk = await _sendHttpCommand(acc, action);
    if (!httpOk) {
        showToast('WiFi indisponible — tentative Bluetooth...', 'info');
        const btOk = await _sendBluetoothCommand(acc, action);
        if (!btOk) {
            navigator.vibrate?.([200, 100, 200]);
            showToast(`Commande ${action} échouée`, 'error');
            return;
        }
    }

    const newStatus = action === 'OUVRIR' ? 'ouvert' : 'ferme';
    if (supabaseClient) {
        await supabaseClient.from('access_points').update({ status: newStatus }).eq('id', acc.id).then(r=>r).catch(() => {});
    }
    const idx = state.acces.findIndex(a => a.id === acc.id);
    if (idx !== -1) state.acces[idx].status = newStatus;

    const profil = typeof getCurrentProfil === 'function' ? getCurrentProfil() : null;
    addHistoryEntry(profil?.name || 'Système', acc.name, action, httpOk ? 'WiFi' : 'Bluetooth');
    navigator.vibrate?.(60);
    showToast(`✅ ${acc.name} — ${action}`, 'success');
    renderAccueil();
}

async function confirmCommand(action) {
    // Appelé uniquement pour FERMER (OUVRIR passe par le slider)
    closeModal('modal-control');
    await _executeCommand(action);
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
    } catch { return false; }
}

async function _sendBluetoothCommand(acc, action) {
    if (!navigator.bluetooth) return false;
    try {
        if (!bluetoothDevice?.gatt?.connected) {
            bluetoothDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: acc.bt_name || 'KC868' }],
                optionalServices: [BT_SERVICE_UUID]
            });
            const server    = await bluetoothDevice.gatt.connect();
            const service   = await server.getPrimaryService(BT_SERVICE_UUID);
            bluetoothCharac = await service.getCharacteristic(BT_CHAR_UUID);
        }
        const cmd = action === 'OUVRIR'
            ? `RELAY:${acc.relay_id || 1}:ON\r\n`
            : `RELAY:${acc.relay_id || 1}:OFF\r\n`;
        await bluetoothCharac.writeValue(new TextEncoder().encode(cmd));
        return true;
    } catch { bluetoothDevice = null; return false; }
}

/* ==================================================================
   PLANNING CALENDRIER
================================================================== */
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
                ${Array.from({length:24},(_,h)=>`<div class="cal-hour-label" style="height:${SLOT_H}px">${String(h).padStart(2,'0')}:00</div>`).join('')}
            </div>
            ${DAYS.map((day,di) => `
                <div class="cal-day-col" style="position:relative;height:${24*SLOT_H}px"
                    ondragover="event.preventDefault()"
                    ondrop="_calDrop(event,${di})">
                    ${Array.from({length:24},(_,h)=>`<div class="cal-grid-line" style="top:${h*SLOT_H}px" ondblclick="_calAddSlot(${di},${h})"></div>`).join('')}
                    ${_renderDaySlots(di)}
                </div>`).join('')}
        </div>`;
    const header = document.getElementById('planning-calendar-header');
    if (header) {
        header.innerHTML = `<div style="width:52px"></div>${DAYS.map(d=>`<div class="cal-th-day">${d}</div>`).join('')}`;
    }
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
                ondragstart="_calDragStart(event,${di},${i})">
                <span class="cal-slot-label">${slot.start}<br><small>${slot.end}</small></span>
                <button class="cal-slot-del" onclick="event.stopPropagation();_calDeleteSlot(${di},${i})">×</button>
                <div class="cal-slot-resize" onmousedown="_calResizeStart(event,${di},${i})"></div>
            </div>`;
    }).join('');
}

function _calAddSlot(di, h) {
    if (!planningSlots[di]) planningSlots[di] = [];
    planningSlots[di].push({ start:`${String(h).padStart(2,'0')}:00`, end:`${String(Math.min(h+2,23)).padStart(2,'0')}:00` });
    _renderCalendar();
}

function _calDeleteSlot(di, i) { planningSlots[di].splice(i,1); _renderCalendar(); }
function _calDragStart(e, di, i) { planningDragData = { di, i }; e.dataTransfer.effectAllowed = 'move'; }

function _calDrop(e, targetDay) {
    e.preventDefault();
    if (!planningDragData) return;
    const { di: src, i } = planningDragData;
    const slot = planningSlots[src]?.[i];
    if (!slot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newH = Math.max(0, Math.min(22, Math.floor((e.clientY - rect.top) / SLOT_H)));
    const dur  = _slotDuration(slot);
    planningSlots[src].splice(i, 1);
    if (!planningSlots[targetDay]) planningSlots[targetDay] = [];
    planningSlots[targetDay].push({ start:`${String(newH).padStart(2,'0')}:00`, end:`${String(Math.min(newH+dur,24)).padStart(2,'0')}:00` });
    planningDragData = null;
    _renderCalendar();
}

function _calResizeStart(e, di, i) {
    e.preventDefault(); e.stopPropagation();
    const startY    = e.clientY;
    const slot      = planningSlots[di][i];
    const [eh, em]  = slot.end.split(':').map(Number);
    const startEnd  = eh + em / 60;
    const [sh]      = slot.start.split(':').map(Number);
    const onMove    = ev => {
        const newEnd = Math.max(sh + 0.5, Math.min(24, startEnd + (ev.clientY - startY) / SLOT_H));
        const h = Math.floor(newEnd);
        const m = Math.round((newEnd - h) * 60 / 15) * 15;
        slot.end = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        _renderCalendar();
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
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
    Object.keys(planningSlots).forEach(d => planningSlots[d].sort((a,b) => a.start.localeCompare(b.start)));
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
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

function clearPlanning() {
    if (confirm('Effacer tous les créneaux ?')) { planningSlots = {}; _renderCalendar(); }
}

/* ==================================================================
   GESTION DES ACCÈS
================================================================== */
function renderAccesList() {
    const container = document.getElementById('list-acces-grid');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'responsive-grid';
    if (!state.acces.length) {
        container.innerHTML = '<div class="empty-state"><p>Aucun point d\'accès configuré.</p></div>';
        return;
    }
    state.acces.forEach(acc => {
        const onlineDot = acc._online === true  ? '<span style="color:var(--green);font-size:.7rem">●</span>'
                        : acc._online === false ? '<span style="color:var(--red);font-size:.7rem">●</span>' : '';
        const card = document.createElement('div');
        card.className = 'card item-card animate-in';
        card.onclick = () => openAccesEdit(acc.id);
        card.innerHTML = `
            <div class="main-info">
                <div class="avatar"><i data-lucide="cpu"></i></div>
                <div>
                    <div style="font-weight:700">${acc.name} ${onlineDot}</div>
                    <div class="ip-badge"><i data-lucide="network"></i>${acc.ip || '—'}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn-small" onclick="event.stopPropagation();toggleFavorite('${acc.id}')"
                    title="${acc.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}"
                    style="color:${acc.is_favorite ? 'var(--orange)' : 'var(--text-muted)'};">★</button>
                <button class="btn-small" onclick="event.stopPropagation();openPlanningEditor('${acc.id}')">
                    <i data-lucide="calendar"></i>
                </button>
                <div class="card-arrow"><i data-lucide="chevron-right"></i></div>
            </div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

async function toggleFavorite(id) {
    const acc = state.acces.find(a => a.id === id);
    if (!acc) return;
    const newVal = !acc.is_favorite;
    if (supabaseClient) {
        const { error } = await supabaseClient.from('access_points').update({ is_favorite: newVal }).eq('id', id);
        if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    }
    acc.is_favorite = newVal;
    showToast(newVal ? '★ Ajouté aux favoris' : '☆ Retiré des favoris');
    renderAccesList();
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
    if (relayEl) relayEl.value = acc.relay_id || '1';
    toggleEditMode(false);
    renderESP32StatusPanel(acc);
}

function closeAccesEdit() {
    document.getElementById('acces-list-view').style.display = 'block';
    document.getElementById('acces-edit-view').style.display = 'none';
}

function toggleEditMode(isEditable) {
    ['edit-acc-name','edit-acc-ip','edit-acc-relay'].forEach(id => {
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
        relay_id: parseInt(document.getElementById('edit-acc-relay')?.value || 1)
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
    const n = document.getElementById('new-acc-name');
    const i = document.getElementById('new-acc-ip');
    if (n) n.value = '';
    if (i) i.value = '';
    openModal('modal-add-acces');
}

function _validateIP(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
        ip.split('.').every(n => parseInt(n) <= 255);
}

function createNewAcces() {
    const name = document.getElementById('new-acc-name').value.trim();
    const ip   = document.getElementById('new-acc-ip').value.trim();
    if (!name || !ip)     { showToast('Remplissez tous les champs', 'error'); return; }
    if (!_validateIP(ip)) { showToast('Format IP invalide (ex: 192.168.1.10)', 'error'); return; }
    if (!supabaseClient)  { showToast('Supabase non connecté', 'error'); return; }

    const entry = { name, ip, relay_id: 1, is_favorite: false, is_deleted: false, planning: { slots: {} } };
    showToast('Création en cours...', 'info');

    supabaseClient.from('access_points').insert([entry]).select()
        .then(({ data, error }) => {
            if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
            state.acces.push(data[0]);
            closeModal('modal-add-acces');
            showToast('✅ Accès créé');
            renderAccesList();
        })
        .then(r=>r)
        .catch(err => showToast('Erreur : ' + err.message, 'error'));
}

function deleteCurrentAcces() {
    if (confirm('Envoyer à la corbeille ?')) _deleteToTrash('acces', currentEditingId);
}

/* ==================================================================
   CONNEXION ESP32
================================================================== */
function renderESP32StatusPanel(acc) {
    const panel = document.getElementById('esp32-status-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
            <div class="esp32-badge" id="esp-badge-wifi">📶 WiFi</div>
            <div class="esp32-badge" id="esp-badge-ip">🌐 IP</div>
            <div class="esp32-badge" id="esp-badge-relay">⚡ Relais</div>
        </div>
        <div id="esp32-info-line" style="font-size:.78rem;color:var(--text-muted);min-height:18px;"></div>`;
    if (acc.ip) pingCurrentAcces();
}

async function pingCurrentAcces() {
    const acc = state.acces.find(a => a.id === currentEditingId);
    if (!acc?.ip) return;

    _setESPBadge('wifi',  'pending', '📶 …');
    _setESPBadge('ip',    'pending', '🌐 …');
    _setESPBadge('relay', 'pending', '⚡ …');

    const infoLine = document.getElementById('esp32-info-line');
    if (infoLine) infoLine.textContent = `Ping ${acc.ip}...`;

    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`http://${acc.ip}/status`, { signal: ctrl.signal, mode: 'cors' }).then(r=>r).catch(() => null);

        if (!res || !res.ok) throw new Error('hors ligne');
        const data = await res.json().then(r=>r).catch(() => null);

        _setESPBadge('wifi',  'ok', '📶 WiFi ✅');
        _setESPBadge('ip',    'ok', `🌐 ${acc.ip} ✅`);
        _setESPBadge('relay', 'ok', `⚡ ${data?.relays?.[0]?.state || 'ok'}`);
        if (infoLine) infoLine.textContent = `RSSI : ${data?.rssi ?? '—'} dBm · Réponse OK`;

        const idx = state.acces.findIndex(a => a.id === currentEditingId);
        if (idx !== -1) state.acces[idx]._online = true;
    } catch {
        _setESPBadge('wifi',  'err', '📶 ❌');
        _setESPBadge('ip',    'err', '🌐 ❌');
        _setESPBadge('relay', 'err', '⚡ —');
        if (infoLine) infoLine.textContent = 'Hors ligne ou IP incorrecte';
        const idx = state.acces.findIndex(a => a.id === currentEditingId);
        if (idx !== -1) state.acces[idx]._online = false;
    }
}

function _setESPBadge(name, status, label) {
    const el = document.getElementById(`esp-badge-${name}`);
    if (!el) return;
    el.textContent = label;
    el.className   = 'esp32-badge esp32-badge--' + status;
}

async function scanBLE() {
    if (!navigator.bluetooth) { showToast('Bluetooth non supporté sur ce navigateur', 'error'); return; }
    const resultsEl = document.getElementById('ble-scan-results');
    if (resultsEl) { resultsEl.style.display = 'block'; resultsEl.innerHTML = '<em style="font-size:.82rem;color:var(--text-muted)">Scan en cours…</em>'; }
    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [BT_SERVICE_UUID]
        });
        if (resultsEl) resultsEl.innerHTML = `
            <div class="esp32-ble-device">
                <span>🔵 <strong>${device.name || 'Appareil sans nom'}</strong></span>
                <button class="btn-small" onclick="showToast('Appareil BLE sélectionné : ${device.name}')">Sélectionner</button>
            </div>`;
    } catch {
        if (resultsEl) resultsEl.innerHTML = '<em style="font-size:.82rem;color:var(--text-muted)">Scan annulé.</em>';
    }
}

/* ==================================================================
   GESTION DES PROFILS
================================================================== */
function renderProfilsList() {
    const container = document.getElementById('list-profils-grid');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'responsive-grid';
    const colors = { 'super_admin':'#f0883e', 'Administrateur':'var(--blue)', 'Régulier':'var(--green)', 'Visiteur':'var(--text-muted)' };

    const myRole  = getCurrentRole();
    const visible = myRole === 'super_admin'
        ? state.profils
        : state.profils.filter(p => (p.type || '').toLowerCase().replace(/\s/g,'_') !== 'super_admin');

    visible.forEach(prof => {
        const role  = prof.type || 'Régulier';
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
                <button class="btn-small" onclick="event.stopPropagation();openInvitationModal('${prof.email||''}','${prof.name}','${role}','${prof.phone||''}')">
                    <i data-lucide="mail"></i>
                </button>
                <div class="card-arrow"><i data-lucide="chevron-right"></i></div>
            </div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

function openAddProfilForm() {
    ['new-prof-name','new-prof-email','new-prof-phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const expiry = document.getElementById('new-prof-expiry');
    if (expiry) expiry.value = '';
    toggleDateInput();
    openModal('modal-add-profil');
}

function toggleDateInput() {
    const type = document.getElementById('new-prof-type')?.value;
    const el   = document.getElementById('expiry-date-container');
    if (el) el.style.display = type === 'Visiteur' ? 'block' : 'none';
}

function createNewProfil() {
    const name   = document.getElementById('new-prof-name')?.value.trim()  || '';
    const email  = document.getElementById('new-prof-email')?.value.trim() || '';
    const phone  = document.getElementById('new-prof-phone')?.value.trim() || null;
    const type   = document.getElementById('new-prof-type')?.value         || 'Régulier';
    const expiry = document.getElementById('new-prof-expiry')?.value       || null;

    if (!name)  { showToast('Le nom est requis', 'error');   return; }
    if (!email) { showToast("L'email est requis", 'error');  return; }
    if (!supabaseClient) { showToast('Supabase non connecté', 'error'); return; }

    const newProfil = { name, email, phone, type, is_active: true, is_deleted: false, expires_at: type === 'Visiteur' ? expiry : null };
    showToast('Création en cours...', 'info');

    supabaseClient.from('profiles').insert([newProfil]).select()
        .then(function(result) {
            if (result.error) { showToast('Erreur : ' + result.error.message, 'error'); return; }
            if (result.data?.[0]) state.profils.push(result.data[0]);
            closeModal('modal-add-profil');
            renderProfilsList();
            showToast('✅ Profil créé : ' + name);
            setTimeout(() => openInvitationModal(email, name, type, phone || ''), 600);
        })
        .then(r=>r)
        .catch(err => showToast('Erreur : ' + err.message, 'error'));
}

function openProfilEdit(id) {
    currentEditingProfilId = id;
    const prof = state.profils.find(p => p.id === id);
    if (!prof) return;
    document.getElementById('profils-list-view').style.display = 'none';
    document.getElementById('profil-edit-view').style.display  = 'block';
    document.getElementById('edit-prof-name').value   = prof.name   || '';
    document.getElementById('edit-prof-email').value  = prof.email  || '';
    document.getElementById('edit-prof-phone').value  = prof.phone  || '';
    document.getElementById('edit-prof-type').value   = prof.type   || 'Régulier';
    document.getElementById('edit-prof-code').value   = prof.code   || '';
    document.getElementById('edit-prof-badge').value  = prof.badge  || '';
    document.getElementById('edit-prof-remote').value = prof.remote || '';
    _renderProfilAccessRights(prof);
    toggleProfilEditMode(false);
    // Désactiver Supprimer pour Super Admin
    const btnDel = document.querySelector('#profil-edit-view .btn-danger');
    if (btnDel) {
        const isSA = (prof.type || '').toLowerCase().replace(/\s/g,'_') === 'super_admin';
        btnDel.disabled     = isSA;
        btnDel.title        = isSA ? 'Impossible de supprimer le Super Admin' : '';
        btnDel.style.opacity = isSA ? '0.4' : '';
    }
}

function _renderProfilAccessRights(prof) {
    const container = document.getElementById('profil-permissions-container');
    if (!container) return;
    const authorized = prof.authorized_access || [];
    if (!state.acces.length) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Aucun accès configuré.</p>';
        return;
    }
    container.innerHTML = state.acces.map(acc => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid var(--border)">
            <input type="checkbox" id="perm-${acc.id}" value="${acc.id}"
                ${authorized.includes(acc.id) ? 'checked' : ''} disabled
                style="width:16px;height:16px;accent-color:var(--primary)">
            <span style="font-size:.9rem;flex:1">${acc.name}</span>
            <span class="ip-badge">${acc.ip || '—'}</span>
        </label>`).join('');
}

function closeProfilEdit() {
    document.getElementById('profils-list-view').style.display = 'block';
    document.getElementById('profil-edit-view').style.display  = 'none';
}

function toggleProfilEditMode(isEditable) {
    ['edit-prof-name','edit-prof-email','edit-prof-phone','edit-prof-type',
     'edit-prof-code','edit-prof-badge','edit-prof-remote'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isEditable;
    });
    document.querySelectorAll('#profil-permissions-container input[type="checkbox"]')
        .forEach(cb => cb.disabled = !isEditable);
    document.getElementById('btn-unlock-prof').style.display = isEditable ? 'none'  : 'block';
    document.getElementById('btn-save-prof').style.display   = isEditable ? 'block' : 'none';
}

async function saveProfilModifications() {
    const code = document.getElementById('edit-prof-code').value;
    if (code && state.profils.some(p => p.code === code && p.id !== currentEditingProfilId)) {
        showToast('⚠️ Ce code est déjà utilisé', 'error');
        return;
    }
    const VALID_TYPES = ['super_admin', 'Administrateur', 'Régulier', 'Visiteur'];
    const rawType = document.getElementById('edit-prof-type').value.trim();
    const currentProfil = state.profils.find(p => p.id === currentEditingProfilId);
    const safeType = VALID_TYPES.includes(rawType) ? rawType : (currentProfil?.type || 'Régulier');
    if (!safeType) {
        showToast('⚠️ Type de profil invalide', 'error');
        return;
    }
    const authorized = Array.from(
        document.querySelectorAll('#profil-permissions-container input:checked')
    ).map(cb => cb.value);

    const updates = {
        name:              document.getElementById('edit-prof-name').value.trim(),
        email:             document.getElementById('edit-prof-email').value.trim(),
        phone:             document.getElementById('edit-prof-phone').value.trim() || null,
        type:              safeType,
        code:              code || null,
        badge:             document.getElementById('edit-prof-badge').value.trim() || null,
        remote:            document.getElementById('edit-prof-remote').value.trim() || null,
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

function deleteCurrentProfil() {
    // Protect super_admin from deletion
    const _prof = state.profils.find(p => p.id === state._currentProfilId);
    if (_prof && _prof.type === 'super_admin') {
        showToast('⛔ Le super administrateur ne peut pas être supprimé', 'error');
        return;
    }
    
    if (confirm('Envoyer à la corbeille ?')) _deleteToTrash('profil', currentEditingProfilId);
}

/* ==================================================================
   INVITATIONS SMS / WHATSAPP / EMAIL
================================================================== */
function openInvitationModal(email, name, role, phone) {
    let modal = document.getElementById('modal-invitation');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-invitation';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const url    = `${window.location.origin}${window.location.pathname}?setup=1&role=${encodeURIComponent(role)}&name=${encodeURIComponent(name)}`;
    const msg    = `Bonjour ${name}, voici votre lien d'accès Thera Connect : ${url}`;
    const msgEnc = encodeURIComponent(msg);
    const tel    = (phone || '').replace(/\s/g, '');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <h3 style="margin-bottom:6px;">📨 Inviter ${name}</h3>
            <p style="color:var(--text-sub);font-size:.85rem;margin-bottom:16px;">Rôle : <strong>${role}</strong></p>
            <div style="background:var(--card-inner);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
                <code style="font-size:.72rem;font-family:'DM Mono',monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-sub);">${url}</code>
                <button class="btn-small" onclick="_copyLink('${url}')">Copier</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${email ? `<a href="mailto:${email}?subject=Votre accès Thera Connect&body=${msgEnc}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--radius);border:1.5px solid var(--border);background:white;color:var(--text-main);text-decoration:none;font-weight:600;font-size:.875rem;"><span style="font-size:1.3rem">📧</span><div><div>Email</div><div style="font-size:.73rem;color:var(--text-sub);font-weight:400">${email}</div></div></a>` : '<div style="padding:10px;border-radius:var(--radius);background:var(--card-inner);color:var(--text-muted);font-size:.83rem;text-align:center;">Email non renseigné</div>'}
                ${tel ? `
                <a href="sms:${tel}?body=${msgEnc}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--radius);border:1.5px solid var(--border);background:white;color:var(--text-main);text-decoration:none;font-weight:600;font-size:.875rem;"><span style="font-size:1.3rem">💬</span><div><div>SMS</div><div style="font-size:.73rem;color:var(--text-sub);font-weight:400">${phone}</div></div></a>
                <a href="https://wa.me/${tel.replace('+','')}?text=${msgEnc}" target="_blank" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--radius);border:1.5px solid var(--border);background:white;color:var(--text-main);text-decoration:none;font-weight:600;font-size:.875rem;"><span style="font-size:1.3rem">🟢</span><div><div>WhatsApp</div><div style="font-size:.73rem;color:var(--text-sub);font-weight:400">${phone}</div></div></a>` : '<div style="padding:10px;border-radius:var(--radius);background:var(--card-inner);color:var(--text-muted);font-size:.83rem;text-align:center;">Téléphone non renseigné</div>'}
            </div>
            <button class="btn-cancel" style="width:100%;margin-top:14px;justify-content:center;" onclick="closeModal('modal-invitation')">Fermer</button>
        </div>`;
    modal.style.display = 'flex';
}

function _copyLink(url) {
    navigator.clipboard?.writeText(url)
        .then(() => showToast('✅ Lien copié !'))
        .then(r=>r)
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

/* ==================================================================
   ALERTES
================================================================== */
function renderAlertsSetup() {
    const sv = document.getElementById('alert-setup-view');
    const lv = document.getElementById('alert-logs-view');
    if (sv) sv.style.display = 'block';
    if (lv) lv.style.display = 'none';
    prepareAlertSetup();
    renderAlertRules();
}

function showAlertSubPage(view) {
    const sv = document.getElementById('alert-setup-view');
    const lv = document.getElementById('alert-logs-view');
    if (sv) sv.style.display = view === 'setup' ? 'block' : 'none';
    if (lv) lv.style.display = view === 'logs'  ? 'block' : 'none';
    if (view === 'setup') { prepareAlertSetup(); renderAlertRules(); }
    else renderAlertLogs();
}

function renderAlertRules() {
    const container = document.getElementById('alert-rules-list');
    if (!container) return;
    const typeLabels = { stay_open:'🚪 Ouvert trop longtemps', wrong_hours:'🕒 Hors-horaires', hardware_cell:'❌ Défaut capteur' };
    if (!state.alertRules.length) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:16px">Aucune règle configurée.</p>';
        return;
    }
    container.innerHTML = state.alertRules.map((r, i) => {
        const acc = state.acces.find(a => a.id === r.access_id);
        return `<div class="alert-item" style="display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="font-weight:600;font-size:.88rem">${typeLabels[r.type] || r.type}</div>
                <small>${acc ? acc.name : 'Accès inconnu'}${r.duration ? ` · ${r.duration} min` : ''}</small>
            </div>
            <button class="btn-small" style="color:var(--red)" onclick="deleteAlertRule(${i})">✕</button>
        </div>`;
    }).join('');
}

async function deleteAlertRule(i) {
    const rule = state.alertRules[i];
    if (!rule) return;
    if (supabaseClient && rule.id) {
        await supabaseClient.from('alert_rules').delete().eq('id', rule.id).then(r=>r).catch(() => {});
    }
    state.alertRules.splice(i, 1);
    renderAlertRules();
    showToast('Règle supprimée');
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
        access_id:  document.getElementById('alert-target-access')?.value,
        type:       document.getElementById('alert-type-select')?.value,
        duration:   parseInt(document.getElementById('alert-limit-time')?.value || 5),
        days:       Array.from(document.querySelectorAll('.alert-day-check:checked')).map(cb => parseInt(cb.value)),
        start_time: document.getElementById('alert-start')?.value || null,
        end_time:   document.getElementById('alert-end')?.value   || null
    };
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('alert_rules').insert([rule]);
            if (error) throw error;
        }
        state.alertRules.push(rule);
        showToast('✅ Règle enregistrée');
        showAlertSubPage('setup');
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

async function deleteAlertRule(ruleId) {
    if (!confirm('Supprimer cette règle d\'alerte ?')) return;
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('alert_rules').delete().eq('id', ruleId);
            if (error) throw error;
        }
        state.alertRules = state.alertRules.filter(r => r.id !== ruleId);
        showToast('✓ Règle supprimée');
        renderAlertLogs();
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
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
    container.innerHTML = '';

    const typeLabels = {
        stay_open: '🚪 Portail ouvert trop longtemps',
        wrong_hours: '🌙 Ouverture hors-horaires',
        hardware_cell: '⚡ Défaut capteur'
    };

    if (!state.alertRules || !state.alertRules.length) {
        container.innerHTML += '<p style="color:var(--text-muted);font-size:.9rem;margin-bottom:8px">Aucune règle configurée.</p>';
    } else {
        const rulesTitle = document.createElement('h4');
        rulesTitle.textContent = 'Règles actives';
        rulesTitle.style.marginBottom = '8px';
        container.appendChild(rulesTitle);
        state.alertRules.forEach(rule => {
            const acc = state.acces.find(a => a.id === rule.access_id);
            const el = document.createElement('div');
            el.className = 'log-item';
            el.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--card);border-radius:8px;margin-bottom:6px;';
            el.innerHTML = `<div>
                <div style="font-weight:600;font-size:.9rem">${typeLabels[rule.type] || rule.type}</div>
                <div style="font-size:.8rem;color:var(--text-muted)">${acc ? acc.name : 'Accès inconnu'} — ${rule.duration || '—'} min</div>
            </div>
            <button class="btn-danger" style="padding:4px 10px;font-size:.8rem" onclick="deleteAlertRule('${rule.id}')">🗑️</button>`;
            container.appendChild(el);
        });
    }

    if (state.alertLogs && state.alertLogs.length > 0) {
        const logsTitle = document.createElement('h4');
        logsTitle.textContent = 'Journal des événements';
        logsTitle.style.cssText = 'margin-top:16px;margin-bottom:8px';
        container.appendChild(logsTitle);
        // Keep only last 15 days
        const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
        const recentLogs = state.alertLogs.filter(l => new Date(l.created_at || l.ts).getTime() > cutoff);
        if (!recentLogs.length) {
            container.innerHTML += '<p style="color:var(--text-muted);font-size:.9rem">Aucun événement récent.</p>';
        } else {
            recentLogs.slice(-50).reverse().forEach(log => {
                const el = document.createElement('div');
                el.className = 'log-item';
                el.style.cssText = 'padding:8px;background:var(--card);border-radius:6px;margin-bottom:4px;font-size:.85rem;';
                const d = new Date(log.created_at || log.ts);
                el.textContent = d.toLocaleString('fr-FR') + ' — ' + (log.message || log.type || 'Alerte');
                container.appendChild(el);
            });
        }
    }
}

/* ==================================================================
   CLÉS & BADGES
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
                <td><code style="font-size:.85rem">${k.val}</code></td>
                <td>${prof.name}</td>
                <td><button class="btn-small" onclick="openProfilEdit('${prof.id}')">Voir</button></td>`;
            tbody.appendChild(tr);
        });
    });
    if (!tbody.innerHTML) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">Aucune clé trouvée.</td></tr>';
    }
}

function filterKeys() { renderKeysList(); }

/* ==================================================================
   HISTORIQUE
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
            operator:  user,
            source,
            details:   `${access} — ${action}`
        }]).then(r=>r).catch(() => {});
    }
}

function renderHistory() {
    const tbody    = document.getElementById('history-table-body');
    const emptyMsg = document.getElementById('history-empty-msg');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!state.historique.length) {
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';
    state.historique.forEach(item => {
        const d  = new Date(item.timestamp);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><small>${d.toLocaleDateString('fr-FR')}</small> <b>${d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</b></td>
            <td>${item.user   || 'Système'}</td>
            <td>${item.access || 'Général'}</td>
            <td><span class="badge-${(item.action||'info').toLowerCase()}">${item.action}</span></td>
            <td><small>${item.source || 'App'}</small></td>`;
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
    link.download = `historique_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

/* ==================================================================
   CORBEILLE
================================================================== */
function renderCorbeille() {
    const tbody    = document.getElementById('corbeille-table-body');
    const emptyMsg = document.getElementById('corbeille-empty-msg');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!state.trash.length) {
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';
    state.trash.forEach((item, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge-info">${item.type.toUpperCase()}</span></td>
            <td><b>${item.data?.name || 'Sans nom'}</b></td>
            <td><small>${new Date(item.date).toLocaleDateString('fr-FR')}</small></td>
            <td><button class="btn-small" onclick="restoreFromTrash(${i})">Restaurer</button></td>`;
        tbody.appendChild(tr);
    });
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
        showToast('✅ Restauré');
        renderCorbeille();
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

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
    } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

/* ==================================================================
   TEMPS RÉEL — Ping 30s + Supabase Realtime + Badge alertes
================================================================== */
let _pingLoopTimer = null;

function startRealtimeFeatures() {
    clearInterval(_pingLoopTimer);
    _pingAllAccesses();
    _pingLoopTimer = setInterval(_pingAllAccesses, 30000);

    if (!supabaseClient) return;
    supabaseClient.channel('realtime-logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, payload => {
            const l = payload.new;
            state.historique.unshift({ id: l.id, timestamp: l.created_at, user: l.operator, access: l.details, action: l.action, source: l.source });
            state.alertLogs.unshift({ timestamp: l.created_at, text: `${l.action} — ${l.details}` });
            _updateAlertBadge();
            const active = document.querySelector('.page.active')?.id;
            if (active === 'page-accueil')    renderAccueil();
            if (active === 'page-historique') renderHistory();
        })
        .subscribe();
}

async function _pingAllAccesses() {
    if (!state.acces.length) return;
    let changed = false;
    await Promise.all(state.acces.map(async acc => {
        if (!acc.ip) return;
        try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 3000);
            await fetch(`http://${acc.ip}/status`, { signal: ctrl.signal, mode: 'no-cors' });
            if (!acc._online) { acc._online = true; changed = true; }
        } catch {
            if (acc._online !== false) { acc._online = false; changed = true; }
        }
    }));
    if (changed) {
        const active = document.querySelector('.page.active')?.id;
        if (active === 'page-accueil') renderAccueil();
        if (active === 'page-acces')   renderAccesList();
    }
}

function _updateAlertBadge() {
    const btn = document.querySelector('.nav-btn[onclick*="page-alerts"]');
    if (!btn) return;
    const since24h = new Date(Date.now() - 86400000);
    const count    = state.alertLogs.filter(l => new Date(l.timestamp) > since24h).length;
    let badge = btn.querySelector('.alert-nav-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'alert-nav-badge';
            btn.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
        badge.remove();
    }
}

/* ==================================================================
   SYSTÈME
================================================================== */
function renderSystemModules() {
    const container = document.getElementById('system-modules-list');
    if (!container) return;
    container.innerHTML = '';
    if (!state.acces.length) {
        container.innerHTML = '<div class="empty-state"><p>Aucun module configuré.</p></div>';
        return;
    }
    state.acces.forEach(acc => {
        const div = document.createElement('div');
        div.className = 'card-inner';
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
        div.innerHTML = `
            <div>
                <strong>${acc.name}</strong><br>
                <small style="font-family:monospace">IP: ${acc.ip} · Relay: ${acc.relay_id||1}</small>
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
    if (!confirm(`Redémarrer "${name}" ?`)) return;
    fetch(`http://${ip}/reboot`, { mode: 'no-cors' }).then(r=>r).catch(() => {});
    showToast(`🔄 Reboot envoyé à ${name}`);
}

function restartApp() {
    if (confirm('Recharger l\'application ?')) location.reload();
}

/* ==================================================================
   RÉGLAGES
================================================================== */
function saveAppSettings() {
    const name = document.getElementById('setting-app-name').value;
    const logo = document.getElementById('setting-app-logo').value;
    if (name) { document.querySelector('.logo-text').innerHTML = `${name}`; document.title = name; }
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
    loadAllData();
    startCloudHealthPolling();
    showToast('💾 Configuration enregistrée');
}

let _cloudPollTimer = null;

async function checkCloudHealth(silent = false) {
    const badge = document.getElementById('cloud-health-badge');
    if (badge) { badge.textContent = '⏳ Vérification…'; badge.style.color = 'var(--text-muted)'; }
    if (!supabaseClient) {
        if (badge) { badge.textContent = '❌ ÉCHEC — non configuré'; badge.style.color = 'var(--red)'; }
        if (!silent) showToast('Supabase non initialisé', 'error');
        return;
    }
    const { error } = await supabaseClient.from('profiles').select('id').limit(1);
    const ok = !error;
    const ts = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    if (badge) {
        badge.textContent = ok ? `✅ Connexion Cloud OK · ${ts}` : `❌ ÉCHEC · ${ts}`;
        badge.style.color = ok ? 'var(--green)' : 'var(--red)';
    }
    if (!silent) showToast(ok ? '✅ Connexion réussie !' : `❌ ${error.message}`, ok ? 'success' : 'error');
}

function startCloudHealthPolling() {
    clearInterval(_cloudPollTimer);
    checkCloudHealth(true);
    _cloudPollTimer = setInterval(() => checkCloudHealth(true), 5 * 60 * 1000);
}

function testCloudConnection() { checkCloudHealth(false); }

/* ==================================================================
   TOAST
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
    const toast  = document.createElement('div');
    toast.style.cssText = `background:${colors[type]||colors.success};color:white;padding:11px 18px;border-radius:10px;font-size:.87rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:320px;animation:toastIn .3s cubic-bezier(.34,1.56,.64,1) both;pointer-events:auto;`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.cssText += 'opacity:0;transition:opacity .3s';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ==================================================================
   INIT
================================================================== */

function checkCloudStatus() {
    const badge = document.getElementById('cloud-status-badge');
    if (!badge || !supabaseClient) return;
    supabaseClient.from('settings').select('id').limit(1)
        .then(r => r)
        .then(({ error }) => {
            badge.className = error ? 'status-badge status-offline' : 'status-badge status-online';
            badge.innerHTML = error 
                ? '<span class="dot-offline"></span> Cloud Hors Ligne' 
                : '<span class="dot-online"></span> Cloud Connecté';
        });
}
// Poll cloud status every 5 minutes
setInterval(checkCloudStatus, 5 * 60 * 1000);

window.onload = () => {
    console.log('🚀 Thera Connect v4.0');
    if (window.lucide) lucide.createIcons();
};
