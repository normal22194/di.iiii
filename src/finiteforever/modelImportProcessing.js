// Client-side preprocessing for STL/OBJ imports, run once at import time —
// deliberately NOT inside the shared model renderer (src/objectComponents/
// ModelObject.jsx, used by Studio/Beta too), so this can't change how an
// already-placed model anywhere else in the app looks or performs the next
// time it loads. Two problems this solves, both specific to STL/OBJ:
//
// 1. Neither format carries any unit convention of its own (unlike GLTF/GLB,
//    which near-universally follow a meters convention) — a CAD export can
//    be millimeter-scale (unusably tiny at this space's ~1-unit-per-mark
//    scale) or arbitrarily huge. Left alone, an imported mark can render
//    as an invisible speck or a wall filling the whole view — reported as
//    "the file doesn't appear".
// 2. Neither format caps triangle count the way most GLTF export pipelines
//    already do — a shared real-time space with many simultaneous marks
//    can't afford one import carrying an arbitrary CAD-grade mesh.
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'

// Matches the built-in primitives' own default footprint (box 1x1x1, sphere
// diameter 1) closely enough to read as "a mark", not an invisible speck or
// a wall filling the whole view.
export const TARGET_LARGEST_DIMENSION = 1.2

// A shared real-time space with many simultaneous marks can't afford one
// import carrying an arbitrary CAD-grade triangle count.
export const MAX_TRIANGLES = 20000

export function triangleCountOf(geometry) {
    const position = geometry?.attributes?.position
    if (!position) return 0
    return (geometry.index ? geometry.index.count : position.count) / 3
}

// Largest dimension of `object3d`'s full world-space bounding box — a group
// with several meshes counts as one object, not per-mesh, so relative
// proportions between sub-meshes are preserved. 0 for an empty object.
export function largestDimensionOf(object3d) {
    const box = new THREE.Box3().setFromObject(object3d)
    if (box.isEmpty()) return 0
    const size = box.getSize(new THREE.Vector3())
    return Math.max(size.x, size.y, size.z)
}

export function fitScaleFor(largestDimension) {
    if (!largestDimension || !Number.isFinite(largestDimension) || largestDimension <= 0) return 1
    return TARGET_LARGEST_DIMENSION / largestDimension
}

// Reduces `geometry` toward `maxTriangles` when it's over budget; leaves it
// untouched otherwise (no unnecessary work or precision loss for a file
// that was already reasonable).
//
// This deliberately does NOT use three.js's own bundled SimplifyModifier
// (three/examples/jsm/modifiers/SimplifyModifier.js) — a real heavy import
// through it froze the page. Its own source says why:
// `minimumCostEdge`/`function minimumCostEdge( vertices ) { // O(n * n)
// approach. TODO optimize this` — that function runs once per vertex
// removed, so reducing a genuinely heavy mesh is O(vertexCount *
// removeCount): for a few hundred thousand vertices needing most of them
// removed, that's tens of billions of operations on the main thread. No
// safe threshold rescues it — by the time a file needs real reduction, the
// same size that makes it worth simplifying is the size that makes this
// particular algorithm hang.
//
// Spatial vertex clustering instead: snap every vertex to the nearest cell
// of a 3D grid sized off the mesh's own bounding box, merge vertices that
// land in the same cell, and drop any triangle whose three corners all
// collapsed together. One pass over the vertices, one pass over the
// triangles — O(n), safe to run synchronously on the main thread regardless
// of input size. Coarser than a real edge-collapse decimator (uv/color
// attributes aren't preserved, only position — acceptable for marks, which
// don't need textured heavy models).
//
// A single analytical guess for the grid resolution isn't good enough: how
// many triangles survive a given cell size depends on the mesh's own shape
// (how its surface area distributes through its bounding volume), not just
// vertex count — a cube-root guess (right for filling a *volume*, wrong for
// a surface) landed at ~30% of the stated budget on a real import, which is
// what "too simplified" was. Instead this measures, then corrects: run one
// pass, see how far off the resulting triangle count is, adjust the cell
// count by the square root of that ratio (triangle count scales roughly
// with cellsPerAxis² for a 2-manifold surface), and repeat — a handful of
// fast O(n) passes converge close to the actual target regardless of shape.
const CLUSTER_MAX_ITERATIONS = 6
const CLUSTER_TOLERANCE = 0.3 // accept anywhere from 70% to 130% of the target

