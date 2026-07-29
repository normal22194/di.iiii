// Ritual log — the durable, append-only record for the "Finite Forever" space.
// Deliberately independent of the space/project op-log tables: those are
// wired specifically for document sync/replay and are pruned/cascade-deleted
// with their space. This log is not — it's meant to survive a space reset
// ("the space forgets, the ritual remembers"), so it lives in its own table
// with no foreign key back to spaces(id).

const crypto = require('node:crypto')
const { getDb } = require('./db')

const ACTIONS = new Set(['place', 'claim', 'revoke', 'advance', 'residue', 'release', 'delete'])

// actorVisible is stored as-authored (never overwritten later) — masking for
// non-admin readers happens at read time (see the GET route in
// finiteForeverRoutes.js), not here, so this store stays pure data access.
const rowToPublic = (row) => row && ({
  id: row.id,
  spaceId: row.space_id,
  actorLabel: row.actor_label || '',
  actorVisible: !!row.actor_visible,
  action: row.action,
  targetLabel: row.target_label || '',
  detail: (() => { try { return JSON.parse(row.detail || '{}') } catch { return {} } })(),
  createdAt: row.created_at
})

const appendRitualLog = ({ spaceId, actorLabel = '', actorVisible = true, action, targetLabel = '', detail = {} }) => {
  const id = crypto.randomBytes(12).toString('hex')
  const now = Date.now()
  if (!spaceId || typeof spaceId !== 'string') throw new Error('spaceId required')
  if (!ACTIONS.has(action)) throw new Error(`invalid action: ${action}`)
  getDb().prepare(
    `INSERT INTO ritual_log (id, space_id, actor_label, actor_visible, action, target_label, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    spaceId,
    String(actorLabel || '').slice(0, 80),
    actorVisible ? 1 : 0,
    action,
    String(targetLabel || '').slice(0, 120),
    JSON.stringify(detail && typeof detail === 'object' ? detail : {}).slice(0, 2000),
    now
  )
  return rowToPublic(getDb().prepare('SELECT * FROM ritual_log WHERE id = ?').get(id))
}

const listRitualLog = (spaceId, { since = 0, limit = 200 } = {}) => {
  const cappedLimit = Math.max(1, Math.min(500, Number(limit) || 200))
  const rows = getDb().prepare(
    'SELECT * FROM ritual_log WHERE space_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?'
  ).all(spaceId, Number(since) || 0, cappedLimit)
  return rows.map(rowToPublic)
}

module.exports = { appendRitualLog, listRitualLog, ACTIONS }
