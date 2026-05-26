import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Camera, LockKeyhole, Menu, QrCode, ShieldCheck, UploadCloud, X } from 'lucide-react'
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
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'mp4', 'mov'])

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

function isAllowedFile(file: File) {
  if (file.type && ALLOWED_TYPES.has(file.type)) return true

  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension ? ALLOWED_EXTENSIONS.has(extension) : false
}

function validateFiles(files: File[]) {
  if (files.length > MAX_FILES) return `Please choose ${MAX_FILES} files or fewer at a time.`
  const unsupported = files.find((file) => !isAllowedFile(file))
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

type NavLink = { href: string; label: string }

function AppHeader({ links = [] }: { links?: NavLink[] }) {
  const [open, setOpen] = useState(false)
  const navLinks = links.length > 0 ? links : [{ href: '/', label: 'Home' }]

  return (
    <header className="app-header">
      <a className="brand-mark" href="/" aria-label="Wedding Photo Drop home">
        <Camera aria-hidden="true" size={20} />
        <span>Wedding Photo Drop</span>
      </a>
      <button className="mobile-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
      </button>
      <nav className={`app-nav ${open ? 'open' : ''}`} aria-label="Primary navigation">
        {navLinks.map((link) => <a key={`${link.href}-${link.label}`} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
      </nav>
    </header>
  )
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
        <AppHeader links={[{ href: '#how-it-works', label: 'How it works' }, { href: '#local-links', label: 'Event links' }]} />

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Private wedding gallery</p>
            <h1>Your favorite moments, collected in one beautiful place.</h1>
            <p className="lede">Guests scan a private QR code, share photos and videos from their phones, and the couple gets a clean gallery of approved memories.</p>
            <div className="hero-actions">
              {devEvents[0] ? (
                <a className="button primary" href={devEvents[0].upload_path}>Open guest upload <ArrowRight aria-hidden="true" size={18} /></a>
              ) : (
                <a className="button primary" href="#link-launcher">Open an event link <ArrowRight aria-hidden="true" size={18} /></a>
              )}
              <a className="button ghost" href="#how-it-works">See how it works</a>
            </div>
          </div>

          <div className="hero-board" aria-label="Product workflow preview">
            <div className="board-card board-card-large">
              <div className="icon-pill"><QrCode aria-hidden="true" size={22} /></div>
              <span>Guest QR code</span>
              <strong>Scan and share</strong>
            </div>
            <div className="board-card">
              <div className="icon-pill"><UploadCloud aria-hidden="true" size={22} /></div>
              <span>Shared moments</span>
              <strong>Ready to review</strong>
            </div>
            <div className="board-card dark">
              <div className="icon-pill"><ShieldCheck aria-hidden="true" size={22} /></div>
              <span>Private review</span>
              <strong>Choose what appears</strong>
            </div>
            <div className="board-card gallery-card">
              <div className="gallery-mosaic" aria-hidden="true"><i /><i /><i /><i /></div>
              <span>Wedding gallery</span>
              <strong>The best moments together</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section split-section" id="how-it-works">
        <div>
          <p className="eyebrow">How it works</p>
          <h2>A simple flow for guests, couples, and trusted reviewers.</h2>
          <p className="muted large-copy">Share one private upload link with guests, review incoming photos and videos, then publish the moments you want everyone to see.</p>
        </div>
        <div className="steps-card">
          <div><span>01</span><strong>Create the event</strong><p>Each event gets a private guest link, review link, and gallery link.</p></div>
          <div><span>02</span><strong>Share the QR code</strong><p>Guests scan once and upload right from their phone.</p></div>
          <div><span>03</span><strong>Curate the gallery</strong><p>Only approved photos and videos appear in the shared gallery.</p></div>
        </div>
      </section>

      <section className="home-section link-section" id="link-launcher">
        <div className="link-card">
          <div>
            <p className="eyebrow">Open your event</p>
            <h2>Have a private code? Jump straight in.</h2>
          </div>
          <form className="token-form" onSubmit={openTokenPath}>
            <select value={destination} onChange={(event) => setDestination(event.target.value as 'upload' | 'gallery' | 'admin')} aria-label="Link type">
              <option value="upload">Guest upload</option>
              <option value="gallery">Gallery</option>
              <option value="admin">Review uploads</option>
            </select>
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" aria-label="Private event token" />
            <button className="button primary" type="submit">Open</button>
          </form>
        </div>
      </section>

      {isLocalHost() && (
        <section className="home-section dev-section" id="local-links">
          <div className="section-heading">
            <p className="eyebrow">Event links</p>
            <h2>Leon & Kami's wedding</h2>
            <p className="muted">Use these links to try the guest upload, gallery, and review experience.</p>
          </div>
          {devEvents.length === 0 ? (
            <div className="empty-dev-card">
              <LockKeyhole aria-hidden="true" size={24} />
              <strong>No event links are available yet.</strong>
              <p>Once an event is created, its guest upload, gallery, and review links will appear here.</p>
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
                    <a className="button dark-button" href={event.admin_path}>Review uploads</a>
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
    <main className="app-page">
      <AppHeader links={[{ href: '/', label: 'Home' }, { href: `/gallery/${eventToken}`, label: 'Gallery' }]} />
      <section className="shell">
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
    <main className="app-page">
      <AppHeader links={[{ href: '/', label: 'Home' }, { href: `/upload/${eventToken}`, label: 'Upload' }]} />
      <section className="shell wide">
      <section className="card">
        <p className="eyebrow">Approved gallery</p>
        <h1>{event?.name || 'Gallery'}</h1>
        <p className="lede">Only admin-approved uploads appear here.</p>
        {error && <p className="alert error">{error}</p>}
        {uploads.length === 0 ? <p className="muted">No approved uploads yet.</p> : <MediaGrid uploads={uploads} />}
      </section>
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
    <main className="app-page">
      <AppHeader links={payload ? [{ href: '/', label: 'Home' }, { href: uploadUrl, label: 'Guest upload' }, { href: galleryUrl, label: 'Gallery' }] : [{ href: '/', label: 'Home' }]} />
      <section className="shell wide">
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
