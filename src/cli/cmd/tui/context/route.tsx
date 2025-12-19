import { createStore } from "solid-js/store";
import { createSimpleContext } from "./helper";
import type { SSOProfile } from "@/types";

/**
 * Route types for awsesh TUI navigation
 */
export type SSOSelectRoute = {
  type: "sso-select";
};

export type ProfileFormRoute = {
  type: "profile-form";
  mode: "create" | "edit";
  profile?: SSOProfile;
};

export type ProfileDeleteConfirmRoute = {
  type: "profile-delete-confirm";
  profileName: string;
};

export type AccountSelectRoute = {
  type: "account-select";
  profileName: string;
};

export type RegionSelectRoute = {
  type: "region-select";
  profileName: string;
  accountId: string;
  accountName: string;
};

export type RoleSelectRoute = {
  type: "role-select";
  profileName: string;
  accountId: string;
  accountName: string;
  region?: string;
};

export type ProfileNameInputRoute = {
  type: "profile-name-input";
  profileName: string;
  accountId: string;
  accountName: string;
  roleName: string;
  region?: string;
};

export type SSOLoginRoute = {
  type: "sso-login";
  profileName: string;
  startUrl: string;
  ssoRegion: string;
};

export type SuccessRoute = {
  type: "success";
  profileName: string;
  accountName: string;
  accountId: string;
  roleName: string;
  expiration?: string; // ISO 8601 string
  region?: string;
};

export type Route =
  | SSOSelectRoute
  | ProfileFormRoute
  | ProfileDeleteConfirmRoute
  | AccountSelectRoute
  | SSOLoginRoute
  | RegionSelectRoute
  | RoleSelectRoute
  | ProfileNameInputRoute
  | SuccessRoute;

/**
 * Route context provider for TUI navigation
 */
export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<Route>({
      type: "sso-select",
    });

    return {
      get data() {
        return store;
      },
      navigate(route: Route) {
        setStore(route);
      },
    };
  },
});

export type RouteContext = ReturnType<typeof useRoute>;

/**
 * Helper to get typed route data
 */
export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute();
  return route.data as Extract<Route, { type: typeof type }>;
}
