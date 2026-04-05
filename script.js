/* ==========================================================================
   THERA CONNECT - LOGIQUE COMPLÈTE V300 (PARTIE 1)
   ========================================================================== */
// --- CONFIGURATION THERA CONNECT V300 ---
const SUPABASE_URL = "https://dekxcxlremxaynpezgmr.supabase.co";
const SUPABASE_KEY = "sb_publishable_JwUtLr2UiSvfsBMceTfWSw_ktthLogk"; // Colle ici ta clé 'anon' publique

const theraClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// --- 1. VARIABLES GLOBALES & PERSISTANCE ---
let appConfig = JSON.parse(localStorage.getItem('thera_config')) || {
    isFirstRun: true,
    portals: JSON.parse(localStorage.getItem('thera_portals')) || [],
    users: JSON.parse(localStorage.getItem('thera_users')) || [],
    logs: JSON.parse(localStorage.getItem('thera_logs')) || [],
    deletedUsers: JSON.parse(localStorage.getItem('thera_deleted_users')) || [],
    branding: { name: "THERA CONNECT", color: "#2563eb", support: "" },
    hardware: { brand: "kincony", ip: "" }
};

// 2. ALIAS (Lien dynamique) - À ne plus jamais redéfinir ensuite
let portals = appConfig.portals;
let users = appConfig.users;
let logs = appConfig.logs;
let deletedUsers = appConfig.deletedUsers;
const portalTimers = {};

function saveToLocalStorage() {
    // On met à jour l'objet global avant de sauver
    appConfig.portals = portals;
    appConfig.users = users;
    appConfig.logs = logs;
    appConfig.deletedUsers = deletedUsers;

    localStorage.setItem('thera_config', JSON.stringify(appConfig));
    
    // Sauvegardes individuelles pour la sécurité (V111/V186)
    localStorage.setItem('thera_portals', JSON.stringify(portals));
    localStorage.setItem('thera_users', JSON.stringify(users));
    localStorage.setItem('thera_logs', JSON.stringify(logs));
    localStorage.setItem('thera_deleted_users', JSON.stringify(deletedUsers));
    
    console.log("✅ Données sauvegardées (Portals/Users/Logs)");
}
function initApp() {
    // 1. Splash Screen
    setTimeout(() => {
        const splash = document.getElementById('page-splash');
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.style.display = 'none', 500);
        }
    }, 2000);

    // 2. Appliquer le Branding
    if (appConfig.branding) {
        applyBranding(appConfig.branding);
    }

    // 3. Router
    const params = new URLSearchParams(window.location.search);
    
    if(params.get('id')) {
        loadGuestView(params.get('id'));
    } 
    else if (appConfig.portals.length === 0) {
        showPage('page-welcome');
    } 
    else {
        showPage('page-a'); // showPage s'occupera d'appeler renderPortalsList
    }
}

// --- 2. NAVIGATION ---
/**
 * UNIQUE chef d'orchestre de la navigation (V300)
 */

function showPage(pageId) {
    // 1. NETTOYAGE VISUEL
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const target = document.getElementById(pageId);
    if (!target) return; 

    target.classList.add('active');

    // 2. MISE À JOUR SIDEBAR / NAVIGATION
    const sidebar = document.getElementById('sidebar');
    
    // Si on est sur la page simplifiée, on cache la sidebar
    if (pageId === 'page-user-simple') {
        if (sidebar) sidebar.style.display = 'none';
    } else {
        if (sidebar) sidebar.style.display = 'flex'; // On la réaffiche pour les autres pages
    }

    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => 
        b.getAttribute('onclick')?.includes(pageId)
    );
    if(activeBtn) activeBtn.classList.add('active');
    
    if(window.innerWidth <= 1024 && sidebar) sidebar.classList.remove('open');

    // 3. LOGIQUE DE RENDU (Lancement des fonctions spécifiques à chaque page)
    switch(pageId) {
        case 'page-a':
            renderPortalsList('portal-list', false);
            break;

        case 'page-b':
            if (typeof renderUsersList === 'function') renderUsersList();
            break;

        case 'page-c':
            renderPortalsList('portals-config-list', true);
            break;

        case 'page-d':
            if (typeof renderLogs === 'function') renderLogs();
            break;

        // --- NOUVEAU : GESTION DE LA PAGE ALERTES ---
   case 'page-alerts':
    // 1. Affiche la liste des règles mémorisées (Mes Règles Actives)
    if (typeof renderRulesList === 'function') {
        renderRulesList();
    }
    // 2. Vérifie la santé du système (IP, config) comme demandé
    if (typeof checkSystemHealth === 'function') {
        checkSystemHealth();
    }
    break;
    break;
        case 'page-f':
            if (typeof initComfortPage === 'function') initComfortPage();
            break;

        case 'page-keys':
            if (typeof renderKeysPage === 'function') renderKeysPage();
            break;

        case 'page-trash':
            if (typeof renderTrashContent === 'function') renderTrashContent();
            break;

        case 'page-user-simple':
            // Logique spécifique gérée lors de la connexion
            break;
    }
}

function remplirSelecteursAlertes() {
    // On cible tous les menus qui ont la classe "portal-select"
    const selects = document.querySelectorAll('.portal-select');
    const portails = appConfig.portals || [];

    selects.forEach(select => {
        // On vide pour éviter de rajouter les noms en double à chaque clic
        select.innerHTML = '<option value="all">-- Tous les accès --</option>';
        
        // On remplit avec les vrais portails du coffret
        portails.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name; 
            opt.textContent = p.name;
            select.appendChild(opt);
        });
    });
}
// --- À METTRE DANS SCRIPT.JS ---
function verifierAcces(user) {
    if (user.role === "ADMINISTRATEUR") {
        showPage('page-a'); // Envoie l'Admin vers le tableau de bord
    } else {
        renderUserSimpleAccess(user); // Prépare les boutons de l'utilisateur
        showPage('page-user-simple'); // Envoie l'utilisateur vers sa page simplifiée
    }
}
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// --- 3. ACCUEIL & STATS ---
function renderHomePage() {
    const statsContainer = document.getElementById('stats-container');
    const now = Date.now();
    const last24h = logs.filter(l => (now - l.id) < 86400000);

    statsContainer.innerHTML = `
        <div class="card">
            <small style="color:var(--text-sub)">Ouvertures (24h)</small><br>
            <strong style="font-size:1.5rem; color:var(--accent)">${last24h.filter(l => l.type==='success').length}</strong>
        </div>
        <div class="card">
            <small style="color:var(--text-sub)">Alertes</small><br>
            <strong style="font-size:1.5rem; color:var(--red)">${last24h.filter(l => l.type==='error').length}</strong>
        </div>
    `;

    const portalList = document.getElementById('portal-list');
    portalList.innerHTML = portals.length ? '' : '<p>Aucun portail configuré.</p>';
    
    portals.forEach(p => {
        const div = document.createElement('div');
        div.className = "card";
        div.style = "display:flex; justify-content:space-between; align-items:center;";
        // Appel à checkAndOpen (défini dans la Partie 2)
        div.innerHTML = `
            <span><strong>${p.name}</strong></span> 
            <button class="btn-primary" onclick="checkAndOpen('${p.id}', ${p.relayIndex})">OUVRIR</button>
        `;
        portalList.appendChild(div);
    });
}

// --- 4. GESTION DES PROFILS & RECHERCHE ---
/**
 * Affiche la liste des profils utilisateurs (Page B)
 */
function renderUsersList() {
    // CORRECTION : On utilise l'ID exact présent dans ton HTML
    const container = document.getElementById('users-list-container'); 
    
    if (!container) {
        console.error("ERREUR : L'élément 'users-list-container' est introuvable.");
        return;
    }

    const list = appConfig.users || [];

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--text-sub);">
                <p>Aucun utilisateur enregistré.</p>
                <small>Cliquez sur "+ Nouveau" pour créer un profil.</small>
            </div>`;
        return;
    }

    container.innerHTML = ""; // Nettoyage

    list.forEach((user, idx) => {
        // Définition des couleurs et icônes par rôle
        let roleColor = "#94a3b8"; // Gris par défaut (Utilisateur)
        let roleLabel = user.role || "UTILISATEUR";
        let roleIcon = "👤";

        if (user.role === "ADMINISTRATEUR") {
            roleColor = "#ef4444"; // Rouge pour l'Admin
            roleIcon = "🔑";
        } else if (user.role === "INVITE") {
            roleColor = "#f59e0b"; // Orange pour l'Invité
            roleIcon = "⏳";
        } else if (user.role === "UTILISATEUR") {
            roleColor = "#2563eb"; // Bleu pour l'Utilisateur
        }

        const div = document.createElement('div');
        div.className = "card";
        // VIGILANCE : La bordure gauche prend la couleur du rôle
        div.style = `margin-top:10px; border-left: 5px solid ${roleColor}; padding:15px; position: relative;`;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <strong style="font-size:1.1rem; color:var(--text-dark);">${user.lastname} ${user.firstname}</strong>
                        <span style="font-size:0.7rem; background:${roleColor}22; color:${roleColor}; padding:2px 6px; border-radius:4px; border:1px solid ${roleColor}; font-weight:bold;">
                            ${roleIcon} ${roleLabel}
                        </span>
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-sub); margin-top:4px;">
                        Accessoire(s) : ${user.access?.code ? '🔢 Code' : ''} ${user.access?.rfid ? '🛰️ Badge' : ''} ${user.access?.remote ? '🎮 Télécommande' : ''}
                        ${(!user.access?.code && !user.access?.rfid && !user.access?.remote) ? '<i>Aucun</i>' : ''}
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn-outline" onclick="editUser('${user.id}')">✏️</button>
                    <button class="btn-outline" style="color:var(--red);" onclick="deleteUser(${idx})">🗑️</button>
                    <button class="btn-outline" onclick="testerVueClient('${user.id}')">👁️ Vue Client</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}
function editUser(userId) {
    // 1. Trouver l'utilisateur
    const user = appConfig.users.find(u => u.id === userId);
    if (!user) return;

    // 2. On définit le portail lié pour le formulaire
    appConfig.currentPortalId = user.access?.portalId || null;

    // 3. On stocke l'ID en cours de modification
    appConfig.currentEditingUserId = userId;

    // --- MISE À JOUR DU RÔLE DANS LE FORMULAIRE ---
    const roleSelect = document.getElementById('user-role');
    if (roleSelect) {
        roleSelect.value = user.role || "UTILISATEUR";
    }

    // 4. On appelle ton openUserForm
    const dataForForm = {
        ...user,
        code: user.access?.code,
        rfid: user.access?.rfid,
        remote: user.access?.remote
    };
    
    openUserForm(dataForForm);
    
    // 5. Ajuster le titre
    const title = document.getElementById('user-form-title');
    if(title) title.innerText = "Modifier le profil de " + user.firstname;
}
function filterUserList() {
    const term = document.getElementById('user-search-input').value.toLowerCase();
    document.querySelectorAll('#user-list-container .card').forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(term) ? "flex" : "none";
    });
}

// --- 5. SYSTEME DE LOGS AVANCÉ (PAGE D) ---

function addSystemLog(msg, type = 'info') {
    logs.unshift({ 
        id: Date.now(), 
        msg: msg, 
        type: type, 
        time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) 
    });
    
    // Limite à 100 logs
    if(logs.length > 100) logs.pop();
    saveToLocalStorage();
}

function renderLogs(filter = 'all') {
    const container = document.getElementById('log-list');
    if(!container) return;

    let filteredLogs = logs;
    if (filter !== 'all') {
        filteredLogs = logs.filter(l => l.type === filter);
    }

    if (filteredLogs.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-sub);">Aucun historique disponible.</div>`;
        return;
    }

    container.innerHTML = filteredLogs.map(l => `
        <div class="log-item ${l.type}">
            <span style="flex:1;">${l.msg}</span>
            <span class="log-time">${l.time}</span>
        </div>
    `).join('');
}

