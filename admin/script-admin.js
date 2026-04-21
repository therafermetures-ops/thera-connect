/* ==================================================================
   THERA CONNECT — Gestion Pro · script-admin.js v1.0
   Dashboard · Clients · GMAO · Chantiers · PDF · Invitations
================================================================== */

let sbClient = null;

let adminState = {
    profiles:      [],
    interventions: [],
    chantiers:     [],
    moduleStatus:  {},   // { profileId: { maintenance: true/false, ... } }
    currentChantierFilter: 'all',
    editingChantier: null,
};

/* ==================================================================
   INIT SUPABASE
================================================================== */
function initAdminSupabase(url, key) {
    if (!url || !key) return;
    sbClient = supabase.createClient(url, key);
    console.log('🔌 Admin Supabase OK');
}

window.addEventListener('DOMContentLoaded', () => {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (url && key) {
        initAdminSupabase(url, key);
        document.getElementById('admin-sb-url').value = url;
        document.getElementById('admin-sb-key').value = key;
    }
});

async function loadAdminData() {
    if (!sbClient) return;
    try {
        const [
            { data: profiles,      error: e1 },
            { data: interventions, error: e2 },
            { data: chantiers,     error: e3 },
            { data: moduleStatus,  error: e4 }
        ] = await Promise.all([
            sbClient.from('profiles').select('*').eq('is_deleted', false).order('name'),
            sbClient.from('interventions').select('*,profiles(name,email)').order('created_at', { ascending: false }),
            sbClient.from('chantiers').select('*').order('created_at', { ascending: false }),
            sbClient.from('module_status').select('*')
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        if (e3) throw e3;

        adminState.profiles      = profiles || [];
        adminState.interventions = interventions || [];
        adminState.chantiers     = chantiers || [];

        // Indexer module_status par profile_id
        adminState.moduleStatus = {};
        (moduleStatus || []).forEach(ms => {
            if (!adminState.moduleStatus[ms.profile_id]) adminState.moduleStatus[ms.profile_id] = {};
            adminState.moduleStatus[ms.profile_id][ms.module] = ms.is_enabled;
        });

        console.log('✅ Admin data chargé');
        updateKPIs();
        updateNavBadges();
    } catch (err) {
        console.error('loadAdminData:', err.message);
        showAdminToast('Erreur chargement : ' + err.message, 'error');
    }
}

/* ==================================================================
   NAVIGATION
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
        case 'page-dashboard':    renderDashboard();    break;
        case 'page-clients':      renderClients();      break;
        case 'page-tickets':      renderTickets();      break;
        case 'page-interventions':renderInterventions();break;
        case 'page-chantiers':    renderChantiers();    break;
    }

    if (window.lucide) lucide.createIcons();
}

function openModal(id)  { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

/* ==================================================================
   KPIs & BADGES
================================================================== */
function updateKPIs() {
    const activeClients     = adminState.profiles.filter(p => p.is_active && !['super_admin'].includes(p.type)).length;
    const openTickets       = adminState.interventions.filter(i => ['nouveau','en_cours'].includes(i.status)).length;
    const thisMonth         = new Date(); thisMonth.setDate(1);
    const interventionsMonth = adminState.interventions.filter(i => new Date(i.created_at) >= thisMonth && i.status === 'resolu').length;
    const chantiersCours    = adminState.chantiers.filter(c => c.status === 'en_cours').length;

    document.getElementById('kpi-clients').textContent       = activeClients;
    document.getElementById('kpi-tickets').textContent       = openTickets;
    document.getElementById('kpi-interventions').textContent = interventionsMonth;
    document.getElementById('kpi-chantiers').textContent     = chantiersCours;
}

function updateNavBadges() {
    const tickets = adminState.interventions.filter(i => i.status === 'nouveau').length;
    const clients = adminState.profiles.filter(p => p.is_active).length;
    document.getElementById('badge-tickets').textContent = tickets;
    document.getElementById('badge-clients').textContent = clients;
    document.getElementById('badge-tickets').classList.toggle('urgent', tickets > 0);
}

/* ==================================================================
   DASHBOARD
================================================================== */
function renderDashboard() {
    updateKPIs();

    // Tickets récents
    const ticketList = document.getElementById('dashboard-tickets-list');
    const recent = adminState.interventions.slice(0, 5);
    if (!recent.length) {
        ticketList.innerHTML = '<div class="empty-state">Aucun ticket</div>';
    } else {
        ticketList.innerHTML = recent.map(t => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);" onclick="openTicketDetail('${t.id}')">
                <span class="badge badge-${t.priority || 'normal'}">${t.priority || 'normal'}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:.875rem;">${t.title}</div>
                    <div style="font-size:.75rem;color:var(--text-sub);">${t.profiles?.name || 'Client'} · ${_fmtDate(t.created_at)}</div>
                </div>
                <span class="badge badge-${t.status}">${_statusLabel(t.status)}</span>
            </div>`).join('');
        ticketList.querySelector('div:last-child').style.borderBottom = 'none';
    }

    // Chantiers en cours
    const chantierList = document.getElementById('dashboard-chantiers-list');
    const encours = adminState.chantiers.filter(c => c.status === 'en_cours').slice(0, 4);
    chantierList.innerHTML = encours.length
        ? encours.map(c => _chantierCardHtml(c)).join('')
        : '<div class="empty-state" style="grid-column:1/-1">Aucun chantier en cours</div>';

    if (window.lucide) lucide.createIcons();
}

/* ==================================================================
   CLIENTS
================================================================== */
function renderClients(data) {
    const rows = data || adminState.profiles.filter(p => !p.is_deleted);
    const tbody = document.getElementById('clients-tbody');

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucun client</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(p => {
        const maintEnabled = adminState.moduleStatus[p.id]?.maintenance || false;
        const roleColor = { 'super_admin':'#f0883e','Administrateur':'var(--blue)','Régulier':'var(--green)','Visiteur':'var(--text-muted)' };
        const color = roleColor[p.type] || 'var(--text-muted)';

        return `<tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:${color}20;color:${color};display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;flex-shrink:0;">${(p.name||'?').charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:600">${p.name}</div>
                        <div style="font-size:.75rem;color:var(--text-sub)">${p.email||''}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge badge-${p.type === 'Régulier' ? 'resolu' : p.type === 'Visiteur' ? 'clos' : 'en_cours'}" style="background:${color}15;color:${color}">${p.type||'Régulier'}</span></td>
            <td>
                <label class="toggle toggle-wrap" title="${maintEnabled ? 'Désactiver' : 'Activer'} le module maintenance">
                    <input type="checkbox" ${maintEnabled ? 'checked' : ''} onchange="toggleModule('${p.id}','maintenance',this.checked)">
                    <div class="toggle-track"></div>
                    <div class="toggle-thumb"></div>
                </label>
            </td>
            <td style="font-size:.8rem;color:var(--text-sub)">${(p.authorized_access||[]).length} accès</td>
            <td>
                <div style="display:flex;gap:6px;">
                    <button class="btn-outline btn-sm" onclick="openInvitationModal({name:'${p.name}',email:'${p.email||''}',phone:'${p.phone||''}',role:'${p.type||'Régulier'}'})" title="Inviter">
                        <i data-lucide="send"></i>
                    </button>
                    <button class="btn-outline btn-sm" style="color:var(--red);border-color:rgba(248,81,73,.2)" onclick="toggleClientStatus('${p.id}',${!p.is_active})" title="${p.is_active ? 'Désactiver' : 'Activer'}">
                        <i data-lucide="${p.is_active ? 'user-x' : 'user-check'}"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

function filterClients() {
    const q     = document.getElementById('client-search').value.toLowerCase();
    const role  = document.getElementById('client-filter-role').value;
    let data    = adminState.profiles.filter(p => !p.is_deleted);
    if (q)      data = data.filter(p => (p.name+p.email).toLowerCase().includes(q));
    if (role)   data = data.filter(p => p.type === role);
    renderClients(data);
}

async function toggleModule(profileId, module, enabled) {
    if (!sbClient) return;
    try {
        await sbClient.from('module_status').upsert({
            profile_id: profileId, module, is_enabled: enabled,
            enabled_at: enabled ? new Date().toISOString() : null
        }, { onConflict: 'profile_id,module' });

        if (!adminState.moduleStatus[profileId]) adminState.moduleStatus[profileId] = {};
        adminState.moduleStatus[profileId][module] = enabled;
        showAdminToast(`Module ${module} ${enabled ? 'activé' : 'désactivé'}`);
    } catch (err) {
        showAdminToast('Erreur : ' + err.message, 'error');
    }
}

async function toggleClientStatus(id, newActive) {
    if (!sbClient) return;
    try {
        await sbClient.from('profiles').update({ is_active: newActive }).eq('id', id);
        const p = adminState.profiles.find(x => x.id === id);
        if (p) p.is_active = newActive;
        renderClients();
        showAdminToast(`Client ${newActive ? 'activé' : 'désactivé'}`);
    } catch (err) {
        showAdminToast('Erreur : ' + err.message, 'error');
    }
}

function openNewClientModal() {
    ['cl-name','cl-email','cl-phone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    openModal('modal-client');
}

async function saveNewClient() {
    const name  = document.getElementById('cl-name').value.trim();
    const email = document.getElementById('cl-email').value.trim();
    const phone = document.getElementById('cl-phone').value.trim();
    const type  = document.getElementById('cl-type').value;
    if (!name || !email) { showAdminToast('Nom et email requis', 'error'); return; }

    try {
        const { data, error } = await sbClient.from('profiles').insert([{ name, email, phone, type, is_active: true }]).select();
        if (error) throw error;
        adminState.profiles.push(data[0]);
        await _sendInvitationEmail(email, name, type);
        closeModal('modal-client');
        renderClients();
        updateNavBadges();
        openInvitationModal({ name, email, phone, role: type });
        showAdminToast(`✅ Client créé · Invitation envoyée à ${email}`);
    } catch (err) {
        showAdminToast('Erreur : ' + err.message, 'error');
    }
}

/* ==================================================================
   TICKETS
================================================================== */
function renderTickets(data) {
    const list = data || adminState.interventions;
    const container = document.getElementById('tickets-list');

    if (!list.length) {
        container.innerHTML = '<div class="empty-state">Aucun ticket</div>';
        return;
    }

    container.innerHTML = list.map(t => `
        <div class="ticket-card ${t.priority || 'normal'}" onclick="openTicketDetail('${t.id}')">
            <div class="ticket-priority ${t.priority || 'normal'}">
                <i data-lucide="${t.priority === 'urgent' ? 'zap' : t.priority === 'high' ? 'alert-triangle' : 'info'}"></i>
            </div>
            <div class="ticket-body">
                <div class="ticket-title">${t.title}</div>
                <div class="ticket-meta">
                    <span>👤 ${t.profiles?.name || 'Client inconnu'}</span>
                    <span>📅 ${_fmtDate(t.created_at)}</span>
                    ${t.access_point_id ? '<span>🚪 Accès lié</span>' : ''}
                </div>
                ${t.description ? `<div style="margin-top:8px;font-size:.82rem;color:var(--text-sub);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${t.description}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
                <span class="badge badge-${t.status}">${_statusLabel(t.status)}</span>
                <span class="badge badge-${t.priority || 'normal'}">${t.priority || 'normal'}</span>
            </div>
        </div>`).join('');

    if (window.lucide) lucide.createIcons();
}

function filterTickets() {
    const status = document.getElementById('ticket-filter-status').value;
    let data = adminState.interventions;
    if (status) data = data.filter(i => i.status === status);
    renderTickets(data);
}

function openTicketDetail(id) {
    const ticket = adminState.interventions.find(t => t.id === id);
    if (!ticket) return;

    document.getElementById('modal-ticket-title').textContent = ticket.title;
    document.getElementById('modal-ticket-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div><div style="font-size:.72rem;color:var(--text-sub);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Client</div><div style="font-weight:600">${ticket.profiles?.name || '—'}</div></div>
            <div><div style="font-size:.72rem;color:var(--text-sub);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Date</div><div>${_fmtDate(ticket.created_at)}</div></div>
            <div><div style="font-size:.72rem;color:var(--text-sub);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Priorité</div><span class="badge badge-${ticket.priority}">${ticket.priority}</span></div>
            <div><div style="font-size:.72rem;color:var(--text-sub);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Statut</div><span class="badge badge-${ticket.status}">${_statusLabel(ticket.status)}</span></div>
        </div>
        ${ticket.description ? `<div style="background:var(--surface2);border-radius:var(--r);padding:12px;font-size:.875rem;margin-bottom:16px;">${ticket.description}</div>` : ''}

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">
        <h3 style="margin-bottom:12px;">Compte-rendu d'intervention</h3>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
                <label>Statut</label>
                <select id="cr-status">
                    <option value="nouveau" ${ticket.status==='nouveau'?'selected':''}>Nouveau</option>
                    <option value="en_cours" ${ticket.status==='en_cours'?'selected':''}>En cours</option>
                    <option value="resolu" ${ticket.status==='resolu'?'selected':''}>Résolu</option>
                    <option value="clos" ${ticket.status==='clos'?'selected':''}>Clos</option>
                </select>
            </div>
            <div class="form-group">
                <label>Technicien</label>
                <input type="text" id="cr-tech" value="${ticket.technician||''}" placeholder="Nom du technicien">
            </div>
        </div>
        <div class="form-group">
            <label>Date d'intervention</label>
            <input type="date" id="cr-date" value="${ticket.intervention_date||''}">
        </div>
        <div class="form-group">
            <label>Travaux effectués</label>
            <textarea id="cr-work" rows="3" placeholder="Décrire les travaux...">${ticket.work_done||''}</textarea>
        </div>
        <div class="form-group">
            <label>Pièces utilisées</label>
            <textarea id="cr-parts" rows="2" placeholder="Liste des pièces...">${ticket.parts_used||''}</textarea>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <button class="btn-primary" onclick="saveCR('${id}')">💾 Enregistrer</button>
            <button class="btn-outline" onclick="generateAndSendPDF('${id}')">📄 Générer PDF & Envoyer</button>
            <button class="btn-outline" style="margin-left:auto" onclick="closeModal('modal-ticket')">Fermer</button>
        </div>`;

    openModal('modal-ticket');
    if (window.lucide) lucide.createIcons();
}

async function saveCR(ticketId) {
    if (!sbClient) return;
    const updates = {
        status:            document.getElementById('cr-status').value,
        technician:        document.getElementById('cr-tech').value,
        intervention_date: document.getElementById('cr-date').value || null,
        work_done:         document.getElementById('cr-work').value,
        parts_used:        document.getElementById('cr-parts').value
    };
    try {
        const { error } = await sbClient.from('interventions').update(updates).eq('id', ticketId);
        if (error) throw error;
        const idx = adminState.interventions.findIndex(t => t.id === ticketId);
        if (idx !== -1) Object.assign(adminState.interventions[idx], updates);
        showAdminToast('✅ Compte-rendu enregistré');
        updateNavBadges();
    } catch (err) { showAdminToast('Erreur : ' + err.message, 'error'); }
}

/* ==================================================================
   GÉNÉRATION PDF (jsPDF)
================================================================== */
async function generateAndSendPDF(ticketId) {
    const ticket  = adminState.interventions.find(t => t.id === ticketId);
    if (!ticket) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

    // — En-tête —
    doc.setFillColor(62, 207, 142);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text('THERA CONNECT', 15, 12);
    doc.setFontSize(10); doc.setFont('helvetica','normal');
    doc.text('Rapport d\'intervention', 15, 20);

    // — Numéro et date —
    doc.setTextColor(255,255,255);
    doc.setFontSize(9);
    doc.text(`N° ${ticket.id.slice(0,8).toUpperCase()}`, 195, 10, { align:'right' });
    doc.text(new Date().toLocaleDateString('fr-FR'), 195, 18, { align:'right' });

    // — Informations —
    doc.setTextColor(30,33,40);
    let y = 36;
    const addSection = (title, content) => {
        doc.setFont('helvetica','bold'); doc.setFontSize(10);
        doc.setFillColor(244,245,247);
        doc.rect(10, y, 190, 7, 'F');
        doc.text(title, 14, y+5);
        y += 10;
        doc.setFont('helvetica','normal'); doc.setFontSize(9);
        if (typeof content === 'string') {
            const lines = doc.splitTextToSize(content || '—', 185);
            doc.text(lines, 14, y);
            y += lines.length * 5 + 4;
        } else if (Array.isArray(content)) {
            content.forEach(([k,v]) => {
                doc.setFont('helvetica','bold');
                doc.text(k+':', 14, y);
                doc.setFont('helvetica','normal');
                doc.text(String(v||'—'), 60, y);
                y += 6;
            });
            y += 2;
        }
    };

    addSection('CLIENT & SIGNALEMENT', [
        ['Client',          ticket.profiles?.name || '—'],
        ['Email',           ticket.profiles?.email || '—'],
        ['Date signalement', _fmtDate(ticket.created_at)],
        ['Priorité',        ticket.priority || 'normale'],
    ]);

    addSection('DESCRIPTION DE LA PANNE', ticket.description);

    addSection('INTERVENTION', [
        ['Technicien',   ticket.technician || '—'],
        ['Date',         ticket.intervention_date ? new Date(ticket.intervention_date).toLocaleDateString('fr-FR') : '—'],
        ['Statut',       _statusLabel(ticket.status)],
    ]);

    addSection('TRAVAUX EFFECTUÉS', ticket.work_done);
    addSection('PIÈCES UTILISÉES', ticket.parts_used);

    // — Signature —
    y += 10;
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('Signature technicien :', 14, y);
    doc.line(14, y+20, 90, y+20);
    doc.text('Signature client :', 120, y);
    doc.line(120, y+20, 196, y+20);

    // — Pied de page —
    doc.setFontSize(8); doc.setTextColor(140,140,140);
    doc.text('Thera Connect · Service de maintenance · www.thera-connect.fr', 105, 287, { align:'center' });

    // Télécharger
    doc.save(`intervention_${ticket.id.slice(0,8)}.pdf`);
    showAdminToast('📄 PDF généré !');

    // Marquer l'envoi en base
    if (sbClient) {
        await sbClient.from('interventions').update({ pdf_sent_at: new Date().toISOString() }).eq('id', ticketId).catch(() => {});
    }
}

/* ==================================================================
   INTERVENTIONS LIST
================================================================== */
function renderInterventions() {
    const container = document.getElementById('interventions-list');
    const resolved  = adminState.interventions.filter(i => ['resolu','clos'].includes(i.status));
    if (!resolved.length) {
        container.innerHTML = '<div class="empty-state">Aucune intervention résolue</div>';
        return;
    }
    container.innerHTML = resolved.map(t => `
        <div class="card" style="cursor:pointer;" onclick="openTicketDetail('${t.id}')">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;">
                    <div style="font-weight:700">${t.title}</div>
                    <div style="font-size:.78rem;color:var(--text-sub);margin-top:2px;">
                        ${t.profiles?.name || '—'} · ${t.technician || 'Tech non défini'} · ${t.intervention_date ? new Date(t.intervention_date).toLocaleDateString('fr-FR') : '—'}
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="badge badge-${t.status}">${_statusLabel(t.status)}</span>
                    ${t.pdf_sent_at ? '<span class="badge badge-resolu">PDF envoyé</span>' : ''}
                    <button class="btn-outline btn-sm" onclick="event.stopPropagation();generateAndSendPDF('${t.id}')">📄 PDF</button>
                </div>
            </div>
        </div>`).join('');
}

function openNewInterventionModal() {
    // Ouvrir un ticket vide manuellement
    const fakeTicket = {
        id: 'new-' + Date.now(),
        title: 'Nouvelle intervention',
        status: 'en_cours',
        priority: 'normal',
        profiles: { name: '', email: '' },
        description: ''
    };
    adminState.interventions.unshift(fakeTicket);
    openTicketDetail(fakeTicket.id);
}

/* ==================================================================
   CHANTIERS
================================================================== */
function renderChantiers(data) {
    const filter    = adminState.currentChantierFilter;
    const chantiers = data || (filter === 'all'
        ? adminState.chantiers
        : adminState.chantiers.filter(c => c.status === filter));

    const grid = document.getElementById('chantiers-grid');
    if (!chantiers.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Aucun chantier</div>';
        return;
    }
    grid.innerHTML = chantiers.map(c => _chantierCardHtml(c)).join('');
    if (window.lucide) lucide.createIcons();
}

function _chantierCardHtml(c) {
    const statusColors = { planifie:'#a78bfa', en_cours:'#f0883e', termine:'#3ecf8e', facture:'#f85149' };
    const color = statusColors[c.status] || 'var(--text-muted)';
    const pct = Math.round(c.progress || 0);

    return `<div class="chantier-card" onclick="editChantier('${c.id}')">
        <div class="chantier-header">
            <div>
                <div class="chantier-name">${c.name}</div>
                <div class="chantier-client">${c.client_name || 'Client non défini'}${c.assigned_to ? ' · ' + c.assigned_to : ''}</div>
            </div>
            <span class="badge badge-${c.status}">${_chantierStatusLabel(c.status)}</span>
        </div>
        ${c.address ? `<div style="font-size:.78rem;color:var(--text-sub);margin-bottom:8px;">📍 ${c.address}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-sub);margin-bottom:4px;">
            <span>Avancement</span><span style="font-weight:700;color:${color}">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,${color},${color}cc)"></div></div>
        ${c.start_date ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:8px;">${_fmtDate(c.start_date)}${c.end_date ? ' → ' + _fmtDate(c.end_date) : ''}</div>` : ''}
        ${c.budget_estimate ? `<div style="font-size:.78rem;color:var(--text-sub);margin-top:6px;">Budget : <strong>${Number(c.budget_estimate).toLocaleString('fr-FR')} €</strong>${c.budget_actual ? ` / Réel : ${Number(c.budget_actual).toLocaleString('fr-FR')} €` : ''}</div>` : ''}
    </div>`;
}

function filterChantiers(status) {
    adminState.currentChantierFilter = status;
    document.querySelectorAll('#page-chantiers .chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('onclick').includes(`'${status}'`));
    });
    renderChantiers();
}

function openNewChantierModal() {
    adminState.editingChantier = null;
    document.getElementById('modal-chantier-title').textContent = 'Nouveau chantier';
    ['ch-name','ch-client','ch-assigned','ch-address','ch-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['ch-budget-est','ch-budget-act'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['ch-start','ch-end'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('ch-status').value = 'en_cours';
    openModal('modal-chantier');
}

function editChantier(id) {
    const c = adminState.chantiers.find(x => x.id === id);
    if (!c) return;
    adminState.editingChantier = id;
    document.getElementById('modal-chantier-title').textContent = 'Modifier le chantier';
    document.getElementById('ch-name').value       = c.name || '';
    document.getElementById('ch-client').value     = c.client_name || '';
    document.getElementById('ch-assigned').value   = c.assigned_to || '';
    document.getElementById('ch-address').value    = c.address || '';
    document.getElementById('ch-status').value     = c.status || 'en_cours';
    document.getElementById('ch-start').value      = c.start_date || '';
    document.getElementById('ch-end').value        = c.end_date || '';
    document.getElementById('ch-budget-est').value = c.budget_estimate || '';
    document.getElementById('ch-budget-act').value = c.budget_actual || '';
    document.getElementById('ch-notes').value      = c.notes_internal || '';
    openModal('modal-chantier');
}

async function saveChantier() {
    const name = document.getElementById('ch-name').value.trim();
    if (!name) { showAdminToast('Nom requis', 'error'); return; }

    const data = {
        name,
        client_name:      document.getElementById('ch-client').value.trim() || null,
        assigned_to:      document.getElementById('ch-assigned').value.trim() || null,
        address:          document.getElementById('ch-address').value.trim() || null,
        status:           document.getElementById('ch-status').value,
        start_date:       document.getElementById('ch-start').value || null,
        end_date:         document.getElementById('ch-end').value || null,
        budget_estimate:  parseFloat(document.getElementById('ch-budget-est').value) || null,
        budget_actual:    parseFloat(document.getElementById('ch-budget-act').value) || null,
        notes_internal:   document.getElementById('ch-notes').value.trim() || null,
    };

    try {
        if (adminState.editingChantier) {
            const { error } = await sbClient.from('chantiers').update(data).eq('id', adminState.editingChantier);
            if (error) throw error;
            const idx = adminState.chantiers.findIndex(c => c.id === adminState.editingChantier);
            if (idx !== -1) Object.assign(adminState.chantiers[idx], data);
            showAdminToast('✅ Chantier mis à jour');
        } else {
            const { data: inserted, error } = await sbClient.from('chantiers').insert([data]).select();
            if (error) throw error;
            adminState.chantiers.unshift(inserted[0]);
            showAdminToast('✅ Chantier créé');
        }
        closeModal('modal-chantier');
        renderChantiers();
        updateKPIs();
    } catch (err) { showAdminToast('Erreur : ' + err.message, 'error'); }
}

/* ==================================================================
   INVITATIONS (SMS / WhatsApp / Email)
================================================================== */
function openInvitationModal(profil) {
    let modal = document.getElementById('modal-invitation-admin');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-invitation-admin';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const url    = `${window.location.origin.replace('/admin','')}/index.html?setup=1&role=${encodeURIComponent(profil.role)}&name=${encodeURIComponent(profil.name)}`;
    const msg    = `Bonjour ${profil.name}, voici votre lien d'accès Thera Connect : ${url}`;
    const msgEnc = encodeURIComponent(msg);
    const phone  = (profil.phone || '').replace(/\s/g, '');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:440px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3>📨 Inviter ${profil.name}</h3>
                <button class="btn-icon" onclick="document.getElementById('modal-invitation-admin').style.display='none'"><i data-lucide="x"></i></button>
            </div>
            <p style="font-size:.82rem;color:var(--text-sub);margin-bottom:16px;">Rôle : <strong>${profil.role}</strong> — Choisissez le canal d'envoi</p>

            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
                <code style="font-size:.72rem;font-family:'DM Mono',monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-sub);">${url}</code>
                <button class="btn-outline btn-sm" onclick="_adminCopyLink('${url}')">Copier</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;">
                ${profil.email ? `
                <a href="mailto:${profil.email}?subject=Votre accès Thera Connect&body=${msgEnc}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--surface);color:var(--text);text-decoration:none;font-weight:600;font-size:.875rem;transition:all .2s;" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
                    <span style="font-size:1.3rem">📧</span>
                    <div><div>Email</div><div style="font-size:.73rem;color:var(--text-sub);font-weight:400">${profil.email}</div></div>
                </a>` : `<div style="padding:10px 12px;border-radius:var(--r);background:var(--surface2);color:var(--text-muted);font-size:.83rem">Email non renseigné</div>`}

                ${phone ? `
                <a href="sms:${phone}?body=${msgEnc}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--surface);color:var(--text);text-decoration:none;font-weight:600;font-size:.875rem;transition:all .2s;" onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'">
                    <span style="font-size:1.3rem">💬</span>
                    <div><div>SMS</div><div style="font-size:.73rem;color:var(--text-sub);font-weight:400">${profil.phone}</div></div>
                </a>
                <a href="https://wa.me/${phone.replace('+','')}?text=${msgEnc}" target="_blank" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--surface);color:var(--text);text-decoration:none;font-weight:600;font-size:.875rem;transition:all .2s;" onmouseover="this.style.borderColor='#25d366'" onmouseout="this.style.borderColor='var(--border)'">
                    <span style="font-size:1.3rem">🟢</span>
                    <div><div>WhatsApp</div><div style="font-size:.73rem;color:var(--text-sub);font-weight:400">${profil.phone}</div></div>
                </a>` : `<div style="padding:10px 12px;border-radius:var(--r);background:var(--surface2);color:var(--text-muted);font-size:.83rem">Téléphone non renseigné</div>`}
            </div>

            <button style="width:100%;margin-top:14px;" class="btn-outline" onclick="document.getElementById('modal-invitation-admin').style.display='none'">Fermer</button>
        </div>`;

    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

function _adminCopyLink(url) {
    navigator.clipboard?.writeText(url).then(() => showAdminToast('✅ Lien copié !'))
        .catch(() => { const el = document.createElement('textarea'); el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); showAdminToast('✅ Lien copié !'); });
}

async function _sendInvitationEmail(email, name, role) {
    if (!sbClient) return;
    try {
        await sbClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin.replace('/admin','')}?setup=1&role=${encodeURIComponent(role)}&name=${encodeURIComponent(name)}`
        });
    } catch (err) { console.warn('Invitation email:', err.message); }
}

/* ==================================================================
   RÉGLAGES
================================================================== */
function saveAdminConfig() {
    const url = document.getElementById('admin-sb-url').value.trim();
    const key = document.getElementById('admin-sb-key').value.trim();
    if (!url || !key) { showAdminToast('Remplissez les deux champs', 'error'); return; }
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_key', key);
    initAdminSupabase(url, key);
    loadAdminData();
    showAdminToast('💾 Configuration enregistrée');
}

function testAdminConnection() {
    if (!sbClient) { showAdminToast('Supabase non initialisé', 'error'); return; }
    sbClient.from('profiles').select('id').limit(1)
        .then(({ error }) => showAdminToast(error ? `❌ ${error.message}` : '✅ Connexion réussie !', error ? 'error' : 'success'));
}

/* ==================================================================
   UTILITAIRES
================================================================== */
function _fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}

function _statusLabel(s) {
    return { nouveau:'Nouveau', en_cours:'En cours', resolu:'Résolu', clos:'Clos' }[s] || s;
}

function _chantierStatusLabel(s) {
    return { planifie:'Planifié', en_cours:'En cours', termine:'Terminé', facture:'Facturé' }[s] || s;
}

function showAdminToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) return;
    if (!document.getElementById('toast-style')) {
        const s = document.createElement('style');
        s.id = 'toast-style';
        s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateY(8px) scale(.95)}to{opacity:1;transform:none}}';
        document.head.appendChild(s);
    }
    const colors = { success:'#3ecf8e', error:'#f85149', info:'#4c9cf8' };
    const toast   = document.createElement('div');
    toast.style.cssText = `background:${colors[type]||colors.success};color:white;padding:11px 18px;border-radius:10px;font-size:.85rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:320px;animation:toastIn .3s cubic-bezier(.34,1.56,.64,1) both;pointer-events:auto;`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.cssText += 'opacity:0;transition:opacity .3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}