import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Camera, LockKeyhole, QrCode, ShieldCheck, UploadCloud } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

type EventRecord = {
  id: number
  name: string
  slug: string
  upload_token: string
  admin_token?: string
  public_gallery_enabled: boolean
  uploads_enabled: boolean
}

type DevEvent = {
  id: number
  name: string
  slug: string
  upload_path: string
  gallery_path: string
  admin_path: string
  uploads_enabled: boolean
  public_gallery_enabled: boolean
}

type MediaUpload = {
  id: number
  guest_name: string | null
  guest_message: string | null
  status: 'pending' | 'approved' | 'rejected'
  media_kind: 'image' | 'video' | 'other'
  original_filename: string
  content_type: string
  file_size: number
  file_url: string | null
  created_at: string
}

type AdminPayload = {
  event: EventRecord
  counts: { pending: number; approved: number; rejected: number; total: number }
  uploads: MediaUpload[]
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const MAX_FILES = 20
const MAX_FILE_SIZE = 250 * 1024 * 1024
const MAX_BATCH_SIZE = 500 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'video/mp4', 'video/quicktime'])

function pathParts() {
  return window.location.pathname.split('/').filter(Boolean)
}

function isLocalHost() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
  return data as T
}

function validateFiles(files: File[]) {
  if (files.length > MAX_FILES) return `Please choose ${MAX_FILES} files or fewer at a time.`
  const unsupported = files.find((file) => !ALLOWED_TYPES.has(file.type))
  if (unsupported) return 'Uploads must be JPEG, PNG, HEIC, WebP, MP4, or MOV files.'
  const oversized = files.find((file) => file.size > MAX_FILE_SIZE)
  if (oversized) return `Each file must be ${formatBytes(MAX_FILE_SIZE)} or smaller.`
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > MAX_BATCH_SIZE) return `Please upload ${formatBytes(MAX_BATCH_SIZE)} or less at a time.`
  return null
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function App() {
  const parts = pathParts()
  const [mode, token] = [parts[0], parts[1]]

  if (mode === 'admin' && token) return <AdminPage adminToken={token} />
  if (mode === 'gallery' && token) return <GalleryPage eventToken={token} />
  if (mode === 'upload' && token) return <UploadPage eventToken={token} />
  return <HomePage />
}