function clearLogs() {
    if(confirm("Voulez-vous vraiment effacer tout l'historique ?")) {
        logs = [];
        saveToLocalStorage();
        renderLogs();
        renderHomePage();
    }
}

// --- 6. (Section réservée - Action déplacée en Section 15) ---

// --- 7. CORBEILLE ---
function renderTrash() {
    const container = document.getElementById('trash-container');
    if(!container) return;

    if (deletedUsers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-sub); margin-top:20px;">La corbeille est vide.</p>';
        return;
    }

    container.innerHTML = deletedUsers.map((item, idx) => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; border-left: 4px solid ${item.type === 'portal' ? '#f59e0b' : '#64748b'};">
            <div>
                <strong>${item.name}</strong><br>
                <small>${item.type === 'portal' ? '📂 Accès/Portail' : '👤 Utilisateur'}</small>
            </div>
            <button class="btn-outline" onclick="restoreFromTrash(${idx})">Restaurer</button>
        </div>
    `).join('');
}

function restoreFromTrash(index) {
    const item = deletedUsers.splice(index, 1)[0];
    
    if (item.type === 'portal') {
        appConfig.portals.push(item);
        showToast(`Accès restauré : ${item.name}`, 'success');
    } else {
        appConfig.users.push(item); 
        showToast(`Utilisateur restauré : ${item.name}`, 'success');
    }
    
    saveToLocalStorage();
    renderTrash(); // On rafraîchit la vue corbeille
    
    // On rafraîchit les listes actives
    if (typeof renderUserList === 'function') renderUserList();
    if (typeof renderPortalsConfigList === 'function') renderPortalsConfigList();
}

// --- 9. MODULE CONFIGURATION ACCÈS (PAGE C) ---
function toggleConnType() {
    const type = document.getElementById('new-portal-connection-type').value;
    const groupLocal = document.getElementById('group-local-ip');
    const groupCloud = document.getElementById('group-cloud-imei');

    if (type === 'cloud') {
        groupLocal.style.display = 'none';
        groupCloud.style.display = 'block';
        console.log("Vigilance : Mode 4G activé (Champs IMEI visible)");
    } else {
        groupLocal.style.display = 'block';
        groupCloud.style.display = 'none';
        console.log("Vigilance : Mode IP activé (Champs IP visible)");
    }
}
function toggleEditConnType() {
    const type = document.getElementById('edit-portal-connection-type').value;
    document.getElementById('edit-group-local').style.display = (type === 'local') ? 'block' : 'none';
    document.getElementById('edit-group-cloud').style.display = (type === 'cloud') ? 'block' : 'none';
}
function togglePortalForm(show) {
    const form = document.getElementById('portal-form-container');
    const btn = document.getElementById('btn-add-portal');
    if(form) form.style.display = show ? 'block' : 'none';
    if(btn) btn.style.display = show ? 'none' : 'block';
}
function submitPortal() {
    const nameInput = document.getElementById('new-portal-name');
    const locationInput = document.getElementById('welcome-portal-location');
    const brandInput = document.getElementById('new-portal-brand');
    const connTypeInput = document.getElementById('new-portal-connection-type'); // Nouveau
    const ipInput = document.getElementById('new-portal-ip');
    const cloudIdInput = document.getElementById('new-portal-cloudid'); // Nouveau
    const relayInput = document.getElementById('new-portal-relay');
    const coordInput = document.getElementById('new-portal-coords');

    // Détermination de la validité selon le mode
    const isLocal = connTypeInput.value === 'local';
    const hasIdentifier = isLocal ? ipInput.value : cloudIdInput.value;

    // Vigilance : Nom, Identifiant (IP ou IMEI) et Relais obligatoires
    if (nameInput.value && hasIdentifier && relayInput.value) {
        
        const newPortal = {
            id: 'p' + Date.now(),
            name: nameInput.value,
            location: locationInput.value || "Lieu non défini",
            brand: brandInput.value,
            connectionType: connTypeInput.value, // 'local' ou 'cloud'
            ip: isLocal ? ipInput.value : null,
            cloudId: !isLocal ? cloudIdInput.value : null,
            relay: parseInt(relayInput.value),
            relayIndex: parseInt(relayInput.value), 
            status: "FERMÉ",
            isButtonLocked: false,
            hasKeypad: false,
            hasRFID: false,
            hasRemote: false,
            lat: coordInput.dataset.lat ? parseFloat(coordInput.dataset.lat) : null,
            lon: coordInput.dataset.lon ? parseFloat(coordInput.dataset.lon) : null,
            coords: coordInput.value || "",
            codes: [],   
            badges: [],  
            remotes: []
        };

        if (!appConfig.portals) appConfig.portals = [];
        appConfig.portals.push(newPortal);
        
        saveToLocalStorage();
        
        showPage('page-c');
        if (typeof renderPortalsConfigList === 'function') renderPortalsConfigList();
        
        if (typeof addSystemLog === 'function') {
            const detail = isLocal ? `IP: ${ipInput.value}` : `4G: ${cloudIdInput.value}`;
            addSystemLog(`Accès "${nameInput.value}" créé (${detail})`, 'success');
        }

        if (typeof showToast === 'function') showToast("Accès configuré avec succès");
        
        // Reset form complet
        nameInput.value = "";
        locationInput.value = "";
        ipInput.value = "";
        cloudIdInput.value = "";
        relayInput.value = "1";
        coordInput.value = "";
        if (connTypeInput) connTypeInput.value = "local"; // Retour par défaut
        toggleConnType(); // Masquer le champ cloud pour le prochain ajout
        
        delete coordInput.dataset.lat;
        delete coordInput.dataset.lon;
        if (typeof togglePortalForm === 'function') togglePortalForm(false);
        
    } else {
        const msg = isLocal ? "Nom, IP et Relais obligatoires" : "Nom, IMEI et Relais obligatoires";
        if (typeof showToast === 'function') {
            showToast(msg, "error");
        } else {
            alert(msg);
        }
    }
}
/**
 * Affiche la liste des accès.
 * @param {string} containerId - 'portal-list' (Page A) ou 'portals-config-list' (Page C)
 * @param {boolean} isConfigMode - Si vrai, affiche "Réglages/Supprimer", sinon affiche "Ouvrir"
 *//**
 * Affiche les accès groupés par Lieu
 * Emplacement : Remplace l'ancienne fonction renderPortalsList
 */
function renderPortalsList(containerId, isConfigMode = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    // 1. Header avec bouton Mise à jour
    const headerDiv = document.createElement('div');
    headerDiv.style.display = "flex";
    headerDiv.style.justifyContent = "space-between";
    headerDiv.style.alignItems = "center";
    headerDiv.style.marginBottom = "20px";
    headerDiv.innerHTML = `
        <h2 style="margin:0; font-size:1.4rem;">Mes Accès</h2>
        <button class="btn-outline" onclick="refreshAllStatuses()" style="font-size:0.75rem; padding:6px 12px;">
            🔄 MISE À JOUR
        </button>
    `;
    container.appendChild(headerDiv);

    // 2. Vérification si la liste est vide
    if (!appConfig.portals || appConfig.portals.length === 0) {
        container.innerHTML += '<p style="text-align:center; opacity:0.5; padding:20px;">Aucun accès configuré.</p>';
        return;
    }

    // 3. Génération de la liste
    const listZone = document.createElement('div');
    listZone.innerHTML = appConfig.portals.map(portal => {
        const status = portal.status || 'FERMÉ'; 
        let statusColor = '#28a745'; // Vert par défaut
        let statusHtml = status;
        
        // Détermination de l'action du bouton (l'inverse de l'état ou de la manœuvre)
        let nextAction = "";
        if (status === 'EN COURS') {
            nextAction = (portal.currentAction === 'OUVERTURE') ? "FERMER" : "OUVRIR";
        } else {
            nextAction = (status === 'OUVERT') ? "FERMER" : "OUVRIR";
        }
        
        let actionClass = (nextAction === "FERMER") ? "btn-danger" : "btn-primary";

        // Ajustement des couleurs et labels selon l'état
        if (status === 'OUVERT') statusColor = '#ffc107'; 
        if (status === 'DÉFAUT') statusColor = '#dc3545'; 
        
        if (status === 'EN COURS') {
            statusColor = '#007bff';
            const labelManœuvre = portal.currentAction || "ACTION";
            statusHtml = `
                <div class="portal-icon-anim is-moving">
                    <div class="portal-leaf left"></div>
                    <div class="portal-leaf right"></div>
                </div>
                <span style="margin-left:8px; font-size:0.65rem; line-height:1.1; text-align:left;">
                    ${labelManœuvre}<br>EN COURS
                </span>
            `;
        }

        return `
            <div class="card-access" style="display:flex; align-items:center; gap:12px; padding:15px; margin-bottom:12px; background:white; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05); border-left:6px solid ${statusColor};">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${portal.name}</div>
                    <div style="font-size:0.8rem; color:#777;">${portal.location}</div>
                </div>
                
                <div style="text-align:right; min-width:125px; margin-right:5px;">
                    <div style="display:flex; align-items:center; justify-content:flex-end; font-weight:900; font-size:0.75rem; color:${statusColor};">
                        ${statusHtml}
                    </div>
                </div>

                <div style="display:flex; gap:8px;">
                    ${isConfigMode ? 
                        `<button onclick="openPortalSettings('${portal.id}')" class="btn-icon">⚙️</button>` : 
                        `<button onclick="triggerAccess('${portal.id}')" 
                                 class="${actionClass}" 
                                 style="min-width:80px; padding:10px 5px; font-size:0.8rem;" 
                                 ${portal.isButtonLocked ? 'disabled' : ''}>
                                 ${portal.isButtonLocked ? '...' : nextAction}
                         </button>`
                    }
                </div>
            </div>
        `;
    }).join('');

    container.appendChild(listZone);
}

// ==========================================
// FONCTIONS UTILITAIRES (GLOBALES)
// ==========================================

function showToast(message, type = 'success') {
    // On cherche si le toast existe déjà
    let toast = document.getElementById('app-toast');
    
    // S'il n'existe pas, on le crée proprement
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        document.body.appendChild(toast);
    }

    // On applique le message et le style (success ou error)
    toast.className = `toast-notification toast-${type} show`;
    toast.innerHTML = (type === 'success' ? '✅ ' : '⚠️ ') + message;

    // Vigilance : on retire la classe 'show' après 4 secondes
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}
    // --- FONCTION DE MISE À JOUR DES ÉTATS ---
function refreshAllStatuses() {
    console.log("Vigilance : Requête de mise à jour des états envoyée...");
    
    // On essaye de récupérer le bouton pour l'animation (feedback visuel)
    const btn = event ? event.target : null;
    let originalText = "";
    
    if (btn && btn.tagName === 'BUTTON') {
        originalText = btn.innerHTML;
        btn.innerHTML = "⏳ MAJ...";
        btn.disabled = true;
    }

    // Simulation de la lecture des relais (Kincony, Shelly, etc.)
    setTimeout(() => {
        appConfig.portals.forEach(portal => {
            // Logique de détermination de l'état
            if (!portal.ip || portal.ip === "") {
                portal.status = 'DÉFAUT'; // Rouge si pas d'IP
            } else {
                // Pour l'instant on simule, on mettra le fetch() ici plus tard
                const random = Math.random();
                if (random > 0.9) portal.status = 'OUVERT';
                else if (random < 0.1) portal.status = 'DÉFAUT';
                else portal.status = 'FERMÉ';
            }
        });

        // On rafraîchit l'affichage
        renderPortalsList('portal-list', false);
        
        // On remet le bouton en état si on l'a trouvé
        if (btn && btn.tagName === 'BUTTON') {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        
        console.log("États mis à jour avec succès.");
    }, 1200);
}
// --- MODULE LAPI (CONNEXION MATÉRIEL) ---
function sendHardwareCommand(portal) {
    let url = "";
    
    if (portal.connectionType === "cloud") {
        // Logique 4G LTE
        // Souvent, on appelle une API du constructeur (ex: Kincony Cloud)
        url = `https://api.kincony.com/control?id=${portal.cloudId}&relay=${portal.relay}&action=ON`;
        console.log("Vigilance : Commande envoyée via le Cloud 4G");
    } else {
        // Logique Locale (ce qu'on a fait avant)
        switch(portal.brand) {
            case "Shelly":
                url = `http://${portal.ip}/relay/${portal.relay - 1}?turn=on`;
                break;
            case "Kincony":
                url = `http://${portal.ip}/control/relay?number=${portal.relay}&status=1`;
                break;
        }
    }
    return url;
}
// --- LOGIQUE DE COMMANDE ET RÉSEAU ---
function triggerAccess(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;

    if (portalTimers[portalId]) {
        clearTimeout(portalTimers[portalId]);
        delete portalTimers[portalId];
    }

    const isOpening = (portal.status === 'FERMÉ' || portal.status === 'DÉFAUT' || !portal.status);
    const commandSuccessful = portal.ip && portal.ip !== ""; 

    if (commandSuccessful) {
        showToast("Commande bien envoyée");
        
        portal.status = 'EN COURS';
        portal.currentAction = isOpening ? 'OUVERTURE' : 'FERMETURE';
        portal.isButtonLocked = true;
        
        // --- MISE À JOUR VISUELLE INTELLIGENTE ---
        updateAllUI(); 

        // Libération bouton après 3s
        setTimeout(() => {
            portal.isButtonLocked = false; 
            updateAllUI();
        }, 3000);

        // Timer de fin de course après 15s
        portalTimers[portalId] = setTimeout(() => {
            portal.status = isOpening ? 'OUVERT' : 'FERMÉ';
            portal.currentAction = null;
            delete portalTimers[portalId];
            updateAllUI();
        }, 15000);

    } else {
        showToast("Échec de la commande", "error");
        portal.status = 'DÉFAUT';
        updateAllUI();
    }
}

