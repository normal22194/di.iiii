import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DRIFT_DURATION_MS,
    FINITE_FOREVER_PROJECT_ID,
    FINITE_FOREVER_SPACE_ID,
    MEDIA_MARK_TYPES,
    PAGEABLE_TYPES,
    PAGE_COUNT,
    SHAPE_MARK_TYPES,
    appendRitualLogEntry,
    buildMarkEntity,
    buildPagesComponent,
    buildPermanenceComponent,
    claimMarksForever,
    claimPermanence,
    clearPage,
    deleteMark,
    deleteMarks,
    duplicateMark,
    fetchFiniteForeverDocument,
    fetchRitualLog,
    formatRemainingDrift,
    getRemainingDriftMs,
    isMarkOwner,
    listPermanentMarks,
    moveMark,
    placeMark,
    placeMediaMark,
    planClaim,
    readPermanencePool,
    recolorMark,
    renameMark,
    rescaleMark,
    rotateMark,
    savePage,
    setMarkOpacity,
    setMarkText,
    uploadMarkAsset,
    uploadPageAsset
} from './permanence.js'

const apiFetch = vi.fn()
const getProjectDocument = vi.fn()
const submitProjectOps = vi.fn()
const uploadProjectAsset = vi.fn()

vi.mock('../services/apiClient.js', () => ({
    apiFetch: (...args) => apiFetch(...args)
}))

vi.mock('../project/services/projectsApi.js', () => ({
    buildProjectAssetUrl: (projectId, assetId) => `/serverXR/api/projects/${projectId}/assets/${assetId}`,
    getProjectDocument: (...args) => getProjectDocument(...args),
    submitProjectOps: (...args) => submitProjectOps(...args),
    uploadProjectAsset: (...args) => uploadProjectAsset(...args)
}))

function makeEntity({ components: componentOverrides, ...overrides } = {}) {
    return {
        id: 'mark-1',
        type: 'box',
        name: 'Box mark',
        ...overrides,
        components: {
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            appearance: { color: '#9fd8ff', opacity: 1 },
            permanence: { ...buildPermanenceComponent() },
            ...componentOverrides
        }
    }
}

beforeEach(() => {
    apiFetch.mockReset()
    getProjectDocument.mockReset()
    submitProjectOps.mockReset()
    uploadProjectAsset.mockReset()
})

