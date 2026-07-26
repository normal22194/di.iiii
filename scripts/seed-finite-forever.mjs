#!/usr/bin/env node
/**
 * seed-finite-forever.mjs — provision the `finite-forever` space + its
 * `ritual` project (routed at /finite-forever, see src/RootApp.jsx and
 * src/finiteforever/), and bootstrap workspaceState.permanencePool. Data is
 * gitignored, so this seeds through the normal API instead of committing
 * fixtures. Idempotent — safe to re-run against an already-seeded server.
 *
 * Usage: node scripts/seed-finite-forever.mjs [--to <url>] [--token <tok>] [--pool <n>]
 *   defaults: --to http://localhost:4000/serverXR, --token $SEED_API_TOKEN, --pool 12
 *   Space creation is admin/session-only when the server runs with
 *   REQUIRE_AUTH=true — pass --token (or set SEED_API_TOKEN) in that case.
 */

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : null }
const BASE = (opt('to') || 'http://localhost:4000/serverXR').replace(/\/+$/, '')
const TOKEN = opt('token') || process.env.SEED_API_TOKEN || ''
const POOL_TOTAL = Number(opt('pool')) || 12

const SPACE_ID = 'finite-forever'
const PROJECT_ID = 'ritual'

const api = async (path, options = {}) => {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
            ...options.headers,
        },
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
}

const existingSpace = await api(`/api/spaces/${SPACE_ID}`)
if (!existingSpace.ok) {
    const r = await api('/api/spaces', {
        method: 'POST',
        body: JSON.stringify({ slug: SPACE_ID, label: 'Finite Forever' })
    })
    if (!r.ok) { console.error(`seed: create space failed HTTP ${r.status}: ${r.body?.error}`); process.exit(1) }
    console.log(`seed: created space ${SPACE_ID}`)
}

const projects = await api(`/api/spaces/${SPACE_ID}/projects`)
if (!(projects.body?.projects || []).some((p) => p.id === PROJECT_ID)) {
    const r = await api(`/api/spaces/${SPACE_ID}/projects`, {
        method: 'POST',
        body: JSON.stringify({ slug: PROJECT_ID, title: 'Finite Forever' })
    })
    if (!r.ok) { console.error(`seed: create project failed HTTP ${r.status}: ${r.body?.error}`); process.exit(1) }
    console.log(`seed: created project ${PROJECT_ID}`)
}

const pub = await api(`/api/spaces/${SPACE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublic: true, publishedProjectId: PROJECT_ID })
})
if (!pub.ok) { console.error(`seed: publish failed HTTP ${pub.status}: ${pub.body?.error}`); process.exit(1) }

const doc = await api(`/api/projects/${PROJECT_ID}/document`)
if (!doc.ok) { console.error(`seed: document read failed HTTP ${doc.status}`); process.exit(1) }

const existingPool = doc.body?.document?.workspaceState?.permanencePool
if (existingPool && typeof existingPool.total === 'number') {
    console.log(`seed: ${SPACE_ID}/${PROJECT_ID} already has a permanence pool (${existingPool.claimed}/${existingPool.total}) — leaving it as-is`)
} else {
    const baseVersion = Number(doc.body?.version) || 0
    const opsRes = await api(`/api/projects/${PROJECT_ID}/ops`, {
        method: 'POST',
        body: JSON.stringify({
            baseVersion,
            ops: [{
                type: 'setWorkspaceState',
                payload: { patch: { permanencePool: { total: POOL_TOTAL, claimed: 0 } } }
            }]
        })
    })
    if (!opsRes.ok) { console.error(`seed: pool bootstrap failed HTTP ${opsRes.status}: ${opsRes.body?.error}`); process.exit(1) }
    console.log(`seed: permanence pool set to ${POOL_TOTAL}`)
}

console.log(`seed: ${SPACE_ID}/${PROJECT_ID} ready — visit /${SPACE_ID}`)
