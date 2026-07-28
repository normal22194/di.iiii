// Pure projection/hit-test math for LiveProjectScene's marquee select —
// kept separate from the DOM/pointer-event wiring specifically so it can be
// unit tested with a real THREE.Camera and no canvas/WebGL context.
import * as THREE from 'three'

const _camSpace = new THREE.Vector3()
const _screen = new THREE.Vector3()

// Projects a world position through `camera` to canvas-relative pixel
// coordinates, or null if the point is behind the camera. The behind-camera
// check matters: perspective division can fold a point that's actually
// behind the camera into seemingly valid on-screen NDC coordinates, which
// would otherwise false-positive as "inside the rectangle".
export function projectToScreen(camera, position, viewportWidth, viewportHeight) {
    const [x, y, z] = position
    _camSpace.set(x, y, z).applyMatrix4(camera.matrixWorldInverse)
    if (_camSpace.z >= 0) return null
    _screen.set(x, y, z).project(camera)
    return {
        x: (_screen.x * 0.5 + 0.5) * viewportWidth,
        y: (1 - (_screen.y * 0.5 + 0.5)) * viewportHeight
    }
}

export function isPointInRect(point, rect) {
    return point.x >= rect.left && point.x <= rect.left + rect.width &&
        point.y >= rect.top && point.y <= rect.top + rect.height
}

// Returns the ids of whichever entities' world position lands inside
// `rect` (canvas-relative pixels) as seen through `camera`.
export function hitTestEntitiesInRect(entities, camera, rect, viewportWidth, viewportHeight) {
    return entities
        .filter((entity) => {
            const pos = entity.components?.transform?.position
            if (!Array.isArray(pos)) return false
            const screen = projectToScreen(camera, pos, viewportWidth, viewportHeight)
            return screen ? isPointInRect(screen, rect) : false
        })
        .map((entity) => entity.id)
}
