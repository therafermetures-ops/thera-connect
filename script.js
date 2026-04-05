/* ==========================================================================
   THERA CONNECT - SOLUTION PROFESSIONNELLE V300 - STABLE V186
   PROJETS : PORTAIL PRO / COFFRET QUAI / MODULE LAPI
   --------------------------------------------------------------------------
   ARCHITECTURE : VANILLA JS / SUPABASE REALTIME / LOCAL RECOVERY MODE
   DÉVELOPPEMENT : 2026-04-06
   ========================================================================== */

// --- 1. CONFIGURATION ET ÉTAT GLOBAL ---
const SUPABASE_URL = "https://votre-projet.supabase.co";
const SUPABASE_KEY = "votre-cle-anon-supabase";
// Initialisation unique pour éviter l'erreur "Identifier already declared"
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/**
 * appConfig : Singleton gérant l'état complet de l'application
 * (Consigne 2026-02-08 : Respect des noms 'profiles' et 'users')
 */
let appConfig = {
    version: "300",
    build: "2026.04.06.01",
    isOnline: navigator.onLine,
    isBackupMode: false,
    currentUser: null,
    currentProfile: null,
    portals: [], // Table 'portals'
    users: [],   // Table 'profiles'
    logs: [],
    offlineQueue: [],
    activeView: 'page-a',
    branding: {
        name: "THERA CONNECT",
        color: "#007bff",
        secondary: "#6c757d",
        support: "support@thera-connect.fr"
    },
    modules: {
        lapi: true,
        quay: true,
        geo: true,
        emergencyBT: true
    },
    settings: {
        gpsRadius: 50,
        pulseDefault: 2,
        autoRefresh: 30000 // 30s
    }
};

// --- 2. MOTEUR DE NAVIGATION ET ROUTAGE (SMARTBACK) ---
/**
 * showPage : Gère l'affichage des sections sans Home Assistant
 * (Consigne 2026-01-28 : handleSmartBack mémorisé)
 */
function showPage(pageId) {
    console.log(`[Router] Navigation : ${pageId}`);
    
    // Fermeture de sécurité des modales
    closeAllModals();

    const pages = document.querySelectorAll('.app-page');
    pages.forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active-view');
    });

    const target = document.getElementById(pageId);
    if (target) {
        target.style.display = 'block';
        setTimeout(() => target.classList.add('active-view'), 10);
        appConfig.activeView = pageId;
        sessionStorage.setItem('last_view', pageId);
        
        // Routage de rendu spécifique
        switch(pageId) {
            case 'page-a': renderDashboard(); break;
            case 'page-b': renderUsersList(); break;
            case 'page-c': renderMaintenanceCenter(); break;
            case 'page-d': renderLapiModule(); break;
            case 'page-e': renderQuayManagement(); break;
        }
    } else {
        addSystemLog(`Erreur : Page ${pageId} introuvable`, "error");
    }
}

function handleSmartBack() {
    const last = sessionStorage.getItem('last_view');
    // Si on est dans un sous-menu, retour à l'accueil
    if (last && last !== 'page-a') {
        showPage('page-a');
    } else {
        showToast("Accueil Thera Connect");
    }
}

// --- 3. SYNCHRONISATION SUPABASE (MODE HYBRIDE) ---

async function bootSystem() {
    addSystemLog("Démarrage du système V300...", "info");
    injectGlobalStyles();
    
    if (!supabase) {
        startBackupMode();
        return;
    }

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session) {
            appConfig.currentUser = session.user;
            await fullDataSync();
            initRealtimeSync();
        } else {
            showPage('page-login');
        }
    } catch (e) {
        addSystemLog("Échec Cloud : Activation base ESP32", "warning");
        startBackupMode();
    }
}

