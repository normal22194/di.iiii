// Per-device identity for Finite Forever — asked for once, then remembered
// for this browser/device (localStorage, not sessionStorage) so opening a
// new tab or coming back later resumes as the same person instead of
// minting a fresh identity every visit ("one device, one user"). Changing
// identity is a deliberate action (clearIdentity, wired to a visible "not
// you?" control), not something that happens by accident.
const STORAGE_KEY = 'ff.identity'

export function readStoredIdentity() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.username) return null
        return { username: String(parsed.username).slice(0, 40), visible: parsed.visible !== false }
    } catch {
        return null
    }
}

export function storeIdentity(identity) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
    } catch {
        // storage unavailable (private mode, etc.) — identity just won't
        // persist across a reload; the gate will ask again next time
    }
}

export function clearIdentity() {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch {
        // nothing to clear
    }
}