describe('drift countdown', () => {
    it('returns 0 for a non-drifting or missing permanence component', () => {
        expect(getRemainingDriftMs(null)).toBe(0)
        expect(getRemainingDriftMs({ status: 'permanent', placedAt: Date.now() })).toBe(0)
        expect(getRemainingDriftMs({ status: 'residue', placedAt: Date.now() })).toBe(0)
    })

    it('counts down from placedAt and clamps at 0 once fully drifted', () => {
        const now = 1_000_000_000_000
        const halfway = { status: 'drifting', placedAt: now - DRIFT_DURATION_MS / 2 }
        expect(getRemainingDriftMs(halfway, now)).toBe(DRIFT_DURATION_MS / 2)

        const overdue = { status: 'drifting', placedAt: now - DRIFT_DURATION_MS * 2 }
        expect(getRemainingDriftMs(overdue, now)).toBe(0)
    })

    it('falls back to "just placed" when placedAt is missing', () => {
        const now = 1_000_000_000_000
        expect(getRemainingDriftMs({ status: 'drifting' }, now)).toBe(DRIFT_DURATION_MS)
    })

    it('formats remaining time at hour/minute/second granularity', () => {
        expect(formatRemainingDrift(0)).toBe('fading now')
        expect(formatRemainingDrift(-500)).toBe('fading now')
        expect(formatRemainingDrift(2 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('2h 5m left')
        expect(formatRemainingDrift(5 * 60 * 1000 + 30 * 1000)).toBe('5m 30s left')
        expect(formatRemainingDrift(45 * 1000)).toBe('45s left')
    })
})

describe('buildMarkEntity', () => {
    it('builds a shape mark with no media component', () => {
        const entity = buildMarkEntity({ type: 'sphere', position: [1, 2, 3], actorLabel: 'nooo', actorVisible: true })
        expect(entity.type).toBe('sphere')
        expect(entity.name).toBe('Sphere mark')
        expect(entity.components.transform.position).toEqual([1, 2, 3])
        expect(entity.components.media).toBeUndefined()
        expect(entity.components.permanence.placedBy).toBe('nooo')
        expect(entity.components.permanence.placedByVisible).toBe(true)
        expect(entity.components.permanence.status).toBe('drifting')
    })

    it('defaults placedBy to "someone" when no actor label is given', () => {
        const entity = buildMarkEntity({ position: [0, 0, 0] })
        expect(entity.components.permanence.placedBy).toBe('someone')
    })

    it('defaults scale to [1,1,1], but accepts an explicit initial scale (transform and drift baseline stay in sync)', () => {
        const defaulted = buildMarkEntity({ position: [0, 0, 0] })
        expect(defaulted.components.transform.scale).toEqual([1, 1, 1])
        expect(defaulted.components.permanence.baseScale).toEqual([1, 1, 1])

        const scaled = buildMarkEntity({ position: [0, 0, 0], scale: [0.3, 0.3, 0.3] })
        expect(scaled.components.transform.scale).toEqual([0.3, 0.3, 0.3])
        expect(scaled.components.permanence.baseScale).toEqual([0.3, 0.3, 0.3])
    })

    it('attaches an image media component referencing the asset id', () => {
        const entity = buildMarkEntity({ type: 'image', position: [0, 0, 0], assetId: 'asset-1' })
        expect(entity.components.media).toEqual({ assetId: 'asset-1', fit: 'contain', autoplay: false, loop: false, muted: true })
    })

    it('attaches a model media component referencing the asset id', () => {
        const entity = buildMarkEntity({ type: 'model', position: [0, 0, 0], assetId: 'asset-2' })
        expect(entity.components.media).toMatchObject({ assetId: 'asset-2', playAnimations: true })
    })

    it('generates unique ids across calls', () => {
        const a = buildMarkEntity({ position: [0, 0, 0] })
        const b = buildMarkEntity({ position: [0, 0, 0] })
        expect(a.id).not.toBe(b.id)
    })

    it('lists shape and media types as disjoint sets', () => {
        expect(SHAPE_MARK_TYPES).toEqual(['box', 'sphere', 'cone', 'torus', 'text'])
        expect(MEDIA_MARK_TYPES).toEqual(['image', 'model'])
    })

    it('gives every pageable type a fresh 6-slot pages component (one per box face)', () => {
        expect(PAGEABLE_TYPES).toEqual(['box'])
        for (const type of PAGEABLE_TYPES) {
            const entity = buildMarkEntity({ type, position: [0, 0, 0] })
            expect(entity.components.pages).toEqual(buildPagesComponent())
            expect(entity.components.pages.items).toHaveLength(PAGE_COUNT)
        }
    })

    it('does not give sphere, cone, torus, text, image, or model marks a pages component', () => {
        for (const type of ['sphere', 'cone', 'torus', 'text', 'image', 'model']) {
            expect(buildMarkEntity({ type, position: [0, 0, 0] }).components.pages).toBeUndefined()
        }
    })
})

describe('buildPagesComponent', () => {
    it('every slot starts blank', () => {
        const pages = buildPagesComponent()
        expect(pages.items).toEqual([{ assetId: null }, { assetId: null }, { assetId: null }, { assetId: null }, { assetId: null }, { assetId: null }])
    })
})

describe('placement + fetch', () => {
    it('placeMark submits a single createEntity op', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        const entity = makeEntity()
        await placeMark({ baseVersion: 1, entity })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'createEntity', payload: { entity } }
        ])
    })

    it('placeMediaMark submits upsertAsset before createEntity in one batch', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        const entity = makeEntity({ type: 'image' })
        const asset = { id: 'asset-1', hash: 'abc' }
        await placeMediaMark({ baseVersion: 1, entity, asset })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'upsertAsset', payload: { asset } },
            { type: 'createEntity', payload: { entity } }
        ])
    })

    it('uploadMarkAsset delegates to uploadProjectAsset for the ritual project', async () => {
        uploadProjectAsset.mockResolvedValue({ id: 'asset-9' })
        const file = { name: 'photo.png' }
        const result = await uploadMarkAsset(file)
        expect(uploadProjectAsset).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, file)
        expect(result).toEqual({ id: 'asset-9' })
    })

    it('fetchFiniteForeverDocument reads the ritual project document', async () => {
        getProjectDocument.mockResolvedValue({ document: {}, version: 3 })
        await fetchFiniteForeverDocument()
        expect(getProjectDocument).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID)
    })
})

