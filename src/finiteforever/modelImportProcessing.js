// Client-side preprocessing for STL/OBJ imports, run once at import time —
// deliberately NOT inside the shared model renderer (src/objectComponents/
// ModelObject.jsx, used by Studio/Beta too), so this can't change how an
// already-placed model anywhere else in the app looks or performs the next
// time it loads. Problems this solves, specific to STL/OBJ:
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
// 3. STL in particular stores exactly one flat normal per facet, with every
//    triangle's 3 vertices stored independently (no shared/indexed
//    vertices) — even a perfectly reasonable, undecimated STL renders
//    hard-edged/faceted, not because of any triangle-count issue but
//    because the format itself can't represent smooth per-vertex shading.
//    See weldAndSmooth below and prepareStlImport's conversion to OBJ,
//    which can.
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

// Accumulates every vertex landing in a cell (sum + count, 4 numbers per
// cell) rather than keeping only the first one seen — averaging them into a
// centroid at the end is what actually makes this look like a simplified
// version of the surface instead of a blocky/faceted one. The earlier
// first-vertex-wins version discarded every other vertex's position in a
// cell outright, so the "representative" point for a region was an
// arbitrary sample rather than where the surface actually sat on average —
// visually reads as chunky/jagged, this is what fixed it.
export function clusterAtResolution(position, cellSize) {
    const cellIndexOf = new Map()
    const sums = [] // flat [sumX, sumY, sumZ, count] per occupied cell
    const vertexRemap = new Int32Array(position.count)
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const y = position.getY(i)
        const z = position.getZ(i)
        const key = `${Math.round(x / cellSize)}|${Math.round(y / cellSize)}|${Math.round(z / cellSize)}`
        let mergedIndex = cellIndexOf.get(key)
        if (mergedIndex === undefined) {
            mergedIndex = sums.length / 4
            sums.push(x, y, z, 1)
            cellIndexOf.set(key, mergedIndex)
        } else {
            const base = mergedIndex * 4
            sums[base] += x
            sums[base + 1] += y
            sums[base + 2] += z
            sums[base + 3] += 1
        }
        vertexRemap[i] = mergedIndex
    }

    const mergedPositions = []
    for (let i = 0; i < sums.length; i += 4) {
        const count = sums[i + 3]
        mergedPositions.push(sums[i] / count, sums[i + 1] / count, sums[i + 2] / count)
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

// Welds vertices that sit at (near enough) the same position into one
// shared, indexed vertex, then recomputes normals from that shared topology
// — this is what actually produces smooth shading. Merely calling
// computeVertexNormals() on STL's raw output (as the shared renderer's own
// STL path already does, see ModelObject.jsx) does *not* achieve this: STL
// geometry is non-indexed (every triangle's 3 vertices are separate array
// entries even where they coincide with a neighboring triangle's), so each
// "vertex" only ever belongs to one triangle and there is nothing to
// average normals across. Welding first is the missing step.
//
// mergeVertices hashes vertices by *all* their attributes together, so the
// existing flat per-face 'normal' attribute (which differs between two
// coincident vertices belonging to different faces) is deleted first —
// otherwise nothing would be considered a duplicate and welding would do
// nothing at all.
//
// Tolerance is scaled off the mesh's own bounding box rather than using
// mergeVertices' fixed absolute default (1e-4) — the same reasoning as
// fitScaleFor/TARGET_LARGEST_DIMENSION: an arbitrary CAD-scale STL could be
// numerically in the thousands or a tiny fraction, so a fixed absolute
// distance isn't meaningfully "coincident" at every scale.
export function weldAndSmooth(geometry) {
    const clone = geometry.clone()
    clone.deleteAttribute('normal')
    clone.computeBoundingBox()
    const size = clone.boundingBox.getSize(new THREE.Vector3())
    const largestDimension = Math.max(size.x, size.y, size.z) || 1
    const merged = mergeVertices(clone, largestDimension * 1e-5)
    merged.computeVertexNormals()
    return merged
}

// Parses an .stl File, welds it to smooth-shade it (see weldAndSmooth),
// then simplifies further if it's still over the triangle budget. Always
// re-exported — but as **OBJ, not STL**: the STL format itself can only
// ever store one flat normal per facet (see STLExporter, which recomputes a
// fresh face normal on export regardless of what's on the geometry), so
// re-exporting as STL would silently throw away the smoothing just done.
// OBJ supports real per-vertex `vn` normals and is already a fully
// supported import format here (OBJExporter writes them, OBJLoader/
// ModelObject.jsx already read them back correctly). Returns the file to
// actually upload (renamed .obj) plus the uniform scale to seed the new
// mark's transform with (see fitScaleFor).
export async function prepareStlImport(file) {
    const arrayBuffer = await file.arrayBuffer()
    const rawGeometry = new STLLoader().parse(arrayBuffer)
    const smoothed = weldAndSmooth(rawGeometry)
    const { geometry: finalGeometry } = simplifyIfHeavy(smoothed)
    const mesh = new THREE.Mesh(finalGeometry)
    const scale = fitScaleFor(largestDimensionOf(mesh))
    const objString = new OBJExporter().parse(mesh)
    const objName = file.name.replace(/\.stl$/i, '.obj')
    return { file: new File([objString], objName, { type: 'text/plain' }), scale }
}

// Same idea for .obj — every mesh in the (possibly multi-object) file is
// checked/simplified independently, since collapsing across unrelated
// sub-objects would corrupt them; the file is only re-exported if at least
// one of them actually needed changing. Unlike STL, OBJ *can* carry real
// per-vertex normals — computeVertexNormals only runs here as a fallback
// for a source file that simply didn't define any (`vn` lines), not as a
// smoothing pass on top of normals the file already had.
export async function prepareObjImport(file) {
    const objText = await file.text()
    const root = new OBJLoader().parse(objText)
    const scale = fitScaleFor(largestDimensionOf(root))
    let anyChanged = false
    root.traverse((child) => {
        if (!child.isMesh || !child.geometry) return
        let geometry = child.geometry
        if (!geometry.attributes.normal) {
            geometry.computeVertexNormals()
            anyChanged = true
        }
        const { geometry: simplifiedGeometry, simplified } = simplifyIfHeavy(geometry)
        if (simplified) {
            geometry = simplifiedGeometry
            anyChanged = true
        }
        child.geometry = geometry
    })
    if (!anyChanged) return { file, scale }
    const objString = new OBJExporter().parse(root)
    return { file: new File([objString], file.name, { type: file.type || 'text/plain' }), scale }
}
