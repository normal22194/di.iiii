// Finite Forever — pure helpers for the drift/permanence mechanic. Kept
// separate from any component so the claim/drift math can be unit tested
// without mounting the 3D scene.
import { getProjectDocument, submitProjectOps } from '../project/services/projectsApi.js'
import { apiFetch } from '../services/apiClient.js'

export const FINITE_FOREVER_SPACE_ID = 'finite-forever'
export const FINITE_FOREVER_PROJECT_ID = 'ritual'

// A mark left to drift reaches residue this long after placement — the
// actual decay math runs server-side on real elapsed wall-clock time (see
// serverXR/src/routes/finiteForeverRoutes.js's DRIFT_DURATION_MS, which this
// must match), not a client timer. Used here only to display a live countdown.
export const DRIFT_DURATION_HOURS = 12
export const DRIFT_DURATION_MS = DRIFT_DURATION_HOURS * 60 * 60 * 1000

// Display-only estimate: milliseconds left before this mark's next sweep
// would find it fully decayed. Falls back to "just placed" for a mark the
// server hasn't swept yet (matches the sweep's own self-heal assumption), so
// this never shows a negative/undefined countdown for a brand new mark.
export function getRemainingDriftMs(permanence, now = Date.now()) {
    if (!permanence || permanence.status !== 'drifting') return 0
    const placedAt = Number(permanence.placedAt) || now
    return Math.max(0, DRIFT_DURATION_MS - (now - placedAt))
}

export function formatRemainingDrift(ms) {
    if (ms <= 0) return 'fading now'
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours}h ${minutes}m left`
    if (minutes > 0) return `${minutes}m ${seconds}s left`
    return `${seconds}s left`
}

export function buildPermanenceComponent() {
    return {
        status: 'drifting',
        stage: 0,
        claimedBy: null,
        claimedAt: null,
        placedAt: Date.now(),
        baseAppearance: null,
        baseScale: null,
        revokedFrom: null
    }
}

export function buildMarkEntity({ type = 'box', position, actorLabel }) {
    const id = `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const appearance = { color: '#9fd8ff', opacity: 1 }
    const scale = [1, 1, 1]
    return {
        id,
        type,
        name: `Mark by ${actorLabel || 'someone'}`,
        components: {
            transform: { position, rotation: [0, 0, 0], scale },
            appearance,
            permanence: {
                ...buildPermanenceComponent(),
                baseAppearance: { opacity: appearance.opacity },
                baseScale: scale
            }
        }
    }
}

export const fetchFiniteForeverDocument = () => getProjectDocument(FINITE_FOREVER_PROJECT_ID)

export async function placeMark({ baseVersion, entity }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'createEntity', payload: { entity } }
    ])
}

// "Oops" undo for a mark you just placed and haven't decided on yet — not a
// ritual action, so it's deliberately not logged to the ritual log (the log
// records what was kept/let go/taken, not placements immediately reversed).
export async function deleteMark({ baseVersion, entityId }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'deleteEntity', payload: { entityId } }
    ])
}

export async function recolorMark({ baseVersion, entityId, color }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'appearance', patch: { color } } }
    ])
}

export async function moveMark({ baseVersion, entityId, position }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'transform', patch: { position } } }
    ])
}

// Places a sibling copy just offset from the original; the copy starts
// drifting fresh like any other new mark (no chained claim prompt for it).
export async function duplicateMark({ baseVersion, entity, actorLabel }) {
    const [x, y, z] = entity.components.transform.position
    const copy = buildMarkEntity({ type: entity.type, position: [x + 0.6, y, z + 0.6], actorLabel })
    copy.components.appearance.color = entity.components.appearance.color
    const response = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'createEntity', payload: { entity: copy } }
    ])
    await appendRitualLogEntry({ actorLabel, action: 'place', targetLabel: copy.name, detail: { entityId: copy.id, duplicatedFrom: entity.id } })
    return response
}

export function readPermanencePool(document) {
    const pool = document?.workspaceState?.permanencePool
    return {
        total: Number(pool?.total) || 0,
        claimed: Number(pool?.claimed) || 0
    }
}

// Deterministic v1 rule: revoke from whoever claimed longest ago.
function findRevokeTarget(document) {
    const permanentEntities = (document?.entities || [])
        .filter((entity) => entity?.components?.permanence?.status === 'permanent')
        .sort((a, b) => (a.components.permanence.claimedAt || 0) - (b.components.permanence.claimedAt || 0))
    return permanentEntities[0] || null
}

export function planClaim(document) {
    const pool = readPermanencePool(document)
    const hasRoom = pool.claimed < pool.total
    return { hasRoom, pool, revokeTarget: hasRoom ? null : findRevokeTarget(document) }
}

export async function claimPermanence({ document, baseVersion, entity, actorLabel }) {
    const { hasRoom, pool, revokeTarget } = planClaim(document)
    const now = Date.now()
    const ops = []

    if (revokeTarget) {
        ops.push({
            type: 'updateComponent',
            payload: {
                entityId: revokeTarget.id,
                component: 'permanence',
                patch: { status: 'drifting', revokedFrom: { by: actorLabel || 'someone', at: now } }
            }
        })
    } else {
        ops.push({
            type: 'setWorkspaceState',
            payload: { patch: { permanencePool: { total: pool.total, claimed: pool.claimed + 1 } } }
        })
    }

    ops.push({
        type: 'updateComponent',
        payload: {
            entityId: entity.id,
            component: 'permanence',
            patch: { status: 'permanent', claimedBy: actorLabel || 'someone', claimedAt: now }
        }
    })

    const result = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, ops)

    if (revokeTarget) {
        await appendRitualLogEntry({
            actorLabel,
            action: 'revoke',
            targetLabel: revokeTarget.name || revokeTarget.id,
            detail: { revokedFromId: revokeTarget.id, takenBy: entity.name || entity.id }
        })
    }
    await appendRitualLogEntry({
        actorLabel,
        action: 'claim',
        targetLabel: entity.name || entity.id,
        detail: { entityId: entity.id, tookFrom: revokeTarget?.id || null }
    })

    return { result, hasRoom, revokeTarget }
}

export async function appendRitualLogEntry({ actorLabel = '', action, targetLabel = '', detail = {} }) {
    return apiFetch(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, {
        method: 'POST',
        body: { actorLabel, action, targetLabel, detail }
    })
}

export async function fetchRitualLog(since = 0) {
    const data = await apiFetch(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log?since=${since}`)
    return data.entries || []
}

export async function advanceDrift() {
    return apiFetch(`/api/projects/${FINITE_FOREVER_PROJECT_ID}/finite-forever/advance-drift`, {
        method: 'POST'
    })
}