describe('deleteMark', () => {
    it('deletes the entity and logs a \'delete\' entry (not a pool release) when the mark was still drifting', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 5 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity()
        await deleteMark({ document: {}, baseVersion: 4, entity, actorLabel: 'nooo' })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 4, [
            { type: 'deleteEntity', payload: { entityId: 'mark-1' } }
        ])
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, {
            method: 'POST',
            body: { actorLabel: 'nooo', actorVisible: true, action: 'delete', targetLabel: 'Box mark', detail: { entityId: 'mark-1' } }
        })
    })

    it('frees a pool slot and logs a release when a permanent mark is deleted', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 5 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity({ components: { permanence: { status: 'permanent' } } })
        const document = { workspaceState: { permanencePool: { total: 3, claimed: 2 } } }
        await deleteMark({ document, baseVersion: 4, entity, actorLabel: 'nooo', actorVisible: false })

        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 4, [
            { type: 'deleteEntity', payload: { entityId: 'mark-1' } },
            { type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 3, claimed: 1 } } } }
        ])
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, {
            method: 'POST',
            body: { actorLabel: 'nooo', actorVisible: false, action: 'release', targetLabel: 'Box mark', detail: { entityId: 'mark-1' } }
        })
    })

    it('never drops claimed below zero when freeing a slot', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 5 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity({ components: { permanence: { status: 'permanent' } } })
        const document = { workspaceState: { permanencePool: { total: 3, claimed: 0 } } }
        await deleteMark({ document, baseVersion: 4, entity, actorLabel: 'nooo' })

        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 4, [
            { type: 'deleteEntity', payload: { entityId: 'mark-1' } },
            { type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 3, claimed: 0 } } } }
        ])
    })
})

describe('deleteMarks (bulk)', () => {
    it('batches one deleteEntity op per entity and logs one combined \'delete\' entry when none were permanent', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 5 })
        apiFetch.mockResolvedValue({ ok: true })
        const entities = [
            makeEntity({ id: 'mark-1' }),
            makeEntity({ id: 'mark-2' }),
            makeEntity({ id: 'mark-3' })
        ]
        await deleteMarks({ document: {}, baseVersion: 4, entities, actorLabel: 'nooo' })

        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 4, [
            { type: 'deleteEntity', payload: { entityId: 'mark-1' } },
            { type: 'deleteEntity', payload: { entityId: 'mark-2' } },
            { type: 'deleteEntity', payload: { entityId: 'mark-3' } }
        ])
        expect(apiFetch).toHaveBeenCalledTimes(1)
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, {
            method: 'POST',
            body: { actorLabel: 'nooo', actorVisible: true, action: 'delete', targetLabel: '3 marks', detail: { count: 3 } }
        })
    })

    it('combines every permanent mark\'s pool release into one decrement and logs both a release and a delete entry', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 5 })
        apiFetch.mockResolvedValue({ ok: true })
        const entities = [
            makeEntity({ id: 'mark-1', components: { permanence: { status: 'permanent' } } }),
            makeEntity({ id: 'mark-2' }), // still drifting — no pool effect, logs as 'delete'
            makeEntity({ id: 'mark-3', components: { permanence: { status: 'permanent' } } })
        ]
        const document = { workspaceState: { permanencePool: { total: 5, claimed: 3 } } }
        await deleteMarks({ document, baseVersion: 4, entities, actorLabel: 'nooo', actorVisible: false })

        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 4, [
            { type: 'deleteEntity', payload: { entityId: 'mark-1' } },
            { type: 'deleteEntity', payload: { entityId: 'mark-2' } },
            { type: 'deleteEntity', payload: { entityId: 'mark-3' } },
            { type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 5, claimed: 1 } } } }
        ])
        expect(apiFetch).toHaveBeenCalledTimes(2)
        expect(apiFetch.mock.calls[0][1].body).toMatchObject({ action: 'release', targetLabel: '2 marks', detail: { count: 2 } })
        expect(apiFetch.mock.calls[1][1].body).toMatchObject({ action: 'delete', targetLabel: '1 mark', detail: { count: 1 } })
    })

    it('never drops claimed below zero across the combined release', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 5 })
        apiFetch.mockResolvedValue({ ok: true })
        const entities = [
            makeEntity({ id: 'mark-1', components: { permanence: { status: 'permanent' } } }),
            makeEntity({ id: 'mark-2', components: { permanence: { status: 'permanent' } } })
        ]
        const document = { workspaceState: { permanencePool: { total: 5, claimed: 1 } } }
        await deleteMarks({ document, baseVersion: 4, entities, actorLabel: 'nooo' })

        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops.at(-1)).toEqual({ type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 5, claimed: 0 } } } })
    })
})

