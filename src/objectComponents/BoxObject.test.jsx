import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BoxObject from './BoxObject.jsx'

// BoxObject/PrimitiveMaterial render R3F custom elements (mesh,
// boxGeometry, meshStandardMaterial, primitive) — outside a real <Canvas>
// these are just unrecognized DOM tags that ReactDOM creates and mounts
// harmlessly (same approach as AudioObject.test.jsx), letting us assert on
// the JSX structure via attributes without a WebGL context. The per-face
// materials (<primitive object={...}>) carry a real, non-string array as
// a prop, which DOM attributes can't reflect — so this only checks the
// structural wiring (single material vs. one attached array), not the
// constructed array's contents.
vi.mock('../hooks/useAssetUrl.js', () => ({
    useAssetUrl: () => null
}))

describe('BoxObject', () => {
    it('renders a single shared material when no pageTextures are given (every non-Finite-Forever box)', () => {
        const { container } = render(<BoxObject color="#ff0000" />)
        expect(container.querySelectorAll('meshstandardmaterial')).toHaveLength(1)
        expect(container.querySelectorAll('primitive')).toHaveLength(0)
    })

    it('attaches one real material array (6 faces) via <primitive attach="material"> when given 6 pageTextures', () => {
        const pageTextures = [null, { id: 'a' }, null, { id: 'b' }, null, null]
        const { container } = render(<BoxObject color="#ff0000" pageTextures={pageTextures} />)

        // No individual per-face JSX material elements — one primitive
        // carrying the whole prebuilt array instead.
        expect(container.querySelectorAll('meshstandardmaterial')).toHaveLength(0)
        const primitives = container.querySelectorAll('primitive')
        expect(primitives).toHaveLength(1)
        expect(primitives[0].getAttribute('attach')).toBe('material')
    })

    it('falls back to the single shared material if pageTextures is the wrong length', () => {
        const { container } = render(<BoxObject color="#ff0000" pageTextures={[null, null]} />)
        expect(container.querySelectorAll('meshstandardmaterial')).toHaveLength(1)
        expect(container.querySelectorAll('primitive')).toHaveLength(0)
    })
})
