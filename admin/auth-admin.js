/* ==================================================================
   THERA CONNECT — Gestion Pro · auth-admin.js
   Authentification admin uniquement
================================================================== */

window.addEventListener('DOMContentLoaded', async () => {
    await _waitForSupabase();

    if (!sbClient) {
        _showAdminLogin('config');
        return;
    }

    sbClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await _handleAdminSignIn(session.user);
        } else if (event === 'SIGNED_OUT') {
            _handleAdminSignOut();
        }
    });

    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
        await _handleAdminSignIn(session.user);
    } else {
        _showAdminLogin('login');
    }
});

function _waitForSupabase(timeout = 3000) {
    return new Promise(resolve => {
        if (typeof sbClient !== 'undefined' && sbClient) { resolve(); return; }
        const iv = setInterval(() => { if (typeof sbClient !== 'undefined' && sbClient) { clearInterval(iv); resolve(); } }, 100);
        setTimeout(() => { clearInterval(iv); resolve(); }, timeout);
    });
}

async function _handleAdminSignIn(user) {
    // Vérifier que l'utilisateur est admin/super_admin
    const { data: profil, error } = await sbClient
        .from('profiles')
        .select('*')
        .eq('email', user.email)
        .single();

    if (error || !profil) {
        await sbClient.auth.signOut();
        _showAdminLogin('login');
        _showLoginError('Profil introuvable. Accès refusé.');
        return;
    }

    if (!['super_admin','Administrateur'].includes(profil.type)) {
        await sbClient.auth.signOut();
        _showAdminLogin('login');
        _showLoginError('Accès réservé aux administrateurs.');
        return;
    }

    _hideAdminLogin();
    _updateAdminSidebarUser(profil);

    await loadAdminData();
    showPage('page-dashboard');

    console.log('✅ Admin connecté :', profil.name, '(' + profil.type + ')');
}

function _handleAdminSignOut() {
    document.getElementById('app-shell').style.display = 'none';
    _showAdminLogin('login');
}

async function adminSignIn() {
    const email    = document.getElementById('admin-login-email')?.value.trim();
    const password = document.getElementById('admin-login-password')?.value;
    const btn      = document.getElementById('admin-login-btn');

    if (!email || !password) { _showLoginError('Email et mot de passe requis'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Connexion...'; }
    _showLoginError('');

    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) {
        if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
        _showLoginError(_authErrMsg(error.message));
    }
}

async function adminSignOut() {
    if (!confirm('Se déconnecter ?')) return;
    await sbClient.auth.signOut();
}

function _showAdminLogin(mode) {
    document.getElementById('app-shell').style.display = 'none';
    let screen = document.getElementById('admin-auth-screen');
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'admin-auth-screen';
        screen.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0a0e14;';
        screen.innerHTML = `
            <div style="background:#111820;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:44px;width:100%;max-width:420px;box-shadow:0 32px 80px rgba(0,0,0,.5);">
                <div style="text-align:center;margin-bottom:32px;">
                    <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#3ecf8e,#2db97a);display:inline-flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;font-weight:800;font-size:1rem;color:white;margin-bottom:14px;box-shadow:0 8px 24px rgba(62,207,142,.35);">TC</div>
                    <div style="font-family:'DM Sans',sans-serif;font-size:1.3rem;font-weight:800;color:white;letter-spacing:-.4px;">Gestion <span style="color:#3ecf8e">Pro</span></div>
                    <div style="color:#475569;font-size:.82rem;margin-top:4px;">Accès réservé aux administrateurs</div>
                </div>

                <div id="admin-config-notice" style="display:none;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);border-radius:8px;padding:14px;color:#f85149;font-size:.83rem;text-align:center;margin-bottom:16px;">
                    ⚠️ Supabase non configuré.<br>
                    <a href="#" onclick="showPage('page-settings');document.getElementById('app-shell').style.display='flex';document.getElementById('admin-auth-screen').style.display='none';" style="color:#3ecf8e;text-decoration:underline;">Configurer</a>
                </div>

                <div id="admin-login-form">
                    <div style="margin-bottom:14px;">
                        <label style="display:block;color:#94a3b8;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Email</label>
                        <input type="email" id="admin-login-email" placeholder="admin@thera-connect.fr"
                            onkeydown="if(event.key==='Enter')adminSignIn()"
                            style="width:100%;padding:12px 14px;border-radius:8px;background:#0a0e14;border:1.5px solid rgba(255,255,255,.1);color:white;font-size:.9rem;outline:none;transition:border-color .2s;"
                            onfocus="this.style.borderColor='#3ecf8e'" onblur="this.style.borderColor='rgba(255,255,255,.1)'">
                    </div>
                    <div style="margin-bottom:22px;">
                        <label style="display:block;color:#94a3b8;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Mot de passe</label>
                        <input type="password" id="admin-login-password" placeholder="••••••••"
                            onkeydown="if(event.key==='Enter')adminSignIn()"
                            style="width:100%;padding:12px 14px;border-radius:8px;background:#0a0e14;border:1.5px solid rgba(255,255,255,.1);color:white;font-size:.9rem;outline:none;transition:border-color .2s;"
                            onfocus="this.style.borderColor='#3ecf8e'" onblur="this.style.borderColor='rgba(255,255,255,.1)'">
                    </div>

                    <p id="admin-login-error" style="color:#f85149;font-size:.82rem;text-align:center;min-height:18px;margin-bottom:10px;"></p>

                    <button id="admin-login-btn" onclick="adminSignIn()"
                        style="width:100%;padding:13px;border-radius:8px;background:linear-gradient(135deg,#3ecf8e,#2db97a);border:none;color:white;font-size:.95rem;font-weight:700;cursor:pointer;transition:opacity .2s;box-shadow:0 4px 16px rgba(62,207,142,.3);"
                        onmouseover="this.style.opacity='.9'" onmouseout="this.style.opacity='1'">
                        Se connecter
                    </button>
                </div>
            </div>`;
        document.body.appendChild(screen);
    }
    screen.style.display = 'flex';
    if (mode === 'config') {
        document.getElementById('admin-config-notice').style.display = 'block';
    }
}

function _hideAdminLogin() {
    const screen = document.getElementById('admin-auth-screen');
    if (screen) screen.style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
}

function _showLoginError(msg) {
    const el = document.getElementById('admin-login-error');
    if (el) el.textContent = msg;
}

function _updateAdminSidebarUser(profil) {
    const footer = document.getElementById('sidebar-user-info');
    if (!footer) return;
    footer.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:30px;height:30px;border-radius:50%;background:rgba(62,207,142,.15);display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:#3ecf8e;flex-shrink:0;">${(profil.name||'A').charAt(0).toUpperCase()}</div>
            <div>
                <div style="font-size:.82rem;color:white;font-weight:600;">${profil.name}</div>
                <div style="font-size:.7rem;color:#64748b;">${profil.type}</div>
            </div>
        </div>
        <button onclick="adminSignOut()" style="width:100%;padding:7px;border-radius:6px;background:transparent;border:1px solid rgba(248,81,73,.25);color:#f85149;font-size:.78rem;cursor:pointer;transition:background .2s;"
            onmouseover="this.style.background='rgba(248,81,73,.1)'" onmouseout="this.style.background='transparent'">
            Déconnexion
        </button>`;
}

function _authErrMsg(msg) {
    if (msg.includes('Invalid login')) return 'Email ou mot de passe incorrect.';
    if (msg.includes('Email not confirmed')) return 'Email non confirmé.';
    if (msg.includes('Too many')) return 'Trop de tentatives. Réessayez plus tard.';
    return 'Erreur de connexion.';
}