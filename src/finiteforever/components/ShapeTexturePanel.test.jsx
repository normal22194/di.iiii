import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ShapeTexturePanel from './ShapeTexturePanel.jsx'

vi.mock('./DrawingCanvas.jsx', () => ({
    default: ({ onSave, onClear }) => (
        <>
            <button type="button" onClick={() => onSave(new Blob(['x'], { type: 'image/png' }))}>
                fake-drawing-canvas-save
            </button>
            <button type="button" onClick={() => onClear()}>fake-drawing-canvas-clear</button>
        </>
    )
}))

function makeEntity(appearanceOverrides = {}) {
    return {
        id: 'mark-1',
        components: {
            appearance: { color: '#9fd8ff', opacity: 1, ...appearanceOverrides }
        }
    }
}

describe('ShapeTexturePanel', () => {
    it('owner sees the drawing tool; saving forwards the blob straight through (no page index, unlike Pages)', () => {
        const onSaveTexture = vi.fn()
        render(<ShapeTexturePanel entity={makeEntity()} isOwner busy={false} onSaveTexture={onSaveTexture} onClearTexture={vi.fn()} />)

        fireEvent.click(screen.getByText('fake-drawing-canvas-save'))
        expect(onSaveTexture).toHaveBeenCalledWith(expect.any(Blob))
    })

    it('clearing calls onClearTexture with no arguments', () => {
        const onClearTexture = vi.fn()
        render(<ShapeTexturePanel entity={makeEntity()} isOwner busy={false} onSaveTexture={vi.fn()} onClearTexture={onClearTexture} />)

        fireEvent.click(screen.getByText('fake-drawing-canvas-clear'))
        expect(onClearTexture).toHaveBeenCalledWith()
    })

    it('non-owner gets a read-only note instead of the drawing tool', () => {
        render(<ShapeTexturePanel entity={makeEntity()} isOwner={false} busy={false} onSaveTexture={vi.fn()} onClearTexture={vi.fn()} />)
        expect(screen.queryByText('fake-drawing-canvas-save')).not.toBeInTheDocument()
        expect(screen.getByText('Only the person who placed this can draw here.')).toBeInTheDocument()
        expect(screen.getByText('Blank surface.')).toBeInTheDocument()
    })

    it('non-owner sees the existing texture image instead of the blank note when one is set', () => {
        render(
            <ShapeTexturePanel
                entity={makeEntity({ textureAssetId: 'asset-9' })}
                isOwner={false}
                busy={false}
                onSaveTexture={vi.fn()}
                onClearTexture={vi.fn()}
            />
        )
        expect(screen.getByAltText('Surface')).toHaveAttribute('src', expect.stringContaining('asset-9'))
        expect(screen.queryByText('Blank surface.')).not.toBeInTheDocument()
    })
})