// Petite fonction utilitaire pour rafraîchir la page active
function updateAllUI() {
    // Si la page utilisateur est active, on rafraîchit ses boutons
    const userPage = document.getElementById('page-user-simple');
    if (userPage && userPage.classList.contains('active')) {
        // On récupère l'utilisateur actuel (à stocker lors du testerVueClient)
        if (window.currentActiveUser) {
            renderUserSimpleAccess(window.currentActiveUser);
        }
    } else {
        // Sinon, on rafraîchit les listes admin classiques
        if (document.getElementById('portal-list')) renderPortalsList('portal-list', false);
        if (document.getElementById('portals-config-list')) renderPortalsList('portals-config-list', true);
    }
}
function deletePortal(id) {
    if (!confirm("Envoyer cet accès à la corbeille ?")) return;

    const index = appConfig.portals.findIndex(p => p.id === id);
    if (index === -1) return;

    // On prépare l'objet pour la corbeille
    const item = appConfig.portals.splice(index, 1)[0];
    item.type = 'portal'; // Indispensable pour renderTrash

    // On l'ajoute au tableau que ta fonction renderTrash utilise
    if (!window.deletedUsers) window.deletedUsers = []; 
    deletedUsers.push(item);

    saveToLocalStorage();
    document.getElementById('portal-fiche-overlay').style.display = 'none';
    
    // Rafraîchissement
    if (typeof renderPortalsConfigList === 'function') renderPortalsConfigList();
    showToast("Accès déplacé vers la corbeille", "info");
}
// --- 10. MODULE EXPORT / IMPORT (PAGE I) ---
function exportData() {
    const data = { portals, users, logs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thera_backup_${new Date().toLocaleDateString()}.json`;
    a.click();
}

function triggerImport() { document.getElementById('import-file').click(); }

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if(data.users && data.portals) {
                appConfig.users = data.users;
                portals = data.portals;
                logs = data.logs || [];
                saveToLocalStorage();
                alert("Importation réussie !");
                location.reload();
            }
        } catch (err) { alert("Fichier invalide."); }
    };
    reader.readAsText(file);
}

// --- 11. LOGIQUE PARAMÈTRES ET RÉGLAGES (F & G) ---

function saveHardwareSettings() {
    const ip = document.getElementById('hardware-ip').value;
    localStorage.setItem('thera_hardware_ip', ip);
    addSystemLog(`Configuration IP mise à jour : ${ip}`, 'success');
    alert("Réglages enregistrés.");
}

function saveAppSettings() {
    const name = document.getElementById('install-name').value;
    localStorage.setItem('thera_install_name', name);
    document.title = name || "THERA CONNECT";
    alert("Paramètres appliqués.");
}

// --- 13. VIDAGE DE LA CORBEILLE (H) ---
function emptyTrash() {
    if(confirm("Vider définitivement la corbeille ?")) {
        deletedUsers = [];
        saveToLocalStorage();
        renderTrash();
        addSystemLog("Corbeille vidée", "info");
    }
}

// --- 14. MODULE FORMULAIRE UTILISATEUR (PAGE B) ---

let currentEditingIndex = null; 
/**
 * Génère le formulaire de profil utilisateur
 * @param {Object} userData - Données du profil si édition, sinon null
 */
function openUserForm(userData = null) {
    showPage('page-user-create'); 
    const container = document.getElementById('user-form-content');
    if (!container) return;

    // On prépare la partie dynamique (Accès + Planning avec bulles)
    const zonePlanning = generateAccessAndScheduleHTML(userData);

    container.innerHTML = `
        <div class="card">
            <h3>👤 Identité de l'usager</h3>
            <div style="display:flex; gap:10px; margin-bottom:15px;">
                <div style="flex:1;">
                    <label>Nom</label>
                    <input type="text" id="user-lastname" class="input-text" placeholder="NOM" value="${userData?.lastname || ''}">
                </div>
                <div style="flex:1;">
                    <label>Prénom</label>
                    <input type="text" id="user-firstname" class="input-text" placeholder="Prénom" value="${userData?.firstname || ''}">
                </div>
                <div class="form-group" style="margin-top: 10px;">
             <label>Rôle du profil</label>
         <div class="role-selector" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 5px;">
        <select id="user-role" class="input-field" style="grid-column: span 3; padding: 12px; border-radius: 8px; border: 1px solid #ddd;">
           <option value="ADMINISTRATEUR">🔑 ADMINISTRATEUR</option>
        <option value="UTILISATEUR" selected>👤 UTILISATEUR</option>
            <option value="INVITE">⏳ INVITE</option>
           </select>
       </div>
     </div>
            </div>
        </div>

        <div class="card">
            ${zonePlanning} 
        </div>

        <div class="card">
            <h3>🔑 Modules physiques (Optionnels)</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                <div>
                    <label>Code Clavier</label>
                    <input type="text" id="user-code" class="input-text" value="${userData?.access?.code || ''}" placeholder="Ex: 1234">
                </div>
                <div>
                    <label>Badge RFID</label>
                    <input type="text" id="user-rfid" class="input-text" value="${userData?.access?.rfid || ''}" placeholder="ID Badge">
                </div>
                <div>
                    <label>Télécommande</label>
                    <input type="text" id="user-remote" class="input-text" value="${userData?.access?.remote || ''}" placeholder="N° Bip">
                </div>
            </div>
        </div>

        <div style="display:flex; gap:10px; margin-top:20px; padding-bottom:40px;">
            <button class="btn-primary" style="flex:2;" onclick="saveUser()">💾 ENREGISTRER LE PROFIL</button>
            <button class="btn-outline" style="flex:1;" onclick="showPage('page-b')">ANNULER</button>
        </div>
    `;
}
// Outil pour fabriquer l'affichage des accès et du planning
function generateAccessAndScheduleHTML(userData = null) {
    // 1. Liste des portails (Accès autorisés)
    let portalsHTML = '<h3>🚪 Accès autorisés</h3><div style="margin-bottom:20px; background:rgba(0,0,0,0.05); padding:15px; border-radius:12px;">';
    appConfig.portals.forEach(p => {
        const isChecked = userData?.access?.portals?.includes(p.id) ? 'checked' : '';
        portalsHTML += `
            <label style="display:flex; align-items:center; gap:12px; margin-bottom:10px; cursor:pointer;">
                <input type="checkbox" class="portal-checkbox" value="${p.id}" ${isChecked} style="width:22px; height:22px;"> 
                <span style="font-size:1rem;">${p.name} <small style="opacity:0.6;">(Relais ${p.relayIndex || p.relay})</small></span>
            </label>`;
    });
    portalsHTML += '</div>';

    // 2. Planning Hebdomadaire (Design Bulles 2026)
    const daysData = userData?.access?.schedule?.days || { mon:true, tue:true, wed:true, thu:true, fri:true, sat:false, sun:false };
    const dayKeys = [
        { key: 'mon', label: 'L' }, { key: 'tue', label: 'M' }, { key: 'wed', label: 'M' },
        { key: 'thu', label: 'J' }, { key: 'fri', label: 'V' }, { key: 'sat', label: 'S' }, { key: 'sun', label: 'D' }
    ];

    const daysHTML = `
        <h3>📅 Planning hebdomadaire</h3>
        <div class="days-selector" style="margin-bottom:20px; background:rgba(0,0,0,0.05); padding:15px; border-radius:12px; display:flex; justify-content:space-between;">
            ${dayKeys.map(d => `
                <div class="day-bubble ${daysData[d.key] ? 'active' : ''}" 
                     onclick="this.classList.toggle('active')" 
                     id="btn-day-${d.key}"
                     style="cursor:pointer;">
                     ${d.label}
                </div>
            `).join('')}
        </div>
        
        <h3>⏰ Plages horaires</h3>
        <div id="time-slots-container"></div>
        <button type="button" class="btn-outline" onclick="addTimeSlot()" style="width:100%; margin-bottom:20px;">+ Ajouter un horaire</button>
        
        <h3>⌛ Expiration de l'accès</h3>
        <input type="date" id="user-expiry" class="input-text" value="${userData?.expiry || ''}" style="margin-bottom:10px;">
    `;

    return portalsHTML + daysHTML;
}

/**
 * Petite fonction pour rafraîchir les modules quand on change de portail dans la liste
 */
function updatePortalAssignment(portalId) {
    appConfig.currentPortalId = portalId;
    
    // On récupère ce qui est écrit dans les champs pour ne pas le perdre
    const currentData = {
        id: appConfig.currentEditingUserId, // IMPORTANT : On garde l'ID
        lastname: document.getElementById('user-lastname').value,
        firstname: document.getElementById('user-firstname').value,
        expiry: document.getElementById('user-expiry').value,
        code: document.getElementById('user-code')?.value || '',
        rfid: document.getElementById('user-rfid')?.value || '',
        remote: document.getElementById('user-remote')?.value || ''
    };
    
    // On relance le formulaire avec ces données
    openUserForm(currentData);
}
function deleteUser(id) {
    if (!confirm("Envoyer cet utilisateur à la corbeille ?")) return;

    const index = appConfig.users.findIndex(u => u.id === id);
    if (index === -1) return;

    const item = appConfig.users.splice(index, 1)[0];
    item.type = 'user'; // Indispensable pour renderTrash

    if (!window.deletedUsers) window.deletedUsers = [];
    deletedUsers.push(item);

    saveToLocalStorage();
    if (typeof renderUserList === 'function') renderUserList();
    
    showToast("Utilisateur déplacé vers la corbeille", "info");
}

// --- 15. MODULE PARTAGE & INVITÉ ---

function shareUserAccess(index) {
    const user = users[index];
    const url = `${window.location.origin}${window.location.pathname}?id=${user.id}`;
    const msg = `Bonjour ${user.name}, voici votre lien d'accès sécurisé THERA CONNECT : ${url}`;
    
    navigator.clipboard.writeText(msg);
    if(confirm("Lien copié ! Ouvrir WhatsApp ?")) {
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
}

function loadGuestView(guestId) {
    const guest = users.find(u => u.id == guestId);
    if (!guest) return alert("Accès refusé ou lien expiré.");

    document.body.innerHTML = ''; 
    document.body.style.background = "#fff";
    
    const validPortals = portals.filter(p => guest.access.includes(p.id));
    
    document.body.innerHTML = `
        <div style="max-width:400px; margin:0 auto; padding:20px; text-align:center; font-family:'Inter',sans-serif;">
            <h1 style="color:#1e293b; font-size:1.5rem; margin-bottom:5px;">THERA<span>CONNECT</span></h1>
            <p style="color:#64748b; margin-bottom:30px;">Bonjour ${guest.name}</p>
            
            <div style="display:flex; flex-direction:column; gap:15px;">
                ${validPortals.map(p => `
                    <button onclick="triggerGuestRelay('${p.id}', ${p.relayIndex})" 
                            style="padding:20px; font-size:1.1rem; background:#2563eb; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px rgba(37,99,235,0.3);">
                        🔓 OUVRIR ${p.name.toUpperCase()}
                    </button>
                `).join('')}
            </div>
            
            ${validPortals.length === 0 ? '<p>Aucun accès autorisé.</p>' : ''}
            <p style="margin-top:40px; font-size:0.8rem; color:#ccc;">Accès sécurisé V300</p>
        </div>
    `;
}

function triggerGuestRelay(id, relay) {
    // Appel direct à l'API matérielle (Section 23)
    sendHardwareCommand(relay);
    addSystemLog(`Accès Invité : ${id}`, 'info');
    alert("Commande envoyée !");
}

// --- 16. LOGIQUE DU PLANNING ---

function togglePlanningMode() {
    const mode = document.getElementById('input-planning').value;
    const details = document.getElementById('planning-details');
    if(details) details.style.display = mode === 'custom' ? 'block' : 'none';
}

function toggleDay(dayIndex) {
    const btn = document.getElementById(`day-${dayIndex}`);
    if(btn) btn.classList.toggle('selected');
}

// --- 17. MODULE BIENVENUE (PREMIÈRE CONNEXION) ---
function testWelcomeConnection(btn) {
    // 1. On récupère l'élément
    const ipField = document.getElementById('welcome-portal-ip');
    
    // 2. Sécurité : on vérifie que l'élément existe bien dans le HTML
    if (!ipField) {
        console.error("Erreur de frappe : L'ID 'welcome-portal-ip' n'existe pas dans le HTML.");
        alert("Erreur technique : ID de champ introuvable.");
        return;
    }

    const ipValue = ipField.value.trim();
    
    // 3. Vérification si le champ est vide
    if (!ipValue) { 
        alert("Veuillez entrer une adresse IP ou un ID Cloud avant de tester."); 
        return; 
    }

    // Effet visuel
    const originalText = btn.innerText;
    btn.innerText = "RECHERCHE...";
    btn.disabled = true;

    setTimeout(() => {
        btn.innerText = "CONNECTÉ ✅";
        btn.disabled = false;
        btn.style.backgroundColor = "#d4edda";
        btn.style.color = "#155724";
    }, 1200);
}

function finishWelcome() {
    const locInput = document.getElementById('welcome-portal-location');
    const nameInput = document.getElementById('welcome-portal-name');
    const relayInput = document.getElementById('welcome-portal-relay');
    const brandInput = document.getElementById('welcome-portal-brand'); // Nouveau
    const ipInput = document.getElementById('welcome-portal-ip');       // Nouveau

    // Vérification de sécurité renforcée
    if (!nameInput.value || !relayInput.value || !ipInput.value) {
        alert("Le nom, le relais et l'adresse IP sont obligatoires pour configurer le boîtier.");
        return;
    }

    // 1. Création du premier portail avec identité et connexion
    const firstPortal = {
        id: 'portal_' + Date.now(),
        location: locInput.value || "Général",
        name: nameInput.value,
        relayIndex: parseInt(relayInput.value),
        brand: brandInput ? brandInput.value : "kincony", // Marque par défaut
        ip: ipInput.value.trim(),                          // IP du boîtier
        hasKeypad: false,
        hasRFID: false,
        hasRemote: false,
        coords: ""
    };

    // 2. Mise à jour de la configuration globale
    appConfig.portals.push(firstPortal);
    appConfig.isFirstRun = false;
    
    // 3. Sauvegardes persistantes (Marqueur de config + LocalStorage)
    localStorage.setItem('thera_is_configured', 'true');
    saveToLocalStorage(); 
    
    // 4. Transition visuelle (On va sur la Page A ou C selon ton choix d'accueil)
    showPage('page-a');
    
    // 5. Rendu immédiat des listes
    if (typeof renderPortalsList === 'function') {
        renderPortalsList('portal-list', false); 
        renderPortalsList('portals-config-list', true); // Mise à jour du mode config aussi
    }
    
    console.log("Système Thera Connect initialisé avec :", firstPortal.name, "sur l'IP", firstPortal.ip);
    alert("Configuration réussie ! Bienvenue dans votre interface Thera Connect.");
}

// --- 18. MODULE SYSTÈME & HARDWARE (PAGE I) ---

function saveHardwareConfig() {
    const brand = document.getElementById('hardware-brand').value;
    const ip = document.getElementById('hardware-ip').value;
    
    localStorage.setItem('thera_hardware_brand', brand);
    localStorage.setItem('thera_hardware_ip', ip);
    
    addSystemLog(`Matériel configuré : ${brand} (${ip})`, "success");
    alert("Configuration matérielle enregistrée !");
}

function testConnection() {
    const brand = document.getElementById('hardware-brand').value;
    const ip = document.getElementById('hardware-ip').value;
    const resultDiv = document.getElementById('test-result');

    if (!ip) {
        resultDiv.style.color = "var(--red)";
        resultDiv.innerText = "❌ Erreur : IP manquante";
        return;
    }

    resultDiv.style.color = "var(--accent)";
    resultDiv.innerText = `⏳ Tentative de connexion à ${brand}...`;

    setTimeout(() => {
        resultDiv.style.color = "var(--green)";
        resultDiv.innerText = `✅ Succès : ${brand} répond sur ${ip}`;
        addSystemLog(`Test de connexion réussi avec ${brand}`, "success");
    }, 1500);
}

function initSystemPage() {
    const savedBrand = localStorage.getItem('thera_hardware_brand');
    const savedIp = localStorage.getItem('thera_hardware_ip');
    if(savedBrand) document.getElementById('hardware-brand').value = savedBrand;
    if(savedIp) document.getElementById('hardware-ip').value = savedIp;
}

// --- 19. MODULE ALERTES & SANTÉ DU SYSTÈME (PAGE E) ---

/* ==========================================================
   GESTION DES ALERTES UNIFIÉE
   ========================================================== */

// 1. DÉTECTION : Ces fonctions enregistrent l'incident
/* ==========================================================
   SECTION 1 : SANTÉ SYSTÈME (Uniquement la config)
   ========================================================== */
function checkSystemHealth() {
    const container = document.getElementById('alerts-container');
    if (!container) return;

    container.innerHTML = "";
    let alertCount = 0;

    // On ne garde que les erreurs de CONFIGURATION
    if (!appConfig.portals || appConfig.portals.length === 0) {
        addAlertCard(container, "Critique", "Accès", "Aucun portail configuré.", "var(--red)");
        alertCount++;
    }

    if (!localStorage.getItem('thera_hardware_ip')) {
        addAlertCard(container, "Attention", "IP", "Adresse IP automate manquante.", "#f59e0b");
        alertCount++;
    }

    if (alertCount === 0) {
        container.innerHTML = `<div style="text-align:center; padding:10px; color:green; font-size:0.8rem;">✅ Configuration valide</div>`;
    }
}

// Garde addAlertCard telle quelle, elle est utile pour le bloc ci-dessus
function addAlertCard(container, level, title, desc, color) {
    const card = document.createElement('div');
    card.className = "card";
    card.style = `border-left: 5px solid ${color}; margin-bottom: 10px; padding:10px;`;
    card.innerHTML = `<strong>${level} : ${title}</strong><p style="margin:0; font-size:0.8rem;">${desc}</p>`;
    container.appendChild(card);
}

/* ==========================================================
   SECTION 2 : TES 3 BLOCS DE SÉCURITÉ (Terrain)
   ========================================================== */

// 1. BLOC HORAIRE
// --- INITIALISATION ---
if (!appConfig.alertRules) appConfig.alertRules = [];
let intrusionCounter = {};

// --- LOGIQUE DE L'INTERFACE ---

function toggleAlertSetup() {
    const form = document.getElementById('alert-setup-form');
    const btn = document.getElementById('btn-toggle-setup');
    const isHidden = form.style.display === 'none';
    form.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? "Annuler" : "+ Nouvelle Règle";
    if (isHidden) {
        document.getElementById('edit-rule-id').value = "";
        renderPortalCheckboxes();
    }
}

function renderPortalCheckboxes(selectedNames = []) {
    const container = document.getElementById('setup-portal-checkboxes');
    const portals = appConfig.portals || [];
    container.innerHTML = portals.map(p => `
        <label style="background:#fff; padding:5px 10px; border-radius:15px; border:1px solid #ddd; cursor:pointer;">
            <input type="checkbox" value="${p.name}" ${selectedNames.includes(p.name) ? 'checked' : ''}> ${p.name}
        </label>
    `).join('') || "Aucun accès configuré.";
}

function updateSetupFields() {
    const type = document.getElementById('setup-alert-type').value;
    document.getElementById('param-horaire').style.display = (type === 'horaire') ? 'block' : 'none';
    document.getElementById('param-stay-open').style.display = (type === 'stay_open') ? 'block' : 'none';
}

function saveAlertRule() {
    const selectedPortals = Array.from(document.querySelectorAll('#setup-portal-checkboxes input:checked')).map(cb => cb.value);
    const selectedDays = Array.from(document.querySelectorAll('.setup-day:checked')).map(cb => parseInt(cb.value));
    
    if (selectedPortals.length === 0) return alert("Choisissez au moins un accès");
    if (selectedDays.length === 0) return alert("Choisissez au moins un jour");

    const id = document.getElementById('edit-rule-id').value || Date.now().toString();
    const rule = {
        id: id,
        portals: selectedPortals,
        days: selectedDays,
        type: document.getElementById('setup-alert-type').value,
        start: document.getElementById('time-start').value,
        end: document.getElementById('time-end').value,
        duration: document.getElementById('time-duration').value
    };

    const index = appConfig.alertRules.findIndex(r => r.id === id);
    if (index > -1) appConfig.alertRules[index] = rule;
    else appConfig.alertRules.push(rule);

    if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
    toggleAlertSetup();
    renderRulesList();
}

function renderRulesList() {
    const list = document.getElementById('active-rules-list');
    list.innerHTML = "";
    if (appConfig.alertRules.length === 0) {
        list.innerHTML = `<p style="color:#999; text-align:center;">Aucune règle enregistrée.</p>`;
        return;
    }
    appConfig.alertRules.forEach(rule => {
        const card = document.createElement('div');
        card.className = "card";
        card.style = "margin-bottom:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid var(--primary);";
        const desc = rule.type === 'horaire' ? `🕒 ${rule.start}-${rule.end}` : `🚪 +${rule.duration}min`;
        card.innerHTML = `
            <div onclick="editRule('${rule.id}')" style="cursor:pointer;">
                <strong>${rule.type === 'horaire' ? 'HORAIRES' : 'OUVERTURE'}</strong> - ${rule.portals.join(', ')}<br>
                <small>Jours: ${rule.days.join(',')} | ${desc}</small>
            </div>
            <button onclick="deleteRule('${rule.id}')" style="border:none; background:none;">🗑️</button>
        `;
        list.appendChild(card);
    });
}

function editRule(id) {
    const rule = appConfig.alertRules.find(r => r.id === id);
    if (!rule) return;
    
    toggleAlertSetup();
    document.getElementById('edit-rule-id').value = rule.id;
    document.getElementById('setup-alert-type').value = rule.type;
    document.getElementById('time-start').value = rule.start;
    document.getElementById('time-end').value = rule.end;
    document.getElementById('time-duration').value = rule.duration;
    renderPortalCheckboxes(rule.portals);
    updateSetupFields();
}

function deleteRule(id) {
    appConfig.alertRules = appConfig.alertRules.filter(r => r.id !== id);
    if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
    renderRulesList();
}

// --- FONCTIONS DE VÉRIFICATION (DÉCLENCHEMENT) ---

function verifierAlerteHoraire(portalName) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() + ":" + String(now.getMinutes()).padStart(2, '0');

    const rule = appConfig.alertRules.find(r => 
        r.type === 'horaire' && r.portals.includes(portalName) && r.days.includes(currentDay)
    );

    if (rule) {
        const isAlert = (rule.start < rule.end) 
            ? (currentTime >= rule.start && currentTime <= rule.end) 
            : (currentTime >= rule.start || currentTime <= rule.end);
        if (isAlert) logIncident('display-horaires', `🚨 <b>${portalName}</b> - Ouverture hors-horaire`);
    }
}

function verifierAlerteResteOuvert(portalName, minutesOpen) {
    const now = new Date();
    const currentDay = now.getDay();
    
    // On cherche une règle "stay_open" pour ce portail et ce jour
    const rule = appConfig.alertRules.find(r => 
        r.type === 'stay_open' && r.portals.includes(portalName) && r.days.includes(currentDay)
    );

    if (rule && minutesOpen >= parseInt(rule.duration)) {
        logIncident('display-stay-open', `🚪 <b>${portalName}</b> - Resté ouvert ${minutesOpen}min`);
    }
}

function verifierAlerteIntrusion(idTechnique) {
    intrusionCounter[idTechnique] = (intrusionCounter[idTechnique] || 0) + 1;
    if (intrusionCounter[idTechnique] >= 2) {
        logIncident('display-intrusion', `⚠️ <b>ID: ${idTechnique}</b> - Tentatives répétées`);
    }
}

function verifierAlerteHardware(typeErreur) {
    logIncident('display-hardware', `❌ <b>${typeErreur}</b> - Erreur boîtier`);
}

function logIncident(containerId, message) {
    const container = document.getElementById(containerId);
    if (document.getElementById('no-incident-msg')) document.getElementById('no-incident-msg').style.display = "none";
    const div = document.createElement('div');
    div.className = "alert-item";
    div.style = "padding:8px; border-bottom:1px solid #eee; font-size:0.9rem;";
    div.innerHTML = `${message} <small>(${new Date().toLocaleTimeString()})</small>`;
    container.prepend(div);
}

function resetAllAlerts() {
    ['display-horaires', 'display-stay-open', 'display-intrusion', 'display-hardware'].forEach(id => {
        document.getElementById(id).innerHTML = "";
    });
    document.getElementById('no-incident-msg').style.display = "block";
    intrusionCounter = {};
}
// --- 20. MODULE RÉGLAGES DE CONFORT (PAGE F) ---

function saveComfortSettings() {
    const config = {
        autoLight: document.getElementById('set-auto-light').checked,
        darkMode: document.getElementById('set-dark-mode').checked,
        keypad: document.getElementById('set-module-keypad').checked,
        rfid: document.getElementById('set-module-rfid').checked,
        remote: document.getElementById('set-module-remote').checked,
        gpsActive: document.getElementById('set-gps-active').checked
    };

    localStorage.setItem('thera_comfort_settings', JSON.stringify(config));
    localStorage.setItem('thera_gps_active', config.gpsActive); 
    
    applyDarkMode(config.darkMode);
    // Appel de toggleGPS qui est dans la Partie 2
    if(typeof toggleGPS === "function") toggleGPS(); 
    
    addSystemLog("Réglages mis à jour", "info");
    alert("Fonctions mises à jour !");
}

function initComfortPage() {
    const saved = JSON.parse(localStorage.getItem('thera_comfort_settings'));
    
    if (saved) {
        document.getElementById('set-auto-light').checked = saved.autoLight || false;
        document.getElementById('set-dark-mode').checked = saved.darkMode || false;
        document.getElementById('set-module-keypad').checked = saved.keypad || false;
        document.getElementById('set-module-rfid').checked = saved.rfid || false;
        document.getElementById('set-module-remote').checked = saved.remote || false;
        document.getElementById('set-gps-active').checked = saved.gpsActive || false;
    }

    const gpsActive = localStorage.getItem('thera_gps_active') === 'true';
    if(gpsActive && typeof toggleGPS === "function") toggleGPS(); 
}

function applyDarkMode(active) {
    if(active) {
        const hour = new Date().getHours();
        if(hour >= 19 || hour <= 7) {
            document.body.style.filter = "invert(0.9) hue-rotate(180deg)";
        }
    } else {
        document.body.style.filter = "none";
    }
}

// --- 21. MODULE PARAMÈTRES & BRANDING (PAGE G) ---

function saveBrandingSettings() {
    const name = document.getElementById('brand-name').value;
    const color = document.getElementById('brand-color').value;
    const support = document.getElementById('brand-support').value;

    const branding = {
        name: name || "THERA CONNECT",
        color: color,
        support: support
    };

    localStorage.setItem('thera_branding', JSON.stringify(branding));
    applyBranding(branding);
    addSystemLog(`Branding mis à jour : ${branding.name}`, "info");
    alert("Identité visuelle mise à jour !");
}

function applyBranding(data) {
    if (!data) return;
    document.querySelectorAll('.logo-text').forEach(el => {
        el.innerHTML = `${data.name.split(' ')[0]}<span>${data.name.split(' ').slice(1).join(' ') || ''}</span>`;
    });
    document.documentElement.style.setProperty('--accent', data.color);
    document.title = data.name;
}

function initBrandingPage() {
    const saved = JSON.parse(localStorage.getItem('thera_branding'));
    if (saved) {
        document.getElementById('brand-name').value = saved.name;
        document.getElementById('brand-color').value = saved.color;
        document.getElementById('brand-support').value = saved.support;
    }
}

// --- 22. MAINTENANCE & REBOOT ---

function rebootHardware() {
    const brand = localStorage.getItem('thera_hardware_brand') || "Automate";
    const ip = localStorage.getItem('thera_hardware_ip');
    const statusEl = document.getElementById('reboot-status');

    if (!ip) {
        alert("Erreur : Aucune adresse IP configurée pour cet automate.");
        return;
    }

    if(confirm(`Voulez-vous vraiment redémarrer le boîtier ${brand} (${ip}) ?`)) {
        statusEl.style.color = "var(--accent)";
        statusEl.innerText = "⏳ Envoi de l'ordre...";
        addSystemLog(`Ordre de redémarrage envoyé à ${brand}`, 'info');

        setTimeout(() => {
            statusEl.style.color = "var(--green)";
            statusEl.innerText = "✅ Commande reçue par le boîtier";
            setTimeout(() => { statusEl.innerText = ""; }, 3000);
        }, 1500);
    }
}
// --- 23. MOTEUR DE COMMUNICATION MATÉRIEL (API) ---

async function sendHardwareCommand(relayIndex, action = 'toggle') {
    const brand = localStorage.getItem('thera_hardware_brand');
    const ip = localStorage.getItem('thera_hardware_ip');
    
    if (!ip) {
        addSystemLog("Erreur : IP non configurée", "error");
        return;
    }

    let url = "";
    const pulse = JSON.parse(localStorage.getItem('thera_tech_settings'))?.pulseTime || 2;

    // Génération de l'URL selon la marque
    switch (brand) {
        case 'shelly':
            url = `http://${ip}/relay/${relayIndex}?turn=on&timer=${pulse}`;
            break;
            
        case 'kincony':
            url = `http://${ip}/control/relay?index=${relayIndex}&action=pulse&time=${pulse}`;
            break;

        case 'norvi':
            url = `http://${ip}/api/relay/${relayIndex}/pulse/${pulse}`;
            break;

        default:
            console.log("Commande simulée pour : " + brand);
            addSystemLog(`Simulation ${brand} - Relais ${relayIndex}`, "info");
            return;
    }

    // Envoi réel de la commande
    try {
        addSystemLog(`Envoi vers ${brand} (${ip})...`, "info");
        const response = await fetch(url, { mode: 'no-cors' }); 
        addSystemLog(`Commande relayée avec succès au boîtier`, "success");
    } catch (error) {
        addSystemLog(`Échec de connexion à l'automate (${ip})`, "error");
        console.error("Erreur API:", error);
    }
}

// --- 16. LOGIQUE DU PLANNING & GESTION DES HEURES ---

// Fonction pour extraire les horaires du formulaire
function getTimeSlotsData() {
    return Array.from(document.querySelectorAll('.time-slot-row')).map(row => ({
        start: row.querySelector('.slot-start').value,
        end: row.querySelector('.slot-end').value
    }));
}

// Fonction pour ajouter une ligne d'horaire dans le formulaire
function addTimeSlot() {
    const container = document.getElementById('time-slots-container');
    const div = document.createElement('div');
    div.className = "time-slot-row";
    div.style = "display:flex; gap:10px; margin-bottom:10px; align-items:center;";
    div.innerHTML = `
        <input type="time" class="input-text slot-start" value="08:00" style="margin:0;">
        <span>à</span>
        <input type="time" class="input-text slot-end" value="18:00" style="margin:0;">
        <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--red); cursor:pointer;">✕</button>
    `;
    container.appendChild(div);
}

// SAUVEGARDE PROFIL UTILISATEUR
/**
 * Vérifie si un utilisateur a le droit d'ouvrir maintenant
 * @param {Object} user - Le profil utilisateur complet
 * @returns {Boolean} - True si accès autorisé
 */
function isUserAllowedNow(user) {
    const now = new Date();
    
    // 1. Vérification de la date d'expiration
    if (user.expiry) {
        const expiryDate = new Date(user.expiry);
        if (now > expiryDate) {
            console.log("Accès refusé : Date d'expiration dépassée.");
            return false;
        }
    }

    const schedule = user.access.schedule;
    if (!schedule) return true; // Si pas de planning, accès libre

    // 2. Vérification du jour de la semaine
    const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayStr = daysMap[now.getDay()];
    if (!schedule.days[todayStr]) {
        console.log("Accès refusé : Jour non autorisé.");
        return false;
    }

    // 3. Vérification des plages horaires
    if (schedule.slots && schedule.slots.length > 0) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const isWithinSlot = schedule.slots.some(slot => {
            const [startH, startM] = slot.start.split(':').map(Number);
            const [endH, endM] = slot.end.split(':').map(Number);
            const startTime = startH * 60 + startM;
            const endTime = endH * 60 + endM;
            return currentTime >= startTime && currentTime <= endTime;
        });

        if (!isWithinSlot) {
            console.log("Accès refusé : Hors plage horaire.");
            return false;
        }
    }

    return true; // Tout est OK
}
// --- ACTION OUVERTURE (Version unique) ---

