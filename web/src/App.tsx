import { useCallback, useEffect, useRef, useState } from 'react'
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

type AdminUser = { id: number; full_name: string; email: string; role: string; active: boolean; invitation_pending?: boolean; invitation_status?: string; first_name?: string | null; last_name?: string | null; invited_at?: string | null; last_sign_in_at?: string | null }

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const MAX_FILES = 20
const MAX_FILE_SIZE = 250 * 1024 * 1024
const MAX_BATCH_SIZE = 500 * 1024 * 1024
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
  if (mode === 'admin' && token === 'users') return <AdminUsersRoute />
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
    const form = new FormData()
    form.append('guest_name', guestName); form.append('guest_message', guestMessage); files.forEach((file) => form.append('files[]', file))
    try {
      const data = await apiJson<{ uploads: MediaUpload[] }>(`/api/v1/events/${eventToken}/uploads`, { method: 'POST', body: form })
      setNotice(`${data.uploads.length} upload${data.uploads.length === 1 ? '' : 's'} received. Thank you!`); setFiles([])
      const input = document.getElementById('files') as HTMLInputElement | null; if (input) input.value = ''
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed') } finally { setUploading(false) }
  }

  return <main className="app-page"><AppHeader links={[{ href: '/', label: 'Home' }, { href: `/gallery/${eventToken}`, label: 'Gallery' }]} /><section className="shell"><section className="card"><p className="eyebrow">Guest upload</p><h1>{event?.name || 'Event photos'}</h1><p className="lede">Share the photos and videos you captured. They’ll go to a private review queue first.</p><form className="stack" onSubmit={submit}><label>Your name <span className="muted">optional</span><input value={guestName} maxLength={80} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Uncle Joe" /></label><label>Message <span className="muted">optional</span><textarea value={guestMessage} maxLength={1000} onChange={(e) => setGuestMessage(e.target.value)} placeholder="Say something sweet…" rows={3} /></label><label className="dropzone" htmlFor="files"><strong>Choose photos/videos</strong><span>{files.length > 0 ? `${files.length} file(s) selected` : 'Tap to select multiple files from your phone'}</span><input id="files" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,video/mp4,video/quicktime" multiple onChange={(e) => { const nextFiles = Array.from(e.target.files || []); setFiles(nextFiles); setError(validateFiles(nextFiles)) }} /></label>{files.length > 0 && <ul className="file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name} · {formatBytes(file.size)}</li>)}</ul>}{error && <p className="alert error">{error}</p>}{notice && <p className="alert success">{notice}</p>}<button className="button primary" disabled={uploading || event?.uploads_enabled === false}>{uploading ? 'Uploading…' : event?.uploads_enabled === false ? 'Uploads closed' : 'Upload memories'}</button><a className="button ghost" href={`/gallery/${eventToken}`}>View approved gallery</a></form></section></section></main>
}

function GalleryPage({ eventToken }: { eventToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null)
  const [uploads, setUploads] = useState<MediaUpload[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { apiJson<{ event: EventRecord; uploads: MediaUpload[] }>(`/api/v1/events/${eventToken}/gallery`).then((data) => { setEvent(data.event); setUploads(data.uploads) }).catch((err) => setError(err.message)) }, [eventToken])
  return <main className="app-page"><AppHeader links={[{ href: '/', label: 'Home' }, { href: `/upload/${eventToken}`, label: 'Upload' }]} /><section className="shell wide"><section className="card"><p className="eyebrow">Approved gallery</p><h1>{event?.name || 'Gallery'}</h1><p className="lede">Only admin-approved uploads appear here.</p>{error && <p className="alert error">{error}</p>}{uploads.length === 0 ? <p className="muted">No approved uploads yet.</p> : <MediaGrid uploads={uploads} />}</section></section></main>
}

function AdminRoute() { return <RequireAdmin><AdminDashboard /></RequireAdmin> }
function AdminUsersRoute() { return <RequireAdmin><AdminUsersPage /></RequireAdmin> }
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

  return <main className="app-page"><AppHeader admin links={[{ href: '/', label: 'Home' }, { href: '/admin', label: 'Events' }, { href: '/admin/users', label: 'Users' }]} /><section className="admin-shell"><div className="admin-hero"><p className="eyebrow">Admin dashboard</p><h1>Manage wedding events and review guest uploads.</h1><p className="muted">Signed in as {user?.full_name || auth.userName || 'admin'}.</p></div>{error && <p className="alert error">{error}</p>}<form className="admin-create-card" onSubmit={createEvent}><div><p className="eyebrow">New event</p><h2>Create an upload collection</h2></div><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name" /><button className="button primary" disabled={creating}>{creating ? 'Creating…' : 'Create event'}</button></form><div className="admin-event-grid">{events.map((event) => <article className="admin-event-card" key={event.id}><div><p className="eyebrow">{event.slug}</p><h3>{event.name}</h3><p className="muted">Pending {event.counts.pending} · Approved {event.counts.approved} · Total {event.counts.total}</p></div><div className="dev-links"><a className="button primary" href={`/admin/events/${event.id}`}>Review event</a><a className="button ghost" href={`/upload/${event.upload_token}`}>Guest upload</a><a className="button ghost" href={`/gallery/${event.upload_token}`}>Gallery</a></div></article>)}</div></section></main>
}

