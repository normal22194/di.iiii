// Finite Forever — pure helpers for the drift/permanence mechanic. Kept
// separate from any component so the claim/drift math can be unit tested
// without mounting the 3D scene.
import { buildProjectAssetUrl, getProjectDocument, submitProjectOps, uploadProjectAsset } from '../project/services/projectsApi.js'
import { apiFetch } from '../services/apiClient.js'

// Re-exported so components resolving a page's assetId to a displayable URL
// (PagesPanel) don't need their own import of the shared projects API.
export { buildProjectAssetUrl }

// Shape marks (built-in primitives, no upload) vs media marks (uploaded
// image/model, referencing an asset). Kept as a named list so the UI can
// gate type-specific controls (color swatch doesn't do anything for a photo).
export const SHAPE_MARK_TYPES = ['box', 'sphere', 'cone', 'torus', 'text']
export const MEDIA_MARK_TYPES = ['image', 'model']

export const FINITE_FOREVER_SPACE_ID = 'finite-forever'
export const FINITE_FOREVER_PROJECT_ID = 'ritual'

// A mark left to drift fades out completely and is deleted this long after
// placement — the actual decay math runs server-side on real elapsed
// wall-clock time (see serverXR/src/routes/finiteForeverRoutes.js's
// DRIFT_DURATION_MS, which this must match), not a client timer. Used here
// only to display a live countdown.
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
        placedBy: null,
        placedByVisible: true,
        claimedBy: null,
        claimedByVisible: true,
        claimedAt: null,
        placedAt: Date.now(),
        baseAppearance: null,
        baseScale: null,
        revokedFrom: null
    }
}

const TYPE_LABEL = { box: 'Box', sphere: 'Sphere', cone: 'Cone', torus: 'Ring', text: 'Text', image: 'Image', model: 'Model' }

// Pages only make sense on a box — each of the 6 pages is a real face of
// the cube (see EntityVisual/BoxObject's per-face materials), which only a
// box has discrete faces for. Sphere/cone/torus don't map cleanly onto "6
// faces", and 'text'/'image'/'model' already show their own content.
export const PAGEABLE_TYPES = ['box']
export const PAGE_COUNT = 6

export function buildPagesComponent() {
    return {
        items: Array.from({ length: PAGE_COUNT }, () => ({ assetId: null }))
    }
}

