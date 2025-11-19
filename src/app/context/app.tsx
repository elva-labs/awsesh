import { createContext, useContext, createSignal, createEffect, type ParentProps } from "solid-js"
import { AWSClient } from "@/aws/client"
import { ConfigManager } from "@/config/manager"
import type { SSOProfile, Account } from "@/types"

type View = 
  | { type: "home" }
  | { type: "profile-list" }
  | { type: "profile-create" }
  | { type: "profile-edit"; profile: SSOProfile }
  | { type: "sso-login"; profile: SSOProfile }
  | { type: "account-list"; profile: SSOProfile; token: string }
  | { type: "role-list"; profile: SSOProfile; token: string; account: Account }
  | { type: "success"; profileName: string; accountName: string; roleName: string }

interface AppState {
  view: View
  profiles: SSOProfile[]
  loading: boolean
  error: string | null
}

interface AppContextValue {
  state: AppState
  setView: (view: View) => void
  setProfiles: (profiles: SSOProfile[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  loadProfiles: () => Promise<void>
  exit: () => void
}

const AppContext = createContext<AppContextValue>()

export function AppProvider(props: ParentProps) {
  const [state, setState] = createSignal<AppState>({
    view: { type: "home" },
    profiles: [],
    loading: false,
    error: null,
  })

  const setView = (view: View) => {
    setState(s => ({ ...s, view, error: null }))
  }

  const setProfiles = (profiles: SSOProfile[]) => {
    setState(s => ({ ...s, profiles }))
  }

  const setLoading = (loading: boolean) => {
    setState(s => ({ ...s, loading }))
  }

  const setError = (error: string | null) => {
    setState(s => ({ ...s, error }))
  }

  const loadProfiles = async () => {
    setLoading(true)
    try {
      const profiles = await ConfigManager.loadProfiles()
      setProfiles(profiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles")
    } finally {
      setLoading(false)
    }
  }

  const exit = () => {
    process.exit(0)
  }

  createEffect(() => {
    loadProfiles()
  })

  const value: AppContextValue = {
    state: state(),
    setView,
    setProfiles,
    setLoading,
    setError,
    loadProfiles,
    exit,
  }

  return (
    <AppContext.Provider value={value}>
      {props.children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within AppProvider")
  }
  return context
}
