/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ClerkProvider, RedirectToSignIn, SignInButton, SignOutButton, useAuth, useUser } from '@clerk/clerk-react'

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
  if (auth.enabled && !auth.signedIn) return <RedirectToSignIn redirectUrl={returnTo} />

  return <>{children}</>
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