// Entity.name is shown to *every* viewer (ritual log, duplicate messages) —
// it deliberately never carries the placer's identity (that lives only in
// permanence.placedBy/placedByVisible, masked per-viewer server-side). "Mark
// by <name>" would leak a hidden name to everyone the instant it was placed.
export function buildMarkEntity({ type = 'box', position, actorLabel, actorVisible = true, assetId = null, scale = [1, 1, 1] }) {
    const id = `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const appearance = { color: '#9fd8ff', opacity: 1 }
    const components = {
        transform: { position, rotation: [0, 0, 0], scale },
        appearance,
        permanence: {
            ...buildPermanenceComponent(),
            placedBy: actorLabel || 'someone',
            placedByVisible: actorVisible,
            baseAppearance: { opacity: appearance.opacity },
            baseScale: scale
        }
    }
    if (type === 'image') {
        components.media = { assetId, fit: 'contain', autoplay: false, loop: false, muted: true }
    } else if (type === 'model') {
        components.media = { assetId, materialsAssetId: null, autoplay: false, loop: false, muted: false, playAnimations: true, animationSpeed: 1, clip: '' }
    } else if (PAGEABLE_TYPES.includes(type)) {
        components.pages = buildPagesComponent()
    }
    return {
        id,
        type,
        name: `${TYPE_LABEL[type] || 'Object'} mark`,
        components
    }
}

// Normal rule: a participant may only edit/move/recolor/delete a mark they
// placed — admins are exempt, and so is the one sanctioned exception
// (choosing which permanent mark to release when claiming into a full pool,
// see claimPermanence). A soft, client-side check: this app's identity is a
// self-declared display name remembered per device, not an authenticated
// account, so it's not spoof-proof — same trust model already established
// for Pages ownership (see AdvancedSettingsPanel.jsx).
export function isMarkOwner({ permanence, actorLabel, isAdmin = false }) {
    if (isAdmin) return true
    const placedBy = permanence?.placedBy
    return Boolean(actorLabel) && Boolean(placedBy) &&
        actorLabel.trim().toLowerCase() === placedBy.trim().toLowerCase()
}

// Uploads through the same content-addressed asset pipeline every other
// project uses (dedupes identical bytes) — no server changes needed.
export const uploadMarkAsset = (file) => uploadProjectAsset(FINITE_FOREVER_PROJECT_ID, file)

// A media mark needs its asset registered in the document's assets[] manifest
// (upsertAsset) *and* the entity created (createEntity) — submitted as one
// batch so a mid-way failure can't leave a dangling entity with no asset.
export async function placeMediaMark({ baseVersion, entity, asset }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'upsertAsset', payload: { asset } },
        { type: 'createEntity', payload: { entity } }
    ])
}

export const fetchFiniteForeverDocument = () => getProjectDocument(FINITE_FOREVER_PROJECT_ID)

export async function placeMark({ baseVersion, entity }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'createEntity', payload: { entity } }
    ])
}

// Deleting a mark that was permanent frees its slot back to the shared pool
// — otherwise the pool would only ever shrink, never regrow, as pieces come
// and go. Every deletion is logged so the ritual log has a complete "who
// deleted what" record, not just the permanent ones — a plain drifting mark
// logs as 'delete', a permanent one (a real act of letting go) as 'release'.
export async function deleteMark({ document, baseVersion, entity, actorLabel, actorVisible = true }) {
    const wasPermanent = entity?.components?.permanence?.status === 'permanent'
    const ops = [{ type: 'deleteEntity', payload: { entityId: entity.id } }]

    if (wasPermanent) {
        const pool = readPermanencePool(document)
        ops.push({
            type: 'setWorkspaceState',
            payload: { patch: { permanencePool: { total: pool.total, claimed: Math.max(0, pool.claimed - 1) } } }
        })
    }

    const result = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, ops)

    await appendRitualLogEntry({
        actorLabel,
        actorVisible,
        action: wasPermanent ? 'release' : 'delete',
        targetLabel: entity.name || entity.id,
        detail: { entityId: entity.id }
    })

    return result
}

// Bulk version of deleteMark, for admin mode's box-select — one batched op
// submission instead of N separate round-trips. Permanent marks in the
// selection free their pool slots and log as one combined 'release'; the
// rest log as one combined 'delete' — same per-type combining as the pool
// decrement, so a mixed bulk-delete produces at most two log entries, not
// one per mark.
export async function deleteMarks({ document, baseVersion, entities, actorLabel, actorVisible = true }) {
    const ops = []
    let permanentReleased = 0
    let plainDeleted = 0
    for (const entity of entities) {
        ops.push({ type: 'deleteEntity', payload: { entityId: entity.id } })
        if (entity?.components?.permanence?.status === 'permanent') {
            permanentReleased += 1
        } else {
            plainDeleted += 1
        }
    }

    if (permanentReleased > 0) {
        const pool = readPermanencePool(document)
        ops.push({
            type: 'setWorkspaceState',
            payload: { patch: { permanencePool: { total: pool.total, claimed: Math.max(0, pool.claimed - permanentReleased) } } }
        })
    }

    const result = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, ops)

    if (permanentReleased > 0) {
        await appendRitualLogEntry({
            actorLabel,
            actorVisible,
            action: 'release',
            targetLabel: `${permanentReleased} mark${permanentReleased === 1 ? '' : 's'}`,
            detail: { count: permanentReleased }
        })
    }
    if (plainDeleted > 0) {
        await appendRitualLogEntry({
            actorLabel,
            actorVisible,
            action: 'delete',
            targetLabel: `${plainDeleted} mark${plainDeleted === 1 ? '' : 's'}`,
            detail: { count: plainDeleted }
        })
    }

    return result
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

export async function rotateMark({ baseVersion, entityId, rotation }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'transform', patch: { rotation } } }
    ])
}

// Also re-baselines permanence.baseScale to the new size — otherwise the
// next drift sweep would recompute scale from the *original* placement-time
// snapshot and silently undo a manual resize on non-permanent marks.
export async function rescaleMark({ baseVersion, entityId, scale }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'transform', patch: { scale } } },
        { type: 'updateComponent', payload: { entityId, component: 'permanence', patch: { baseScale: scale } } }
    ])
}

// Same re-baselining reasoning as rescaleMark, for opacity.
export async function setMarkOpacity({ baseVersion, entityId, opacity }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'appearance', patch: { opacity } } },
        { type: 'updateComponent', payload: { entityId, component: 'permanence', patch: { baseAppearance: { opacity } } } }
    ])
}

export async function setMarkText({ baseVersion, entityId, value }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'text', patch: { value } } }
    ])
}

// entity.name is a top-level field (not a component), so this is the one
// mark edit that goes through updateEntity rather than updateComponent.
export async function renameMark({ baseVersion, entityId, name }) {
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateEntity', payload: { entityId, patch: { name } } }
    ])
}

// Same content-addressed pipeline as uploadMarkAsset, just with an explicit
// filename — the composited page PNG is a Blob, not a File, so it has no
// .name of its own for uploadProjectAsset to fall back to.
export const uploadPageAsset = (blob, filename) => (
    uploadProjectAsset(FINITE_FOREVER_PROJECT_ID, blob, { filename })
)

// Saves a page's drawing+image composite as this mark's page[pageIndex] —
// each page is a real, permanently-mapped face of the box (see
// EntityVisual/BoxObject), so this is the only op a page save needs: no
// separate "activate" step, it's live on that face for every viewer the
// moment this lands. Registers the asset and replaces the whole `items`
// array (updateComponent patches replace array values wholesale, they
// don't merge by index), leaving every other page's slot untouched.
export async function savePage({ baseVersion, entityId, pageIndex, items, asset }) {
    const nextItems = items.map((item, i) => (i === pageIndex ? { assetId: asset.id } : item))
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'upsertAsset', payload: { asset } },
        { type: 'updateComponent', payload: { entityId, component: 'pages', patch: { items: nextItems } } }
    ])
}

// Reverts a page to blank — assetId: null, not an uploaded blank/transparent
// image. A transparent PNG would still be a real texture map, and since the
// box's material isn't `transparent` (opacity 1), the cleared pixels would
// render as solid black instead of the plain base color; null skips having
// a texture at all, so PrimitiveMaterial falls back to the entity's color.
export async function clearPage({ baseVersion, entityId, pageIndex, items }) {
    const nextItems = items.map((item, i) => (i === pageIndex ? { assetId: null } : item))
    return submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'updateComponent', payload: { entityId, component: 'pages', patch: { items: nextItems } } }
    ])
}

// Places a sibling copy just offset from the original; the copy starts
// drifting fresh like any other new mark (no chained claim prompt for it).
export async function duplicateMark({ baseVersion, entity, actorLabel, actorVisible = true }) {
    const [x, y, z] = entity.components.transform.position
    const copy = buildMarkEntity({
        type: entity.type,
        position: [x + 0.6, y, z + 0.6],
        actorLabel,
        actorVisible,
        assetId: entity.components.media?.assetId || null
    })
    copy.components.appearance.color = entity.components.appearance.color
    if (entity.type === 'text' && entity.components.text) {
        copy.components.text = { ...entity.components.text }
    }
    const response = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, [
        { type: 'createEntity', payload: { entity: copy } }
    ])
    await appendRitualLogEntry({ actorLabel, actorVisible, action: 'place', targetLabel: copy.name, detail: { entityId: copy.id, duplicatedFrom: entity.id } })
    return response
}

export function readPermanencePool(document) {
    const pool = document?.workspaceState?.permanencePool
    return {
        total: Number(pool?.total) || 0,
        claimed: Number(pool?.claimed) || 0
    }
}

// Every mark currently holding permanence, oldest claim first — this is the
// full candidate list a claimant picks from once the pool is full (see
// ClaimPrompt's revoke picker). Order is display convenience only now
// (longest-held listed first); the choice of which one to give up belongs to
// the person claiming, not to this function.
export function listPermanentMarks(document) {
    return (document?.entities || [])
        .filter((entity) => entity?.components?.permanence?.status === 'permanent')
        .sort((a, b) => (a.components.permanence.claimedAt || 0) - (b.components.permanence.claimedAt || 0))
}

export function planClaim(document) {
    const pool = readPermanencePool(document)
    const hasRoom = pool.claimed < pool.total
    return { hasRoom, pool, revokeCandidates: hasRoom ? [] : listPermanentMarks(document) }
}

// Normal rule: nobody may claim into a full pool without deliberately giving
// up someone else's permanence first — this is the one sanctioned way a
// participant is allowed to touch a mark they didn't place (see
// isMarkOwner, which locks out every other edit). `revokeTargetId` must name
// a currently-permanent mark the UI already offered the claimant as a choice
// (built from listPermanentMarks/planClaim); a missing/stale id throws
// rather than silently picking one for them.
export async function claimPermanence({ document, baseVersion, entity, actorLabel, actorVisible = true, revokeTargetId = null }) {
    const { hasRoom, pool } = planClaim(document)
    const now = Date.now()
    const ops = []
    let revokeTarget = null

    if (!hasRoom) {
        revokeTarget = (document?.entities || []).find((e) => (
            e.id === revokeTargetId && e.components?.permanence?.status === 'permanent'
        )) || null
        if (!revokeTarget) {
            throw new Error('Choose a permanent mark to let go of before claiming this one.')
        }
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
            patch: { status: 'permanent', claimedBy: actorLabel || 'someone', claimedByVisible: actorVisible, claimedAt: now }
        }
    })

    const result = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, ops)

    if (revokeTarget) {
        await appendRitualLogEntry({
            actorLabel,
            actorVisible,
            action: 'revoke',
            targetLabel: revokeTarget.name || revokeTarget.id,
            detail: { revokedFromId: revokeTarget.id, takenBy: entity.name || entity.id }
        })
    }
    await appendRitualLogEntry({
        actorLabel,
        actorVisible,
        action: 'claim',
        targetLabel: entity.name || entity.id,
        detail: { entityId: entity.id, tookFrom: revokeTarget?.id || null }
    })

    return { result, hasRoom, revokeTarget }
}

// Admin-only override for admin mode's box-select: makes every selected
// mark permanent in one batched request, with no cap and no choice — unlike
// claimPermanence (the normal, capped, "pick something to let go of" flow
// everyone else uses). pool.claimed still increments for every mark this
// actually claims, so deleteMark/deleteMarks's existing decrement stays
// correct later — but claimed is allowed to exceed total; there's no revoke
// step and no pool-full rejection here. Marks already permanent in the
// selection are skipped (nothing to do); a selection that's entirely
// already-permanent is a no-op, not an error.
export async function claimMarksForever({ document, baseVersion, entities, actorLabel, actorVisible = true }) {
    const targets = (entities || []).filter((entity) => entity?.components?.permanence?.status !== 'permanent')
    if (targets.length === 0) {
        return { document, newVersion: baseVersion }
    }

    const now = Date.now()
    const pool = readPermanencePool(document)
    const ops = targets.map((entity) => ({
        type: 'updateComponent',
        payload: {
            entityId: entity.id,
            component: 'permanence',
            patch: { status: 'permanent', claimedBy: actorLabel || 'someone', claimedByVisible: actorVisible, claimedAt: now }
        }
    }))
    ops.push({
        type: 'setWorkspaceState',
        payload: { patch: { permanencePool: { total: pool.total, claimed: pool.claimed + targets.length } } }
    })

    const result = await submitProjectOps(FINITE_FOREVER_PROJECT_ID, baseVersion, ops)

    await appendRitualLogEntry({
        actorLabel,
        actorVisible,
        action: 'claim',
        targetLabel: `${targets.length} mark${targets.length === 1 ? '' : 's'}`,
        detail: { count: targets.length, bulk: true }
    })

    return result
}

export async function appendRitualLogEntry({ actorLabel = '', actorVisible = true, action, targetLabel = '', detail = {} }) {
    return apiFetch(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, {
        method: 'POST',
        body: { actorLabel, actorVisible, action, targetLabel, detail }
    })
}

export async function fetchRitualLog(since = 0) {
    const data = await apiFetch(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log?since=${since}`)
    return data.entries || []
}
