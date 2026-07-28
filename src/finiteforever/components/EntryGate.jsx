import { useEffect, useRef, useState } from 'react'

// Blocks entry until a name is given — required either way; "hidden" only
// changes whether *other visitors* see it (admins always see the real name,
// server-side, regardless of this choice).
export default function EntryGate({ onEnter, isAdmin }) {
    const [username, setUsername] = useState('')
    const [visible, setVisible] = useState(true)
    const inputRef = useRef(null)
    // Ref-based focus instead of the autoFocus prop (jsx-a11y/no-autofocus) —
    // same effect, just not the flagged attribute.
    useEffect(() => { inputRef.current?.focus() }, [])

    const submit = (e) => {
        e.preventDefault()
        const trimmed = username.trim()
        if (!trimmed) return
        onEnter({ username: trimmed, visible: isAdmin ? true : visible })
    }

    return (
        <div className="ff-entry-gate">
            <form className="ff-entry-gate__card" onSubmit={submit}>
                <span className="ff-entry-gate__title">FINITE FOREVER</span>
                <p className="ff-entry-gate__line">Before you enter — what should we call you?</p>
                <input
                    ref={inputRef}
                    type="text"
                    className="ff-entry-gate__input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your name"
                    maxLength={40}
                    required
                />

                {isAdmin ? (
                    <p className="ff-entry-gate__note">
                        Signed in as admin — your name is always visible to others.
                    </p>
                ) : (
                    <>
                        <div className="ff-entry-gate__visibility">
                            <label>
                                <input type="radio" name="ff-visibility" checked={visible} onChange={() => setVisible(true)} />
                                Visible to others
                            </label>
                            <label>
                                <input type="radio" name="ff-visibility" checked={!visible} onChange={() => setVisible(false)} />
                                Hidden from others
                            </label>
                        </div>
                        <p className="ff-entry-gate__note">
                            {visible
                                ? 'Others will see your name in the ritual log and on what you claim.'
                                : 'Others will see "an anonymous visitor" instead of your name — you still need to enter one.'}
                        </p>
                    </>
                )}

                <button type="submit" className="ff-button ff-button--primary">Enter</button>
            </form>
        </div>
    )
}
