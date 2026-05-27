/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ClerkProvider, SignInButton, SignOutButton, useAuth, useUser } from '@clerk/clerk-react'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
export const isClerkEnabled = Boolean(CLERK_KEY)

type AuthContextValue = {
  enabled: boolean
  loaded: boolean
  signedIn: boolean
  getToken: () => Promise<string | null>
  userName: string | null
  userEmail: string | null
}

const defaultAuthContext: AuthContextValue = {
  enabled: false,
  loaded: true,
  signedIn: false,
  getToken: async () => null,
  userName: null,
  userEmail: null,
}

const localDevAuthContext: AuthContextValue = {
  enabled: false,
  loaded: true,
  signedIn: true,
  getToken: async () => null,
  userName: 'Local Admin',
  userEmail: null,
}

const AuthContext = createContext<AuthContextValue>(defaultAuthContext)

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const userEmail = user?.primaryEmailAddress?.emailAddress || null
  const userName = user?.fullName || userEmail
  const getAuthToken = useCallback(() => getToken(), [getToken])
  const value = useMemo<AuthContextValue>(() => ({
    enabled: true,
    loaded: isLoaded,
    signedIn: Boolean(isSignedIn),
    getToken: getAuthToken,
    userName,
    userEmail,
  }), [getAuthToken, isLoaded, isSignedIn, userEmail, userName])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function NoAuthBridge({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={localDevAuthContext}>{children}</AuthContext.Provider>
}

export function AuthRoot({ children }: { children: ReactNode }) {
  if (!isClerkEnabled) return <NoAuthBridge>{children}</NoAuthBridge>

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" signInFallbackRedirectUrl="/admin" signUpFallbackRedirectUrl="/admin">
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}

export function useAppAuth() {
  return useContext(AuthContext)
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const auth = useAppAuth()
  const [returnTo] = useState(() => window.location.pathname + window.location.search)

  if (!auth.loaded) return <div className="auth-state">Loading secure dashboard…</div>
  if (auth.enabled && !auth.signedIn) return <AdminAuthPrompt returnTo={returnTo} />

  return <>{children}</>
}

function AdminAuthPrompt({ returnTo }: { returnTo: string }) {
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card" aria-labelledby="admin-auth-title">
        <p className="eyebrow">Admin access</p>
        <h1 id="admin-auth-title">Sign in to manage your event.</h1>
        <p className="muted">Use your invited admin or reviewer account to review uploads, manage galleries, and invite teammates.</p>
        <div className="admin-auth-actions">
          <SignInButton mode="modal" forceRedirectUrl={returnTo}>
            <button className="button primary" type="button">Sign in</button>
          </SignInButton>
        </div>
        <p className="muted auth-note">Need access? Ask an admin to send you an invitation first.</p>
        <a className="quiet-link" href="/">Return to homepage</a>
      </section>
    </main>
  )
}

export function AdminLoginButton({ children }: { children: ReactNode }) {
  if (!isClerkEnabled) return <a className="button dark-button" href="/admin">{children}</a>
  return <SignInButton mode="modal" forceRedirectUrl="/admin"><button className="button dark-button" type="button">{children}</button></SignInButton>
}

export function AdminSignOutButton() {
  const auth = useAppAuth()
  if (!auth.enabled) return null
  return <SignOutButton><button className="button ghost small-button" type="button">Sign out</button></SignOutButton>
}

export function useAuthHeaders() {
  const auth = useAppAuth()

  return useCallback(async function authHeaders(): Promise<Record<string, string>> {
    const token = await auth.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [auth])
}

