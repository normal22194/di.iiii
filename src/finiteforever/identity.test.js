import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearIdentity, readStoredIdentity, storeIdentity } from './identity.js'

const STORAGE_KEY = 'ff.identity'

afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
})

describe('readStoredIdentity', () => {
    it('returns null when nothing is stored', () => {
        expect(readStoredIdentity()).toBeNull()
    })

    it('reads back a previously stored identity', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: 'nooo', visible: false }))
        expect(readStoredIdentity()).toEqual({ username: 'nooo', visible: false })
    })

    it('defaults visible to true when omitted', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: 'nooo' }))
        expect(readStoredIdentity()).toEqual({ username: 'nooo', visible: true })
    })

    it('truncates an overlong username to 40 characters', () => {
        const long = 'x'.repeat(60)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: long }))
        expect(readStoredIdentity().username).toHaveLength(40)
    })

    it('returns null when the stored username is missing or empty', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible: true }))
        expect(readStoredIdentity()).toBeNull()
    })

    it('returns null instead of throwing on corrupt JSON', () => {
        window.localStorage.setItem(STORAGE_KEY, '{not valid json')
        expect(readStoredIdentity()).toBeNull()
    })

    it('returns null when localStorage.getItem throws (private mode, etc.)', () => {
        vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })
        expect(readStoredIdentity()).toBeNull()
    })
})

describe('storeIdentity', () => {
    it('persists the identity as JSON under the storage key', () => {
        storeIdentity({ username: 'nooo', visible: true })
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ username: 'nooo', visible: true })
    })

    it('does not throw when localStorage.setItem fails', () => {
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })
        expect(() => storeIdentity({ username: 'nooo', visible: true })).not.toThrow()
    })
})

describe('clearIdentity', () => {
    it('removes any stored identity', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: 'nooo' }))
        clearIdentity()
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('does not throw when localStorage.removeItem fails', () => {
        vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })
        expect(() => clearIdentity()).not.toThrow()
    })
})
