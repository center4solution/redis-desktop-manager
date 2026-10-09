import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { ConnectionProfile, ProfileFormValues } from '../types/connection'

interface Props {
  initial?: ConnectionProfile
  onSubmit: (values: ProfileFormValues) => void
  onCancel: () => void
}

type Errors = Partial<Record<'host' | 'port' | 'db', string>>

// Strict whole-number parse: "6379abc" or "1e3" must not slip through Number().
const parseWhole = (raw: string): number | null => (/^\d+$/.test(raw.trim()) ? Number(raw) : null)

function ConnectionForm({ initial, onSubmit, onCancel }: Props): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [host, setHost] = useState(initial?.host ?? '127.0.0.1')
  const [port, setPort] = useState(String(initial?.port ?? 6379))
  const [username, setUsername] = useState(initial?.username ?? '')
  // Saved passwords never reach the page: leave this empty to keep the saved
  // one, type to replace it, or use "Remove saved password".
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [db, setDb] = useState(String(initial?.db ?? 0))
  const [tls, setTls] = useState(initial?.tls ?? false)
  const [icon, setIcon] = useState<string | undefined>(initial?.icon)
  const [errors, setErrors] = useState<Errors>({})
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({
    state: 'idle'
  })
  const [storage, setStorage] = useState<{ secure: boolean; reason?: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(onCancel)

  useEffect(() => {
    window.api.config
      .storageSecurity()
      .then(setStorage)
      .catch(() => {})
  }, [])

  const hasSavedPassword = Boolean(initial?.hasPassword) && !clearPassword

  // Downscale to a 64x64 PNG so the stored profile stays tiny.
  const handleIconFile = (file: File | undefined): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = 64
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // "cover" crop: fill the square, centred.
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        setIcon(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const validate = (): { values: ProfileFormValues; errors: Errors } => {
    const errs: Errors = {}
    const trimmedHost = host.trim()
    if (!trimmedHost) errs.host = 'Host is required'
    else if (/\s/.test(trimmedHost)) errs.host = 'Host cannot contain spaces'

    const portNum = parseWhole(port)
    if (portNum === null || portNum < 1 || portNum > 65535) errs.port = 'Port must be 1–65535'

    const dbNum = parseWhole(db)
    if (dbNum === null || dbNum > 1_000_000) errs.db = 'DB index must be a whole number ≥ 0'

    return {
      errors: errs,
      values: {
        name: name.trim() || `${trimmedHost}:${port}`,
        host: trimmedHost,
        port: portNum ?? 6379,
        username: username.trim() || undefined,
        password: password || undefined,
        clearPassword: clearPassword || undefined,
        db: dbNum ?? 0,
        tls,
        icon
      }
    }
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const { values, errors: errs } = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit(values)
  }

  const handleTest = async (): Promise<void> => {
    const { values, errors: errs } = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setTest({ state: 'running' })
    try {
      await window.api.redis.test(
        {
          host: values.host,
          port: values.port,
          username: values.username,
          // empty => main falls back to the saved password for this profile
          password: values.password,
          db: values.db,
          tls: values.tls
        },
        clearPassword ? undefined : initial?.id
      )
      setTest({ state: 'ok', message: 'Connection successful' })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setTest({
        state: 'fail',
        message: raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
      })
    }
  }

  // Any edit invalidates the previous test result.
  const touch = (fn: () => void): void => {
    fn()
    if (test.state !== 'idle') setTest({ state: 'idle' })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="connection-form-title">{initial ? 'Edit connection' : 'New connection'}</h2>
        <form className="modal-form" onSubmit={handleSubmit} noValidate>

          <label>
            Name
            <input
              value={name}
              onChange={(e) => touch(() => setName(e.target.value))}
              placeholder="My Redis"
            />
          </label>
          <div className="icon-row" role="group" aria-labelledby="icon-row-label">
            <span id="icon-row-label">Icon</span>
            <div className="icon-picker">
              <span className="icon-preview">
                {icon ? <img src={icon} alt="Selected icon preview" /> : <span className="icon-placeholder" />}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                Choose image…
              </button>
              {icon && (
                <button type="button" className="btn btn-sm" onClick={() => setIcon(undefined)}>
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  handleIconFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <label>
            Host
            <input
              value={host}
              onChange={(e) => touch(() => setHost(e.target.value))}
              className={errors.host ? 'invalid' : ''}
              aria-invalid={Boolean(errors.host)}
              aria-describedby={errors.host ? 'err-host' : undefined}
            />
          </label>
          {errors.host && (
            <p className="field-error" id="err-host" role="alert">
              {errors.host}
            </p>
          )}
          <label>
            Port
            <input
              value={port}
              onChange={(e) => touch(() => setPort(e.target.value))}
              inputMode="numeric"
              className={errors.port ? 'invalid' : ''}
              aria-invalid={Boolean(errors.port)}
              aria-describedby={errors.port ? 'err-port' : undefined}
            />
          </label>
          {errors.port && (
            <p className="field-error" id="err-port" role="alert">
              {errors.port}
            </p>
          )}
          <label>
            Username (optional)
            <input value={username} onChange={(e) => touch(() => setUsername(e.target.value))} />
          </label>
          <label>
            Password (optional)
            <input
              value={password}
              onChange={(e) => touch(() => setPassword(e.target.value))}
              type="password"
              placeholder={hasSavedPassword ? '•••••••• saved — leave empty to keep' : ''}
              autoComplete="new-password"
            />
          </label>
          {hasSavedPassword && (
            <p className="field-hint">
              A password is saved for this connection.{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => touch(() => setClearPassword(true))}
              >
                Remove saved password
              </button>
            </p>
          )}
          {clearPassword && (
            <p className="field-hint">
              The saved password will be removed when you save.{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => touch(() => setClearPassword(false))}
              >
                Undo
              </button>
            </p>
          )}
          {storage && !storage.secure && (
            <p className="field-warning">
              Heads up: {storage.reason}. Saved passwords are only weakly protected on this machine.
            </p>
          )}
          <label>
            DB index
            <input
              value={db}
              onChange={(e) => touch(() => setDb(e.target.value))}
              inputMode="numeric"
              className={errors.db ? 'invalid' : ''}
              aria-invalid={Boolean(errors.db)}
              aria-describedby={errors.db ? 'err-db' : undefined}
            />
          </label>
          {errors.db && (
            <p className="field-error" id="err-db" role="alert">
              {errors.db}
            </p>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={tls}
              onChange={(e) => touch(() => setTls(e.target.checked))}
            />
            Use TLS
          </label>

          {test.state !== 'idle' && (
            <p
              role={test.state === 'fail' ? 'alert' : 'status'}
              className={
                test.state === 'ok'
                  ? 'test-result ok'
                  : test.state === 'fail'
                    ? 'test-result fail'
                    : 'test-result'
              }
            >
              {test.state === 'running' ? 'Testing connection…' : test.message}
            </p>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn test-btn"
              onClick={handleTest}
              disabled={test.state === 'running'}
            >
              Test Connection
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {initial ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ConnectionForm