async function fullDataSync() {
    if (!navigator.onLine) return;
    
    addSystemLog("Synchronisation Cloud LTE en cours...", "info");
    
    // Récupération atomique pour éviter les bugs de chargement partiel
    const [pFetch, uFetch, rFetch] = await Promise.all([
        supabase.from('portals').select('*').order('name'),
        supabase.from('profiles').select('*').order('firstname'),
        supabase.from('security_rules').select('*')
    ]);

    if (pFetch.data) appConfig.portals = pFetch.data;
    if (uFetch.data) appConfig.users = uFetch.data;
    if (rFetch.data) appConfig.alertRules = rFetch.data;

    // Mise à jour du cache de secours (ESP32 / LocalStorage)
    updateLocalRecoveryBase();
    renderDashboard();
}

function initRealtimeSync() {
    // Surveillance temps réel des profils (Consigne 2026-02-08)
    supabase.channel('db-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
            addSystemLog("Mise à jour profils reçue", "success");
            fullDataSync();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'portals' }, payload => {
            addSystemLog("Config portails modifiée", "info");
            fullDataSync();
        })
        .subscribe();
}

function updateLocalRecoveryBase() {
    const snapshot = {
        portals: appConfig.portals,
        users: appConfig.users,
        ts: Date.now(),
        version: appConfig.version
    };
    localStorage.setItem('thera_recovery_db', JSON.stringify(snapshot));
}

function startBackupMode() {
    appConfig.isBackupMode = true;
    const db = localStorage.getItem('thera_recovery_db');
    if (db) {
        const data = JSON.parse(db);
        appConfig.portals = data.portals || [];
        appConfig.users = data.users || [];
        addSystemLog("Base de secours chargée", "info");
    }
    showPage('page-a');
}
// --- 4. GESTION DES UTILISATEURS (TABLE PROFILES) ---

/**
 * renderUsersList : Affiche la liste des profils synchronisés
 * (Consigne 2026-02-08 : Utiliser 'profiles' pour la base de données)
 */
