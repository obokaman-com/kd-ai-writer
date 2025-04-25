const AI_WRITER_API  = 'https://services.krakend.io/webhook/5001df30-59b2-498d-a1c2-15b64be106d9/ai-writer';
const COMPANIES_URL  = AI_WRITER_API + '/companies-list';
const PROFILE_URL    =  AI_WRITER_API + '/company-profile';
const WRITE_URL      =  AI_WRITER_API + '/write';
const CONTEXT_URL      =  AI_WRITER_API + '/context';

let _authToken = null;
let _busy      = false;
let _controller = null;

export function setAuthToken(token) { _authToken = token; }
function authHeader() { return { 'Authorization': 'Bearer ' + _authToken }; }
export function cancelRequest() {
    if (_controller) {
        _controller.abort();
        _controller = null;
    }
}

function showLoading() {
    const ind = document.getElementById('loadingIndicator');
    if (ind) ind.classList.remove('hidden');
}

function hideLoading() {
    const ind = document.getElementById('loadingIndicator');
    if (ind) ind.classList.add('hidden');
}

async function apiFetch(url, opts = {}) {
    if (_busy) {
        return Promise.reject(new Error('Another ongoing request'));
    }
    _busy = true;
    _controller = new AbortController();
    showLoading();

    try {
        const res = await fetch(url, {
            ...opts,
            signal: _controller.signal
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('Aborted request:', url);
            return Promise.reject(err);
        }
        return Promise.reject(err);
    } finally {
        hideLoading();
        _busy = false;
        _controller = null;
    }
}

/**
 * Fetch companies list, caching in localStorage for 3 hours
 */
export async function fetchCompanies() {
    const CACHE_KEY = 'kd_companies';
    const CACHE_TS  = 'kd_companies_ts';
    const now = Date.now();
    const ts  = parseInt(localStorage.getItem(CACHE_TS) || '0', 10);

    if (now - ts < 3 * 60 * 60 * 1000) {
        try {
            return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
        } catch {}
    }

    const companies = await apiFetch(COMPANIES_URL, {
        headers: authHeader()
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(companies));
    localStorage.setItem(CACHE_TS, now.toString());
    return companies;
}

export async function fetchCompanyProfile(companyName) {
    try {
        const json = await apiFetch(
            `${PROFILE_URL}/${encodeURIComponent(companyName)}`,
            { headers: authHeader() }
        );
        return json.full_summary || null;
    } catch {
        return null;
    }
}

export async function writeDraft(payload) {
    return apiFetch(WRITE_URL, {
        method: 'POST',
        headers: {
            ...authHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

export async function fetchContext(url) {
    const json = await apiFetch(CONTEXT_URL, {
        method: 'POST',
        headers: {
            ...authHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
    });
    return json.output;
}
