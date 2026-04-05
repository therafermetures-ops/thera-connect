
// 1. CONFIGURATION ET ETAT GLOBAL
const SB_URL = 'https://dekxcxlremxaynpezgmr.supabase.co';
const SB_KEY = 'sb_publishable_JwUtLr2UiSvfsBMceTfWSw_ktthLogk';

// Utilisation d'un nom unique pour éviter les conflits avec la bibliothèque window.supabase
var supabaseClient; 

function initSupabase() {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
        console.log("✅ Client Supabase initialisé avec succès.");
    } else {
        console.error("❌ La bibliothèque Supabase n'est pas chargée. Vérifiez votre index.html.");
    }
}
// État global de l'application (Source de vérité unique)
let appConfig = {
    appName: "Thera Connect",
    portals: [],
    users: [],
    alertRules: [],
    currentUser: null, // Sera rempli après login
    history: ['home']  // Historique de navigation
};

// 2. SYSTÈME DE NAVIGATION (CORRIGÉ)
function showPage(pageId, saveToHistory = true) {
    console.log("Navigation vers :", pageId);
    
    // Masquer toutes les pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    
    // Afficher la page cible
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        // Enregistrer dans l'historique si demandé
        if (saveToHistory && appConfig.history[appConfig.history.length - 1] !== pageId) {
            appConfig.history.push(pageId);
        }
    } else {
        console.error(`Erreur : La page [${pageId}] n'existe pas dans le HTML.`);
    }
}

function handleSmartBack() {
    // Correction : Utilisation de appConfig.history au lieu de pageHistory
    if (appConfig.history.length > 1) {
        appConfig.history.pop(); // Retire la page actuelle
        const prevPage = appConfig.history[appConfig.history.length - 1];
        showPage(prevPage, false); // On ne rajoute pas la page précédente à l'historique
    } else {
        showPage('home', false);
    }
}

// 3. SYNCHRONISATION SUPABASE (MOTEUR PRINCIPAL)
async function syncDatabase() {
    try {
        console.log("Sync en cours...");
        const { data: portals } = await supabase.from('portals').select('*');
        const { data: users } = await supabase.from('users').select('*');
        const { data: rules } = await supabase.from('alert_rules').select('*');
        
        if (portals) appConfig.portals = portals;
        if (users) appConfig.users = users;
        if (rules) appConfig.alertRules = rules;

        // Mise à jour de l'interface
        if (typeof renderUserList === "function") renderUserList();
        if (typeof renderPortalDashboard === "function") renderPortalDashboard();
        
    } catch (err) {
        console.error("Erreur critique de synchronisation :", err);
    }
}
/* ==========================================================
   MODULE B : HARDWARE ENGINE & LAPI MODULE (OPTIONS)
   ========================================================== */

// 1. GESTION DES COMMANDES PAR MARQUE (STRICT CONFORMITY)
async function executeHardwareAction(portalId, relayIndex, actionType = 'pulse') {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) {
        addSystemLog("Erreur : Portail introuvable pour l'action", "error");
        return;
    }

    const ip = portal.ip;
    const brand = portal.brand; // Kincony, Shelly, Norvi, etc.
    const pulseTime = portal.settings?.pulse || 2; 
    let endpoint = "";

    // Sécurité : Vérification LAPI (Module payant)
    if (portal.isLAPI && !checkLAPILicense(portalId)) {
        addSystemLog("Action refusée : Module LAPI non activé", "warning");
        return;
    }

    // Routage selon la marque (Tes 7 marques préférées)
    switch (brand.toUpperCase()) {
        case 'SHELLY':
            // Format Shelly Gen1 & Gen2
            endpoint = `http://${ip}/relay/${relayIndex}?turn=on&timer=${pulseTime}`;
            break;

        case 'KINCONY':
            // Format standard Kincony Relay Control
            endpoint = `http://${ip}/control/relay?index=${relayIndex}&action=pulse&time=${pulseTime}`;
            break;

        case 'NORVI':
            // Format API Norvi Industrial
            endpoint = `http://${ip}/api/relay/${relayIndex}/pulse/${pulseTime}`;
            break;

        case 'INDUSTRIAL SHIELDS':
            // Via ESP32 Custom firmware Thera
            endpoint = `http://${ip}/setRelay?id=${relayIndex}&pulse=${pulseTime}`;
            break;

        case 'ARDUINO OPTA':
            // API spécifique Opta Finder
            endpoint = `http://${ip}/opta/relay/${relayIndex}/trigger`;
            break;

        case 'OLIMEX':
        case 'BRAINBOXES':
            endpoint = `http://${ip}/io/relay/${relayIndex}/state?value=1&duration=${pulseTime}`;
            break;

        default:
            addSystemLog(`Marque ${brand} inconnue - Simulation active`, "info");
            simulateAction(portal.name, relayIndex);
            return;
    }

    // 2. EXÉCUTION ET LOGGING (SYNC SUPABASE)
    try {
        addSystemLog(`Envoi vers ${brand} (${ip})...`, "info");
        
        // Tentative de fetch locale (Mode transparent client)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        await fetch(endpoint, { 
            mode: 'no-cors', 
            signal: controller.signal 
        });

        clearTimeout(timeoutId);
        addSystemLog(`Signal envoyé : ${portal.name}`, "success");

        // Enregistrement historique sur Supabase
        await supabase.from('logs').insert([{
            portal_id: portalId,
            action: 'OPEN_SUCCESS',
            operator: appConfig.currentUser ? (appConfig.currentUser.firstname + " " + appConfig.currentUser.lastname) : "Système",
            timestamp: new Date().toISOString()
        }]);

    } catch (err) {
        handleHardwareError(err, portal);
    }
}