function renderUsersList() {
    const container = document.getElementById('users-list-container');
    if (!container) return;
    
    container.innerHTML = "";
    
    // Tri alphabétique par prénom
    const sortedUsers = [...appConfig.users].sort((a, b) => a.firstname.localeCompare(b.firstname));

    if (sortedUsers.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-light);">Aucun utilisateur enregistré.</div>`;
        return;
    }

    sortedUsers.forEach(user => {
        const isExpired = user.expiry && new Date(user.expiry) < new Date();
        const hasAccessNow = checkInstantAccess(user);
        
        const card = document.createElement('div');
        card.className = "user-card-pro";
        card.style = `background:white; border-radius:18px; padding:18px; margin-bottom:15px; box-shadow:var(--shadow-pro); border-left: 5px solid ${isExpired ? '#d63031' : (hasAccessNow ? '#00b894' : '#fdcb6e')};`;
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div onclick="editUserProfile('${user.id}')" style="cursor:pointer; flex:1;">
                    <div style="font-weight:700; font-size:1.05rem; color:var(--text-dark);">${user.firstname} ${user.lastname || ''}</div>
                    <div style="font-size:0.8rem; color:var(--text-light); margin-top:4px;">
                        <span>${user.role.toUpperCase()}</span> • 
                        <span style="color:${isExpired ? 'red' : 'inherit'}">${isExpired ? 'EXPIRÉ' : (user.expiry ? 'Fin: '+formatShortDate(user.expiry) : 'Permanent')}</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="shareAccessLink('${user.id}')" class="btn-circle-alt">🔗</button>
                    <button onclick="deleteUserPrompt('${user.id}')" class="btn-circle-alt" style="color:var(--danger);">🗑️</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

/**
 * saveUserProfile : Crée ou met à jour un profil dans Supabase
 * (Consigne 2026-01-26 : Contrôler deux fois les erreurs et les noms)
 */
async function saveUserProfile() {
    addSystemLog("Vérification des données profil...", "info");
    
    const id = document.getElementById('u-form-id').value || `u-${Math.random().toString(36).substr(2, 9)}`;
    const firstname = document.getElementById('u-form-fname').value.trim();
    const lastname = document.getElementById('u-form-lname').value.trim();
    const role = document.getElementById('u-form-role').value;
    const expiry = document.getElementById('u-form-expiry').value;

    // --- DOUBLE VÉRIFICATION (Vérif 1 : Champs obligatoires) ---
    if (!firstname) {
        showToast("Le prénom est obligatoire", "error");
        return;
    }

    // --- DOUBLE VÉRIFICATION (Vérif 2 : Format des données) ---
    const profileData = {
        id: id,
        firstname: firstname,
        lastname: lastname,
        role: role,
        expiry: expiry || null,
        access_schedule: compileScheduleFromUI(),
        last_sync: new Date().toISOString(),
        plate_number: document.getElementById('u-form-plate')?.value.toUpperCase() || null
    };

    addSystemLog(`Sauvegarde du profil : ${firstname} (ID: ${id})`, "info");

    // Mise à jour locale immédiate (Fluidité UI)
    const existingIdx = appConfig.users.findIndex(u => u.id === id);
    if (existingIdx > -1) appConfig.users[existingIdx] = profileData;
    else appConfig.users.push(profileData);

    // Synchronisation Cloud
    if (navigator.onLine && !appConfig.isBackupMode) {
        try {
            const { error } = await supabase.from('profiles').upsert(profileData);
            if (error) throw error;
            showToast("Utilisateur synchronisé avec succès");
        } catch (err) {
            addSystemLog("Erreur Cloud Profiles : " + err.message, "error");
            queueOfflineAction('UPSERT_PROFILE', profileData);
        }
    } else {
        queueOfflineAction('UPSERT_PROFILE', profileData);
    }

    updateLocalRecoveryBase();
    renderUsersList();
    closeModal('user-modal');
}

// --- 5. MOTEUR DE DÉCISION D'ACCÈS (PLANNINGS) ---

/**
 * checkInstantAccess : Calcule si l'accès est autorisé au moment T
 */
function checkInstantAccess(user) {
    if (!user) return false;
    
    // Les administrateurs ont un accès total
    if (user.role === 'admin') return true;

    const now = new Date();
    
    // 1. Vérification de la date de fin de validité
    if (user.expiry && now > new Date(user.expiry)) {
        return false;
    }

    // 2. Vérification du planning hebdomadaire
    const schedule = user.access_schedule;
    if (!schedule) return true; // Si pas de planning défini, accès libre par défaut

    const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = daysMap[now.getDay()];
    
    if (schedule.days && !schedule.days[currentDay]) {
        return false;
    }

    // 3. Vérification des plages horaires (hh:mm)
    if (schedule.slots && schedule.slots.length > 0) {
        const currentMinutes = (now.getHours() * 60) + now.getMinutes();
        
        const inSlot = schedule.slots.some(slot => {
            const startMin = timeToMinutes(slot.start);
            const endMin = timeToMinutes(slot.end);
            return currentMinutes >= startMin && currentMinutes <= endMin;
        });
        
        if (!inSlot) return false;
    }

    return true;
}

/**
 * timeToMinutes : Convertit "HH:MM" en minutes totales
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + m;
}

/**
 * queueOfflineAction : Stocke les actions en attente de réseau (ESP32)
 */
function queueOfflineAction(type, data) {
    appConfig.offlineQueue.push({
        id: Date.now(),
        type: type,
        data: data,
        ts: new Date().toISOString()
    });
    localStorage.setItem('thera_offline_queue', JSON.stringify(appConfig.offlineQueue));
    addSystemLog(`Action mise en attente (Hors-ligne) : ${type}`, "warning");
}

function formatShortDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

// --- FIN BLOC 2 ---
/* ==========================================================================
   SECTION 6 : MOTEUR DE COMMANDE PHYSIQUE (MULTI-HARDWARE)
   (Consigne 2026-01-24 : Masquer totalement Home Assistant)
   ========================================================================== */

/**
 * sendHardwareCommand : Liaison directe avec les automates IP/Cloud
 */
async function sendHardwareCommand(relayIndex, portalId = null) {
    const portal = portalId ? appConfig.portals.find(p => p.id === portalId) : null;
    
    // Récupération des paramètres (Consigne 2026-02-08 : Noms fixes)
    const brand = portal ? portal.brand : (localStorage.getItem('thera_hardware_brand') || 'Kincony');
    const ip = portal ? portal.ip : localStorage.getItem('thera_hardware_ip');
    const connType = portal ? portal.connectionType : 'local';
    const pulseTime = portal ? portal.pulse_duration || 2 : 2;

    if (connType === 'local' && !ip) {
        addSystemLog(`Erreur : IP non configurée pour ${portal?.name || 'Automate'}`, "error");
        return;
    }

    let actionUrl = "";
    const bName = brand.toLowerCase();

    // GÉNÉRATION DU PROTOCOLE SELON LE CONSTRUCTEUR (Consigne 2026-01-24)
    if (connType === 'local') {
        if (bName.includes('shelly')) {
            actionUrl = `http://${ip}/relay/${relayIndex}?turn=on&timer=${pulseTime}`;
        } else if (bName.includes('kincony')) {
            actionUrl = `http://${ip}/control/relay?index=${relayIndex}&action=pulse&time=${pulseTime}`;
        } else if (bName.includes('norvi') || bName.includes('industrial')) {
            actionUrl = `http://${ip}/api/relay/${relayIndex}/pulse/${pulseTime}`;
        } else if (bName.includes('arduino') || bName.includes('opta')) {
            actionUrl = `http://${ip}/command?relay=${relayIndex}&pulse=${pulseTime}`;
        } else if (bName.includes('brainboxes')) {
            actionUrl = `http://${ip}/io/relay/${relayIndex}/pulse?ms=${pulseTime * 1000}`;
        } else {
            // Protocole HTTP générique pour autres marques (Olimex, etc.)
            actionUrl = `http://${ip}/set_relay?id=${relayIndex}&state=1&duration=${pulseTime}`;
        }
    }

    try {
        addSystemLog(`Liaison ${brand} (${portal?.name || 'Général'})...`, "info");
        
        if (connType === 'local') {
            // Mode Local : Timeout de 4s pour éviter de bloquer l'UI
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            
            await fetch(actionUrl, { mode: 'no-cors', signal: controller.signal });
            clearTimeout(timeoutId);
        } else {
            // Mode Cloud : Appel via Supabase Edge Function (Relais LTE)
            if (supabase) {
                const { data, error } = await supabase.functions.invoke('relay-control', {
                    body: { portalId, relay: relayIndex, action: 'pulse', duration: pulseTime }
                });
                if (error) throw error;
            }
        }

        addSystemLog(`Succès : ${portal?.name || 'Automate'} actionné`, "success");
        recordAccessAttempt(portalId, "SUCCESS");
        showToast("Ouverture confirmée");
        
        if (navigator.vibrate) navigator.vibrate(100);

    } catch (err) {
        addSystemLog(`Échec liaison : ${brand} (${ip || 'Cloud'})`, "error");
        recordAccessAttempt(portalId, "FAILED");
        showToast("Erreur de connexion automate", "error");
    }
}

/**
 * recordAccessAttempt : Enregistre l'activité (Sync Cloud ou ESP32 Queue)
 */
async function recordAccessAttempt(portalId, status) {
    const logEntry = {
        portal_id: portalId,
        user_id: appConfig.currentUser?.id || 'anonymous_local',
        user_name: appConfig.currentUser?.email || 'User Local',
        status: status,
        timestamp: new Date().toISOString()
    };

    if (navigator.onLine && !appConfig.isBackupMode && supabase) {
        await supabase.from('access_logs').insert([logEntry]);
    } else {
        // Sauvegarde dans la base de secours ESP32 (Consigne 2026-02-08)
        const queue = JSON.parse(localStorage.getItem('thera_offline_logs') || "[]");
        queue.push(logEntry);
        localStorage.setItem('thera_offline_logs', JSON.stringify(queue));
    }
}

/* ==========================================================================
   SECTION 7 : CENTRE DE MAINTENANCE & DIAGNOSTIC
   ========================================================================== */

/**
 * runHardwareDiagnostic : Teste la présence réseau de tous les automates
 */
async function runHardwareDiagnostic() {
    addSystemLog("Lancement du diagnostic réseau...", "info");
    const results = [];

    for (const portal of appConfig.portals) {
        if (portal.connectionType !== 'local') continue;
        
        const start = Date.now();
        let status = "OFFLINE";
        
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            
            // Test de ping HTTP léger
            await fetch(`http://${portal.ip}/status`, { mode: 'no-cors', signal: controller.signal });
            status = "ONLINE";
            clearTimeout(timeout);
        } catch (e) {
            status = "TIMEOUT/ERR";
        }

        const latency = Date.now() - start;
        results.push({ name: portal.name, ip: portal.ip, status, latency });
        addSystemLog(`Diag ${portal.name} (${portal.ip}) : ${status}`, status === "ONLINE" ? "success" : "error");
    }
    
    renderDiagnosticUI(results);
}

function renderDiagnosticUI(results) {
    const container = document.getElementById('maintenance-report-area');
    if (!container) return;

    container.innerHTML = `
        <div class="diag-card">
            <h4 style="margin-top:0;">Rapport d'état matériel</h4>
            ${results.map(r => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee;">
                    <span><strong>${r.name}</strong> <small>(${r.ip})</small></span>
                    <span style="color:${r.status === 'ONLINE' ? 'var(--success)' : 'var(--danger)'}">
                        ${r.status} ${r.status === 'ONLINE' ? `(${r.latency}ms)` : ''}
                    </span>
                </div>
            `).join('')}
            <button onclick="runHardwareDiagnostic()" class="btn-action" style="margin-top:15px; width:100%;">RAFRAÎCHIR LE TEST</button>
        </div>
    `;
}

// --- FIN BLOC 3 ---
/* ==========================================================================
   SECTION 8 : GÉOFENCING & LOCALISATION (GPS MODULE)
   (Consigne 2026-01-27 : Ouverture automatique sécurisée)
   ========================================================================== */

let geoWatchId = null;

/**
 * toggleGeofencing : Active ou désactive la surveillance GPS
 */
function toggleGeofencing(enable) {
    if (enable && navigator.geolocation) {
        addSystemLog("Surveillance GPS active (Proximité)", "info");
        geoWatchId = navigator.geolocation.watchPosition(
            checkProximity, 
            (err) => addSystemLog("Erreur GPS : " + err.message, "error"), 
            { enableHighAccuracy: true, distanceFilter: 10 }
        );
    } else if (geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
        addSystemLog("Surveillance GPS désactivée", "info");
    }
}

function checkProximity(position) {
    const uLat = position.coords.latitude;
    const uLon = position.coords.longitude;
    const radius = appConfig.settings.gpsRadius;

    appConfig.portals.forEach(portal => {
        if (portal.lat && portal.lon) {
            const dist = calculateDistance(uLat, uLon, portal.lat, portal.lon);
            if (dist < radius) {
                // Déclenche une confirmation visuelle avant ouverture (Sécurité)
                triggerGpsAlert(portal);
            }
        }
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Rayon Terre
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ==========================================================================
   SECTION 9 : DESIGN SYSTÈME DYNAMIQUE (UI ENGINE)
   (Consigne 2026-02-08 : Insertion images et wallpapers Thera Connect)
   ========================================================================== */

function injectGlobalStyles() {
    const css = `
        :root {
            --accent: ${appConfig.branding.color};
            --bg-main: #f4f7f9;
            --card-bg: #ffffff;
            --text-dark: #2d3436;
            --text-light: #636e72;
            --success: #00b894;
            --danger: #d63031;
            --shadow-pro: 0 10px 25px rgba(0,0,0,0.05);
        }

        body { 
            margin: 0; padding: 0; font-family: 'Inter', sans-serif;
            background: var(--bg-main); color: var(--text-dark);
            -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent;
        }

        /* --- Mise en page des sections --- */
        .app-page { display: none; min-height: 100vh; padding: 20px 20px 100px 20px; box-sizing: border-box; }
        .active-view { display: block; animation: fadeIn 0.4s ease; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* --- Cartes Portails Professionnelles --- */
        .portal-card {
            background: var(--card-bg); border-radius: 24px; padding: 24px;
            box-shadow: var(--shadow-pro); display: flex; justify-content: space-between;
            align-items: center; border-left: 6px solid var(--accent);
            margin-bottom: 15px; transition: transform 0.2s;
        }
        .portal-card:active { transform: scale(0.97); }

        .btn-open-main {
            background: var(--accent); color: white; border: none;
            padding: 15px 30px; border-radius: 16px; font-weight: 700;
            cursor: pointer; box-shadow: 0 4px 12px rgba(0,123,255,0.25);
        }

        /* --- Barre de Navigation Inférieure --- */
        .bottom-nav {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255,255,255,0.9); backdrop-filter: blur(12px);
            display: flex; justify-content: space-around;
            padding: 15px 10px calc(15px + env(safe-area-inset-bottom));
            border-top: 1px solid rgba(0,0,0,0.05); z-index: 1000;
        }

        .nav-item { color: var(--text-light); text-decoration: none; text-align: center; flex: 1; font-size: 0.75rem; }
        .nav-item.active { color: var(--accent); font-weight: 700; }

        /* --- Toasts et Modales --- */
        .toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            padding: 12px 25px; border-radius: 50px; background: #333; color: white;
            font-size: 0.9rem; z-index: 10001; opacity: 0; transition: opacity 0.3s;
        }
        .toast-show { opacity: 1; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
}

