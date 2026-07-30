import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
    MAX_TRIANGLES,
    TARGET_LARGEST_DIMENSION,
    clusterAtResolution,
    fitScaleFor,
    largestDimensionOf,
    simplifyIfHeavy,
    triangleCountOf,
    weldAndSmooth
} from './modelImportProcessing.js'

describe('triangleCountOf', () => {
    it('counts triangles from an indexed geometry', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1) // indexed, 12 triangles
        expect(triangleCountOf(geometry)).toBe(12)
    })

    it('counts triangles from a non-indexed geometry', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
        expect(triangleCountOf(geometry)).toBe(12)
    })

    it('returns 0 for a geometry with no position attribute', () => {
        expect(triangleCountOf(new THREE.BufferGeometry())).toBe(0)
        expect(triangleCountOf(null)).toBe(0)
    })
})

describe('largestDimensionOf', () => {
    it('returns the largest bounding-box dimension of a single mesh', () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 1))
        expect(largestDimensionOf(mesh)).toBeCloseTo(5, 5)
    })

    it('returns the largest dimension across a multi-mesh group, not per-mesh', () => {
        const group = new THREE.Group()
        const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
        a.position.set(-3, 0, 0)
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
        b.position.set(3, 0, 0)
        group.add(a, b)
        // Neither box alone is wider than 1, but they're 6 apart center-to-center.
        expect(largestDimensionOf(group)).toBeCloseTo(7, 5)
    })

    it('returns 0 for an empty object', () => {
        expect(largestDimensionOf(new THREE.Group())).toBe(0)
    })
})

describe('fitScaleFor', () => {
    it('computes a scale that brings the largest dimension to the target size', () => {
        expect(fitScaleFor(10)).toBeCloseTo(TARGET_LARGEST_DIMENSION / 10, 5)
        expect(fitScaleFor(0.01)).toBeCloseTo(TARGET_LARGEST_DIMENSION / 0.01, 5)
    })

    it('defaults to 1 (no-op) for zero, negative, or non-finite input', () => {
        expect(fitScaleFor(0)).toBe(1)
        expect(fitScaleFor(-5)).toBe(1)
        expect(fitScaleFor(NaN)).toBe(1)
        expect(fitScaleFor(Infinity)).toBe(1)
    })
})

describe('weldAndSmooth', () => {
    // STL always parses to non-indexed geometry with one flat normal per
    // facet duplicated across that facet's 3 vertices (see STLLoader) — two
    // adjacent triangles sharing an edge end up with *different* normals at
    // vertices that sit at the exact same position, which is why the old
    // per-face 'normal' attribute has to be deleted before merging: keeping
    // it would make mergeVertices treat those coincident vertices as
    // distinct (different hash) and weld nothing at all.
    it('merges coincident vertices into a shared indexed topology despite them carrying different flat normals', () => {
        const positions = new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0, // triangle 1
            0, 0, 0, 1, 1, 0, 0, 1, 0  // triangle 2 — shares (0,0,0) and (1,1,0) with triangle 1
        ])
        const normals = new Float32Array([
            0, 0, 1, 0, 0, 1, 0, 0, 1,
            0, 0, -1, 0, 0, -1, 0, 0, -1 // deliberately different from triangle 1's
        ])
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

        const result = weldAndSmooth(geometry)

        // 4 distinct corners for a quad made of 2 triangles, not the
        // original 6 — confirms the shared edge actually merged.
        expect(result.attributes.position.count).toBe(4)
        expect(result.index).not.toBeNull()
        expect(result.index.count).toBe(6) // still 2 triangles' worth of indices
        // Recomputed from the now-shared topology, one normal per welded
        // vertex — not the original per-face duplicated normals.
        expect(result.attributes.normal.count).toBe(4)
    })

    it('scales its merge tolerance to the mesh\'s own size, not a fixed absolute distance', () => {
        // A large CAD-scale mesh (thousands of units) whose "shared" edge
        // vertices differ by a tiny fraction of its own size — a fixed
        // absolute tolerance built for a unit-scale mesh would fail to
        // merge this; a size-relative one still should.
        const positions = new Float32Array([
            0, 0, 0, 1000, 0, 0, 1000, 1000, 0,
            0.0001, 0.0001, 0, 1000, 1000, 0, 0, 1000, 0
        ])
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(18), 3))

        const result = weldAndSmooth(geometry)
        expect(result.attributes.position.count).toBeLessThan(6)
    })
})