// 3. GESTION DES ERREURS ET REDÉMARRAGE (BOOTSTRAP)
function handleHardwareError(error, portal) {
    console.error(`Hardware Error on ${portal.name}:`, error);
    addSystemLog(`Échec liaison ${portal.brand} à l'adresse ${portal.ip}`, "error");

    // Tentative de reconnexion ou proposition de reboot
    const errorCard = document.getElementById('hardware-status-error');
    if (errorCard) {
        errorCard.style.display = 'block';
        errorCard.innerHTML = `L'automate ${portal.name} ne répond pas. <button onclick="rebootHardware('${portal.id}')">Redémarrer</button>`;
    }
}

async function rebootHardware(portalId) {
    const portal = appConfig.portals.find(p => p.id === portalId);
    if (!portal) return;

    if (confirm(`Confirmer le redémarrage forcé de ${portal.name} ?`)) {
        addSystemLog(`Ordre de Reboot envoyé à ${portal.ip}`, "warning");
        // Commande spécifique de reboot selon firmware Thera
        await fetch(`http://${portal.ip}/system/reboot`, { mode: 'no-cors' });
        
        setTimeout(() => {
            addSystemLog("L'automate redémarre (prévoir 30s)", "info");
        }, 2000);
    }
}

// 4. MODULE QUAI & LAPI (LOGIQUE SPÉCIFIQUE)
function checkLAPILicense(portalId) {
    // Vérifie dans la config si l'option est achetée (Simulé via appConfig)
    const portal = appConfig.portals.find(p => p.id === portalId);
    return portal && portal.options && portal.options.lapi_active === true;
}

function processQuayManagement(data) {
    // Logique complexe pour le coffret quai (Files d'attente, gestion des bornes)
    // Cette fonction fait normalement 150 lignes à elle seule
    console.log("Traitement Module Quai Thera...");
    if (data.type === 'arrival') {
        assignAvailableSpot(data.vesselId);
    }
}

// 5. CODES CLAVIERS ET RS485 (OPTION)
function processRS485Input(rawCode) {
    // Option du clavier RS485 mentionnée le 2026-01-18
    addSystemLog(`Entrée clavier détectée : ${rawCode}`, "info");
    const user = appConfig.users.find(u => u.pincode === rawCode);
    if (user && isUserAllowedNow(user)) {
        executeHardwareAction(appConfig.mainPortalId, 0);
    } else {
        addSystemLog("Code clavier invalide ou accès refusé", "error");
    }
}
/* ==========================================================
   MODULE C : DYNAMIC UI, FORM MANAGEMENT & OFFLINE CACHE
   ========================================================== */

// 1. GESTION DU CACHE LOCAL (INDEXEDDB - SECURITE ESP32)
const dbName = "TheraConnect_Offline";
let db;

const request = indexedDB.open(dbName, 3);
request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("users")) db.createObjectStore("users", { keyPath: "id" });
    if (!db.objectStoreNames.contains("portals")) db.createObjectStore("portals", { keyPath: "id" });
    if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { autoIncrement: true });
};

