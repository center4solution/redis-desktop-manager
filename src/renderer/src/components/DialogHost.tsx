import { useState } from 'react'
import { useDialogStore, type DialogRequest } from '../store/dialogStore'
import { useFocusTrap } from '../hooks/useFocusTrap'

// Renders whatever confirm()/prompt() call is currently pending, anywhere in
// the app, via useDialogStore. Mounted once in App.
function DialogHost(): React.JSX.Element | null {
  const current = useDialogStore((s) => s.current)
  if (!current) return null
  // Keyed so each new request gets a fresh form (and a fresh focus trap).
  return <DialogForm key={current.id} current={current} />
}

function DialogForm({ current }: { current: DialogRequest }): React.JSX.Element {
  const submit = useDialogStore((s) => s.submit)
  const cancel = useDialogStore((s) => s.cancel)
  const [value, setValue] = useState(current.kind === 'prompt' ? current.defaultValue : '')
  const dialogRef = useFocusTrap<HTMLDivElement>(cancel, current.opener)

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    submit(current.kind === 'prompt' ? value : true)
  }

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div
        ref={dialogRef}
        className="modal"
        // A confirm is an interruption that needs an answer; announce it as such.
        role={current.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="modal-form" onSubmit={handleSubmit}>
          <p className="dialog-message" id="dialog-message">
            {current.message}
          </p>

          {current.kind === 'prompt' && (
            <input
              autoFocus
              aria-labelledby="dialog-message"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
            <button
              type="submit"
              className={current.kind === 'confirm' ? 'btn btn-danger' : 'btn btn-primary'}
              autoFocus={current.kind === 'confirm'}
            >
              {current.kind === 'confirm' ? 'Confirm' : 'OK'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DialogHost
