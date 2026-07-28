import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ClaimPrompt from './ClaimPrompt.jsx'

function makeEntity(overrides = {}) {
    return {
        id: 'mark-1',
        type: 'box',
        name: 'Box mark',
        components: {
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            appearance: { color: '#9fd8ff', opacity: 1 },
            permanence: { status: 'drifting', placedAt: Date.now(), placedBy: 'nooo', placedByVisible: true, ...overrides }
        }
    }
}

const noop = () => {}
const baseProps = {
    pool: { total: 5, claimed: 1 },
    onConfirm: noop, onDismiss: noop, onRecolor: noop, onDuplicate: noop, onDelete: noop, onRename: noop,
    onNudge: noop, onAxisDragChange: noop, onScaleNudge: noop, onScaleDragChange: noop,
    onRotationNudge: noop, onRotationDragChange: noop, onOpacityChange: noop, onTextChange: noop,
    onOpenAdvanced: noop, isAdmin: false, busy: false
}

describe('ClaimPrompt — name and Advanced button', () => {
    it('shows the object name and who placed it', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} />)
        expect(screen.getByText('Box mark')).toBeInTheDocument()
        expect(screen.getByText('placed by nooo')).toBeInTheDocument()
    })

    it('masks the placer name for non-admins when placedByVisible is false', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity({ placedByVisible: false })} />)
        expect(screen.getByText('placed by an anonymous visitor')).toBeInTheDocument()
    })

    it('renaming the object calls onRename, not any of the transform/appearance handlers', () => {
        const onRename = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} onRename={onRename} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My favorite box' } })
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
        expect(onRename).toHaveBeenCalledWith('My favorite box')
    })

    it('the Advanced button opens the separate advanced window, not a collapsible section', () => {
        const onOpenAdvanced = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} onOpenAdvanced={onOpenAdvanced} />)
        fireEvent.click(screen.getByRole('button', { name: 'Advanced…' }))
        expect(onOpenAdvanced).toHaveBeenCalledTimes(1)
        // Not a CollapsibleSection: no expandable section body appears from this click.
        expect(screen.queryByText('No advanced settings yet.')).not.toBeInTheDocument()
    })
})