request.onsuccess = (e) => { db = e.target.result; };

async function saveToOfflineCache(storeName, data) {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    data.forEach(item => store.put(item));
}

// 2. RENDU DYNAMIQUE DES LISTES (SANS INVENTER DE CLASSES)
function renderUserList() {
    const container = document.getElementById('user-list-container');
    if (!container) return;

    container.innerHTML = "";
    appConfig.users.forEach(user => {
        const userRow = document.createElement('div');
        userRow.className = "user-row"; // Classe existante dans ton CSS
        userRow.innerHTML = `
            <div class="user-info">
                <span class="user-name">${user.firstname} ${user.lastname}</span>
                <span class="user-status ${isUserAllowedNow(user) ? 'active' : 'expired'}"></span>
            </div>
            <div class="user-actions">
                <button onclick="editUser('${user.id}')">Modifier</button>
                <button class="btn-danger" onclick="deleteUser('${user.id}')">Supprimer</button>
            </div>
        `;
        container.appendChild(userRow);
    });
}

// 3. GESTIONNAIRE DE FORMULAIRE (VALIDATION STRICTE)
async function handleUserSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    // Construction de l'objet utilisateur selon tes standards
    const userData = {
        id: formData.get('user-id') || `user_${Date.now()}`,
        firstname: formData.get('firstname'),
        lastname: formData.get('lastname'),
        role: formData.get('role'),
        pincode: formData.get('pincode'), // Pour clavier RS485
        expiry: formData.get('expiry-date'),
        schedule: {
            days: {
                mon: formData.get('mon') === 'on',
                tue: formData.get('tue') === 'on',
                wed: formData.get('wed') === 'on',
                thu: formData.get('thu') === 'on',
                fri: formData.get('fri') === 'on',
                sat: formData.get('sat') === 'on',
                sun: formData.get('sun') === 'on'
            },
            slots: [
                { start: formData.get('slot1-start'), end: formData.get('slot1-end') }
            ]
        }
    };

    // Double contrôle de l'erreur (Consigne du 2026-01-26)
    if (!userData.firstname || !userData.lastname) {
        alert("Erreur : Les noms sont obligatoires.");
        return;
    }

    try {
        // 1. Sauvegarde Supabase
        const { error } = await supabase.from('users').upsert(userData);
        if (error) throw error;

        // 2. Mise à jour cache local (Backup ESP32)
        await saveToOfflineCache("users", [userData]);

        addSystemLog(`Utilisateur ${userData.firstname} synchronisé.`, "success");
        showPage('settings-users');
        syncDatabase();
    } catch (err) {
        addSystemLog("Erreur de synchronisation Cloud. Données stockées localement.", "warning");
        await saveToOfflineCache("users", [userData]);
    }
}

// 4. CONFIGURATION DES PORTAILS (MARQUES & RÉGLAGES)
function renderPortalDashboard() {
    const grid = document.getElementById('portal-grid');
    if (!grid) return;

    grid.innerHTML = appConfig.portals.map(p => `
        <div class="portal-card" data-brand="${p.brand}">
            <div class="portal-header">
                <h3>${p.name}</h3>
                <span class="badge-${p.brand.toLowerCase()}">${p.brand}</span>
            </div>
            <div class="portal-controls">
                <button class="main-trigger" onclick="executeHardwareAction('${p.id}', 0)">
                    OUVRIR PRINCIPAL
                </button>
                ${p.hasSecondRelay ? `<button onclick="checkAndOpen('${currentUser.id}', '${p.id}', 1)">PIÉTON</button>` : ''}
            </div>
            <div class="portal-meta">
                <span>IP: ${p.ip}</span>
                <span class="signal-icon"></span>
            </div>
        </div>
    `).join('');
}

// 5. GESTION DES RECHERCHES (FILTRES DYNAMIQUES)
function filterUsers(query) {
    const filtered = appConfig.users.filter(u => 
        u.firstname.toLowerCase().includes(query.toLowerCase()) || 
        u.lastname.toLowerCase().includes(query.toLowerCase())
    );
    // On rappelle le rendu avec la liste filtrée
    renderUserList(filtered);
}
/* ==========================================================
   MODULE D : GEOFENCING, BRANDING & SYSTEM LAUNCH
   ========================================================== */

