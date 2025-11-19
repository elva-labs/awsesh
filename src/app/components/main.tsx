import { Show, Switch, Match } from "solid-js"
import { useApp } from "../context/app"
import { Home } from "./views/home"
import { ProfileList } from "./views/profile-list"
import { ProfileCreate } from "./views/profile-create"
import { ProfileEdit } from "./views/profile-edit"
import { SSOLogin } from "./views/sso-login"
import { AccountList } from "./views/account-list"
import { RoleList } from "./views/role-list"
import { Success } from "./views/success"

export function Main() {
  const app = useApp()

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Show when={app.state.error}>
        <box width="100%" padding={1} style={{ backgroundColor: "red" }}>
          <text fg="white">{app.state.error}</text>
        </box>
      </Show>

      <Switch>
        <Match when={app.state.view.type === "home"}>
          <Home />
        </Match>
        <Match when={app.state.view.type === "profile-list"}>
          <ProfileList />
        </Match>
        <Match when={app.state.view.type === "profile-create"}>
          <ProfileCreate />
        </Match>
        <Match when={app.state.view.type === "profile-edit"}>
          <ProfileEdit profile={(app.state.view as any).profile} />
        </Match>
        <Match when={app.state.view.type === "sso-login"}>
          <SSOLogin profile={(app.state.view as any).profile} />
        </Match>
        <Match when={app.state.view.type === "account-list"}>
          <AccountList 
            profile={(app.state.view as any).profile}
            token={(app.state.view as any).token}
          />
        </Match>
        <Match when={app.state.view.type === "role-list"}>
          <RoleList 
            profile={(app.state.view as any).profile}
            token={(app.state.view as any).token}
            account={(app.state.view as any).account}
          />
        </Match>
        <Match when={app.state.view.type === "success"}>
          <Success 
            profileName={(app.state.view as any).profileName}
            accountName={(app.state.view as any).accountName}
            roleName={(app.state.view as any).roleName}
          />
        </Match>
      </Switch>
    </box>
  )
}
