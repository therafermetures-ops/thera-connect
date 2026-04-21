/* ==================================================================
   AUTH.JS — Thera Connect Phase 2
   Gestion complète de l'authentification via Supabase Auth
   Ce fichier doit être chargé AVANT script.js dans index.html
================================================================== */

/* ------------------------------------------------------------------
   1. ÉTAT DE SESSION
------------------------------------------------------------------ */
let currentUser = null;      // Objet utilisateur Supabase Auth
let currentProfil = null;    // Ligne correspondante dans la table 'profiles'

/* ------------------------------------------------------------------
   2. INITIALISATION AU CHARGEMENT
   Supabase est déjà initialisé via script.js (supabaseClient).
   On écoute les changements de session dès que la page se charge.
------------------------------------------------------------------ */
window.addEventListener('DOMContentLoaded', async () => {
    // Attendre que supabaseClient soit disponible (initialisé dans script.js)
    await waitForSupabase();

    if (!supabaseClient) {
        // Pas de config Supabase : afficher l'écran de configuration
        showAuthScreen('config');
        return;
    }

    // Écouter les changements d'état de session (login, logout, refresh)
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('🔐 Auth event:', event);

        if (event === 'SIGNED_IN' && session) {
            await handleSignIn(session.user);
        } else if (event === 'SIGNED_OUT') {
            handleSignOut();
        } else if (event === 'TOKEN_REFRESHED' && session) {
            console.log('🔄 Token rafraîchi.');
        }
    });

    // Vérifier s'il y a déjà une session active (rechargement de page)
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await handleSignIn(session.user);
    } else {
        showAuthScreen('login');
    }
});

/* ------------------------------------------------------------------
   3. ATTENTE DE SUPABASECLIENT (peut être initialisé après DOMContentLoaded)
------------------------------------------------------------------ */
function waitForSupabase(timeout = 3000) {
    return new Promise((resolve) => {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            resolve();
            return;
        }
        const interval = setInterval(() => {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
        setTimeout(() => { clearInterval(interval); resolve(); }, timeout);
    });
}

/* ------------------------------------------------------------------
   4. CONNEXION : EMAIL + MOT DE PASSE
------------------------------------------------------------------ */
async function signInWithEmail() {
    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const btn = document.getElementById('auth-submit-btn');
    const errEl = document.getElementById('auth-error');

    if (!email || !password) {
        showAuthError("Veuillez remplir tous les champs.");
        return;
    }

    // État de chargement
    if (btn) { btn.disabled = true; btn.textContent = "Connexion..."; }
    if (errEl) errEl.textContent = "";

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
        showAuthError(getAuthErrorMessage(error.message));
        return;
    }
    // onAuthStateChange prend le relais automatiquement
}

/* ------------------------------------------------------------------
   5. DÉCONNEXION
------------------------------------------------------------------ */
async function signOut() {
    if (!confirm("Voulez-vous vous déconnecter ?")) return;

    await supabaseClient.auth.signOut();
    // onAuthStateChange déclenche handleSignOut()
}

