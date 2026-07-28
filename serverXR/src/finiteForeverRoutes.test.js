// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { registerFiniteForeverRoutes, computeDriftAppearance, DRIFT_DURATION_MS } from './routes/finiteForeverRoutes.js'
import { loadSharedModule } from './sharedRuntime.js'

const { applyProjectOps } = loadSharedModule('projectSchema.cjs')

function makePermanence(overrides = {}) {
    return {
        status: 'drifting',
        stage: 0,
        placedBy: 'nooo',
        placedByVisible: true,
        claimedBy: null,
        claimedByVisible: true,
        claimedAt: null,
        placedAt: Date.now(),
        baseAppearance: { opacity: 1 },
        baseScale: [1, 1, 1],
        revokedFrom: null,
        ...overrides
    }
}

function makeEntity(id, type, permanenceOverrides = {}) {
    return {
        id,
        type,
        name: `${type} mark`,
        components: {
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            appearance: { color: '#9fd8ff', opacity: 1 },
            permanence: makePermanence(permanenceOverrides)
        }
    }
}

// Builds a fully-wired runDriftSweep with in-memory fakes standing in for
// storage/broadcast/lock — enough to exercise the real applyProjectOps
// pipeline without touching disk or a real Express app.
function setupSweep(document) {
    const router = { post: vi.fn(), get: vi.fn() }
    const projectContext = { projectId: 'ritual', spaceId: 'finite-forever', meta: { documentVersion: 5, createdAt: 1000 } }
    const writeProjectDocument = vi.fn().mockResolvedValue(undefined)
    const appendProjectOps = vi.fn().mockResolvedValue(undefined)
    const upsertProjectMeta = vi.fn().mockResolvedValue({ documentVersion: 99 })
    const broadcastProjectLiveEvent = vi.fn().mockResolvedValue(undefined)
    const appendRitualLog = vi.fn()

    const { runDriftSweep } = registerFiniteForeverRoutes(router, {
        requireAdminWrite: (req, res, next) => next(),
        resolveProjectContext: vi.fn().mockResolvedValue(projectContext),
        readProjectDocument: vi.fn().mockResolvedValue(document),
        writeProjectDocument,
        applyProjectOps,
        appendProjectOps,
        upsertProjectMeta,
        broadcastProjectLiveEvent,
        maxOpHistory: 500,
        spacesDir: 'test-spaces',
        withProjectLock: async (projectId, fn) => fn(),
        appendRitualLog,
        listRitualLog: vi.fn()
    })

    return { runDriftSweep, writeProjectDocument, appendRitualLog, broadcastProjectLiveEvent }
}

describe('computeDriftAppearance', () => {
    it('is unchanged at placement (t=0)', () => {
        expect(computeDriftAppearance({ opacity: 1 }, [1, 1, 1], 0)).toEqual({ opacity: 1, scale: [1, 1, 1] })
    })

    it('fades linearly toward zero at the halfway point', () => {
        expect(computeDriftAppearance({ opacity: 1 }, [1, 1, 1], 0.5)).toEqual({ opacity: 0.5, scale: [0.5, 0.5, 0.5] })
    })

    it('reaches fully transparent opacity at t=1, with scale floored just above zero', () => {
        const { opacity, scale } = computeDriftAppearance({ opacity: 1 }, [1, 1, 1], 1)
        expect(opacity).toBe(0)
        scale.forEach((value) => expect(value).toBeCloseTo(0.02, 5))
    })

    it('clamps t outside [0, 1] instead of overshooting', () => {
        expect(computeDriftAppearance({ opacity: 1 }, [1, 1, 1], 1.5)).toEqual(computeDriftAppearance({ opacity: 1 }, [1, 1, 1], 1))
        expect(computeDriftAppearance({ opacity: 1 }, [1, 1, 1], -1)).toEqual(computeDriftAppearance({ opacity: 1 }, [1, 1, 1], 0))
    })
})

describe('runDriftSweep', () => {
    it('deletes a fully-decayed mark, fades a mid-decay one, and leaves a permanent one untouched', async () => {
        const now = Date.now()
        const document = {
            entities: [
                makeEntity('expired', 'box', { placedAt: now - DRIFT_DURATION_MS * 2 }),
                makeEntity('mid', 'sphere', { placedAt: now - DRIFT_DURATION_MS / 2 }),
                makeEntity('kept', 'cone', { status: 'permanent', claimedAt: now, placedAt: now - DRIFT_DURATION_MS * 10 })
            ],
            workspaceState: {},
            assets: [],
            nodes: [],
            edges: [],
            projectMeta: {}
        }

        const { runDriftSweep, writeProjectDocument, appendRitualLog } = setupSweep(document)
        const result = await runDriftSweep('ritual')

        expect(result.stepped).toBe(2)
        expect(result.reachedResidue).toBe(1)

        const [, , , writtenDocument] = writeProjectDocument.mock.calls[0]
        const byId = Object.fromEntries(writtenDocument.entities.map((e) => [e.id, e]))

        expect(byId.expired).toBeUndefined()

        expect(byId.mid.components.permanence.status).toBe('drifting')
        expect(byId.mid.components.appearance.opacity).toBeCloseTo(0.5, 1)
        expect(byId.mid.components.transform.scale[0]).toBeCloseTo(0.5, 1)

        expect(byId.kept.components.permanence.status).toBe('permanent')
        expect(byId.kept.components.appearance.opacity).toBe(1)

        expect(appendRitualLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'residue',
            detail: { stepped: 2, reachedResidue: 1 }
        }))
    })

    it('does not write or log anything when nothing has moved since the last sweep', async () => {
        const now = Date.now()
        const document = {
            entities: [makeEntity('fresh', 'box', { placedAt: now })],
            workspaceState: {},
            assets: [],
            nodes: [],
            edges: [],
            projectMeta: {}
        }

        const { runDriftSweep, writeProjectDocument, appendRitualLog } = setupSweep(document)
        const result = await runDriftSweep('ritual')

        expect(result.stepped).toBe(0)
        expect(writeProjectDocument).not.toHaveBeenCalled()
        expect(appendRitualLog).not.toHaveBeenCalled()
    })

    it('self-heals a mark with no placedAt by starting its window now instead of deleting it immediately', async () => {
        const document = {
            entities: [makeEntity('healme', 'box', { placedAt: null })],
            workspaceState: {},
            assets: [],
            nodes: [],
            edges: [],
            projectMeta: {}
        }

        const { runDriftSweep, writeProjectDocument } = setupSweep(document)
        const result = await runDriftSweep('ritual')

        expect(result.stepped).toBe(1)
        expect(result.reachedResidue).toBe(0)
        const [, , , writtenDocument] = writeProjectDocument.mock.calls[0]
        const healed = writtenDocument.entities.find((e) => e.id === 'healme')
        expect(healed.components.permanence.status).toBe('drifting')
        expect(healed.components.appearance.opacity).toBeCloseTo(1, 1)
    })
})