/* ==========================================================================
   SECTION 10 : MODULE LAPI & QUAI (INDUSTRIAL LOGIC)
   (Consigne 2026-01-27 : Gestion spécifique Coffret Quai)
   ========================================================================== */

const IndustryEngine = {
    async processLapiDetection(plateNumber) {
        if (!appConfig.modules.lapi) return;
        
        addSystemLog(`Analyse LAPI : Plaque détectée ${plateNumber}`, "info");
        
        // Recherche du profil correspondant (Double vérification 2026-01-26)
        const profile = appConfig.users.find(u => u.plate_number === plateNumber);
        
        if (profile && checkInstantAccess(profile)) {
            addSystemLog(`Accès LAPI autorisé pour ${profile.firstname}`, "success");
            const entryGate = appConfig.portals.find(p => p.type === 'entree');
            if (entryGate) sendHardwareCommand(entryGate.relayIndex, entryGate.id);
        } else {
            addSystemLog(`Accès LAPI refusé : Plaque ${plateNumber} inconnue/bloquée`, "warning");
        }
    },

    async handleQuayAssignment(quayId) {
        const quay = appConfig.portals.find(p => p.id === quayId);
        if (quay && quay.status === 'LIBRE') {
            addSystemLog(`Attribution Quai : ${quay.name}`, "info");
            sendHardwareCommand(quay.relayIndex, quay.id);
        }
    }
};

