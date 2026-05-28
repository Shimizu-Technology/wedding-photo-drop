import { useCallback, useEffect, useRef, useState } from 'react'
import { DirectUpload, type DirectUploadBlob } from '@rails/activestorage'
import { ArrowRight, Camera, Menu, QrCode, ShieldCheck, UploadCloud, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { AdminLoginButton, AdminSignOutButton, RequireAdmin, useAppAuth, useAuthHeaders } from './auth'
import './App.css'

type EventRecord = {
  id: number
  name: string
  slug: string
  upload_token: string
  admin_token?: string
  public_gallery_enabled: boolean
  uploads_enabled: boolean
  counts?: Counts
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

type Counts = { pending: number; approved: number; rejected: number; total: number }

type AlbumSection = {
  id: number
  event_id: number
  name: string
  slug: string
  description: string | null
  sort_order: number
  visible: boolean
  uploads_count?: number
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
  album_section_id: number | null
  album_section?: Pick<AlbumSection, 'id' | 'name' | 'slug'> | null
  sort_order: number
  file_url: string | null
  created_at: string
}

type AdminPayload = {
  event: EventRecord
  album_sections: AlbumSection[]
  counts: Counts
  pagination?: { limit: number; offset: number; next_offset: number | null }
  uploads: MediaUpload[]
}

type AdminEventsPayload = { events: Array<EventRecord & { counts: Counts }> }

type AdminUser = { id: number; full_name: string; email: string; role: string; active: boolean; is_super_admin?: boolean; invitation_pending?: boolean; invitation_status?: string; first_name?: string | null; last_name?: string | null; invited_at?: string | null; last_sign_in_at?: string | null }

type EventMembership = { id: number; event_id: number; role: string; active: boolean; invited_at?: string | null; user: AdminUser }

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const MAX_FILES = 100
const UPLOAD_CHUNK_MAX_FILES = 20
const MAX_FILE_SIZE = 250 * 1024 * 1024
const MAX_BATCH_SIZE = 2 * 1024 * 1024 * 1024
const API_PAGE_LIMIT = 48
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'video/mp4', 'video/quicktime'])
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'mp4', 'mov'])

type NavLink = { href: string; label: string }

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

function directUploadFile(file: File): Promise<DirectUploadBlob> {
  return new Promise((resolve, reject) => {
    const upload = new DirectUpload(file, `${API_BASE_URL}/rails/active_storage/direct_uploads`)
    upload.create((error, blob) => {
      if (error) reject(new Error(error))
      else if (blob) resolve(blob)
      else reject(new Error('Direct upload did not return a blob'))
    })
  })
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
  const empty = files.find((file) => file.size <= 0)
  if (empty) return 'Uploads cannot be empty files.'
  const longName = files.find((file) => file.name.length > 255)
  if (longName) return 'Filenames must be 255 characters or fewer.'
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
  const [mode, token, nestedId] = [parts[0], parts[1], parts[2]]

  if (mode === 'admin' && token === 'events' && nestedId) return <AdminEventRoute eventId={nestedId} />
  if (mode === 'admin' && token === 'users') return <AdminRoute />
  if (mode === 'admin') return <AdminRoute />
  if (mode === 'gallery' && token) return <GalleryPage eventToken={token} />
  if (mode === 'upload' && token) return <UploadPage eventToken={token} />
  return <HomePage />
}

function AppHeader({ links = [], admin = false }: { links?: NavLink[]; admin?: boolean }) {
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
        {admin && <AdminSignOutButton />}
      </nav>
    </header>
  )
}