describe('clusterAtResolution', () => {
    // Regression: an earlier version kept only the *first* vertex seen in a
    // cell and threw away every other vertex landing there, so the
    // simplified surface snapped to an arbitrary sample point per region
    // instead of where the surface actually sat on average — read as
    // blocky/faceted geometry, which is what "low quality" turned out to be.
    it('merges vertices in the same cell to their centroid, not just the first vertex seen', () => {
        // Three points that all round to the same grid cell at cellSize=10
        // (well within rounding distance of each other and of cell center 0).
        const position = new THREE.Float32BufferAttribute([
            0, 0, 0,
            1, 1, 1,
            2, 2, 2
        ], 3)
        const { positions, indices } = clusterAtResolution(position, 10)

        expect(indices).toHaveLength(0) // one degenerate triangle, correctly dropped
        expect(positions).toHaveLength(3)
        // Centroid of (0,0,0), (1,1,1), (2,2,2) is (1,1,1) — not (0,0,0),
        // which is what "keep only the first vertex" would have produced.
        expect(positions[0]).toBeCloseTo(1, 5)
        expect(positions[1]).toBeCloseTo(1, 5)
        expect(positions[2]).toBeCloseTo(1, 5)
    })

    it('keeps distinct cells separate — merging is only within a cell, not across the whole mesh', () => {
        const position = new THREE.Float32BufferAttribute([
            0, 0, 0,
            0, 0, 0,
            100, 100, 100
        ], 3)
        const { positions } = clusterAtResolution(position, 1)
        expect(positions).toHaveLength(6) // two distinct cells survive
    })
})

describe('simplifyIfHeavy', () => {
    it('leaves a geometry under the triangle budget untouched', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1) // 12 triangles
        const result = simplifyIfHeavy(geometry, MAX_TRIANGLES)
        expect(result.simplified).toBe(false)
        expect(result.geometry).toBe(geometry)
    })

    it('simplifies a geometry over the triangle budget down toward it', () => {
        // A high-subdivision sphere comfortably exceeds a small test budget.
        const geometry = new THREE.SphereGeometry(1, 64, 64)
        const before = triangleCountOf(geometry)
        const budget = 200
        expect(before).toBeGreaterThan(budget)

        const result = simplifyIfHeavy(geometry, budget)
        expect(result.simplified).toBe(true)
        expect(result.geometry).not.toBe(geometry)
        const after = triangleCountOf(result.geometry)
        expect(after).toBeLessThan(before)
    })

    // Regression: a first version picked the grid resolution from a single
    // analytical guess (cube root of the target, as if the mesh's surface
    // filled a volume) instead of measuring and correcting — on a real
    // ~80k-triangle sphere targeting 20,000, it landed at ~6,100 (about 30%
    // of the stated budget), which is what "too simplified, bad quality"
    // was. The fix measures the actual result and adjusts the grid a few
    // times, so this must land in the same order of magnitude as the
    // target, not undershoot it by 3-4x.
    it('lands within the same order of magnitude as the requested budget, not wildly under it', () => {
        const geometry = new THREE.SphereGeometry(1, 200, 200) // ~80,000 triangles
        const budget = 20000
        const result = simplifyIfHeavy(geometry, budget)
        const after = triangleCountOf(result.geometry)
        expect(after).toBeGreaterThan(budget * 0.5)
        expect(after).toBeLessThan(budget * 2)
    })

    it('does nothing for an empty geometry instead of throwing', () => {
        const result = simplifyIfHeavy(new THREE.BufferGeometry(), 10)
        expect(result.simplified).toBe(false)
    })

    // The actual regression this whole rewrite exists for: an earlier
    // version used three.js's own bundled SimplifyModifier, whose own
    // source admits its edge-collapse search is "O(n * n)... TODO
    // optimize" — real heavy imports froze the page. Spatial clustering is
    // O(n): this mesh (60 segments³-ish icosphere-scale subdivision, tens
    // of thousands of triangles) must resolve near-instantly, not hang.
    it('reduces a genuinely heavy mesh without hanging (the actual bug this replaces a fix for)', () => {
        const geometry = new THREE.SphereGeometry(1, 200, 200) // ~80,000 triangles
        const before = triangleCountOf(geometry)
        expect(before).toBeGreaterThan(MAX_TRIANGLES * 3)

        const start = performance.now()
        const result = simplifyIfHeavy(geometry, MAX_TRIANGLES)
        const elapsedMs = performance.now() - start

        expect(result.simplified).toBe(true)
        expect(triangleCountOf(result.geometry)).toBeLessThan(before)
        // Generous ceiling for a slow CI machine — the point is "clearly
        // sub-second", not a tight perf assertion prone to flaking.
        expect(elapsedMs).toBeLessThan(2000)
    })
})
