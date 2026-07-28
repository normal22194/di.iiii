import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PagesPanel from './PagesPanel.jsx'

vi.mock('./DrawingCanvas.jsx', () => ({
    default: ({ onSave, onClear }) => (
        <>
            <button type="button" onClick={() => onSave(new Blob(['x'], { type: 'image/png' }))}>
                fake-drawing-canvas-save
            </button>
            <button type="button" onClick={onClear}>fake-drawing-canvas-clear</button>
        </>
    )
}))

function makeEntity(pagesOverrides = {}) {
    return {
        id: 'mark-1',
        components: {
            pages: {
                items: [{ assetId: null }, { assetId: null }, { assetId: null }, { assetId: null }, { assetId: null }, { assetId: null }],
                ...pagesOverrides
            }
        }
    }
}

describe('PagesPanel', () => {
    it('renders nothing for a mark with no pages component (non-box marks)', () => {
        const { container } = render(
            <PagesPanel entity={{ id: 'mark-1', components: {} }} isOwner busy={false} onSavePage={vi.fn()} />
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders 6 page tabs, one per box face', () => {
        render(<PagesPanel entity={makeEntity()} isOwner busy={false} onSavePage={vi.fn()} />)
        for (let i = 1; i <= 6; i += 1) {
            expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument()
        }
    })

    it('highlights whichever page tab is currently selected, and only that one', () => {
        render(<PagesPanel entity={makeEntity()} isOwner busy={false} onSavePage={vi.fn()} onClearPage={vi.fn()} />)
        const tabOne = screen.getByRole('button', { name: '1' })
        const tabFour = screen.getByRole('button', { name: '4' })

        expect(tabOne).toHaveClass('ff-pages__tab--selected')
        expect(tabOne).toHaveAttribute('aria-current', 'true')
        expect(tabFour).not.toHaveClass('ff-pages__tab--selected')

        fireEvent.click(tabFour)

        expect(tabFour).toHaveClass('ff-pages__tab--selected')
        expect(tabFour).toHaveAttribute('aria-current', 'true')
        expect(tabOne).not.toHaveClass('ff-pages__tab--selected')
        expect(tabOne).toHaveAttribute('aria-current', 'false')
    })

    it('owner sees the drawing tool for whichever page is selected; saving forwards that page index', () => {
        const onSavePage = vi.fn()
        render(<PagesPanel entity={makeEntity()} isOwner busy={false} onSavePage={onSavePage} onClearPage={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: '3' }))
        fireEvent.click(screen.getByText('fake-drawing-canvas-save'))

        expect(onSavePage).toHaveBeenCalledWith(2, expect.any(Blob))
    })

    it('clearing forwards the selected page index to onClearPage', () => {
        const onClearPage = vi.fn()
        render(<PagesPanel entity={makeEntity()} isOwner busy={false} onSavePage={vi.fn()} onClearPage={onClearPage} />)

        fireEvent.click(screen.getByRole('button', { name: '5' }))
        fireEvent.click(screen.getByText('fake-drawing-canvas-clear'))

        expect(onClearPage).toHaveBeenCalledWith(4)
    })

    it('non-owner gets a read-only note instead of the drawing tool, with no activation step to reach', () => {
        render(<PagesPanel entity={makeEntity()} isOwner={false} busy={false} onSavePage={vi.fn()} />)
        expect(screen.queryByText('fake-drawing-canvas-save')).not.toBeInTheDocument()
        expect(screen.getByText('Only the person who placed this can draw here.')).toBeInTheDocument()
        expect(screen.getByText('Blank page.')).toBeInTheDocument()
    })

    it('switching tabs shows each page\'s own saved image, independent of the others', () => {
        render(
            <PagesPanel
                entity={makeEntity({ items: [{ assetId: 'asset-1' }, { assetId: null }, { assetId: 'asset-3' }, { assetId: null }, { assetId: null }, { assetId: null }] })}
                isOwner={false}
                busy={false}
                onSavePage={vi.fn()}
            />
        )
        expect(screen.getByAltText('Page 1')).toHaveAttribute('src', expect.stringContaining('asset-1'))

        fireEvent.click(screen.getByRole('button', { name: '2' }))
        expect(screen.queryByAltText('Page 2')).not.toBeInTheDocument()
        expect(screen.getByText('Blank page.')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: '3' }))
        expect(screen.getByAltText('Page 3')).toHaveAttribute('src', expect.stringContaining('asset-3'))
    })
})