function HomePage() {
  const [token, setToken] = useState('')
  const [destination, setDestination] = useState<'upload' | 'gallery'>('upload')
  const [devEvents, setDevEvents] = useState<DevEvent[]>([])

  useEffect(() => {
    if (!isLocalHost()) return
    apiJson<{ events: DevEvent[] }>('/api/v1/dev/events').then((data) => setDevEvents(data.events)).catch(() => setDevEvents([]))
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
        <AppHeader links={[{ href: '#how-it-works', label: 'How it works' }, { href: '#local-links', label: 'Event links' }, { href: '/admin', label: 'Admin' }]} />
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Private wedding gallery</p>
            <h1>Your favorite moments, collected in one beautiful place.</h1>
            <p className="lede">Guests scan a private QR code, share photos and videos from their phones, and the couple gets a clean gallery of approved memories.</p>
            <div className="hero-actions">
              {devEvents[0] ? <a className="button primary" href={devEvents[0].upload_path}>Open guest upload <ArrowRight aria-hidden="true" size={18} /></a> : <a className="button primary" href="#link-launcher">Open an event link <ArrowRight aria-hidden="true" size={18} /></a>}
              <AdminLoginButton>Admin dashboard</AdminLoginButton>
            </div>
          </div>
          <div className="hero-board" aria-label="Product workflow preview">
            <div className="board-card board-card-large"><div className="icon-pill"><QrCode aria-hidden="true" size={22} /></div><span>Guest QR code</span><strong>Scan and share</strong></div>
            <div className="board-card"><div className="icon-pill"><UploadCloud aria-hidden="true" size={22} /></div><span>Shared moments</span><strong>Ready to review</strong></div>
            <div className="board-card dark"><div className="icon-pill"><ShieldCheck aria-hidden="true" size={22} /></div><span>Private review</span><strong>Choose what appears</strong></div>
            <div className="board-card gallery-card"><div className="gallery-mosaic" aria-hidden="true"><i /><i /><i /><i /></div><span>Wedding gallery</span><strong>The best moments together</strong></div>
          </div>
        </div>
      </section>
      <section className="home-section split-section" id="how-it-works">
        <div><p className="eyebrow">How it works</p><h2>A simple flow for guests, couples, and trusted reviewers.</h2><p className="muted large-copy">Share one private upload link with guests, review incoming photos and videos, then publish the moments you want everyone to see.</p></div>
        <div className="steps-card"><div><span>01</span><strong>Create the event</strong><p>Each event gets a private guest link, review link, and gallery link.</p></div><div><span>02</span><strong>Share the QR code</strong><p>Guests scan once and upload right from their phone.</p></div><div><span>03</span><strong>Curate the gallery</strong><p>Only approved photos and videos appear in the shared gallery.</p></div></div>
      </section>
      <section className="home-section link-section" id="link-launcher">
        <div className="link-card"><div><p className="eyebrow">Open your event</p><h2>Have a private code? Jump straight in.</h2></div><form className="token-form" onSubmit={openTokenPath}><select value={destination} onChange={(event) => setDestination(event.target.value as 'upload' | 'gallery')} aria-label="Link type"><option value="upload">Guest upload</option><option value="gallery">Gallery</option></select><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" aria-label="Private event token" /><button className="button primary" type="submit">Open</button></form></div>
      </section>
      {isLocalHost() && devEvents.length > 0 && <section className="home-section dev-section" id="local-links"><div className="section-heading"><p className="eyebrow">Event links</p><h2>Leon & Kami's wedding</h2><p className="muted">Use these links to try the guest upload, gallery, and review experience.</p></div><div className="dev-grid">{devEvents.map((event) => <article className="dev-event-card" key={event.id}><div><p className="eyebrow">{event.slug}</p><h3>{event.name}</h3></div><div className="dev-links"><a className="button primary" href={event.upload_path}>Guest upload</a><a className="button ghost" href={event.gallery_path}>Gallery</a><a className="button dark-button" href="/admin">Admin dashboard</a></div></article>)}</div></section>}
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

  useEffect(() => { apiJson<{ event: EventRecord }>(`/api/v1/events/${eventToken}`).then((data) => setEvent(data.event)).catch((err) => setError(err.message)) }, [eventToken])

  async function submit(eventObj: React.FormEvent) {
    eventObj.preventDefault()
    if (files.length === 0) return setError('Choose at least one photo or video first.')
    const validationError = validateFiles(files)
    if (validationError) return setError(validationError)
    setUploading(true); setError(null); setNotice(null)
    try {
      let uploadedCount = 0
      for (let index = 0; index < files.length; index += UPLOAD_CHUNK_MAX_FILES) {
        const chunk = files.slice(index, index + UPLOAD_CHUNK_MAX_FILES)
        setNotice(`Preparing ${Math.min(index + chunk.length, files.length)} of ${files.length} file${files.length === 1 ? '' : 's'}…`)
        const blobs = await Promise.all(chunk.map((file) => directUploadFile(file)))
        const form = new FormData()
        form.append('guest_name', guestName); form.append('guest_message', guestMessage); blobs.forEach((blob) => form.append('signed_blob_ids[]', blob.signed_id))
        const data = await apiJson<{ uploads: MediaUpload[] }>(`/api/v1/events/${eventToken}/uploads`, { method: 'POST', body: form })
        uploadedCount += data.uploads.length
        setNotice(`Uploading ${uploadedCount} of ${files.length} file${files.length === 1 ? '' : 's'}…`)
      }
      setNotice(`${uploadedCount} upload${uploadedCount === 1 ? '' : 's'} received. Thank you!`); setFiles([])
      const input = document.getElementById('files') as HTMLInputElement | null; if (input) input.value = ''
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed') } finally { setUploading(false) }
  }

  return <main className="app-page"><AppHeader links={[{ href: '/', label: 'Home' }, { href: `/gallery/${eventToken}`, label: 'Gallery' }]} /><section className="shell"><section className="card"><p className="eyebrow">Guest upload</p><h1>{event?.name || 'Event photos'}</h1><p className="lede">Share the photos and videos you captured. They’ll go to a private review queue first.</p><form className="stack" onSubmit={submit}><label>Your name <span className="muted">optional</span><input value={guestName} maxLength={80} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Uncle Joe" /></label><label>Message <span className="muted">optional</span><textarea value={guestMessage} maxLength={1000} onChange={(e) => setGuestMessage(e.target.value)} placeholder="Say something sweet…" rows={3} /></label><label className="dropzone" htmlFor="files"><strong>Choose photos/videos</strong><span>{files.length > 0 ? `${files.length} file(s) selected` : 'Tap to select multiple files from your phone'}</span><input id="files" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,video/mp4,video/quicktime" multiple onChange={(e) => { const nextFiles = Array.from(e.target.files || []); setFiles(nextFiles); setError(validateFiles(nextFiles)) }} /></label>{files.length > 0 && <ul className="file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name} · {formatBytes(file.size)}</li>)}</ul>}{error && <p className="alert error">{error}</p>}{notice && <p className="alert success">{notice}</p>}<button className="button primary" disabled={uploading || event?.uploads_enabled === false}>{uploading ? 'Uploading…' : event?.uploads_enabled === false ? 'Uploads closed' : 'Upload memories'}</button><a className="button ghost" href={`/gallery/${eventToken}`}>View approved gallery</a></form></section></section></main>
}

function GalleryPage({ eventToken }: { eventToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null)
  const [uploads, setUploads] = useState<MediaUpload[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeUploadId, setActiveUploadId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadGallery = useCallback(async function loadGallery(offset = 0, append = false) {
    const data = await apiJson<{ event: EventRecord; uploads: MediaUpload[]; pagination?: { next_offset: number | null } }>(`/api/v1/events/${eventToken}/gallery?limit=${API_PAGE_LIMIT}&offset=${offset}`)
    setEvent(data.event)
    setUploads((current) => append ? [...current, ...data.uploads] : data.uploads)
    setNextOffset(data.pagination?.next_offset ?? null)
  }, [eventToken])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial gallery load synchronizes with backend state
  useEffect(() => { loadGallery().catch((err) => setError(err.message)) }, [loadGallery])

  async function loadMore() {
    if (nextOffset === null) return
    setLoadingMore(true)
    try { await loadGallery(nextOffset, true) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load more photos') } finally { setLoadingMore(false) }
  }

  return <main className="app-page"><AppHeader links={[{ href: '/', label: 'Home' }, { href: `/upload/${eventToken}`, label: 'Upload' }]} /><section className="shell wide"><section className="card"><p className="eyebrow">Approved gallery</p><h1>{event?.name || 'Gallery'}</h1><p className="lede">Only admin-approved uploads appear here.</p>{error && <p className="alert error">{error}</p>}{uploads.length === 0 ? <p className="muted">No approved uploads yet.</p> : <><MediaGrid uploads={uploads} onOpen={(upload) => setActiveUploadId(upload.id)} />{nextOffset !== null && <button className="button ghost load-more-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>}</>}{activeUploadId !== null && <MediaLightbox uploads={uploads} activeId={activeUploadId} onClose={() => setActiveUploadId(null)} onActiveIdChange={setActiveUploadId} />}</section></section></main>
}

function AdminRoute() { return <RequireAdmin><AdminDashboard /></RequireAdmin> }
function AdminEventRoute({ eventId }: { eventId: string }) { return <RequireAdmin><AdminEventPage eventId={eventId} /></RequireAdmin> }

function AdminDashboard() {
  const auth = useAppAuth()
  const authHeaders = useAuthHeaders()
  const [events, setEvents] = useState<Array<EventRecord & { counts: Counts }>>([])
  const [user, setUser] = useState<AdminUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const refresh = useCallback(async function refresh() {
    try {
      const headers = await authHeaders()
      const [eventsData, userData] = await Promise.all([
        apiJson<AdminEventsPayload>('/api/v1/admin/events', { headers }),
        apiJson<{ user: AdminUser }>('/api/v1/admin/me', { headers }),
      ])
      setEvents(eventsData.events); setUser(userData.user); setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load admin dashboard') }
  }, [authHeaders])

  useEffect(() => {
    let ignore = false

    async function loadDashboard() {
      try {
        const headers = await authHeaders()
        const [eventsData, userData] = await Promise.all([
          apiJson<AdminEventsPayload>('/api/v1/admin/events', { headers }),
          apiJson<{ user: AdminUser }>('/api/v1/admin/me', { headers }),
        ])
        if (!ignore) {
          setEvents(eventsData.events)
          setUser(userData.user)
          setError(null)
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Could not load admin dashboard')
      }
    }

    void loadDashboard()
    return () => { ignore = true }
  }, [authHeaders])

  async function createEvent(eventObj: React.FormEvent) {
    eventObj.preventDefault(); if (!newName.trim()) return
    setCreating(true)
    try {
      const headers = await authHeaders()
      await apiJson('/api/v1/admin/events', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ event: { name: newName.trim() } }) })
      setNewName(''); await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create event') } finally { setCreating(false) }
  }

  return <main className="app-page"><AppHeader admin links={[{ href: '/', label: 'Home' }, { href: '/admin', label: 'Events' }]} /><section className="admin-shell"><div className="admin-hero"><p className="eyebrow">Admin dashboard</p><h1>Manage wedding events and review guest uploads.</h1><p className="muted">Signed in as {user?.full_name || auth.userName || 'admin'}.</p></div>{error && <p className="alert error">{error}</p>}{user?.is_super_admin && <form className="admin-create-card" onSubmit={createEvent}><div><p className="eyebrow">New event</p><h2>Create an upload collection</h2></div><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name" /><button className="button primary" disabled={creating}>{creating ? 'Creating…' : 'Create event'}</button></form>}<div className="admin-event-grid">{events.map((event) => <article className="admin-event-card" key={event.id}><div><p className="eyebrow">{event.slug}</p><h3>{event.name}</h3><p className="muted">Pending {event.counts.pending} · Approved {event.counts.approved} · Total {event.counts.total}</p></div><div className="dev-links"><a className="button primary" href={`/admin/events/${event.id}`}>Review event</a><a className="button ghost" href={`/upload/${event.upload_token}`}>Guest upload</a><a className="button ghost" href={`/gallery/${event.upload_token}`}>Gallery</a></div></article>)}</div></section></main>
}

function AdminEventPage({ eventId }: { eventId: string }) {
  const authHeaders = useAuthHeaders()
  const [payload, setPayload] = useState<AdminPayload | null>(null)
  const [status, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [albumFilter, setAlbumFilter] = useState<'all' | 'uncategorized' | string>('all')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [newSectionName, setNewSectionName] = useState('')
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null)
  const [sectionDraft, setSectionDraft] = useState({ name: '', description: '', sort_order: 0, visible: true })
  const [activeUploadId, setActiveUploadId] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [memberships, setMemberships] = useState<EventMembership[]>([])
  const [memberForm, setMemberForm] = useState({ email: '', role: 'admin' })
  const statusRef = useRef(status)
  const event = payload?.event
  const uploadUrl = event ? `${window.location.origin}/upload/${event.upload_token}` : ''
  const galleryUrl = event ? `${window.location.origin}/gallery/${event.upload_token}` : ''

  const refresh = useCallback(async function refresh(nextStatus: typeof status) {
    try {
      const headers = await authHeaders()
      const qs = new URLSearchParams({ limit: String(API_PAGE_LIMIT), offset: '0' })
      if (nextStatus !== 'all') qs.set('status', nextStatus)
      if (albumFilter !== 'all') qs.set('album_section_id', albumFilter === 'uncategorized' ? '' : albumFilter)
      const data = await apiJson<AdminPayload>(`/api/v1/admin/events/${eventId}?${qs.toString()}`, { headers })
      setPayload(data); setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load event') }
  }, [albumFilter, authHeaders, eventId])

  const loadMemberships = useCallback(async function loadMemberships() {
    try {
      const headers = await authHeaders()
      const data = await apiJson<{ memberships: EventMembership[] }>(`/api/v1/admin/events/${eventId}/memberships`, { headers })
      setMemberships(data.memberships)
    } catch {
      setMemberships([])
    }
  }, [authHeaders, eventId])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    let ignore = false

    async function loadEvent() {
      try {
        const headers = await authHeaders()
        const qs = new URLSearchParams({ limit: String(API_PAGE_LIMIT), offset: '0' })
        if (status !== 'all') qs.set('status', status)
        if (albumFilter !== 'all') qs.set('album_section_id', albumFilter === 'uncategorized' ? '' : albumFilter)
        const data = await apiJson<AdminPayload>(`/api/v1/admin/events/${eventId}?${qs.toString()}`, { headers })
        if (!ignore) {
          setPayload(data)
          setError(null)
          void loadMemberships()
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Could not load event')
      }
    }

    void loadEvent()
    return () => { ignore = true }
  }, [albumFilter, authHeaders, eventId, loadMemberships, status])
  async function act(id: number, action: 'approve' | 'reject') { setBusyId(id); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${id}/${action}`, { method: 'PATCH', headers }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Action failed') } finally { setBusyId(null) } }
  async function updateEvent(changes: Partial<EventRecord>) { if (!event) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${event.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ event: changes }) }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update event') } finally { setSaving(false) } }
  async function updateUpload(id: number, changes: Partial<MediaUpload>) { setBusyId(id); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ upload: changes }) }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update upload') } finally { setBusyId(null) } }
  async function bulkAction(action: 'bulk_approve' | 'bulk_reject' | 'bulk_destroy') { if (selectedIds.length === 0) return; if (action === 'bulk_destroy' && !window.confirm(`Delete ${selectedIds.length} selected upload(s)?`)) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${action}`, { method: action === 'bulk_destroy' ? 'DELETE' : 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }) }); setSelectedIds([]); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Bulk action failed') } finally { setSaving(false) } }
  async function deleteUpload(id: number) { if (!window.confirm('Delete this upload?')) return; setBusyId(id); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${id}`, { method: 'DELETE', headers }); setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id)); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete upload') } finally { setBusyId(null) } }
  async function createSection(eventObj: React.FormEvent) { eventObj.preventDefault(); if (!newSectionName.trim()) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/album_sections`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ album_section: { name: newSectionName.trim(), sort_order: payload?.album_sections.length || 0 } }) }); setNewSectionName(''); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not create section') } finally { setSaving(false) } }
  function startSectionEdit(section: AlbumSection) { setEditingSectionId(section.id); setSectionDraft({ name: section.name, description: section.description || '', sort_order: section.sort_order, visible: section.visible }) }
  async function saveSection(id: number) { setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/album_sections/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ album_section: sectionDraft }) }); setEditingSectionId(null); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update section') } finally { setSaving(false) } }
  async function deleteSection(id: number) { if (!window.confirm('Delete this album section? Photos will move back to Uncategorized.')) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/album_sections/${id}`, { method: 'DELETE', headers }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete section') } finally { setSaving(false) } }
  async function inviteEventMember(eventObj: React.FormEvent) { eventObj.preventDefault(); if (!memberForm.email.trim()) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/memberships`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ membership: memberForm }) }); setMemberForm({ email: '', role: 'admin' }); await loadMemberships() } catch (err) { setError(err instanceof Error ? err.message : 'Could not invite event admin') } finally { setSaving(false) } }
  async function updateMembership(id: number, changes: Partial<EventMembership>) { setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/memberships/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ membership: changes }) }); await loadMemberships() } catch (err) { setError(err instanceof Error ? err.message : 'Could not update event access') } finally { setSaving(false) } }
  async function deleteMembership(id: number) { if (!window.confirm('Remove this person from the event admin side?')) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/memberships/${id}`, { method: 'DELETE', headers }); await loadMemberships() } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove event access') } finally { setSaving(false) } }
  async function loadMoreUploads() { if (!payload?.pagination?.next_offset) return; setLoadingMore(true); try { const headers = await authHeaders(); const qs = new URLSearchParams({ limit: String(API_PAGE_LIMIT), offset: String(payload.pagination.next_offset) }); if (statusRef.current !== 'all') qs.set('status', statusRef.current); if (albumFilter !== 'all') qs.set('album_section_id', albumFilter === 'uncategorized' ? '' : albumFilter); const data = await apiJson<AdminPayload>(`/api/v1/admin/events/${eventId}?${qs.toString()}`, { headers }); setPayload({ ...data, uploads: [...payload.uploads, ...data.uploads] }) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load more uploads') } finally { setLoadingMore(false) } }
  function toggleSelected(id: number) { setSelectedIds((ids) => ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id]) }
  function changeStatus(next: typeof status) { setStatus(next); setSelectedIds([]); setActiveUploadId(null) }
  function changeAlbumFilter(next: typeof albumFilter) { setAlbumFilter(next); setSelectedIds([]); setActiveUploadId(null) }

  return <main className="app-page"><AppHeader admin links={[{ href: '/admin', label: 'Events' }, { href: uploadUrl || '#', label: 'Guest upload' }, { href: galleryUrl || '#', label: 'Gallery' }]} /><section className="admin-shell">{error && <p className="alert error">{error}</p>}{payload && event && <><div className="admin-detail-header"><div><p className="eyebrow">Event review</p><h1>{event.name}</h1><p className="muted">Pending {payload.counts.pending} · Approved {payload.counts.approved} · Rejected {payload.counts.rejected}</p></div><div className="admin-quick-links"><QRCodeSVG value={uploadUrl} size={132} /><a href={uploadUrl}>{uploadUrl}</a></div></div><div className="settings-grid"><label>Event name<input value={event.name} onChange={(e) => setPayload({ ...payload, event: { ...event, name: e.target.value } })} onBlur={() => updateEvent({ name: event.name })} /></label><label className="toggle-row"><input type="checkbox" checked={event.uploads_enabled} onChange={(e) => updateEvent({ uploads_enabled: e.target.checked })} /> Guest uploads open</label><label className="toggle-row"><input type="checkbox" checked={event.public_gallery_enabled} onChange={(e) => updateEvent({ public_gallery_enabled: e.target.checked })} /> Gallery visible</label><a className="button ghost" href={`${API_BASE_URL}/api/v1/admin/events/${eventId}/approved_download`} onClick={async (clickEvent) => { clickEvent.preventDefault(); const headers = await authHeaders(); const response = await fetch(`${API_BASE_URL}/api/v1/admin/events/${eventId}/approved_download`, { headers }); if (!response.ok) { setError('No approved media ready to download'); return } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${event.slug}-approved-media.zip`; link.click(); URL.revokeObjectURL(url) }}>Download approved</a>{saving && <p className="muted">Saving…</p>}</div><form className="admin-create-card slim-card" onSubmit={inviteEventMember}><div><p className="eyebrow">Event admins</p><h2>Invite event-specific access</h2></div><input value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} placeholder="Email address" type="email" /><select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}><option value="admin">Admin</option><option value="reviewer">Reviewer</option></select><button className="button primary" disabled={saving}>Invite</button></form>{memberships.length > 0 && <div className="album-section-list">{memberships.map((membership) => <article className="album-section-card" key={membership.id}><div><strong>{membership.user.full_name}</strong><p className="muted">{membership.user.email} · {membership.role} · {membership.active ? 'Active' : 'Inactive'}{membership.user.invitation_pending ? ' · Pending invite' : ''}</p></div><div className="actions"><select value={membership.role} onChange={(e) => updateMembership(membership.id, { role: e.target.value })}><option value="admin">Admin</option><option value="reviewer">Reviewer</option></select><button className="button ghost" onClick={() => updateMembership(membership.id, { active: !membership.active })}>{membership.active ? 'Deactivate' : 'Activate'}</button><button className="button danger" onClick={() => deleteMembership(membership.id)}>Remove</button></div></article>)}</div>}<form className="admin-create-card slim-card" onSubmit={createSection}><div><p className="eyebrow">Album sections</p><h2>Organize the gallery</h2></div><input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="Section name" /><button className="button primary" disabled={saving}>Add section</button></form>{payload.album_sections.length > 0 && <div className="album-section-list">{payload.album_sections.map((section) => <article className="album-section-card" key={section.id}>{editingSectionId === section.id ? <><div className="album-section-fields"><input value={sectionDraft.name} onChange={(e) => setSectionDraft({ ...sectionDraft, name: e.target.value })} aria-label="Section name" /><input value={sectionDraft.description} onChange={(e) => setSectionDraft({ ...sectionDraft, description: e.target.value })} placeholder="Description" aria-label="Section description" /><input type="number" value={sectionDraft.sort_order} onChange={(e) => setSectionDraft({ ...sectionDraft, sort_order: Number(e.target.value) })} aria-label="Sort order" /><label className="toggle-row"><input type="checkbox" checked={sectionDraft.visible} onChange={(e) => setSectionDraft({ ...sectionDraft, visible: e.target.checked })} /> Visible</label></div><div className="actions"><button className="button primary" disabled={saving} onClick={() => saveSection(section.id)}>Save section</button><button className="button ghost" onClick={() => setEditingSectionId(null)}>Cancel</button></div></> : <><div><strong>{section.name}</strong><p className="muted">{section.uploads_count || 0} uploads · {section.visible ? 'Visible' : 'Hidden'}</p>{section.description && <p>{section.description}</p>}</div><div className="actions"><button className="button ghost" onClick={() => startSectionEdit(section)}>Edit</button><button className="button danger" onClick={() => deleteSection(section.id)}>Delete</button></div></>}</article>)}</div>}<div className="filter-tabs">{(['pending', 'approved', 'rejected', 'all'] as const).map((item) => <button className={status === item ? 'active' : ''} key={item} onClick={() => changeStatus(item)}>{item}</button>)}</div><div className="album-filter-bar"><span>Album</span><button className={albumFilter === 'all' ? 'active' : ''} onClick={() => changeAlbumFilter('all')}>All albums</button><button className={albumFilter === 'uncategorized' ? 'active' : ''} onClick={() => changeAlbumFilter('uncategorized')}>Uncategorized</button>{payload.album_sections.map((section) => <button className={albumFilter === String(section.id) ? 'active' : ''} key={section.id} onClick={() => changeAlbumFilter(String(section.id))}>{section.name}</button>)}</div>{selectedIds.length > 0 && <div className="bulk-toolbar"><strong>{selectedIds.length} selected</strong><button className="button primary" onClick={() => bulkAction('bulk_approve')}>Approve selected</button><button className="button ghost" onClick={() => bulkAction('bulk_reject')}>Reject selected</button><button className="button danger" onClick={() => bulkAction('bulk_destroy')}>Delete selected</button><button className="button ghost" onClick={() => setSelectedIds([])}>Clear</button></div>}{payload.uploads.length === 0 ? <div className="empty-dev-card"><strong>No uploads in this view.</strong><p>New guest uploads will appear here for review.</p></div> : <div className="review-list">{payload.uploads.map((upload) => <article className={`review-card ${upload.status}`} key={upload.id}><label className="select-upload"><input type="checkbox" checked={selectedIds.includes(upload.id)} onChange={() => toggleSelected(upload.id)} /> Select</label><button className="media-preview-button" type="button" onClick={() => setActiveUploadId(upload.id)}><MediaPreview upload={upload} /></button><div className="review-body"><strong>{upload.guest_name || 'Anonymous guest'}</strong>{upload.guest_message && <p>{upload.guest_message}</p>}<p className="muted">{upload.original_filename} · {formatBytes(upload.file_size)} · {upload.status}{upload.album_section ? ` · ${upload.album_section.name}` : ''}</p><label className="compact-label">Album section<select value={upload.album_section_id || ''} onChange={(e) => updateUpload(upload.id, { album_section_id: e.target.value ? Number(e.target.value) : null })}><option value="">Uncategorized</option>{payload.album_sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><div className="actions"><button className="button primary" disabled={busyId === upload.id} onClick={() => act(upload.id, 'approve')}>Approve</button><button className="button danger" disabled={busyId === upload.id} onClick={() => act(upload.id, 'reject')}>Reject</button><button className="button danger" disabled={busyId === upload.id} onClick={() => deleteUpload(upload.id)}>Delete</button>{upload.file_url && <button className="button ghost" onClick={() => setActiveUploadId(upload.id)}>Open</button>}</div></div></article>)}</div>}{payload.pagination?.next_offset !== null && payload.pagination?.next_offset !== undefined && <button className="button ghost load-more-button" disabled={loadingMore} onClick={loadMoreUploads}>{loadingMore ? 'Loading…' : 'Load more uploads'}</button>}{activeUploadId !== null && <MediaLightbox uploads={payload.uploads} activeId={activeUploadId} onClose={() => setActiveUploadId(null)} onActiveIdChange={setActiveUploadId} adminControls={{ albumSections: payload.album_sections, busyId, onApprove: (id) => act(id, 'approve'), onReject: (id) => act(id, 'reject'), onDelete: deleteUpload, onUpdateUpload: updateUpload }} />}</>}</section></main>
}

