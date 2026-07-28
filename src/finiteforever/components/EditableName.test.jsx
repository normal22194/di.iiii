import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditableName from './EditableName.jsx'

describe('EditableName', () => {
    it('shows the value as plain text until double-clicked', () => {
        render(<EditableName value="Box mark" onChange={vi.fn()} />)
        expect(screen.getByText('Box mark')).toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('double-click enters edit mode, Enter commits a trimmed non-empty value', () => {
        const onChange = vi.fn()
        render(<EditableName value="Box mark" onChange={onChange} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))

        const input = screen.getByRole('textbox')
        expect(input).toHaveValue('Box mark')
        fireEvent.change(input, { target: { value: '  My favorite box  ' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(onChange).toHaveBeenCalledWith('My favorite box')
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('commits on blur too', () => {
        const onChange = vi.fn()
        render(<EditableName value="Box mark" onChange={onChange} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'Renamed' } })
        fireEvent.blur(input)
        expect(onChange).toHaveBeenCalledWith('Renamed')
    })

    it('Escape cancels without calling onChange', () => {
        const onChange = vi.fn()
        render(<EditableName value="Box mark" onChange={onChange} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'Something else' } })
        fireEvent.keyDown(input, { key: 'Escape' })

        expect(onChange).not.toHaveBeenCalled()
        expect(screen.getByText('Box mark')).toBeInTheDocument()
    })

    it('does not call onChange when committing an empty or unchanged value', () => {
        const onChange = vi.fn()
        render(<EditableName value="Box mark" onChange={onChange} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
        expect(onChange).not.toHaveBeenCalled()

        fireEvent.doubleClick(screen.getByText('Box mark'))
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
        expect(onChange).not.toHaveBeenCalled()
    })

    it('Enter key while focused also enters edit mode (keyboard equivalent of double-click)', () => {
        render(<EditableName value="Box mark" onChange={vi.fn()} />)
        fireEvent.keyDown(screen.getByText('Box mark'), { key: 'Enter' })
        expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('does not enter edit mode when disabled', () => {
        render(<EditableName value="Box mark" onChange={vi.fn()} disabled />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
})
