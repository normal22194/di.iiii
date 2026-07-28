import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdvancedSettingsPanel from './AdvancedSettingsPanel.jsx'

vi.mock('./PagesPanel.jsx', () => ({
    default: ({ isOwner }) => <div>pages-panel isOwner={String(isOwner)}</div>
}))

function makeEntity(permanenceOverrides = {}) {
    return {
        id: 'mark-1',
        type: 'box',
        name: 'Box mark',
        components: {
            pages: { active: 0, items: [] },
            permanence: {
                placedBy: 'nooo',
                placedByVisible: true,
                ...permanenceOverrides
            }
        }
    }
}

describe('AdvancedSettingsPanel', () => {
    it('renders nothing when there is no entity', () => {
        const { container } = render(<AdvancedSettingsPanel entity={null} onClose={vi.fn()} onRename={vi.fn()} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('shows the object name and who placed it', () => {
        render(<AdvancedSettingsPanel entity={makeEntity()} onClose={vi.fn()} onRename={vi.fn()} />)
        expect(screen.getByText('Box mark')).toBeInTheDocument()
        expect(screen.getByText('nooo')).toBeInTheDocument()
    })

    it('masks the placer name for non-admins when placedByVisible is false', () => {
        render(<AdvancedSettingsPanel entity={makeEntity({ placedByVisible: false })} isAdmin={false} onClose={vi.fn()} onRename={vi.fn()} />)
        expect(screen.getByText('an anonymous visitor')).toBeInTheDocument()
        expect(screen.queryByText('nooo')).not.toBeInTheDocument()
    })

    it('shows the real placer name for admins even when placedByVisible is false', () => {
        render(<AdvancedSettingsPanel entity={makeEntity({ placedByVisible: false })} isAdmin onClose={vi.fn()} onRename={vi.fn()} />)
        expect(screen.getByText('nooo')).toBeInTheDocument()
    })

    it('renames the object via double-click, same as the main edit panel', () => {
        const onRename = vi.fn()
        render(<AdvancedSettingsPanel entity={makeEntity()} onClose={vi.fn()} onRename={onRename} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'Renamed' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onRename).toHaveBeenCalledWith('Renamed')
    })

    it('calls onClose from its own close button', () => {
        const onClose = vi.fn()
        render(<AdvancedSettingsPanel entity={makeEntity()} onClose={onClose} onRename={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('treats a case/whitespace-insensitive match between actorLabel and placedBy as the owner', () => {
        render(<AdvancedSettingsPanel entity={makeEntity()} actorLabel="  NoOo  " onClose={vi.fn()} onRename={vi.fn()} />)
        expect(screen.getByText('pages-panel isOwner=true')).toBeInTheDocument()
    })

    it('is not the owner when actorLabel does not match placedBy', () => {
        render(<AdvancedSettingsPanel entity={makeEntity()} actorLabel="someone else" onClose={vi.fn()} onRename={vi.fn()} />)
        expect(screen.getByText('pages-panel isOwner=false')).toBeInTheDocument()
    })

    it('admins always count as the owner, regardless of actorLabel', () => {
        render(<AdvancedSettingsPanel entity={makeEntity()} actorLabel="someone else" isAdmin onClose={vi.fn()} onRename={vi.fn()} />)
        expect(screen.getByText('pages-panel isOwner=true')).toBeInTheDocument()
    })
})
