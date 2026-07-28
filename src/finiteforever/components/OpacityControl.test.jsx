import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OpacityControl from './OpacityControl.jsx'

describe('OpacityControl', () => {
    it('displays opacity as a rounded percentage', () => {
        render(<OpacityControl opacity={0.42} onChange={vi.fn()} />)
        expect(screen.getByText('42%')).toBeInTheDocument()
    })

    it('reports the new opacity as a number on change', () => {
        const onChange = vi.fn()
        render(<OpacityControl opacity={1} onChange={onChange} />)
        fireEvent.change(screen.getByRole('slider'), { target: { value: '0.65' } })
        expect(onChange).toHaveBeenCalledWith(0.65)
    })

    it('disables the slider while busy', () => {
        render(<OpacityControl opacity={1} onChange={vi.fn()} busy />)
        expect(screen.getByRole('slider')).toBeDisabled()
    })
})
