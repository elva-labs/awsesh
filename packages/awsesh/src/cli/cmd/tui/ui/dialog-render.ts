import { createComponent, type Component, type JSX } from "solid-js"

export function createDialogRender<P extends Record<string, any>>(
  component: Component<P>,
  props?: P,
): () => JSX.Element {
  return () => createComponent(component, (props ?? {}) as P)
}