function AdminUsersPage() {
  const authHeaders = useAuthHeaders()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'reviewer' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', role: 'reviewer', active: true })
  const [busyId, setBusyId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadUsers = useCallback(async function loadUsers() {
    try {
      const headers = await authHeaders()
      const [usersData, meData] = await Promise.all([
        apiJson<{ users: AdminUser[] }>('/api/v1/admin/users', { headers }),
        apiJson<{ user: AdminUser }>('/api/v1/admin/me', { headers }),
      ])
      setUsers(usersData.users)
      setCurrentUser(meData.user)
      setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load users') }
  }, [authHeaders])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial admin users load synchronizes with backend state
  useEffect(() => { void loadUsers() }, [loadUsers])

  async function inviteUser(eventObj: React.FormEvent) {
    eventObj.preventDefault(); if (!form.email.trim()) return
    setSaving(true); setError(null); setNotice(null)
    try {
      const headers = await authHeaders()
      const data = await apiJson<{ invitation_sent: boolean; invitation_error?: string }>('/api/v1/admin/users', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ user: form }) })
      setNotice(data.invitation_sent ? 'Invitation sent.' : `User created. Invitation email was not sent${data.invitation_error ? `: ${data.invitation_error}` : '.'}`)
      setForm({ email: '', first_name: '', last_name: '', role: 'reviewer' })
      await loadUsers()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not invite user') } finally { setSaving(false) }
  }

  function startEdit(user: AdminUser) {
    setEditingId(user.id)
    setEditForm({ first_name: user.first_name || '', last_name: user.last_name || '', role: user.role, active: user.active })
  }

  async function saveUser(id: number) {
    setBusyId(id); setError(null); setNotice(null)
    try {
      const headers = await authHeaders()
      await apiJson(`/api/v1/admin/users/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ user: editForm }) })
      setEditingId(null); setNotice('User updated.'); await loadUsers()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update user') } finally { setBusyId(null) }
  }

  async function resendInvite(id: number) {
    setBusyId(id); setError(null); setNotice(null)
    try {
      const headers = await authHeaders()
      const data = await apiJson<{ invitation_sent: boolean; invitation_error?: string }>(`/api/v1/admin/users/${id}/resend_invitation`, { method: 'POST', headers })
      setNotice(data.invitation_sent ? 'Invitation resent.' : `Invitation could not be sent${data.invitation_error ? `: ${data.invitation_error}` : '.'}`)
      await loadUsers()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not resend invitation') } finally { setBusyId(null) }
  }

  async function deleteUser(id: number) {
    if (!window.confirm('Remove this user?')) return
    setBusyId(id); setError(null); setNotice(null)
    try {
      const headers = await authHeaders()
      await apiJson(`/api/v1/admin/users/${id}`, { method: 'DELETE', headers })
      setNotice('User removed.'); await loadUsers()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove user') } finally { setBusyId(null) }
  }

  return <main className="app-page"><AppHeader admin links={[{ href: '/admin', label: 'Events' }, { href: '/admin/users', label: 'Users' }]} /><section className="admin-shell"><div className="admin-hero"><p className="eyebrow">User management</p><h1>Invite reviewers and manage admin access.</h1><p className="muted">Admins can manage users. Reviewers can review uploads and manage event media.</p></div>{error && <p className="alert error">{error}</p>}{notice && <p className="alert success">{notice}</p>}<form className="admin-create-card" onSubmit={inviteUser}><div><p className="eyebrow">Invite user</p><h2>Add a teammate</h2></div><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" type="email" /><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select><button className="button primary" disabled={saving}>{saving ? 'Sending…' : 'Send invite'}</button></form><div className="review-list">{users.map((user) => <article className="review-card" key={user.id}><div className="review-body"><strong>{user.full_name}{currentUser?.id === user.id ? ' (you)' : ''}</strong><p className="muted">{user.email} · {user.role} · {user.invitation_pending ? 'Pending' : user.active ? 'Active' : 'Inactive'}</p>{editingId === user.id && <div className="settings-grid compact-settings"><label>First name<input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} /></label><label>Last name<input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} /></label><label>Role<select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select></label><label className="toggle-row"><input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Active</label></div>}<div className="actions">{editingId === user.id ? <><button className="button primary" disabled={busyId === user.id} onClick={() => saveUser(user.id)}>Save</button><button className="button ghost" onClick={() => setEditingId(null)}>Cancel</button></> : <button className="button ghost" onClick={() => startEdit(user)}>Edit</button>}{user.invitation_pending && <button className="button ghost" disabled={busyId === user.id} onClick={() => resendInvite(user.id)}>Resend invite</button>}{currentUser?.id !== user.id && <button className="button danger" disabled={busyId === user.id} onClick={() => deleteUser(user.id)}>Delete</button>}</div></div></article>)}</div></section></main>
}

function AdminEventPage({ eventId }: { eventId: string }) {
  const authHeaders = useAuthHeaders()
  const [payload, setPayload] = useState<AdminPayload | null>(null)
  const [status, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [newSectionName, setNewSectionName] = useState('')
  const statusRef = useRef(status)
  const event = payload?.event
  const uploadUrl = event ? `${window.location.origin}/upload/${event.upload_token}` : ''
  const galleryUrl = event ? `${window.location.origin}/gallery/${event.upload_token}` : ''

  const refresh = useCallback(async function refresh(nextStatus: typeof status) {
    try {
      const headers = await authHeaders()
      const qs = nextStatus === 'all' ? '' : `?status=${nextStatus}`
      const data = await apiJson<AdminPayload>(`/api/v1/admin/events/${eventId}${qs}`, { headers })
      setPayload(data); setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load event') }
  }, [authHeaders, eventId])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    let ignore = false

    async function loadEvent() {
      try {
        const headers = await authHeaders()
        const qs = status === 'all' ? '' : `?status=${status}`
        const data = await apiJson<AdminPayload>(`/api/v1/admin/events/${eventId}${qs}`, { headers })
        if (!ignore) {
          setPayload(data)
          setError(null)
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Could not load event')
      }
    }

    void loadEvent()
    return () => { ignore = true }
  }, [authHeaders, eventId, status])
  async function act(id: number, action: 'approve' | 'reject') { setBusyId(id); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${id}/${action}`, { method: 'PATCH', headers }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Action failed') } finally { setBusyId(null) } }
  async function updateEvent(changes: Partial<EventRecord>) { if (!event) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${event.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ event: changes }) }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update event') } finally { setSaving(false) } }
  async function updateUpload(id: number, changes: Partial<MediaUpload>) { setBusyId(id); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ upload: changes }) }); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update upload') } finally { setBusyId(null) } }
  async function bulkAction(action: 'bulk_approve' | 'bulk_reject' | 'bulk_destroy') { if (selectedIds.length === 0) return; if (action === 'bulk_destroy' && !window.confirm(`Delete ${selectedIds.length} selected upload(s)?`)) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${action}`, { method: action === 'bulk_destroy' ? 'DELETE' : 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }) }); setSelectedIds([]); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Bulk action failed') } finally { setSaving(false) } }
  async function deleteUpload(id: number) { if (!window.confirm('Delete this upload?')) return; setBusyId(id); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/uploads/${id}`, { method: 'DELETE', headers }); setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id)); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete upload') } finally { setBusyId(null) } }
  async function createSection(eventObj: React.FormEvent) { eventObj.preventDefault(); if (!newSectionName.trim()) return; setSaving(true); try { const headers = await authHeaders(); await apiJson(`/api/v1/admin/events/${eventId}/album_sections`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ album_section: { name: newSectionName.trim(), sort_order: payload?.album_sections.length || 0 } }) }); setNewSectionName(''); await refresh(statusRef.current) } catch (err) { setError(err instanceof Error ? err.message : 'Could not create section') } finally { setSaving(false) } }
  function toggleSelected(id: number) { setSelectedIds((ids) => ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id]) }
  function changeStatus(next: typeof status) { setStatus(next) }

  return <main className="app-page"><AppHeader admin links={[{ href: '/admin', label: 'Events' }, { href: '/admin/users', label: 'Users' }, { href: uploadUrl || '#', label: 'Guest upload' }, { href: galleryUrl || '#', label: 'Gallery' }]} /><section className="admin-shell">{error && <p className="alert error">{error}</p>}{payload && event && <><div className="admin-detail-header"><div><p className="eyebrow">Event review</p><h1>{event.name}</h1><p className="muted">Pending {payload.counts.pending} · Approved {payload.counts.approved} · Rejected {payload.counts.rejected}</p></div><div className="admin-quick-links"><QRCodeSVG value={uploadUrl} size={132} /><a href={uploadUrl}>{uploadUrl}</a></div></div><div className="settings-grid"><label>Event name<input value={event.name} onChange={(e) => setPayload({ ...payload, event: { ...event, name: e.target.value } })} onBlur={() => updateEvent({ name: event.name })} /></label><label className="toggle-row"><input type="checkbox" checked={event.uploads_enabled} onChange={(e) => updateEvent({ uploads_enabled: e.target.checked })} /> Guest uploads open</label><label className="toggle-row"><input type="checkbox" checked={event.public_gallery_enabled} onChange={(e) => updateEvent({ public_gallery_enabled: e.target.checked })} /> Gallery visible</label><a className="button ghost" href={`${API_BASE_URL}/api/v1/admin/events/${eventId}/approved_download`} onClick={async (clickEvent) => { clickEvent.preventDefault(); const headers = await authHeaders(); const response = await fetch(`${API_BASE_URL}/api/v1/admin/events/${eventId}/approved_download`, { headers }); if (!response.ok) { setError('No approved media ready to download'); return } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${event.slug}-approved-media.zip`; link.click(); URL.revokeObjectURL(url) }}>Download approved</a>{saving && <p className="muted">Saving…</p>}</div><form className="admin-create-card slim-card" onSubmit={createSection}><div><p className="eyebrow">Album sections</p><h2>Organize the gallery</h2></div><input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="Section name" /><button className="button primary" disabled={saving}>Add section</button></form>{payload.album_sections.length > 0 && <div className="section-chip-row">{payload.album_sections.map((section) => <span className="section-chip" key={section.id}>{section.name} <small>{section.uploads_count || 0}</small></span>)}</div>}<div className="filter-tabs">{(['pending', 'approved', 'rejected', 'all'] as const).map((item) => <button className={status === item ? 'active' : ''} key={item} onClick={() => changeStatus(item)}>{item}</button>)}</div>{selectedIds.length > 0 && <div className="bulk-toolbar"><strong>{selectedIds.length} selected</strong><button className="button primary" onClick={() => bulkAction('bulk_approve')}>Approve selected</button><button className="button ghost" onClick={() => bulkAction('bulk_reject')}>Reject selected</button><button className="button danger" onClick={() => bulkAction('bulk_destroy')}>Delete selected</button><button className="button ghost" onClick={() => setSelectedIds([])}>Clear</button></div>}{payload.uploads.length === 0 ? <div className="empty-dev-card"><strong>No uploads in this view.</strong><p>New guest uploads will appear here for review.</p></div> : <div className="review-list">{payload.uploads.map((upload) => <article className={`review-card ${upload.status}`} key={upload.id}><label className="select-upload"><input type="checkbox" checked={selectedIds.includes(upload.id)} onChange={() => toggleSelected(upload.id)} /> Select</label><MediaPreview upload={upload} /><div className="review-body"><strong>{upload.guest_name || 'Anonymous guest'}</strong>{upload.guest_message && <p>{upload.guest_message}</p>}<p className="muted">{upload.original_filename} · {formatBytes(upload.file_size)} · {upload.status}{upload.album_section ? ` · ${upload.album_section.name}` : ''}</p><label className="compact-label">Album section<select value={upload.album_section_id || ''} onChange={(e) => updateUpload(upload.id, { album_section_id: e.target.value ? Number(e.target.value) : null })}><option value="">Uncategorized</option>{payload.album_sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><div className="actions"><button className="button primary" disabled={busyId === upload.id} onClick={() => act(upload.id, 'approve')}>Approve</button><button className="button danger" disabled={busyId === upload.id} onClick={() => act(upload.id, 'reject')}>Reject</button><button className="button danger" disabled={busyId === upload.id} onClick={() => deleteUpload(upload.id)}>Delete</button>{upload.file_url && <a className="button ghost" href={upload.file_url} target="_blank" rel="noopener noreferrer">Open</a>}</div></div></article>)}</div>}</>}</section></main>
}

function MediaGrid({ uploads }: { uploads: MediaUpload[] }) { return <div className="media-grid">{uploads.map((upload) => <MediaPreview key={upload.id} upload={upload} />)}</div> }
function MediaPreview({ upload }: { upload: MediaUpload }) { if (!upload.file_url) return <div className="placeholder">No preview</div>; if (upload.media_kind === 'video') return <video src={upload.file_url} controls playsInline />; return <img src={upload.file_url} alt={upload.guest_message || upload.original_filename} loading="lazy" referrerPolicy="no-referrer" /> }

export default App
