const AI_WRITER_API  = 'https://services.krakend.io/webhook/5001df30-59b2-498d-a1c2-15b64be106d9/ai-writer';
const COMPANIES_URL  = AI_WRITER_API + '/companies-list';
const PROFILE_URL    =  AI_WRITER_API + '/company-profile';
const WRITE_URL      =  AI_WRITER_API + '/write';

let _token = null;
export function setAuthToken(token) { _token = token; }
function authHeader() { return { 'Authorization': 'Bearer ' + _token }; }

let loadingCount = 0;

/**
 * Show a floating loading indicator with animated dots
 */
export function showLoading() {
    loadingCount++;
    if (loadingCount === 1) {
        const ind = document.getElementById('loadingIndicator');
        ind.classList.remove('hidden');
    }
}

/**
 * Hide the loading indicator when all requests complete
 */
export function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
        document.getElementById('loadingIndicator').classList.add('hidden');
    }
}

/**
 * Fetch companies list, caching in localStorage for 3 hours
 */
export async function fetchCompanies() {
    const CACHE_KEY = 'kd_companies';
    const CACHE_TS  = 'kd_companies_ts';
    const now = Date.now();
    let companies = [];

    // Try cache
    const ts = parseInt(localStorage.getItem(CACHE_TS) || '0', 10);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached && now - ts < 3 * 60 * 60 * 1000) {
        try {
            companies = JSON.parse(cached);
            return companies;
        } catch (e) {
            console.warn('Invalid companies cache, fetching fresh:', e);
        }
    }

    // Fetch fresh
    try {
        showLoading();
        const res = await fetch(COMPANIES_URL, { headers: authHeader() });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        let companies = await res.json();
        // Cache
        localStorage.setItem(CACHE_KEY, JSON.stringify(companies));
        localStorage.setItem(CACHE_TS, now.toString());
        return JSON.parse(JSON.stringify(companies));
    } catch (err) {
        console.error('Error loading companies:', err);
    } finally {
        hideLoading();
    }
}

/**
 * Fetch profile summary for a given company name
 * @param {string} companyName
 * @returns {Promise<string|null>} full_summary or null
 */
export async function fetchCompanyProfile(companyName) {
    try {
        showLoading();
        const res = await fetch(`${PROFILE_URL}/${encodeURIComponent(companyName)}`, { headers: authHeader() });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const profile = await res.json();
        return profile.full_summary || null;
    } catch (err) {
        console.error('Error loading company profile:', err);
        return null;
    } finally {
        hideLoading();
    }
}

/**
 * Send a draft generation request to the AI writer API
 * @param {Object} payload - { template, user, user_prompt, company_context, task }
 * @returns {Promise<object>} response JSON with at least an `output` field
 */
export async function writeDraft(prompt) {
    try {
        showLoading();
        const res = await fetch(WRITE_URL, {
            method: 'POST',
            headers: {
                ...authHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(prompt)
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
    } catch (err) {
        console.error('Error generating draft:', err);
        throw err;
    } finally {
        hideLoading();
    }
}

