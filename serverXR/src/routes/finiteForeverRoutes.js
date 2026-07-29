// "Finite Forever" — decay/permanence mechanics layered on top of the
// existing project-document pipeline (see docs/architecture/PROJECT_SURFACES.md
// and the plan this was built from). Placing marks and claiming/revoking
// permanence ride the generic POST /api/projects/:projectId/ops route
// unchanged (plain additive `components.permanence` + `workspaceState.
// permanencePool` patches) — this module only adds what genuinely can't be a
// plain client-submitted op: a server-driven drift sweep (recomputing every
// unclaimed mark's appearance from real elapsed wall-clock time since it was
// placed, fading it out and deleting it once DRIFT_DURATION_MS is reached),
// plus the durable ritual log (kept in its own table, see ritualLogStore.js,
// specifically so it survives independent of this project's own document).
const crypto = require('node:crypto')

// A mark left to drift fades all the way out and is removed 12 real hours
// after placement — this is wall-clock time (Date.now()), not a per-click
// step, so it keeps advancing whether or not anyone is looking or an admin
// ever presses the manual trigger below.
const DRIFT_DURATION_MS = 12 * 60 * 60 * 1000
const DRIFT_STAGE_COUNT = 4 // informational bucket for the ritual log/UI only — the opacity/scale math below uses the continuous fraction directly, not this.
// Scale never quite hits exactly 0 (a degenerate zero-scale transform can
// upset some renderers/hit-testing); opacity does, so the mark is fully
// invisible for whatever sliver of a sweep interval it exists in right
// before deletion actually removes it.
const MIN_OPACITY = 0
const MIN_SCALE = 0.02

// t: 0..1, the fraction of DRIFT_DURATION_MS elapsed since placement.
// Computed from the placement-time snapshot every sweep (never compounds off
// the last written value, so repeated sweeps stay numerically stable).
function computeDriftAppearance(baseAppearance, baseScale, t) {
  const clamped = Math.min(1, Math.max(0, t))
  const baseOpacity = typeof baseAppearance?.opacity === 'number' ? baseAppearance.opacity : 1
  const scaleSource = Array.isArray(baseScale) && baseScale.length === 3 ? baseScale : [1, 1, 1]
  return {
    opacity: Math.max(MIN_OPACITY, baseOpacity * (1 - clamped)),
    scale: scaleSource.map((value) => Math.max(MIN_SCALE, (Number(value) || 1) * (1 - clamped)))
  }
}