describe('single-field updates', () => {
    it('recolorMark patches appearance.color', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await recolorMark({ baseVersion: 1, entityId: 'mark-1', color: '#ff0000' })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'appearance', patch: { color: '#ff0000' } } }
        ])
    })

    it('moveMark patches transform.position', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await moveMark({ baseVersion: 1, entityId: 'mark-1', position: [1, 2, 3] })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'transform', patch: { position: [1, 2, 3] } } }
        ])
    })

    it('rotateMark patches transform.rotation', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await rotateMark({ baseVersion: 1, entityId: 'mark-1', rotation: [0, 1.5, 0] })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'transform', patch: { rotation: [0, 1.5, 0] } } }
        ])
    })

    it('setMarkText patches the text component', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await setMarkText({ baseVersion: 1, entityId: 'mark-1', value: 'hello' })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'text', patch: { value: 'hello' } } }
        ])
    })

    it('renameMark patches the entity\'s top-level name via updateEntity, not updateComponent', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await renameMark({ baseVersion: 1, entityId: 'mark-1', name: 'My favorite box' })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateEntity', payload: { entityId: 'mark-1', patch: { name: 'My favorite box' } } }
        ])
    })
})

describe('pages', () => {
    it('uploadPageAsset uploads with an explicit filename (the composite is a Blob, not a File)', async () => {
        uploadProjectAsset.mockResolvedValue({ id: 'asset-9' })
        const blob = new Blob(['x'], { type: 'image/png' })
        const result = await uploadPageAsset(blob, 'page-mark-1-1.png')
        expect(uploadProjectAsset).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, blob, { filename: 'page-mark-1-1.png' })
        expect(result).toEqual({ id: 'asset-9' })
    })

    it('savePage registers the asset and replaces only the targeted slot, leaving the rest untouched', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        const items = buildPagesComponent().items
        const asset = { id: 'asset-9', name: 'page-mark-1-3.png' }
        await savePage({ baseVersion: 1, entityId: 'mark-1', pageIndex: 2, items, asset })

        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'upsertAsset', payload: { asset } },
            {
                type: 'updateComponent',
                payload: {
                    entityId: 'mark-1',
                    component: 'pages',
                    patch: {
                        items: [
                            { assetId: null }, { assetId: null },
                            { assetId: 'asset-9' },
                            { assetId: null }, { assetId: null }, { assetId: null }
                        ]
                    }
                }
            }
        ])
    })

    it('clearPage reverts a page to blank (assetId: null) with no asset upload', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        const items = buildPagesComponent().items.map((item, i) => (i === 2 ? { assetId: 'asset-9' } : item))

        await clearPage({ baseVersion: 1, entityId: 'mark-1', pageIndex: 2, items })

        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            {
                type: 'updateComponent',
                payload: {
                    entityId: 'mark-1',
                    component: 'pages',
                    patch: {
                        items: [
                            { assetId: null }, { assetId: null },
                            { assetId: null },
                            { assetId: null }, { assetId: null }, { assetId: null }
                        ]
                    }
                }
            }
        ])
        // Confirms no upsertAsset op — clearing never uploads anything.
        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops.some((op) => op.type === 'upsertAsset')).toBe(false)
    })
})