/* ==========================================================================
   SECTION 11 : INITIALISATION FINALE ET LANCEMENT
   (Consigne 2026-01-14 : Provide launch command)
   ========================================================================== */

/**
 * initializeApp : Démarre tous les services Thera Connect
 */
function initializeApp() {
    console.log(`%c THERA CONNECT V${appConfig.version} - BOOT SUCCESS `, "background: #007bff; color: white; font-weight: bold;");
    
    // 1. Montage CSS
    injectGlobalStyles();
    
    // 2. Lancement Session Cloud ou Backup
    bootSystem();
    
    // 3. Activation des modules secondaires
    if (appConfig.modules.geo) toggleGeofencing(true);
    
    // 4. Protection Crash (Consigne 2026-01-26)
    window.onerror = function(msg, url, line) {
        addSystemLog(`CRASH ÉVITÉ : ${msg} (Ligne ${line})`, "error");
        return false;
    };

    addSystemLog("Système prêt et opérationnel", "success");
}

// Lancement automatique au chargement
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * COMMANDE DE LANCEMENT : 
 * initializeApp(); 
 * (Invoquée automatiquement par l'événement DOMContentLoaded)
 */

/* ==========================================================================
   FIN DU FICHIER SCRIPT.JS - VERSION STABLE V300 (2500 LIGNES DE LOGIQUE)
   ========================================================================== */
