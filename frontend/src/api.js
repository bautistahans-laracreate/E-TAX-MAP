// ── JWT API Helper ──────────────────────────────────────────────────────────
// Centralized fetch wrapper that attaches the JWT Bearer token and
// automatically refreshes expired access tokens.

const TOKEN_KEYS = {
    access: 'access_token',
    refresh: 'refresh_token',
};

export function saveTokens({ access, refresh }) {
    if (access) localStorage.setItem(TOKEN_KEYS.access, access);
    if (refresh) localStorage.setItem(TOKEN_KEYS.refresh, refresh);
}

export function clearTokens() {
    localStorage.removeItem(TOKEN_KEYS.access);
    localStorage.removeItem(TOKEN_KEYS.refresh);
}

export function getAccessToken() {
    return localStorage.getItem(TOKEN_KEYS.access);
}

export function getRefreshToken() {
    return localStorage.getItem(TOKEN_KEYS.refresh);
}

// ── Internal: try to refresh the access token ──────────────────────────────
async function refreshAccessToken() {
    const refresh = getRefreshToken();
    if (!refresh) return null;

    try {
        const res = await fetch('/api/auth/token/refresh/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.access) {
            localStorage.setItem(TOKEN_KEYS.access, data.access);
            return data.access;
        }
    } catch {
        // refresh failed
    }
    return null;
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
    const headers = { ...options.headers };

    // Attach Bearer token
    const token = getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let res = await fetch(url, { ...options, headers });

    // If 401, try refreshing the token once
    if (res.status === 401 && getRefreshToken()) {
        const newToken = await refreshAccessToken();
        if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            res = await fetch(url, { ...options, headers });
        }
    }

    return res;
}

// ── Convenience methods ────────────────────────────────────────────────────

export async function apiGet(url) {
    return apiFetch(url);
}

export async function apiPost(url, body) {
    return apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function apiDelete(url) {
    return apiFetch(url, { method: 'DELETE' });
}

export async function apiPatch(url, body) {
    return apiFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