function checkAndOpen(userId, portalId, relayIndex) {
    const user = appConfig.users.find(u => u.id === userId);
    
    if (!user) {
        addSystemLog("Erreur : Utilisateur inconnu", "error");
        return;
    }

    // On appelle la fonction de vérification qu'on vient de créer au-dessus
    if (!isUserAllowedNow(user)) {
        addSystemLog(`Accès refusé : ${user.firstname} est hors planning`, "error");
        alert("Accès refusé : Votre planning ne vous autorise pas l'accès actuellement.");
        return; 
    }

    // Si le planning est validé, on envoie l'ordre au boîtier
    addSystemLog(`Ouverture validée pour ${user.firstname}`, "success");
    sendHardwareCommand(relayIndex);
}

// --- 24. MODULE GÉOLOCALISATION & PROXIMITÉ (UNIQUE & CORRIGÉ) ---


function getCurrentLocation() {
    const coordsInput = document.getElementById('new-portal-coords');
    const btn = event.target;

    if (!navigator.geolocation) {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        return;
    }

    btn.innerText = "RECHERCHE...";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lon = position.coords.longitude.toFixed(6);
            const coordsString = `${lat}, ${lon}`;
            
            if (coordsInput) {
                coordsInput.value = coordsString;
                // Feedback visuel
                coordsInput.style.borderColor = "var(--green)";
            }
            
            btn.innerText = "📍 CAPTURÉ";
            btn.classList.add('btn-success');
            
            setTimeout(() => {
                btn.innerText = "📍 CAPTURER";
                btn.disabled = false;
            }, 2000);
        },
        (error) => {
            console.error("Erreur GPS:", error);
            alert("Impossible d'obtenir votre position. Vérifiez les autorisations GPS.");
            btn.innerText = "📍 ERREUR";
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// B. Surveillance en arrière-plan (Geofencing)
let watchId = null;
let gpsTimer = null;

function toggleGPS() {
    const isActive = document.getElementById('set-gps-active').checked;
    const options = document.getElementById('gps-options');
    if(options) options.style.display = isActive ? 'block' : 'none';
    
    if (isActive) {
        if (!watchId) {
            addSystemLog("Surveillance GPS activée", "info");
            watchId = navigator.geolocation.watchPosition(checkProximity, 
                (err) => console.error("Erreur GPS:", err), 
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    } else {
        if(watchId) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            addSystemLog("Surveillance GPS désactivée", "info");
        }
    }
}

function checkProximity(pos) {
    const userLat = pos.coords.latitude;
    const userLon = pos.coords.longitude;
    const maxDist = parseInt(document.getElementById('set-gps-distance')?.value || 600);

    portals.forEach(p => {
        if (p.lat && p.lon) {
            const d = calculateDistance(userLat, userLon, p.lat, p.lon);
            if (d < maxDist) triggerGPSModal(p);
        }
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function triggerGPSModal(portal) {
    const modal = document.getElementById('gps-confirm-modal');
    if(!modal || modal.style.display === 'block') return;

    document.getElementById('gps-target-name').innerText = portal.name;
    modal.style.display = 'block';
    
    const slider = document.getElementById('gps-slider');
    slider.value = 0;
    slider.oninput = function() {
        if (this.value > 90) {
            sendHardwareCommand(portal.relayIndex);
            closeGPSModal();
            addSystemLog(`Ouverture GPS : ${portal.name}`, "success");
        }
    };
    gpsTimer = setTimeout(closeGPSModal, 10000); // Fermeture auto après 10s
}

function closeGPSModal() {
    const modal = document.getElementById('gps-confirm-modal');
    if(modal) modal.style.display = 'none';
    clearTimeout(gpsTimer);
}
/**
 * Ouvre l'interface de réglages matériels pour un portail spécifique
 * @param {string} portalId - L'ID de l'accès à configurer
 */function openPortalSettings(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;
    if (!portal.codes) portal.codes = [];
    if (!portal.badges) portal.badges = [];
    if (!portal.remotes) portal.remotes = [];
    const overlay = document.getElementById('portal-fiche-overlay');
    const content = document.getElementById('portal-fiche-content');
    if (!overlay || !content) return;

    overlay.style.display = 'block';
    appConfig.currentPortalId = portalId;

    // Logique pour masquer/afficher IP ou IMEI selon le mode actuel du portail
    const isCloud = portal.connectionType === 'cloud';

    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h2 style="margin:0;">📋 Fiche Complète : ${portal.name}</h2>
            <button class="btn-outline" onclick="document.getElementById('portal-fiche-overlay').style.display='none'" style="border:none; font-size:1.8rem; cursor:pointer;">&times;</button>
        </div>

        <div class="card-inner" style="background: var(--bg-body); padding:15px; border-radius:10px; margin-bottom:20px;">
            <h4 style="margin-top:0; color:var(--accent);">📍 LOCALISATION</h4>
            <label>Lieu / Site</label>
            <input type="text" id="edit-portal-location" class="input-text" value="${portal.location || ''}" placeholder="Ex: Entrée Nord">
            
            <label style="margin-top:10px; display:block;">Nom de l'accès</label>
            <input type="text" id="edit-portal-name" class="input-text" value="${portal.name}">
        </div>

        <div class="card-inner" style="background: var(--bg-body); padding:15px; border-radius:10px; margin-bottom:20px; border-left: 4px solid var(--accent);">
            <h4 style="margin-top:0; color:var(--accent);">🔌 CONNEXION AUTOMATE</h4>
            
            <label>Marque</label>
            <select id="edit-portal-brand" class="input-text" style="width:100%; margin-bottom:10px;">
                <option value="Kincony" ${portal.brand === 'Kincony' ? 'selected' : ''}>Kincony</option>
                <option value="Norvi" ${portal.brand === 'Norvi' ? 'selected' : ''}>Norvi</option>
                <option value="Shelly" ${portal.brand === 'Shelly' ? 'selected' : ''}>Shelly</option>
                <option value="Industrial Shields" ${portal.brand === 'Industrial Shields' ? 'selected' : ''}>Industrial Shields</option>
                <option value="Arduino Opta" ${portal.brand === 'Arduino Opta' ? 'selected' : ''}>Arduino Opta</option>
                <option value="Olimex" ${portal.brand === 'Olimex' ? 'selected' : ''}>Olimex</option>
                <option value="Brainboxes" ${portal.brand === 'Brainboxes' ? 'selected' : ''}>Brainboxes</option>
            </select>

            <label>Type de connexion</label>
            <select id="edit-portal-connection-type" class="input-text" onchange="toggleEditConnType()" style="width:100%; margin-bottom:10px;">
                <option value="local" ${!isCloud ? 'selected' : ''}>Réseau Local (IP)</option>
                <option value="cloud" ${isCloud ? 'selected' : ''}>4G LTE (Cloud / IMEI)</option>
            </select>

            <div id="edit-group-local" style="display: ${!isCloud ? 'block' : 'none'};">
                <label>Adresse IP</label>
                <input type="text" id="edit-portal-ip" class="input-text" value="${portal.ip || ''}" placeholder="192.168.1.100">
            </div>

            <div id="edit-group-cloud" style="display: ${isCloud ? 'block' : 'none'};">
                <label>ID Cloud / IMEI</label>
                <input type="text" id="edit-portal-cloudid" class="input-text" value="${portal.cloudId || ''}" placeholder="IMEI du boîtier">
            </div>

            <label style="margin-top:10px; display:block;">Numéro du Relais</label>
            <input type="number" id="edit-portal-relay" class="input-text" value="${portal.relay || portal.relayIndex}">
        </div>

        <div class="card-inner" style="background: var(--bg-body); padding:15px; border-radius:10px;">
            <h4 style="margin-top:0; color:var(--accent);">🔑 SÉCURITÉ & ACCESSOIRES</h4>
            
            <div class="flex-row" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <label>Clavier (Codes)</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    ${portal.hasKeypad ? `<button class="btn-small" onclick="manageCodes('${portal.id}')" style="padding:2px 8px; font-size:0.7rem;">GÉRER LES CODES</button>` : ''}
                    <input type="checkbox" id="edit-hasKeypad" ${portal.hasKeypad ? 'checked' : ''} onchange="saveSpecificPortalSettings('${portal.id}')">
                </div>
            </div>
            
            <div class="flex-row" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <label>Lecteur RFID (Badges)</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    ${portal.hasRFID ? `<button class="btn-small" onclick="manageBadges('${portal.id}')" style="padding:2px 8px; font-size:0.7rem;">GÉRER LES BADGES</button>` : ''}
                    <input type="checkbox" id="edit-hasRFID" ${portal.hasRFID ? 'checked' : ''} onchange="saveSpecificPortalSettings('${portal.id}')">
                </div>
            </div>

  <div class="flex-row" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <label>Emetteurs</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    ${portal.hasRemote ? `<button class="btn-small" onclick="manageBadges('${portal.id}')" style="padding:2px 8px; font-size:0.7rem;">GÉRER LES EMETTEURS</button>` : ''}
                    <input type="checkbox" id="edit-hasRemote" ${portal.hasRemote ? 'checked' : ''} onchange="saveSpecificPortalSettings('${portal.id}')">
                </div>
            </div>
        <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <button class="btn-outline" onclick="deletePortal('${portal.id}')">🗑️ SUPPRIMER</button>
            <button class="btn-primary" onclick="saveSpecificPortalSettings('${portal.id}')">💾 ENREGISTRER</button>
        </div>
    `;

    overlay.scrollIntoView({ behavior: 'smooth' });
}
function savePortal() {
    // 1. Récupération des valeurs
    const name = document.getElementById('edit-portal-name').value;
    const location = document.getElementById('edit-portal-location').value;
    const brand = document.getElementById('edit-portal-brand').value;
    const connType = document.getElementById('new-portal-connection-type')?.value || 'local';
    const ip = document.getElementById('edit-portal-ip').value;
    const cloudId = document.getElementById('edit-portal-cloudid')?.value || null;
    const relay = document.getElementById('edit-portal-relay').value;

    // Validation hybride (IP ou CloudID selon le mode)
    const identifier = (connType === 'local') ? ip : cloudId;

    if (!name || !identifier) {
        showToast("Le nom et l'identifiant (IP ou IMEI) sont obligatoires", "error");
        return;
    }

    // 2. Création de l'objet complet
    const newPortal = {
        id: "p" + Date.now(), 
        name: name,
        location: location,
        brand: brand,
        connectionType: connType,
        ip: (connType === 'local') ? ip : null,
        cloudId: (connType === 'cloud') ? cloudId : null,
        relay: parseInt(relay),
        relayIndex: parseInt(relay),
        status: "FERMÉ",
        isButtonLocked: false,
        currentAction: null,
        hasKeypad: false,
        hasRFID: false,
        hasRemote: false,
        codes: [],  
        badges: [], 
        remotes: []
    };

    // 3. Ajout à la config
    if (!appConfig.portals) appConfig.portals = [];
    appConfig.portals.push(newPortal);
    
    // 4. Sauvegarde et mise à jour
    saveToLocalStorage();
    showToast("Accès configuré avec succès");
    
    // Rafraîchir les deux vues possibles
    if (typeof renderPortalsConfigList === 'function') renderPortalsConfigList();
    renderPortalsList('portal-list', false);
    
    showPage('page-c'); // On retourne généralement à la config
}
/**
 * Enregistre les options matérielles dans l'objet du portail
 */
function saveSpecificPortalSettings(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;

    // 1. Récupération des infos de base
    const locField = document.getElementById('edit-portal-location');
    const nameField = document.getElementById('edit-portal-name');
    const relayField = document.getElementById('edit-portal-relay');

    if(locField) portal.location = locField.value.trim();
    if(nameField) portal.name = nameField.value.trim();
    if(relayField) {
        portal.relay = parseInt(relayField.value);
        portal.relayIndex = portal.relay; // Garde la cohérence avec ton ancien code
    }

    // 2. NOUVEAU : Récupération IP / MARQUE / 4G (Vigilance 2026)
    const brandField = document.getElementById('edit-portal-brand');
    const connTypeField = document.getElementById('edit-portal-connection-type');
    const ipField = document.getElementById('edit-portal-ip');
    const cloudField = document.getElementById('edit-portal-cloudid');

    if(brandField) portal.brand = brandField.value;
    if(connTypeField) {
        portal.connectionType = connTypeField.value;
        if(portal.connectionType === 'local') {
            portal.ip = ipField ? ipField.value : portal.ip;
            portal.cloudId = null;
        } else {
            portal.cloudId = cloudField ? cloudField.value : portal.cloudId;
            portal.ip = null;
        }
    }

    // 3. Mise à jour des modules (Switchs)
    portal.hasKeypad = document.getElementById('edit-hasKeypad').checked;
    portal.hasRFID = document.getElementById('edit-hasRFID').checked;
    portal.hasRemote = document.getElementById('edit-hasRemote').checked;

    // 4. Sauvegarde globale
    saveToLocalStorage(); 

    // 5. Feedback visuel
    const btn = window.event ? (window.event.target.closest('button') || window.event.target) : null;
    if(btn) {
        const originalText = btn.innerText;
        btn.innerText = "CONFIGURÉ ✅";
        btn.disabled = true;

        setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
            // On ferme l'overlay proprement
            document.getElementById('portal-fiche-overlay').style.display = 'none';
            // Rafraîchissement des listes
            if (typeof renderPortalsConfigList === 'function') renderPortalsConfigList();
            renderPortalsList('portal-list', false);
        }, 1000);
    }
}
// Variable globale pour le type de filtre sélectionné
let currentKeyTypeFilter = 'all';

function toggleKeyInput() {
    const type = document.getElementById('key-type-select').value;
    const input = document.getElementById('key-value-input');
    
    if (type === 'code') {
        input.placeholder = "Ex: 1234 (4 à 6 chiffres)";
        input.type = "number";
    } else if (type === 'badge') {
        input.placeholder = "Ex: ID RFID (ex: 0012457)";
        input.type = "text";
    } else {
        input.placeholder = "ID Télécommande (ex: BT-01)";
        input.type = "text";
    }
}
/* ==========================================================
   GESTION DES UTILISATEURS ET DES CLÉS (VERSION STABLE)
   ========================================================== */

/**
 * 1. SAUVEGARDE : Enregistre les données et rafraîchit la vue
 */
function saveUser() { 
    const lastname = document.getElementById('user-lastname')?.value.trim();
    const firstname = document.getElementById('user-firstname')?.value.trim();
    const role = document.getElementById('user-role')?.value || "UTILISATEUR";
    
    if (!lastname || !firstname) {
        alert("Le nom et le prénom sont obligatoires.");
        return;
    }

    // Récupération des portails cochés
    const selectedPortals = [];
    document.querySelectorAll('.portal-checkbox:checked').forEach(cb => {
        selectedPortals.push(cb.value);
    });

    // Construction de l'objet utilisateur complet
    const userData = {
        id: appConfig.currentEditingUserId || 'user_' + Date.now(),
        name: `${firstname} ${lastname.toUpperCase()}`,
        lastname: lastname.toUpperCase(),
        firstname: firstname,
        role: role,
        expiry: document.getElementById('user-expiry')?.value || "",
        access: {
            portals: selectedPortals,
            schedule: {
                days: {
                    mon: document.getElementById('btn-day-mon')?.classList.contains('active'),
                    tue: document.getElementById('btn-day-tue')?.classList.contains('active'),
                    wed: document.getElementById('btn-day-wed')?.classList.contains('active'),
                    thu: document.getElementById('btn-day-thu')?.classList.contains('active'),
                    fri: document.getElementById('btn-day-fri')?.classList.contains('active'),
                    sat: document.getElementById('btn-day-sat')?.classList.contains('active'),
                    sun: document.getElementById('btn-day-sun')?.classList.contains('active')
                },
                slots: typeof getTimeSlotsData === 'function' ? getTimeSlotsData() : []
            },
            // Récupération des codes d'accès
            code: document.getElementById('user-code')?.value || null,
            rfid: document.getElementById('user-rfid')?.value || null,
            remote: document.getElementById('user-remote')?.value || null
        }
    };

    // Mise à jour de l'array global
    if (appConfig.currentEditingUserId) {
        const idx = appConfig.users.findIndex(u => u.id === appConfig.currentEditingUserId);
        if (idx !== -1) appConfig.users[idx] = userData;
    } else {
        appConfig.users.push(userData);
    }

    appConfig.currentEditingUserId = null;
    
    // Sauvegarde physique (LocalStorage)
    saveToLocalStorage(); 
    
    // Retour à la liste et rafraîchissement
    showPage('page-b'); 
    renderKeysPage(); // Relance la chaîne de rendu
    
    showToast(`Utilisateur enregistré avec succès`);
}

/**
 * 2. RENDER PAGE : Remplit les menus déroulants (Select)
 *//**
 * RENDER PAGE : Remplit les menus déroulants (Select)
 */
function renderKeysPage() {
    const userSelect = document.getElementById('key-user-select');
    const portalSelect = document.getElementById('key-portal-select');

    if (!userSelect || !portalSelect) return;

    // Remplissage des Profils
    let userOptions = '<option value="">Choisir un Profil...</option>';
    appConfig.users.forEach(u => {
        const displayName = u.name || `${u.firstname} ${u.lastname}`;
        userOptions += `<option value="${u.id}">${displayName}</option>`;
    });
    userSelect.innerHTML = userOptions;

    // Remplissage des Accès (Portails)
    let portalOptions = '<option value="">Attribuer à un Accès...</option>';
    appConfig.portals.forEach(p => {
        portalOptions += `<option value="${p.id}">${p.name}</option>`;
    });
    portalSelect.innerHTML = portalOptions;

    // Lance le dessin de la liste
    renderKeysCentral();
}

/**
 * RENDER CENTRAL : Dessine les cartes ou le tableau dans le conteneur central
 */
function renderKeysCentral() {
    // VIGILANCE : On utilise l'ID exact de ton HTML
    const container = document.getElementById('central-keys-list'); 
    if (!container) return;

    // Récupération des filtres pour la recherche dynamique
    const userFilter = document.getElementById('filter-key-user')?.value.toLowerCase() || "";
    
    let html = "";

    // On boucle sur les utilisateurs pour afficher leurs clés
    appConfig.users.forEach(u => {
        const displayName = u.name || `${u.firstname} ${u.lastname}`;
        
        // Application du filtre de recherche par nom
        if (userFilter && !displayName.toLowerCase().includes(userFilter)) return;

        const access = u.access || {};
        const pin = access.code || "---";
        const rfid = access.rfid || "---";
        const remote = access.remote || "---";

        // Création d'une "ligne" ou "carte" pour chaque utilisateur
        html += `
            <div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1;">
                    <strong style="font-size:1.1rem; color:var(--primary);">${displayName}</strong><br>
                    <small style="color:#666;">${u.role || 'UTILISATEUR'}</small>
                </div>
                <div style="flex:2; display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; text-align:center;">
                    <div><small>PIN</small><br><strong>${pin}</strong></div>
                    <div><small>RFID</small><br><strong>${rfid}</strong></div>
                    <div><small>EMETTEUR</small><br><strong>${remote}</strong></div>
                </div>
                <div style="flex:1; text-align:right;">
                    <button class="btn-outline btn-small" onclick="editUser('${u.id}')">✏️</button>
                    <button class="btn-outline btn-small" onclick="testerVueClient('${u.id}')">👁️</button>
                </div>
            </div>
        `;
    });

    // Si aucun utilisateur ne correspond au filtre
    if (html === "") {
        html = `<div style="text-align:center; padding:20px; color:#999;">Aucun profil trouvé.</div>`;
    }

    container.innerHTML = html;
}

function createNewKey() {
    // 1. On récupère les éléments
    const userEl = document.getElementById('key-user-select');
    const portalEl = document.getElementById('key-portal-select');
    const typeEl = document.getElementById('key-type-select');
    const valueEl = document.getElementById('key-value-input');

    // 2. SÉCURITÉ : Si un élément est null, on arrête tout proprement
    if (!userEl || !portalEl || !typeEl || !valueEl) {
        console.error("Erreur : Un des éléments HTML est introuvable. Vérifie les IDs.");
        return;
    }

    const userId = userEl.value;
    const portalId = portalEl.value;
    const type = typeEl.value;
    const value = valueEl.value.trim();

    // 3. Validation
    if (!userId || !portalId || !value) {
        alert("Veuillez remplir tous les champs (Utilisateur, Accès et Valeur).");
        return;
    }

    // 4. Logique d'enregistrement (On cherche l'utilisateur dans appConfig.users)
    const userIndex = appConfig.users.findIndex(u => u.id === userId);
    if (userIndex === -1) return;

    // Initialisation de la structure si elle n'existe pas
    if (!appConfig.users[userIndex].access) appConfig.users[userIndex].access = {};
    
    // On enregistre la clé selon son type
    if (type === 'code') appConfig.users[userIndex].access.code = value;
    if (type === 'badge') appConfig.users[userIndex].access.rfid = value;
    if (type === 'remote') appConfig.users[userIndex].access.remote = value;

    // 5. Sauvegarde et mise à jour
    saveToLocalStorage();
    renderKeysCentral(); // Rafraîchit la liste en bas
    valueEl.value = "";   // Vide le champ
    showToast("Clé enregistrée avec succès !");
}

function filterKeys(type) {
    currentKeyTypeFilter = type;
    renderKeysCentral();
}
function manageCodes(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;

    // On utilise un simple prompt pour l'exemple, mais on pourra faire une modal plus tard
    const label = prompt("Nom de l'utilisateur du code (ex: Jardinier) :");
    if (!label) return;
    const newCode = prompt("Entrez le code numérique (4 à 6 chiffres) :");
    
    if (newCode && newCode.length >= 4) {
        if (!portal.codes) portal.codes = [];
        portal.codes.push({ id: Date.now(), label: label, code: newCode });
        saveToLocalStorage();
        showToast(`Code pour ${label} enregistré sur le boîtier ${portal.brand}`);
        
        // Ici, on enverra plus tard l'ordre au boitier via LAPI
        console.log(`Vigilance : Envoi du code ${newCode} au boîtier ${portal.ip || portal.cloudId}`);
    }
}

function manageBadges(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;

    showToast("Mode apprentissage badge activé sur le lecteur...", "info");
    
    // Simulons la réception d'un UID badge
    const label = prompt("Nom du titulaire du badge :");
    if (!label) return;
    
    const uid = "RF-" + Math.floor(Math.random() * 1000000); // Simulation UID
    
    if (!portal.badges) portal.badges = [];
    portal.badges.push({ id: Date.now(), label: label, uid: uid });
    saveToLocalStorage();
    
    alert(`Badge de ${label} enregistré ! (UID: ${uid})`);
}
function manageRemotes(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;

    const label = prompt("Nom du propriétaire de la télécommande (ex: Mme Martin) :");
    if (!label) return;

    showToast("Appuyez 3 secondes sur le bouton de la télécommande...", "info");

    // Simulation de l'ID unique capté par l'antenne du boîtier
    const remoteId = "RM-" + Math.floor(Math.random() * 9999);

    if (!portal.remotes) portal.remotes = [];
    portal.remotes.push({ id: Date.now(), label: label, remoteId: remoteId });
    
    saveToLocalStorage();
    
    alert(`Télécommande de ${label} enregistrée avec succès sur le portail !`);
    
    // Vigilance : Rafraîchir la fiche pour voir les changements si nécessaire
    openPortalSettings(portalId);
}
function checkFirstVisit() {
    const isConfigured = localStorage.getItem('thera_is_configured');

    if (!isConfigured || appConfig.portals.length === 0) {
        // C'est la première fois : on force la page de bienvenue
        showPage('page-welcome');
    } else {
        // Le système est déjà prêt : on va sur l'accueil
        showPage('page-a');
        renderPortalsList('portal-list', false);
    }
}
// --- À METTRE TOUT EN BAS DE SCRIPT.JS ---
/* --- GESTION VUE CLIENT (V301) --- */

// 1. Lancement de la vue (Nettoie l'écran et lance la page)
function testerVueClient(userId) {
    // A. On récupère l'utilisateur
    const user = appConfig.users.find(u => u.id === userId);
    if (!user) return alert("Erreur : Utilisateur introuvable.");

    // B. On force la fermeture de tous les overlays (formulaires, fiches...)
    const overlays = document.querySelectorAll('.overlay'); // ou tes IDs spécifiques
    overlays.forEach(el => el.style.display = 'none');
    
    // Si tu as des IDs spécifiques pour les overlays, on assure le coup :
    if(document.getElementById('user-form-overlay')) document.getElementById('user-form-overlay').style.display = 'none';

    // C. On génère le contenu
    renderUserSimpleAccess(user);

    // D. On affiche la page (showPage gère le menu, le CSS gère le z-index)
    showPage('page-user-simple');
}

// 2. Génération des Cartes d'Accès
function renderUserSimpleAccess(user) {
    const container = document.getElementById('user-access-buttons');
    const welcome = document.getElementById('user-welcome-name');
    
    if (!container) return; // Sécurité si le HTML n'est pas prêt

    // Mise à jour du nom
    if (welcome) welcome.innerText = "Bonjour " + (user.firstname || "Utilisateur");
    
    container.innerHTML = ""; // On vide avant de remplir

    // Vérification des accès
    const access = user.access || {};
    const portalsIds = access.portals || [];

    if (portalsIds.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#666;">Aucun accès configuré pour ce profil.</div>`;
        return;
    }

    // Boucle sur chaque portail autorisé
    portalsIds.forEach(portalId => {
        const portal = appConfig.portals.find(p => p.id === portalId);
        const name = portal ? portal.name : "Accès " + portalId;
        
        // Récupération sécurisée des infos
        const userCode = access.code || "---";
        const jours = (access.days && access.days.length > 0) ? access.days.join(', ') : "7j/7";
        const heures = (access.startHour && access.endHour) ? `${access.startHour}h - ${access.endHour}h` : "24h/24";

        // Création de la carte HTML
        const card = document.createElement('div');
        card.className = "access-card";
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <div>
                    <h3 style="margin:0 0 5px 0; color:var(--primary);">${name.toUpperCase()}</h3>
                    <div style="font-size:0.85rem; color:#64748b;">
                        <div>📅 ${jours}</div>
                        <div>⏰ ${heures}</div>
                    </div>
                </div>
                <div>
                    <button id="btn-reveal-${portalId}" class="btn-code" onclick="revealCode('${portalId}')">
                        👁️ CODE
                    </button>
                </div>
            </div>

            <div id="secret-area-${portalId}" class="code-reveal-area">
                CODE : ${userCode}
            </div>

            <button class="btn-primary" 
                    style="width:100%; height:60px; font-size:1.1rem; font-weight:bold; border-radius:12px;" 
                    onclick="triggerAccess('${portalId}')">
                🚗 OUVRIR
            </button>
        `;

        container.appendChild(card);
    });
}

// 3. Logique d'affichage du code (5 secondes)
function revealCode(portalId) {
    const secretArea = document.getElementById(`secret-area-${portalId}`);
    const btn = document.getElementById(`btn-reveal-${portalId}`);
    
    if (secretArea && btn) {
        // On affiche le code et on cache le petit bouton
        secretArea.style.display = 'block';
        btn.style.display = 'none';

        // Timer de 5 secondes
        setTimeout(() => {
            secretArea.style.display = 'none';
            btn.style.display = 'block'; // Le bouton revient
        }, 5000);
    }
}
// Fonction pour révéler le code pendant 5 secondes

function handleSmartBack() {
    // Cette fonction décide où retourner intelligemment
    if (appConfig.currentEditingUserId) {
        appConfig.currentEditingUserId = null;
    }
    showPage('page-b'); // Retour par défaut à la liste des usagers
}
// --- INITIALISATION ---
window.addEventListener('DOMContentLoaded', () => {
    // 1. Masquer le Splash Screen après 2s
    setTimeout(() => {
        const splash = document.getElementById('page-splash');
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.style.display = 'none', 500);
        }
    }, 2000);

    // 2. Charger le Branding (Identité visuelle)
    const savedBrand = JSON.parse(localStorage.getItem('thera_branding'));
    if(savedBrand) applyBranding(savedBrand);

    // 3. Router (Choix de la page de démarrage)
    const params = new URLSearchParams(window.location.search);
    const isConfigured = localStorage.getItem('thera_is_configured');

    if (params.get('id')) {
        // Mode Invité (via lien de partage)
        loadGuestView(params.get('id'));
    } else if (!isConfigured) {
        // Mode Nouveau Client (Page de Bienvenue)
        showPage('page-welcome');
    } else {
        // Mode Installé (Tableau de bord)
        showPage('page-a');
        
        // Diagnostic et Rendu forcé des listes
        console.log("--- DIAGNOSTIC THERA V300 ---");
        console.log("Accès trouvés :", appConfig.portals.length);
        
        // On lance le rendu des listes immédiatement
        renderPortalsList('portal-list', false);
        renderPortalsList('portals-config-list', true);
    }
});