function clusterAtResolution(position, cellSize) {
    const cellIndexOf = new Map()
    const mergedPositions = []
    const vertexRemap = new Int32Array(position.count)
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const y = position.getY(i)
        const z = position.getZ(i)
        const key = `${Math.round(x / cellSize)}|${Math.round(y / cellSize)}|${Math.round(z / cellSize)}`
        let mergedIndex = cellIndexOf.get(key)
        if (mergedIndex === undefined) {
            mergedIndex = mergedPositions.length / 3
            mergedPositions.push(x, y, z)
            cellIndexOf.set(key, mergedIndex)
        }
        vertexRemap[i] = mergedIndex
    }

    const indices = []
    for (let t = 0; t < position.count; t += 3) {
        const a = vertexRemap[t]
        const b = vertexRemap[t + 1]
        const c = vertexRemap[t + 2]
        if (a === b || b === c || a === c) continue // all corners collapsed to one cell — degenerate, drop it
        indices.push(a, b, c)
    }
    return { positions: mergedPositions, indices }
}

export function simplifyIfHeavy(geometry, maxTriangles = MAX_TRIANGLES) {
    const triangles = triangleCountOf(geometry)
    if (triangles <= maxTriangles) return { geometry, simplified: false }

    const source = geometry.index ? geometry.toNonIndexed() : geometry
    const position = source.attributes.position
    if (!position || position.count === 0) return { geometry, simplified: false }

    source.computeBoundingBox()
    const size = source.boundingBox.getSize(new THREE.Vector3())
    const largestDimension = Math.max(size.x, size.y, size.z) || 1

    let cellsPerAxis = Math.sqrt(maxTriangles)
    let result = clusterAtResolution(position, largestDimension / cellsPerAxis)
    for (let i = 1; i < CLUSTER_MAX_ITERATIONS; i++) {
        const resultTriangles = result.indices.length / 3
        const ratio = resultTriangles / maxTriangles
        if (Math.abs(ratio - 1) <= CLUSTER_TOLERANCE || resultTriangles === 0) break
        cellsPerAxis *= Math.sqrt(maxTriangles / resultTriangles)
        result = clusterAtResolution(position, largestDimension / cellsPerAxis)
    }

    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3))
    next.setIndex(result.indices)
    next.computeVertexNormals()
    return { geometry: next, simplified: true }
}

// Parses an .stl File, simplifying it first if it's over the triangle
// budget — re-exported as a fresh binary STL only when that actually
// happens; an already-reasonable file is re-uploaded as-is, with no
// parse/export round-trip risk for the common case. Returns the file to
// actually upload plus the uniform scale to seed the new mark's transform
// with (see fitScaleFor).
export async function prepareStlImport(file) {
    const arrayBuffer = await file.arrayBuffer()
    const geometry = new STLLoader().parse(arrayBuffer)
    const { geometry: finalGeometry, simplified } = simplifyIfHeavy(geometry)
    const mesh = new THREE.Mesh(finalGeometry)
    const scale = fitScaleFor(largestDimensionOf(mesh))
    if (!simplified) return { file, scale }
    const stlData = new STLExporter().parse(mesh, { binary: true })
    return { file: new File([stlData], file.name, { type: file.type || 'model/stl' }), scale }
}

// Same idea for .obj — every mesh in the (possibly multi-object) file is
// checked/simplified independently, since collapsing across unrelated
// sub-objects would corrupt them; the file is only re-exported if at least
// one of them actually needed it.
export async function prepareObjImport(file) {
    const objText = await file.text()
    const root = new OBJLoader().parse(objText)
    const scale = fitScaleFor(largestDimensionOf(root))
    let anySimplified = false
    root.traverse((child) => {
        if (!child.isMesh || !child.geometry) return
        const { geometry, simplified } = simplifyIfHeavy(child.geometry)
        if (simplified) {
            child.geometry = geometry
            anySimplified = true
        }
    })
    if (!anySimplified) return { file, scale }
    const objString = new OBJExporter().parse(root)
    return { file: new File([objString], file.name, { type: file.type || 'text/plain' }), scale }
}
