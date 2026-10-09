import { useEffect, useState } from 'react'

interface UpdateEvent {
  type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}

function UpdateBanner(): React.JSX.Element | null {
  const [event, setEvent] = useState<UpdateEvent | null>(null)

  useEffect(() => {
    return window.api.updates.onEvent(setEvent as (e: UpdateEvent) => void)
  }, [])

  if (!event || event.type === 'checking' || event.type === 'not-available') return null
  if (event.type === 'error') return null // update failures are non-critical, fail silently

  return (
    <div className="update-banner">
      {event.type === 'available' && (
        <>
          <span>Update {event.version} is available.</span>
          <button className="btn btn-xs btn-on-accent" onClick={() => window.api.updates.download()}>
            Download
          </button>
        </>
      )}
      {event.type === 'downloading' && <span>Downloading update… {event.percent}%</span>}
      {event.type === 'downloaded' && (
        <>
          <span>Update {event.version} ready to install.</span>
          <button className="btn btn-xs btn-on-accent" onClick={() => window.api.updates.quitAndInstall()}>
            Restart & Install
          </button>
        </>
      )}
    </div>
  )
}

export default UpdateBanner