describe('re-baselining updates', () => {
    it('rescaleMark patches transform.scale and re-baselines permanence.baseScale', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await rescaleMark({ baseVersion: 1, entityId: 'mark-1', scale: [2, 2, 2] })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'transform', patch: { scale: [2, 2, 2] } } },
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'permanence', patch: { baseScale: [2, 2, 2] } } }
        ])
    })

    it('setMarkOpacity patches appearance.opacity and re-baselines permanence.baseAppearance', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        await setMarkOpacity({ baseVersion: 1, entityId: 'mark-1', opacity: 0.4 })
        expect(submitProjectOps).toHaveBeenCalledWith(FINITE_FOREVER_PROJECT_ID, 1, [
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'appearance', patch: { opacity: 0.4 } } },
            { type: 'updateComponent', payload: { entityId: 'mark-1', component: 'permanence', patch: { baseAppearance: { opacity: 0.4 } } } }
        ])
    })
})

describe('duplicateMark', () => {
    it('offsets the copy, carries over color, and logs the placement', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity({ components: { appearance: { color: '#abcdef', opacity: 1 } } })

        await duplicateMark({ baseVersion: 1, entity, actorLabel: 'nooo', actorVisible: true })

        const [, , ops] = submitProjectOps.mock.calls[0]
        const copy = ops[0].payload.entity
        expect(copy.components.transform.position).toEqual([0.6, 0, 0.6])
        expect(copy.components.appearance.color).toBe('#abcdef')
        expect(copy.id).not.toBe(entity.id)

        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, expect.objectContaining({
            method: 'POST',
            body: expect.objectContaining({ actorLabel: 'nooo', actorVisible: true, action: 'place' })
        }))
    })

    it('carries over text content for text marks', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity({ type: 'text', components: { text: { value: 'hello world' } } })

        await duplicateMark({ baseVersion: 1, entity, actorLabel: 'nooo' })

        const [, , ops] = submitProjectOps.mock.calls[0]
        const copy = ops[0].payload.entity
        expect(copy.components.text).toEqual({ value: 'hello world' })
    })

    it('carries over the asset id for media marks', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 2 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity({ type: 'image', components: { media: { assetId: 'asset-7' } } })

        await duplicateMark({ baseVersion: 1, entity, actorLabel: 'nooo' })

        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops[0].payload.entity.components.media.assetId).toBe('asset-7')
    })
})

describe('permanence pool + claim planning', () => {
    it('readPermanencePool defaults missing/malformed values to zero', () => {
        expect(readPermanencePool(null)).toEqual({ total: 0, claimed: 0 })
        expect(readPermanencePool({})).toEqual({ total: 0, claimed: 0 })
        expect(readPermanencePool({ workspaceState: { permanencePool: { total: '5', claimed: '2' } } })).toEqual({ total: 5, claimed: 2 })
    })

    it('planClaim reports room available and no revoke candidates under the cap', () => {
        const document = { workspaceState: { permanencePool: { total: 3, claimed: 1 } }, entities: [] }
        expect(planClaim(document)).toEqual({ hasRoom: true, pool: { total: 3, claimed: 1 }, revokeCandidates: [] })
    })

    it('planClaim lists every permanent mark, oldest claim first, once full', () => {
        const older = makeEntity({ id: 'old', components: { permanence: { status: 'permanent', claimedAt: 100 } } })
        const newer = makeEntity({ id: 'new', components: { permanence: { status: 'permanent', claimedAt: 200 } } })
        const document = {
            workspaceState: { permanencePool: { total: 2, claimed: 2 } },
            entities: [newer, older]
        }
        const plan = planClaim(document)
        expect(plan.hasRoom).toBe(false)
        expect(plan.revokeCandidates.map((e) => e.id)).toEqual(['old', 'new'])
    })

    it('planClaim returns no revoke candidates when full but nothing is actually permanent', () => {
        const document = { workspaceState: { permanencePool: { total: 0, claimed: 0 } }, entities: [] }
        const plan = planClaim(document)
        expect(plan.hasRoom).toBe(false)
        expect(plan.revokeCandidates).toEqual([])
    })

    it('listPermanentMarks filters out drifting marks and sorts by claimedAt', () => {
        const drifting = makeEntity({ id: 'drifting', components: { permanence: { status: 'drifting' } } })
        const older = makeEntity({ id: 'old', components: { permanence: { status: 'permanent', claimedAt: 100 } } })
        const newer = makeEntity({ id: 'new', components: { permanence: { status: 'permanent', claimedAt: 200 } } })
        expect(listPermanentMarks({ entities: [newer, drifting, older] }).map((e) => e.id)).toEqual(['old', 'new'])
    })
})