/* ------------------------------------------------------------------
   6. APRÈS CONNEXION RÉUSSIE
   - Récupérer le profil dans la table 'profiles' via l'email
   - Appliquer les permissions selon le rôle
   - Afficher l'application
------------------------------------------------------------------ */
async function handleSignIn(user) {
    currentUser = user;
    console.log("✅ Utilisateur connecté :", user.email);

    // Récupérer le profil dans la table profiles (correspondance par email)
    const { data: profil, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('email', user.email)
        .single();

    if (error || !profil) {
        console.warn("⚠️ Profil introuvable pour :", user.email, "— accès visiteur par défaut.");
        currentProfil = { name: user.email, type: 'Visiteur', role: 'Visiteur' };
    } else {
        currentProfil = profil;
    }

    // Masquer l'écran d'auth, afficher l'app
    hideAuthScreen();
    updateSidebarUser();

    // Charger les données et appliquer les permissions
    await loadAllData();
    applyPermissions(currentProfil.type || currentProfil.role || 'Visiteur', currentProfil.expires_at);

    showPage('page-accueil');
}

/* ------------------------------------------------------------------
   7. APRÈS DÉCONNEXION
------------------------------------------------------------------ */
function handleSignOut() {
    currentUser = null;
    currentProfil = null;

    // Réinitialiser le state
    state.acces = [];
    state.profils = [];
    state.historique = [];
    state.trash = [];

    showAuthScreen('login');
    console.log("👋 Déconnecté.");
}

/* ------------------------------------------------------------------
   8. AFFICHAGE / MASQUAGE DE L'ÉCRAN D'AUTH
------------------------------------------------------------------ */
function showAuthScreen(mode = 'login') {
    // Masquer l'app
    document.querySelector('.main-layout').style.display = 'none';
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) mobileBtn.style.display = 'none';

    // Afficher ou créer l'écran d'auth
    let authScreen = document.getElementById('auth-screen');
    if (!authScreen) {
        authScreen = createAuthScreen();
        document.body.appendChild(authScreen);
    }
    authScreen.style.display = 'flex';

    if (mode === 'config') {
        document.getElementById('auth-config-notice').style.display = 'block';
        document.getElementById('auth-form-section').style.display = 'none';
    } else {
        document.getElementById('auth-config-notice').style.display = 'none';
        document.getElementById('auth-form-section').style.display = 'block';
    }
}

function hideAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.style.display = 'none';

    document.querySelector('.main-layout').style.display = 'flex';
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) mobileBtn.style.display = '';
}

