let authToken = null;
let userPayload = null;

function showSpinner() {
    const sp = document.getElementById('spinner');
    if (sp) sp.classList.remove('hidden');
}

function hideSpinner() {
    const sp = document.getElementById('spinner');
    if (sp) sp.classList.add('hidden');
}

function makeLoginUrl({ prompt = 'select_account' } = {}) {
    const CLIENT_ID = '210193560315-oqteji9v5622etsl79hv3hn2m9lsj7ac.apps.googleusercontent.com';
    const REDIRECT  = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        response_type: 'id_token',
        scope: 'openid email profile',
        hd: 'krakend.io',
        nonce: Math.random().toString(36).substring(2),
        prompt
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function showOverlay() {
    document.getElementById('loginOverlay').classList.remove('hidden');
}

function hideOverlayAndInit(initApp) {
    document.getElementById('loginOverlay').classList.add('hidden');
    setAuthToken(authToken);
    initApp();
}

function showErrorMsg(msg) {
    const err = document.getElementById('errorMsg');
    err.textContent = msg;
    err.classList.remove('hidden');
}

function scheduleSilentRefresh() {
    if (!userPayload || !userPayload.exp) return;
    const expTs = userPayload.exp * 1000;
    const now   = Date.now();
    const delay = expTs - now - 60 * 1000;
    if (delay <= 0) {
        window.location.href = makeLoginUrl({ prompt: 'none' });
    } else {
        setTimeout(() => {
            window.location.href = makeLoginUrl({ prompt: 'none' });
        }, delay);
    }
}

function handleCallback(initApp) {
    showSpinner();
    const hash = window.location.hash.substring(1);
    const resp = Object.fromEntries(new URLSearchParams(hash));

    history.replaceState(null, '', window.location.pathname);

    if (resp.error) {
        if (resp.error === 'login_required' || resp.error === 'interaction_required') {
            showOverlay();
            const btn = document.getElementById('googleLoginBtn');
            btn.href = makeLoginUrl({ prompt: 'select_account' });
            showErrorMsg('You need to login again.');
        } else {
            showErrorMsg(`Google error: ${resp.error}`);
        }
        hideSpinner();
        return;
    }

    if (resp.id_token) {
        try {
            const payload = JSON.parse(atob(resp.id_token.split('.')[1]));
            if (payload.hd !== 'krakend.io') {
                showErrorMsg(`Domain not authorized (${payload.hd})`);
                return setTimeout(() => window.location.href = 'https://www.krakend.io/', 5000);
            }
            authToken   = resp.id_token;
            userPayload = payload;

            showUserProfile();
            hideOverlayAndInit(initApp);
            scheduleSilentRefresh();
        } catch (e) {
            showErrorMsg('Error parsing token: ' + e.message);
        }
    }

    hideSpinner();
}

function showUserProfile() {
    if (!userPayload) return;
    const profileDiv = document.getElementById('userProfile');
    const avatarImg  = document.getElementById('userAvatar');
    const nameSpan   = document.getElementById('userName');

    avatarImg.src   = userPayload.picture;
    avatarImg.title = userPayload.name || userPayload.email;
    nameSpan.textContent = userPayload.name || userPayload.email;

    profileDiv.classList.remove('hidden');
}

export function initAuth(initApp) {
    window.onload = () => {
        if (window.location.hash) {
            handleCallback(initApp);
            return;
        }
        showSpinner();
        window.location.href = makeLoginUrl({ prompt: 'none' });
    };
}

/**
 * Permite que data.js reciba el token
 */
export function setAuthToken(token) {
    // data.js importará esta función para guardar _token
    // o bien data.js puede llamar getAuthToken directamente
    // Aquí simplemente se hace un stub; la lógica real de guardado
    // se delega a data.js mediante import.
    window._appAuthToken = token;
}

/**
 * Permite leer el token desde otros módulos
 */
export function getAuthToken() {
    return authToken;
}