describe('isMarkOwner', () => {
    it('matches when actorLabel equals placedBy, case/whitespace-insensitively', () => {
        expect(isMarkOwner({ permanence: { placedBy: 'nooo' }, actorLabel: '  NoOo  ' })).toBe(true)
    })

    it('does not match a different actorLabel', () => {
        expect(isMarkOwner({ permanence: { placedBy: 'nooo' }, actorLabel: 'someone else' })).toBe(false)
    })

    it('admins always count as the owner, regardless of actorLabel', () => {
        expect(isMarkOwner({ permanence: { placedBy: 'nooo' }, actorLabel: 'someone else', isAdmin: true })).toBe(true)
    })

    it('is false with no actorLabel or no placedBy', () => {
        expect(isMarkOwner({ permanence: { placedBy: 'nooo' }, actorLabel: '' })).toBe(false)
        expect(isMarkOwner({ permanence: {}, actorLabel: 'nooo' })).toBe(false)
    })
})

describe('claimPermanence', () => {
    it('grows the pool and logs a single claim when there is room', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 9 })
        apiFetch.mockResolvedValue({ ok: true })
        const entity = makeEntity()
        const document = { workspaceState: { permanencePool: { total: 3, claimed: 1 } }, entities: [] }

        const { hasRoom, revokeTarget } = await claimPermanence({ document, baseVersion: 8, entity, actorLabel: 'nooo', actorVisible: true })

        expect(hasRoom).toBe(true)
        expect(revokeTarget).toBeNull()
        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops[0]).toEqual({ type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 3, claimed: 2 } } } })
        expect(ops[1].payload.patch).toMatchObject({ status: 'permanent', claimedBy: 'nooo', claimedByVisible: true })
        expect(apiFetch).toHaveBeenCalledTimes(1)
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, expect.objectContaining({
            body: expect.objectContaining({ action: 'claim' })
        }))
    })

    it('rejects a claim into a full pool with no chosen revoke target', async () => {
        const held = makeEntity({ id: 'held', name: 'Held mark', components: { permanence: { status: 'permanent', claimedAt: 50 } } })
        const entity = makeEntity({ id: 'new-mark' })
        const document = { workspaceState: { permanencePool: { total: 1, claimed: 1 } }, entities: [held] }

        await expect(claimPermanence({ document, baseVersion: 8, entity, actorLabel: 'nooo' })).rejects.toThrow()
        expect(submitProjectOps).not.toHaveBeenCalled()
    })

    it('rejects a revokeTargetId that is not currently permanent (stale choice)', async () => {
        const drifting = makeEntity({ id: 'drifting-mark', components: { permanence: { status: 'drifting' } } })
        const entity = makeEntity({ id: 'new-mark' })
        const document = { workspaceState: { permanencePool: { total: 1, claimed: 1 } }, entities: [drifting] }

        await expect(claimPermanence({ document, baseVersion: 8, entity, actorLabel: 'nooo', revokeTargetId: 'drifting-mark' })).rejects.toThrow()
        expect(submitProjectOps).not.toHaveBeenCalled()
    })

    it('revokes the chosen mark and logs both a revoke and a claim when full', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 9 })
        apiFetch.mockResolvedValue({ ok: true })
        const held = makeEntity({ id: 'held', name: 'Held mark', components: { permanence: { status: 'permanent', claimedAt: 50 } } })
        const otherHeld = makeEntity({ id: 'other-held', name: 'Other mark', components: { permanence: { status: 'permanent', claimedAt: 10 } } })
        const entity = makeEntity({ id: 'new-mark' })
        const document = { workspaceState: { permanencePool: { total: 2, claimed: 2 } }, entities: [held, otherHeld] }

        // Deliberately choosing the *newer* claim (not the oldest) — this is
        // the claimant's choice, not an automatic pick.
        const { hasRoom, revokeTarget } = await claimPermanence({ document, baseVersion: 8, entity, actorLabel: 'nooo', revokeTargetId: 'held' })

        expect(hasRoom).toBe(false)
        expect(revokeTarget.id).toBe('held')
        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops[0]).toEqual({
            type: 'updateComponent',
            payload: { entityId: 'held', component: 'permanence', patch: { status: 'drifting', revokedFrom: { by: 'nooo', at: expect.any(Number) } } }
        })
        expect(apiFetch).toHaveBeenCalledTimes(2)
        expect(apiFetch.mock.calls[0][1].body).toMatchObject({ action: 'revoke', targetLabel: 'Held mark' })
        expect(apiFetch.mock.calls[1][1].body).toMatchObject({ action: 'claim' })
    })
})

