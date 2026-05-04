import { createContext, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useAwsesh } from "./awsesh"
import { Log } from "@/util/log"

const log = Log.create({ service: "credentials-context" })

export interface ActiveCredentials {
  sessionName: string
  profileName: string
  accountName: string
  accountId: string
  roleName: string
  region: string
  expiration: string
}

function init(awsesh: ReturnType<typeof useAwsesh>) {
  const [store, setStore] = createStore({
    active: null as ActiveCredentials | null,
  })

  ;(async () => {
    try {
      const active = await awsesh.activeCredentials.list()
      if (active.length > 0) {
        const sorted = active.sort(
          (a, b) => new Date(b.expiration).getTime() - new Date(a.expiration).getTime()
        )
        const mostRecent = sorted[0]
        setStore("active", {
          sessionName: mostRecent.sessionName,
          profileName: mostRecent.profileName,
          accountName: mostRecent.accountName,
          accountId: mostRecent.accountId,
          roleName: mostRecent.roleName,
          region: mostRecent.region ?? "",
          expiration: mostRecent.expiration,
        })
      }
    } catch (e) {
      log.error("Failed to load active credentials", { error: e })
    }
  })()

  return {
    get active() {
      return store.active
    },
    set(credentials: ActiveCredentials) {
      setStore("active", credentials)
    },
    clear() {
      setStore("active", null)
    },
  }
}

export type CredentialsContext = ReturnType<typeof init>

const ctx = createContext<CredentialsContext>()

export function CredentialsProvider(props: ParentProps) {
  const awsesh = useAwsesh()
  const value = init(awsesh)
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useCredentials() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useCredentials must be used within a CredentialsProvider")
  }
  return value
}
