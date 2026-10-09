import { useEffect, useRef, useState } from 'react'
import { useCliStore } from '../store/cliStore'

interface Props {
  connId: string
  focusRef?: React.MutableRefObject<(() => void) | null>
}

function CliConsole({ connId, focusRef }: Props): React.JSX.Element {
  const state = useCliStore((s) => s.getState(connId))
  const run = useCliStore((s) => s.run)
  const clear = useCliStore((s) => s.clear)

  const [input, setInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focusRef) return
    focusRef.current = () => inputRef.current?.focus()
    return () => {
      focusRef.current = null
    }
  }, [focusRef])

  const submit = async (): Promise<void> => {
    const cmd = input
    setInput('')
    setHistoryIndex(null)
    await run(connId, cmd)
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (state.history.length === 0) return
      const nextIndex =
        historyIndex === null ? state.history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setInput(state.history[nextIndex])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === null) return
      const nextIndex = historyIndex + 1
      if (nextIndex >= state.history.length) {
        setHistoryIndex(null)
        setInput('')
      } else {
        setHistoryIndex(nextIndex)
        setInput(state.history[nextIndex])
      }
    }
  }

  return (
    <div className="cli-console">
      <div className="cli-header">
        <h2>CLI</h2>
        <button className="btn btn-xs" onClick={() => clear(connId)}>
          Clear
        </button>
      </div>

      <div className="cli-output" ref={scrollRef} role="log" aria-label="Command output" tabIndex={0}>
        {state.entries.map((entry, i) => (
          <div key={i} className="cli-entry">
            <div className="cli-command">
              <span className="cli-prompt">&gt;</span> {entry.command}
            </div>
            {entry.error ? (
              <pre className="cli-result cli-error">{entry.error}</pre>
            ) : (
              <pre className="cli-result">{entry.result}</pre>
            )}
          </div>
        ))}
        {state.entries.length === 0 && <p className="empty">Run a raw Redis command, e.g. INFO server</p>}
      </div>

      <input
        ref={inputRef}
        aria-label="Redis command"
        className="cli-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="SET foo bar"
        spellCheck={false}
      />
    </div>
  )
}

export default CliConsole