describe('claimMarksForever (admin bulk override)', () => {
    it('claims every non-permanent selected mark and grows the pool by that count, uncapped', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 12 })
        apiFetch.mockResolvedValue({ ok: true })
        const a = makeEntity({ id: 'a', components: { permanence: { status: 'drifting' } } })
        const b = makeEntity({ id: 'b', components: { permanence: { status: 'drifting' } } })
        const document = { workspaceState: { permanencePool: { total: 1, claimed: 1 } }, entities: [a, b] }

        const result = await claimMarksForever({ document, baseVersion: 5, entities: [a, b], actorLabel: 'admin', actorVisible: true })

        expect(result).toEqual({ document: {}, newVersion: 12 })
        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops).toHaveLength(3)
        expect(ops[0]).toMatchObject({ type: 'updateComponent', payload: { entityId: 'a', component: 'permanence', patch: { status: 'permanent', claimedBy: 'admin' } } })
        expect(ops[1]).toMatchObject({ type: 'updateComponent', payload: { entityId: 'b', component: 'permanence', patch: { status: 'permanent', claimedBy: 'admin' } } })
        // Pool was already full (1/1) — this still succeeds and pushes claimed
        // past total, since the admin override has no cap.
        expect(ops[2]).toEqual({ type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 1, claimed: 3 } } } })
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, expect.objectContaining({
            body: expect.objectContaining({ action: 'claim', targetLabel: '2 marks', detail: { count: 2, bulk: true } })
        }))
    })

    it('skips marks already permanent and only counts the rest', async () => {
        submitProjectOps.mockResolvedValue({ document: {}, newVersion: 12 })
        apiFetch.mockResolvedValue({ ok: true })
        const already = makeEntity({ id: 'already', components: { permanence: { status: 'permanent', claimedAt: 1 } } })
        const drifting = makeEntity({ id: 'drifting', components: { permanence: { status: 'drifting' } } })
        const document = { workspaceState: { permanencePool: { total: 5, claimed: 1 } }, entities: [already, drifting] }

        await claimMarksForever({ document, baseVersion: 5, entities: [already, drifting], actorLabel: 'admin' })

        const [, , ops] = submitProjectOps.mock.calls[0]
        expect(ops).toHaveLength(2)
        expect(ops[0].payload.entityId).toBe('drifting')
        expect(ops[1]).toEqual({ type: 'setWorkspaceState', payload: { patch: { permanencePool: { total: 5, claimed: 2 } } } })
    })

    it('is a no-op (no network call) when everything selected is already permanent', async () => {
        const already = makeEntity({ id: 'already', components: { permanence: { status: 'permanent', claimedAt: 1 } } })
        const document = { workspaceState: { permanencePool: { total: 5, claimed: 1 } }, entities: [already] }

        const result = await claimMarksForever({ document, baseVersion: 5, entities: [already], actorLabel: 'admin' })

        expect(result).toEqual({ document, newVersion: 5 })
        expect(submitProjectOps).not.toHaveBeenCalled()
        expect(apiFetch).not.toHaveBeenCalled()
    })
})

describe('ritual log + admin actions', () => {
    it('appendRitualLogEntry posts to the space ritual log with defaults', async () => {
        apiFetch.mockResolvedValue({ ok: true })
        await appendRitualLogEntry({ action: 'place' })
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log`, {
            method: 'POST',
            body: { actorLabel: '', actorVisible: true, action: 'place', targetLabel: '', detail: {} }
        })
    })

    it('fetchRitualLog returns entries or an empty array', async () => {
        apiFetch.mockResolvedValueOnce({ entries: [{ id: 1 }] })
        expect(await fetchRitualLog(10)).toEqual([{ id: 1 }])
        expect(apiFetch).toHaveBeenCalledWith(`/api/spaces/${FINITE_FOREVER_SPACE_ID}/ritual-log?since=10`)

        apiFetch.mockResolvedValueOnce({})
        expect(await fetchRitualLog()).toEqual([])
    })
})
