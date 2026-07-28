import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { useAssetUrl } from '../hooks/useAssetUrl.js'
import { asColor } from '../utils/colorValue.js'

// BoxGeometry's material-group order (standard three.js face winding):
// 0 +X (right), 1 -X (left), 2 +Y (top), 3 -Y (bottom), 4 +Z (front), 5 -Z (back).
// pageTextures[i] maps 1:1 onto this order — page 1 = right face, ... page 6 = back face.
const FACE_COUNT = 6

// Loads one face's texture — same resolution/loading logic as
// PrimitiveMaterial's own effect, just returning a plain THREE.Texture
// instead of JSX, since BoxObject needs 6 of these built into one real
// array (see below) rather than 6 independent material elements.
function useFaceTexture(assetRef) {
    const assetUrl = useAssetUrl(assetRef, { preferRemoteSource: true })
    const sourceUrl = assetRef ? (assetUrl || assetRef.url || null) : null
    const [map, setMap] = useState(null)

    useEffect(() => {
        const resolved = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolved || resolved === 'blob:null') {
            setMap(null)
            return undefined
        }
        let cancelled = false
        let loaded = null
        const loader = new THREE.TextureLoader()
        loader.setCrossOrigin('anonymous')
        loader.load(
            resolved,
            (texture) => {
                if (cancelled) {
                    texture.dispose()
                    return
                }
                texture.colorSpace = THREE.SRGBColorSpace
                loaded = texture
                setMap(texture)
            },
            undefined,
            () => { if (!cancelled) setMap(null) }
        )
        return () => {
            cancelled = true
            loaded?.dispose()
            setMap(null)
        }
    }, [sourceUrl])

    return map
}

export default function BoxObject({ color, boxSize = [1, 1, 1], wireframe = false, opacity = 1, material = {}, pageTextures = null }) {
    const safeSize = Array.isArray(boxSize)
        ? boxSize.map((entry) => {
            const next = Math.abs(Number(entry))
            if (!Number.isFinite(next)) return 1
            return Math.min(100, Math.max(0.001, next))
        })
        : [1, 1, 1]

    // Finite Forever's "pages" feature: 6 independently-texturable faces
    // instead of one texture wrapped uniformly over the whole box. Fixed
    // number of hook calls (Rules of Hooks) regardless of whether pages are
    // actually in use — each just resolves to null immediately when there's
    // nothing to load.
    const hasPages = Array.isArray(pageTextures) && pageTextures.length === FACE_COUNT
    const faceAsset = (index) => (hasPages ? pageTextures[index] : null)
    const faceMap0 = useFaceTexture(faceAsset(0))
    const faceMap1 = useFaceTexture(faceAsset(1))
    const faceMap2 = useFaceTexture(faceAsset(2))
    const faceMap3 = useFaceTexture(faceAsset(3))
    const faceMap4 = useFaceTexture(faceAsset(4))
    const faceMap5 = useFaceTexture(faceAsset(5))

    // Real material instances assigned to the mesh as one array via
    // <primitive attach="material">, rather than 6 separate JSX elements
    // each self-attaching by dashed index — unambiguous, no per-child
    // attach-string resolution to rely on. Old instances are disposed
    // whenever a new set is built, since these bypass R3F's own
    // create/dispose lifecycle by being constructed directly.
    const pageMaterials = useMemo(() => {
        if (!hasPages) return null
        return [faceMap0, faceMap1, faceMap2, faceMap3, faceMap4, faceMap5].map((map) => new THREE.MeshStandardMaterial({
            color: asColor(color),
            map,
            wireframe,
            transparent: wireframe || opacity < 1,
            opacity,
            roughness: 1,
            metalness: 0
        }))
    }, [hasPages, color, wireframe, opacity, faceMap0, faceMap1, faceMap2, faceMap3, faceMap4, faceMap5])

    useEffect(() => {
        if (!pageMaterials) return undefined
        return () => { pageMaterials.forEach((mat) => mat.dispose()) }
    }, [pageMaterials])

    return (
        <mesh position-y={safeSize[1] / 2}>
            <boxGeometry args={safeSize} />
            {pageMaterials
                ? <primitive object={pageMaterials} attach="material" />
                : <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} {...material} />}
        </mesh>
    )
}
