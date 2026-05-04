import { expect, test } from "bun:test"
import {
  createComponent,
  createContext,
  createRoot,
  useContext,
  type Component,
} from "solid-js"
import { createDialogRender } from "./dialog-render"

test("createDialogRender defers dialog component creation until rendered under a provider", () => {
  const values: string[] = []
  const ctx = createContext<string>()

  const Child: Component = () => {
    const value = useContext(ctx)
    if (!value) {
      throw new Error("missing provider")
    }
    values.push(value)
    return null
  }

  createRoot((dispose) => {
    const render = createDialogRender(Child)

    expect(values).toEqual([])

    createComponent(ctx.Provider, {
      value: "dialog-provider",
      get children() {
        return render()
      },
    })

    expect(values).toEqual(["dialog-provider"])
    dispose()
  })
})
