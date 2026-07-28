import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { hitTestEntitiesInRect, isPointInRect, projectToScreen } from './marqueeSelect.js'

// A real perspective camera — no WebGL/canvas needed, THREE's math objects
// work standalone. Looking down -Z from the origin, matching how the
// walker's own default camera is set up.
function makeCamera() {
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 200)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    return camera
}

describe('projectToScreen', () => {
    it('projects a point directly ahead to roughly the center of the viewport', () => {
        const camera = makeCamera()
        const screen = projectToScreen(camera, [0, 0, 0], 800, 600)
        expect(screen).not.toBeNull()
        expect(screen.x).toBeCloseTo(400, 0)
        expect(screen.y).toBeCloseTo(300, 0)
    })

    it('projects a point off to the world-space left to the left half of the screen', () => {
        const camera = makeCamera()
        const screen = projectToScreen(camera, [-3, 0, 0], 800, 600)
        expect(screen).not.toBeNull()
        expect(screen.x).toBeLessThan(400)
    })

    it('returns null for a point behind the camera instead of a false on-screen position', () => {
        const camera = makeCamera()
        // Camera is at z=5 looking toward the origin (i.e. -Z); z=10 is behind it.
        const screen = projectToScreen(camera, [0, 0, 10], 800, 600)
        expect(screen).toBeNull()
    })
})

describe('isPointInRect', () => {
    const rect = { left: 100, top: 100, width: 50, height: 50 }

    it('is true for a point inside, including on the boundary', () => {
        expect(isPointInRect({ x: 125, y: 125 }, rect)).toBe(true)
        expect(isPointInRect({ x: 100, y: 100 }, rect)).toBe(true)
        expect(isPointInRect({ x: 150, y: 150 }, rect)).toBe(true)
    })

    it('is false for a point outside', () => {
        expect(isPointInRect({ x: 99, y: 125 }, rect)).toBe(false)
        expect(isPointInRect({ x: 125, y: 151 }, rect)).toBe(false)
    })
})

describe('hitTestEntitiesInRect', () => {
    function makeEntity(id, position) {
        return { id, components: { transform: { position } } }
    }

    it('returns ids of entities whose projected position lands inside the rect', () => {
        const camera = makeCamera()
        const entities = [
            makeEntity('center', [0, 0, 0]),
            makeEntity('far-left', [-3, 0, 0]),
            makeEntity('behind-camera', [0, 0, 10])
        ]
        const centerRect = { left: 350, top: 250, width: 100, height: 100 }
        expect(hitTestEntitiesInRect(entities, camera, centerRect, 800, 600)).toEqual(['center'])
    })

    it('ignores entities with no valid transform.position', () => {
        const camera = makeCamera()
        const entities = [{ id: 'no-transform', components: {} }, { id: 'bad-position', components: { transform: { position: 'nope' } } }]
        const anyRect = { left: 0, top: 0, width: 800, height: 600 }
        expect(hitTestEntitiesInRect(entities, camera, anyRect, 800, 600)).toEqual([])
    })

    it('returns an empty array when nothing falls inside the rect', () => {
        const camera = makeCamera()
        const entities = [makeEntity('center', [0, 0, 0])]
        const cornerRect = { left: 0, top: 0, width: 10, height: 10 }
        expect(hitTestEntitiesInRect(entities, camera, cornerRect, 800, 600)).toEqual([])
    })
})