// 1. MOTEUR DE GÉOLOCALISATION (Calcul Haversine & Proximité)
let geoWatchId = null;

function toggleGeofencing(isActive) {
    if (isActive) {
        if (!navigator.geolocation) {
            addSystemLog("GPS non supporté par ce navigateur", "error");
            return;
        }
        geoWatchId = navigator.geolocation.watchPosition(
            checkProximityToPortals,
            (err) => addSystemLog(`Erreur GPS: ${err.message}`, "warning"),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        addSystemLog("Surveillance de proximité activée", "info");
    } else {
        if (geoWatchId) navigator.geolocation.clearWatch(geoWatchId);
        addSystemLog("Géofencing désactivé", "info");
    }
}

function checkProximityToPortals(pos) {
    const userLat = pos.coords.latitude;
    const userLon = pos.coords.longitude;
    const detectionRadius = 50; //Rayon de 50 mètres

    appConfig.portals.forEach(portal => {
        if (portal.lat && portal.lon) {
            const distance = calculateDistance(userLat, userLon, portal.lat, portal.lon);
            if (distance <= detectionRadius) {
                showProximitySlider(portal);
            }
        }
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Rayon Terre en mètres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 2. INTERFACE DE CONFIRMATION (SLIDER DE SÉCURITÉ)
function showProximitySlider(portal) {
    const modal = document.getElementById('gps-slider-modal');
    if (modal.style.display === 'block') return; // Déjà affiché

    document.getElementById('gps-target-name').innerText = portal.name;
    modal.style.display = 'block';

    const slider = document.getElementById('gps-slider-input');
    slider.value = 0;
    
    slider.oninput = function() {
        if (this.value > 95) {
            executeHardwareAction(portal.id, 0); // Ouvre le relais 0
            closeGPSModal();
            addSystemLog(`Ouverture automatique : ${portal.name}`, "success");
        }
    };
}

// 3. BRANDING DYNAMIQUE ET MODE SOMBRE (TRANSPARENCE CLIENT)
function applyBranding(config) {
    // Masquer toute trace de Home Assistant
    document.title = config.appName || "Thera Connect";
    
    // Couleurs dynamiques
    const root = document.documentElement;
    root.style.setProperty('--primary-color', config.color || '#007bff');
    root.style.setProperty('--accent-color', config.accent || '#ff9800');

    // Logo et Wallpaper (Instructions du 2026-02-08)
    const logoImg = document.getElementById('app-logo');
    if (logoImg && config.logoUrl) logoImg.src = config.logoUrl;

    if (config.wallpaperUrl) {
        document.body.style.backgroundImage = `url('${config.wallpaperUrl}')`;
        document.body.style.backgroundSize = "cover";
    }

    // Gestion automatique du mode sombre (Heure locale)
    const hour = new Date().getHours();
    if (hour >= 20 || hour <= 6) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// 4. HISTORIQUE ET LOGS (LOGIQUE DE RECHERCHE)
async function fetchLogs() {
    const { data, error } = await supabase
        .from('logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;

    logContainer.innerHTML = data.map(log => `
        <div class="log-item ${log.type.toLowerCase()}">
            <span class="log-date">${new Date(log.timestamp).toLocaleString()}</span>
            <span class="log-msg">${log.details}</span>
            <span class="log-op">${log.operator || 'Système'}</span>
        </div>
    `).join('');
}

// 5. COMMANDE DE LANCEMENT ET INITIALISATION FINALE
function launchTheraConnect() {
    console.log("--- INITIALISATION THERA CONNECT V300 ---");
    
    // 1. Connexion Supabase
    syncDatabase();

    // 2. Chargement du Branding
    const savedConfig = JSON.parse(localStorage.getItem('thera_branding'));
    if (savedConfig) applyBranding(savedConfig);

    // 3. Activation du Géofencing si paramétré
    if (localStorage.getItem('geofencing_enabled') === 'true') {
        toggleGeofencing(true);
    }

    // 4. Écoute temps réel Supabase (Logs)
    supabase
        .channel('public:logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, payload => {
            addSystemLog(`Nouvel événement : ${payload.new.action}`, "info");
            fetchLogs();
        })
        .subscribe();

    addSystemLog("Système Thera Connect opérationnel.", "success");
}

// LANCEMENT DU SCRIPT
launchTheraConnect();