/* ------------------------------------------------------------------
   9. CRÉATION DYNAMIQUE DE L'ÉCRAN DE LOGIN
------------------------------------------------------------------ */
function createAuthScreen() {
    const screen = document.createElement('div');
    screen.id = 'auth-screen';
    screen.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: #0f1318;
    `;

    screen.innerHTML = `
        <div style="
            background: #161b22; border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px; padding: 40px; width: 100%; max-width: 400px;
            box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        ">
            <div style="text-align:center; margin-bottom: 32px;">
                <div style="font-size: 1.4rem; font-weight: 800; color: white; letter-spacing: -0.5px;">
                    Thera <span style="color: #3ecf8e;">Connect</span>
                </div>
                <p style="color: #64748b; font-size: 0.9rem; margin-top: 8px;">
                    Connectez-vous pour accéder à votre espace
                </p>
            </div>

            <!-- Notice si Supabase non configuré -->
            <div id="auth-config-notice" style="display:none; background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.3); border-radius: 8px; padding: 16px; color: #f85149; font-size: 0.85rem; text-align: center; margin-bottom: 16px;">
                ⚠️ Supabase n'est pas configuré.<br>
                <a href="#" onclick="showConfigFromAuth()" style="color: #3ecf8e; text-decoration: underline;">
                    Configurer la connexion cloud
                </a>
            </div>

            <!-- Formulaire de login -->
            <div id="auth-form-section">
                <div style="margin-bottom: 16px;">
                    <label style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 6px;">
                        Adresse email
                    </label>
                    <input
                        type="email"
                        id="auth-email"
                        placeholder="votre@email.com"
                        onkeydown="if(event.key==='Enter') signInWithEmail()"
                        style="
                            width: 100%; padding: 12px 14px; border-radius: 8px;
                            background: #0f1318; border: 1px solid rgba(255,255,255,0.1);
                            color: white; font-size: 0.95rem; outline: none;
                            transition: border-color 0.2s;
                        "
                        onfocus="this.style.borderColor='#3ecf8e'"
                        onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
                    >
                </div>

                <div style="margin-bottom: 24px;">
                    <label style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 6px;">
                        Mot de passe
                    </label>
                    <input
                        type="password"
                        id="auth-password"
                        placeholder="••••••••"
                        onkeydown="if(event.key==='Enter') signInWithEmail()"
                        style="
                            width: 100%; padding: 12px 14px; border-radius: 8px;
                            background: #0f1318; border: 1px solid rgba(255,255,255,0.1);
                            color: white; font-size: 0.95rem; outline: none;
                            transition: border-color 0.2s;
                        "
                        onfocus="this.style.borderColor='#3ecf8e'"
                        onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
                    >
                </div>

                <p id="auth-error" style="color: #f85149; font-size: 0.85rem; text-align: center; min-height: 20px; margin-bottom: 12px;"></p>

                <button
                    id="auth-submit-btn"
                    onclick="signInWithEmail()"
                    style="
                        width: 100%; padding: 13px; border-radius: 8px;
                        background: #3ecf8e; border: none; color: white;
                        font-size: 1rem; font-weight: 700; cursor: pointer;
                        transition: background 0.2s;
                    "
                    onmouseover="this.style.background='#34b97d'"
                    onmouseout="this.style.background='#3ecf8e'"
                >
                    Se connecter
                </button>

                <p style="color: #475569; font-size: 0.78rem; text-align: center; margin-top: 20px;">
                    Accès réservé aux utilisateurs autorisés.<br>
                    Contactez votre administrateur pour créer un compte.
                </p>
            </div>
        </div>
    `;

    return screen;
}

/* ------------------------------------------------------------------
   10. MISE À JOUR DE LA SIDEBAR AVEC L'UTILISATEUR CONNECTÉ
------------------------------------------------------------------ */
function updateSidebarUser() {
    const header = document.querySelector('.sidebar-header');
    if (!header || !currentProfil) return;

    // Supprimer l'ancienne info utilisateur si elle existe
    const old = header.querySelector('.sidebar-user-info');
    if (old) old.remove();

    const userInfo = document.createElement('div');
    userInfo.className = 'sidebar-user-info';
    userInfo.style.cssText = `
        margin-top: 16px; padding-top: 16px;
        border-top: 1px solid rgba(255,255,255,0.06);
    `;
    userInfo.innerHTML = `
        <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 10px;">
            <div style="
                width: 32px; height: 32px; border-radius: 50%;
                background: rgba(62,207,142,0.15); display: flex;
                align-items: center; justify-content: center;
                font-size: 0.8rem; font-weight: 700; color: #3ecf8e;
            ">
                ${(currentProfil.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="font-size: 0.85rem; color: white; font-weight: 600;">
                    ${currentProfil.name || currentUser?.email || 'Utilisateur'}
                </div>
                <div style="font-size: 0.75rem; color: #64748b;">
                    ${currentProfil.type || currentProfil.role || 'Visiteur'}
                </div>
            </div>
        </div>
        <button
            onclick="signOut()"
            style="
                width: 100%; padding: 8px; border-radius: 6px;
                background: transparent; border: 1px solid rgba(248,81,73,0.3);
                color: #f85149; font-size: 0.8rem; cursor: pointer;
                transition: background 0.2s;
            "
            onmouseover="this.style.background='rgba(248,81,73,0.1)'"
            onmouseout="this.style.background='transparent'"
        >
            Se déconnecter
        </button>
    `;

    header.appendChild(userInfo);
}

/* ------------------------------------------------------------------
   11. UTILITAIRES AUTH
------------------------------------------------------------------ */
function showAuthError(message) {
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.textContent = message;
}

function getAuthErrorMessage(msg) {
    if (msg.includes('Invalid login')) return "Email ou mot de passe incorrect.";
    if (msg.includes('Email not confirmed')) return "Veuillez confirmer votre email avant de vous connecter.";
    if (msg.includes('Too many requests')) return "Trop de tentatives. Réessayez dans quelques minutes.";
    if (msg.includes('User not found')) return "Aucun compte trouvé avec cet email.";
    return "Erreur de connexion. Vérifiez vos identifiants.";
}

function showConfigFromAuth() {
    hideAuthScreen();
    // Montrer l'app en mode config uniquement
    document.querySelector('.main-layout').style.display = 'flex';
    showPage('page-reglages');
}

/* ------------------------------------------------------------------
   12. EXPORT — accès au profil courant depuis script.js
------------------------------------------------------------------ */
function getCurrentProfil() { return currentProfil; }
function getCurrentUser() { return currentUser; }