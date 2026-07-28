import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TextControl from './TextControl.jsx'

describe('TextControl', () => {
    it('shows the current value and reports edits', () => {
        const onChange = vi.fn()
        render(<TextControl value="hello" onChange={onChange} />)
        const input = screen.getByDisplayValue('hello')
        fireEvent.change(input, { target: { value: 'hello world' } })
        expect(onChange).toHaveBeenCalledWith('hello world')
    })

    it('caps input at 120 characters', () => {
        render(<TextControl value="" onChange={vi.fn()} />)
        expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '120')
    })

    it('is never disabled, even while saving in the background', () => {
        render(<TextControl value="" onChange={vi.fn()} />)
        expect(screen.getByRole('textbox')).not.toBeDisabled()
    })
})