function MediaGrid({ uploads, onOpen }: { uploads: MediaUpload[]; onOpen?: (upload: MediaUpload) => void }) { return <div className="media-grid">{uploads.map((upload) => <button key={upload.id} type="button" className="gallery-media-button" onClick={() => onOpen?.(upload)}><MediaPreview upload={upload} /></button>)}</div> }
function MediaPreview({ upload }: { upload: MediaUpload }) { if (!upload.file_url) return <div className="placeholder">No preview</div>; if (upload.media_kind === 'video') return <video src={upload.file_url} controls playsInline />; return <img src={upload.file_url} alt={upload.guest_message || upload.original_filename} loading="lazy" referrerPolicy="no-referrer" /> }

type LightboxAdminControls = { albumSections: AlbumSection[]; busyId: number | null; onApprove: (id: number) => void; onReject: (id: number) => void; onDelete: (id: number) => void; onUpdateUpload: (id: number, changes: Partial<MediaUpload>) => void }

function MediaLightbox({ uploads, activeId, onClose, onActiveIdChange, adminControls }: { uploads: MediaUpload[]; activeId: number; onClose: () => void; onActiveIdChange: (id: number) => void; adminControls?: LightboxAdminControls }) {
  const index = Math.max(0, uploads.findIndex((upload) => upload.id === activeId))
  const upload = uploads[index]
  const hasPrevious = index > 0
  const hasNext = index < uploads.length - 1

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasPrevious) onActiveIdChange(uploads[index - 1].id)
      if (event.key === 'ArrowRight' && hasNext) onActiveIdChange(uploads[index + 1].id)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKeyDown) }
  }, [hasNext, hasPrevious, index, onActiveIdChange, onClose, uploads])

  if (!upload) return null

  return <div className="lightbox" role="dialog" aria-modal="true" aria-label="Media preview"><button className="lightbox-backdrop" type="button" aria-label="Close preview" onClick={onClose} /><div className="lightbox-panel"><div className="lightbox-stage"><button className="lightbox-close" type="button" onClick={onClose}>Close</button>{hasPrevious && <button className="lightbox-nav previous" type="button" onClick={() => onActiveIdChange(uploads[index - 1].id)}>Previous</button>}{hasNext && <button className="lightbox-nav next" type="button" onClick={() => onActiveIdChange(uploads[index + 1].id)}>Next</button>}{upload.media_kind === 'video' && upload.file_url ? <video src={upload.file_url} controls playsInline autoPlay /> : upload.file_url ? <img src={upload.file_url} alt={upload.guest_message || upload.original_filename} /> : <div className="placeholder">No preview</div>}</div><aside className="lightbox-sidebar"><p className="eyebrow">{upload.status}</p><h2>{upload.guest_name || 'Anonymous guest'}</h2>{upload.guest_message && <p>{upload.guest_message}</p>}<p className="muted">{upload.original_filename} · {formatBytes(upload.file_size)}</p>{adminControls ? <><label className="compact-label">Album section<select value={upload.album_section_id || ''} onChange={(e) => adminControls.onUpdateUpload(upload.id, { album_section_id: e.target.value ? Number(e.target.value) : null })}><option value="">Uncategorized</option>{adminControls.albumSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><div className="actions"><button className="button primary" disabled={adminControls.busyId === upload.id} onClick={() => adminControls.onApprove(upload.id)}>Approve</button><button className="button danger" disabled={adminControls.busyId === upload.id} onClick={() => adminControls.onReject(upload.id)}>Reject</button><button className="button danger" disabled={adminControls.busyId === upload.id} onClick={() => adminControls.onDelete(upload.id)}>Delete</button></div></> : <p className="muted">{index + 1} of {uploads.length}</p>}</aside></div></div>
}

export default App
