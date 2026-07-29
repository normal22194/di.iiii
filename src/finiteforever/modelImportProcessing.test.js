import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
    MAX_TRIANGLES,
    TARGET_LARGEST_DIMENSION,
    fitScaleFor,
    largestDimensionOf,
    simplifyIfHeavy,
    triangleCountOf
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