function HomePage() {
  const [token, setToken] = useState('')
  const [destination, setDestination] = useState<'upload' | 'gallery' | 'admin'>('upload')
  const [devEvents, setDevEvents] = useState<DevEvent[]>([])

  useEffect(() => {
    if (!isLocalHost()) return

    apiJson<{ events: DevEvent[] }>('/api/v1/dev/events')
      .then((data) => setDevEvents(data.events))
      .catch(() => setDevEvents([]))
  }, [])

  function openTokenPath(eventObj: React.FormEvent) {
    eventObj.preventDefault()
    const cleanToken = token.trim()
    if (!cleanToken) return
    window.location.href = `/${destination}/${cleanToken}`
  }

  return (
    <main className="home-page">
      <section className="home-hero">
        <nav className="topbar" aria-label="Primary navigation">
          <a className="brand-mark" href="/" aria-label="Wedding Photo Drop home">
            <Camera aria-hidden="true" size={20} />
            <span>Wedding Photo Drop</span>
          </a>
          <div className="topbar-links">
            <a href="#how-it-works">How it works</a>
            <a href="#local-links">Local links</a>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Private event media collection</p>
            <h1>Every guest photo, gathered without making guests log in.</h1>
            <p className="lede">A private QR link lets guests upload from their phones. Admins review every file before anything appears in the public gallery.</p>
            <div className="hero-actions">
              {devEvents[0] ? (
                <a className="button primary" href={devEvents[0].upload_path}>Open seeded upload <ArrowRight aria-hidden="true" size={18} /></a>
              ) : (
                <a className="button primary" href="#link-launcher">Open an event link <ArrowRight aria-hidden="true" size={18} /></a>
              )}
              <a className="button ghost" href="#how-it-works">See the workflow</a>
            </div>
          </div>

          <div className="hero-board" aria-label="Product workflow preview">
            <div className="board-card board-card-large">
              <div className="icon-pill"><QrCode aria-hidden="true" size={22} /></div>
              <span>Guest QR link</span>
              <strong>/upload/private-token</strong>
            </div>
            <div className="board-card">
              <div className="icon-pill"><UploadCloud aria-hidden="true" size={22} /></div>
              <span>Pending uploads</span>
              <strong>Review queue</strong>
            </div>
            <div className="board-card dark">
              <div className="icon-pill"><ShieldCheck aria-hidden="true" size={22} /></div>
              <span>Admin only</span>
              <strong>Approve or reject</strong>
            </div>
            <div className="board-card gallery-card">
              <div className="gallery-mosaic" aria-hidden="true"><i /><i /><i /><i /></div>
              <span>Public gallery</span>
              <strong>Approved media only</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section split-section" id="how-it-works">
        <div>
          <p className="eyebrow">How links work</p>
          <h2>No admin sign-in yet. For MVP, access is through secret links.</h2>
          <p className="muted large-copy">Guests get a QR code or private upload URL. Admins use the separate admin URL printed by the seed task. Real account-based admin sign-in can come later when this moves beyond MVP/dogfood.</p>
        </div>
        <div className="steps-card">
          <div><span>01</span><strong>Run seeds</strong><p><code>cd api && bin/rails db:seed</code> prints upload, gallery, and admin paths.</p></div>
          <div><span>02</span><strong>Share the QR</strong><p>The admin page generates the guest QR for the upload URL.</p></div>
          <div><span>03</span><strong>Moderate</strong><p>Approvals happen on the secret admin review page.</p></div>
        </div>
      </section>

      <section className="home-section link-section" id="link-launcher">
        <div className="link-card">
          <div>
            <p className="eyebrow">Open a private link</p>
            <h2>Paste a token if you already have one.</h2>
          </div>
          <form className="token-form" onSubmit={openTokenPath}>
            <select value={destination} onChange={(event) => setDestination(event.target.value as 'upload' | 'gallery' | 'admin')} aria-label="Link type">
              <option value="upload">Guest upload</option>
              <option value="gallery">Gallery</option>
              <option value="admin">Admin review</option>
            </select>
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" aria-label="Private event token" />
            <button className="button primary" type="submit">Open</button>
          </form>
        </div>
      </section>

      {isLocalHost() && (
        <section className="home-section dev-section" id="local-links">
          <div className="section-heading">
            <p className="eyebrow">Local development</p>
            <h2>Seeded event links</h2>
            <p className="muted">These only appear on localhost and come from the development API.</p>
          </div>
          {devEvents.length === 0 ? (
            <div className="empty-dev-card">
              <LockKeyhole aria-hidden="true" size={24} />
              <strong>No local seed event found yet.</strong>
              <p>Start the Rails API and run <code>cd api && bin/rails db:seed</code>. The seed task also prints the exact paths in your terminal.</p>
            </div>
          ) : (
            <div className="dev-grid">
              {devEvents.map((event) => (
                <article className="dev-event-card" key={event.id}>
                  <div>
                    <p className="eyebrow">{event.slug}</p>
                    <h3>{event.name}</h3>
                  </div>
                  <div className="dev-links">
                    <a className="button primary" href={event.upload_path}>Guest upload</a>
                    <a className="button ghost" href={event.gallery_path}>Gallery</a>
                    <a className="button dark-button" href={event.admin_path}>Admin review</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function UploadPage({ eventToken }: { eventToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [guestName, setGuestName] = useState('')
  const [guestMessage, setGuestMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    apiJson<{ event: EventRecord }>(`/api/v1/events/${eventToken}`)
      .then((data) => setEvent(data.event))
      .catch((err) => setError(err.message))
  }, [eventToken])

  async function submit(eventObj: React.FormEvent) {
    eventObj.preventDefault()
    if (files.length === 0) {
      setError('Choose at least one photo or video first.')
      return
    }

    const validationError = validateFiles(files)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    setError(null)
    setNotice(null)

    const form = new FormData()
    form.append('guest_name', guestName)
    form.append('guest_message', guestMessage)
    files.forEach((file) => form.append('files[]', file))

    try {
      const data = await apiJson<{ uploads: MediaUpload[] }>(`/api/v1/events/${eventToken}/uploads`, {
        method: 'POST',
        body: form,
      })
      setNotice(`${data.uploads.length} upload${data.uploads.length === 1 ? '' : 's'} received. Thank you!`)
      setFiles([])
      const input = document.getElementById('files') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">Guest upload</p>
        <h1>{event?.name || 'Event photos'}</h1>
        <p className="lede">Share the photos and videos you captured. They’ll go to a private review queue first.</p>

        <form className="stack" onSubmit={submit}>
          <label>
            Your name <span className="muted">optional</span>
            <input value={guestName} maxLength={80} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Uncle Joe" />
          </label>

          <label>
            Message <span className="muted">optional</span>
            <textarea value={guestMessage} maxLength={1000} onChange={(e) => setGuestMessage(e.target.value)} placeholder="Say something sweet…" rows={3} />
          </label>

          <label className="dropzone" htmlFor="files">
            <strong>Choose photos/videos</strong>
            <span>{files.length > 0 ? `${files.length} file(s) selected` : 'Tap to select multiple files from your phone'}</span>
            <input id="files" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,video/mp4,video/quicktime" multiple onChange={(e) => {
              const nextFiles = Array.from(e.target.files || [])
              setFiles(nextFiles)
              setError(validateFiles(nextFiles))
            }} />
          </label>

          {files.length > 0 && <ul className="file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name} · {formatBytes(file.size)}</li>)}</ul>}

          {error && <p className="alert error">{error}</p>}
          {notice && <p className="alert success">{notice}</p>}

          <button className="button primary" disabled={uploading || event?.uploads_enabled === false}>{uploading ? 'Uploading…' : event?.uploads_enabled === false ? 'Uploads closed' : 'Upload memories'}</button>
          <a className="button ghost" href={`/gallery/${eventToken}`}>View approved gallery</a>
        </form>
      </section>
    </main>
  )
}

function GalleryPage({ eventToken }: { eventToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null)
  const [uploads, setUploads] = useState<MediaUpload[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiJson<{ event: EventRecord; uploads: MediaUpload[] }>(`/api/v1/events/${eventToken}/gallery`)
      .then((data) => { setEvent(data.event); setUploads(data.uploads) })
      .catch((err) => setError(err.message))
  }, [eventToken])

  return (
    <main className="shell wide">
      <section className="card">
        <p className="eyebrow">Approved gallery</p>
        <h1>{event?.name || 'Gallery'}</h1>
        <p className="lede">Only admin-approved uploads appear here.</p>
        {error && <p className="alert error">{error}</p>}
        {uploads.length === 0 ? <p className="muted">No approved uploads yet.</p> : <MediaGrid uploads={uploads} />}
      </section>
    </main>
  )
}

function AdminPage({ adminToken }: { adminToken: string }) {
  const [payload, setPayload] = useState<AdminPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const uploadUrl = useMemo(() => payload ? `${window.location.origin}/upload/${payload.event.upload_token}` : '', [payload])
  const galleryUrl = useMemo(() => payload ? `${window.location.origin}/gallery/${payload.event.upload_token}` : '', [payload])

  async function refreshAdmin() {
    try {
      const data = await apiJson<AdminPayload>('/api/v1/admin/event', { headers: { 'X-Admin-Token': adminToken } })
      setPayload(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin page')
    }
  }

  useEffect(() => {
    let ignore = false

    apiJson<AdminPayload>('/api/v1/admin/event', { headers: { 'X-Admin-Token': adminToken } })
      .then((data) => {
        if (!ignore) {
          setPayload(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Could not load admin page')
      })

    return () => { ignore = true }
  }, [adminToken])

  async function act(id: number, action: 'approve' | 'reject') {
    setBusyId(id)
    try {
      await apiJson(`/api/v1/admin/uploads/${id}/${action}`, { method: 'PATCH', headers: { 'X-Admin-Token': adminToken } })
      await refreshAdmin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="shell wide">
      <section className="card">
        <p className="eyebrow">Admin review</p>
        <h1>{payload?.event.name || 'Event admin'}</h1>
        {error && <p className="alert error">{error}</p>}

        {payload && (
          <>
            <div className="admin-links">
              <div>
                <h2>Guest upload QR</h2>
                <QRCodeSVG value={uploadUrl} size={164} />
                <a href={uploadUrl}>{uploadUrl}</a>
              </div>
              <div>
                <h2>Public gallery</h2>
                <a className="button ghost" href={galleryUrl}>Open gallery</a>
                <p className="muted">Pending: {payload.counts.pending} · Approved: {payload.counts.approved} · Rejected: {payload.counts.rejected}</p>
              </div>
            </div>

            {payload.uploads.length === 0 ? <p className="muted">No uploads yet.</p> : (
              <div className="review-list">
                {payload.uploads.map((upload) => (
                  <article className={`review-card ${upload.status}`} key={upload.id}>
                    <MediaPreview upload={upload} />
                    <div className="review-body">
                      <strong>{upload.guest_name || 'Anonymous guest'}</strong>
                      {upload.guest_message && <p>{upload.guest_message}</p>}
                      <p className="muted">{upload.original_filename} · {formatBytes(upload.file_size)} · {upload.status}</p>
                      <div className="actions">
                        <button className="button primary" disabled={busyId === upload.id} onClick={() => act(upload.id, 'approve')}>Approve</button>
                        <button className="button danger" disabled={busyId === upload.id} onClick={() => act(upload.id, 'reject')}>Reject</button>
                        {upload.file_url && <a className="button ghost" href={upload.file_url} target="_blank" rel="noopener noreferrer">Open</a>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function MediaGrid({ uploads }: { uploads: MediaUpload[] }) {
  return <div className="media-grid">{uploads.map((upload) => <MediaPreview key={upload.id} upload={upload} />)}</div>
}

function MediaPreview({ upload }: { upload: MediaUpload }) {
  if (!upload.file_url) return <div className="placeholder">No preview</div>
  if (upload.media_kind === 'video') return <video src={upload.file_url} controls playsInline />
  return <img src={upload.file_url} alt={upload.guest_message || upload.original_filename} loading="lazy" referrerPolicy="no-referrer" />
}

export default App