function makeOpId() {
  return crypto.randomUUID?.() || `ff-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function registerFiniteForeverRoutes(router, {
  resolveProjectContext,
  readProjectDocument,
  writeProjectDocument,
  applyProjectOps,
  appendProjectOps,
  upsertProjectMeta,
  broadcastProjectLiveEvent,
  maxOpHistory,
  spacesDir,
  withProjectLock,
  appendRitualLog,
  listRitualLog
}) {
  // Recomputes every `drifting` entity's appearance/scale from real elapsed
  // time since it was placed. Callable both from the manual admin route below
  // (forces an immediate recompute — handy for testing/demos) and from a
  // periodic timer (see index.js) that keeps marks drifting on their own.
  // Entities placed before this field existed self-heal: missing `placedAt`
  // is treated as "starts its 12h window now" rather than crashing or maxing
  // out instantly.
  const runDriftSweep = async (projectId, { actorLabel = 'the space' } = {}) => {
    const project = await resolveProjectContext(projectId)
    if (!project) return { notFound: true }

    const result = await withProjectLock(project.projectId, async () => {
      const fresh = await resolveProjectContext(project.projectId)
      if (!fresh) return { notFound: true }
      const document = await readProjectDocument(spacesDir, fresh.spaceId, fresh.projectId)
      const currentVersion = Number(fresh.meta?.documentVersion) || 0

      const timestamp = Date.now()
      let nextVersion = currentVersion
      const versionedOps = []
      let stepped = 0
      let reachedResidue = 0

      for (const entity of document.entities || []) {
        const permanence = entity?.components?.permanence
        if (!permanence || permanence.status !== 'drifting') continue

        const placedAt = Number(permanence.placedAt) || timestamp
        const t = (timestamp - placedAt) / DRIFT_DURATION_MS

        // Fully faded: remove it outright rather than parking it at a floor
        // appearance forever — "residue" here means gone, not a permanently
        // dim/tiny leftover. Never claimed (permanence.status is still
        // 'drifting'), so there's no permanence-pool slot to release.
        if (t >= 1) {
          versionedOps.push({
            opId: makeOpId(),
            clientId: 'server',
            type: 'deleteEntity',
            payload: { entityId: entity.id },
            version: ++nextVersion,
            timestamp
          })
          stepped += 1
          reachedResidue += 1
          continue
        }

        const { opacity, scale } = computeDriftAppearance(permanence.baseAppearance, permanence.baseScale, t)
        const nextStage = Math.min(DRIFT_STAGE_COUNT, Math.floor(Math.max(0, t) * DRIFT_STAGE_COUNT))

        // Nothing to write if this entity hasn't moved since the last sweep
        // (freshly placed, or no placedAt to heal).
        if (nextStage === (Number(permanence.stage) || 0) && permanence.placedAt) continue

        versionedOps.push({
          opId: makeOpId(),
          clientId: 'server',
          type: 'updateComponent',
          payload: { entityId: entity.id, component: 'permanence', patch: { stage: nextStage, placedAt } },
          version: ++nextVersion,
          timestamp
        })
        versionedOps.push({
          opId: makeOpId(),
          clientId: 'server',
          type: 'updateComponent',
          payload: { entityId: entity.id, component: 'appearance', patch: { opacity } },
          version: ++nextVersion,
          timestamp
        })
        versionedOps.push({
          opId: makeOpId(),
          clientId: 'server',
          type: 'updateComponent',
          payload: { entityId: entity.id, component: 'transform', patch: { scale } },
          version: ++nextVersion,
          timestamp
        })
        stepped += 1
      }

      if (!versionedOps.length) {
        return { nextVersion: currentVersion, nextMeta: fresh.meta, spaceId: fresh.spaceId, stepped: 0, reachedResidue: 0 }
      }

      const nextDocument = applyProjectOps(document, versionedOps)
      nextDocument.projectMeta = {
        ...nextDocument.projectMeta,
        id: fresh.projectId,
        spaceId: fresh.spaceId,
        createdAt: fresh.meta?.createdAt || nextDocument.projectMeta.createdAt,
        updatedAt: Date.now()
      }
      await writeProjectDocument(spacesDir, fresh.spaceId, fresh.projectId, nextDocument)
      await appendProjectOps(spacesDir, fresh.spaceId, fresh.projectId, versionedOps, maxOpHistory)
      const nextMeta = await upsertProjectMeta(spacesDir, fresh.spaceId, fresh.projectId, {
        title: nextDocument.projectMeta.title,
        documentVersion: nextVersion
      })
      return { nextVersion, nextMeta, spaceId: fresh.spaceId, versionedOps, stepped, reachedResidue }
    })

    if (result.notFound) return result
    if (result.versionedOps?.length) {
      await broadcastProjectLiveEvent(project.projectId, 'project-op', {
        version: result.nextVersion,
        ops: result.versionedOps
      })
    }
    if (result.stepped > 0) {
      appendRitualLog({
        spaceId: result.spaceId,
        actorLabel,
        action: result.reachedResidue > 0 ? 'residue' : 'advance',
        targetLabel: `${result.stepped} mark${result.stepped === 1 ? '' : 's'}`,
        detail: { stepped: result.stepped, reachedResidue: result.reachedResidue }
      })
    }
    return result
  }

  // Participant-writable (same trust level as placing/claiming a mark) —
  // the frontend calls this right after a successful claim/revoke ops batch,
  // so the durable record exists independent of the live document.
  router.post('/api/spaces/:spaceId/ritual-log', async (req, res, next) => {
    try {
      const spaceId = String(req.params.spaceId || '')
      const action = String(req.body?.action || '')
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      try {
        const entry = appendRitualLog({
          spaceId,
          actorLabel: req.body?.actorLabel,
          actorVisible: req.body?.actorVisible !== false,
          action,
          targetLabel: req.body?.targetLabel,
          detail: req.body?.detail
        })
        res.status(201).json({ entry })
      } catch (validationError) {
        res.status(400).json({ error: validationError.message })
      }
    } catch (error) {
      next(error)
    }
  })

  // Public read — the ritual log is meant to remain legible even without a
  // session, matching the "the ritual remembers" framing of the concept.
  // Entries whose actor chose not to be visible get their name masked here,
  // server-side, for anyone but an admin — this is the enforcement point,
  // not just a client-side display choice, so it can't be bypassed by
  // reading the response directly.
  router.get('/api/spaces/:spaceId/ritual-log', async (req, res, next) => {
    try {
      const spaceId = String(req.params.spaceId || '')
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const since = Number(req.query.since)
      const limit = Number(req.query.limit)
      const entries = listRitualLog(spaceId, {
        since: Number.isFinite(since) ? since : 0,
        limit: Number.isFinite(limit) ? limit : 200
      })
      const isAdmin = req.authState?.role === 'admin'
      const visibleEntries = isAdmin ? entries : entries.map((entry) => (
        entry.actorVisible ? entry : { ...entry, actorLabel: 'an anonymous visitor' }
      ))
      res.json({ entries: visibleEntries })
    } catch (error) {
      next(error)
    }
  })

  return { runDriftSweep }
}

module.exports = { registerFiniteForeverRoutes, computeDriftAppearance, DRIFT_DURATION_MS, DRIFT_STAGE_COUNT }
