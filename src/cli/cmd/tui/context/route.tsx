import { createStore } from "solid-js/store";
import { createSimpleContext } from "./helper";

/**
 * Route types for awsesh TUI navigation
 */
export type SSOSelectRoute = {
  type: "sso-select";
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

export type SuccessRoute = {
  type: "success";
  profileName: string;
  accountName: string;
  roleName: string;
};

export type Route =
  | SSOSelectRoute
  | AccountSelectRoute
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
