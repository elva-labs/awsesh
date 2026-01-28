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
  sessionName: string;
};

export type CredentialsRoute = {
  type: "credentials";
};

export type Route =
  | SSOSelectRoute
  | AccountSelectRoute
  | CredentialsRoute;

type RouteStore = SSOSelectRoute | AccountSelectRoute | CredentialsRoute;

/**
 * Route context provider for TUI navigation
 */
export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<RouteStore>({
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
