import { afterEach, expect, mock, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { createSignal } from "solid-js"
import type { FilterableListItem } from "./filterable-list"

const color = RGBA.fromInts(255, 255, 255)
const background = RGBA.fromInts(0, 0, 0)
const theme = new Proxy(
  { background },
  {
    get(target, property) {
      return property === "background" ? target.background : color
    },
  },
)

mock.module("../context/theme", () => ({
  useTheme: () => ({ theme }),
}))

mock.module("../context/keybind", () => ({
  useKeybind: () => ({
    match: (key: string, evt: { name: string }) => key === "filter" && evt.name === "/",
  }),
}))

mock.module("../context/command", () => ({
  useCommand: () => ({ suspend: () => {} }),
}))

mock.module("../context/config", () => ({
  useConfig: () => ({ data: { mouseEdgeScroll: false } }),
}))

mock.module("./dialog", () => ({
  useDialog: () => ({ stack: [] }),
}))

const { FilterableList } = await import("./filterable-list")

type Item = FilterableListItem<string>

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

const item = (title: string, subtitle?: string): Item => ({ id: title, title, subtitle, value: title })

const renderList = async (initial: Item[], options?: { initialId?: string; height?: number }) => {
  const [items, setItems] = createSignal(initial)
  const [initialId, setInitialId] = createSignal(options?.initialId)
  let selected: string | undefined
  let moved: string | undefined

  setup = await testRender(
    () => (
      <FilterableList
        items={items()}
        initialId={initialId()}
        onSelect={(item) => {
          selected = item.id
        }}
        onMove={(item) => {
          moved = item.id
        }}
      />
    ),
    { width: 80, height: options?.height ?? 30 },
  )
  await setup.waitForFrame((frame) => frame.includes(initial[0].title))

  const selectedId = async (): Promise<string | undefined> => {
    selected = undefined
    setup!.mockInput.pressEnter()
    await setup!.flush()
    return selected
  }

  const press = async (key: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      setup!.mockInput.pressKey(key)
      await setup!.renderOnce()
    }
  }

  const filter = async (text: string) => {
    await setup!.mockInput.typeText("/")
    await setup!.mockInput.typeText(text)
    setup!.mockInput.pressEnter()
    await setup!.flush()
  }

  return { setItems, setInitialId, selectedId, movedId: () => moved, press, filter }
}

test("keeps the selection when items reorder", async () => {
  const list = await renderList([item("alpha"), item("beta"), item("gamma")])

  await list.press("j")
  expect(await list.selectedId()).toBe("beta")

  list.setItems([item("gamma"), item("alpha"), item("beta")])
  await setup!.flush()

  expect(await list.selectedId()).toBe("beta")
})

test("keeps the selection when a filtered list reorders", async () => {
  const list = await renderList([
    item("prod-api", "111 · AdministratorAccess"),
    item("prod-web", "222 · AdminRead"),
    item("prod-data", "333 · AdministratorAccess"),
  ])

  await list.filter("admin")
  expect(await list.selectedId()).toBe("prod-web")

  list.setItems([
    item("prod-api", "111 · AdministratorAccess"),
    item("prod-web", "222 · AdministratorAccess"),
    item("prod-data", "333 · AdministratorAccess"),
  ])
  await setup!.flush()

  expect(await list.selectedId()).toBe("prod-web")
})

test("notifies the first match when the filter changes", async () => {
  const list = await renderList([item("alpha"), item("beta"), item("gamma")])

  await list.press("j", 2)
  expect(list.movedId()).toBe("gamma")

  await list.filter("bet")

  expect(list.movedId()).toBe("beta")
  expect(await list.selectedId()).toBe("beta")
})

test("selects the next item when the selected item is removed", async () => {
  const list = await renderList([item("alpha"), item("beta"), item("gamma")])

  await list.press("j")
  list.setItems([item("alpha"), item("gamma")])
  await setup!.flush()

  expect(list.movedId()).toBe("gamma")
  expect(await list.selectedId()).toBe("gamma")
})

test("applies the initial id when it arrives with reordered items", async () => {
  const list = await renderList([item("alpha"), item("beta"), item("gamma")], { initialId: "delta" })

  list.setItems([item("alpha"), item("beta"), item("gamma")])
  await setup!.flush()
  list.setItems([item("xi"), item("psi"), item("delta"), item("alpha"), item("beta"), item("gamma")])
  await setup!.flush()

  expect(list.movedId()).toBe("delta")
  expect(await list.selectedId()).toBe("delta")
})

test("scrolls to the selected item after it moves in a long list", async () => {
  const titles = Array.from({ length: 50 }, (_, i) => `item-${String(i).padStart(2, "0")}`)
  const list = await renderList(titles.map((title) => item(title)), { height: 20 })

  await list.press("j", 25)
  expect(setup!.captureCharFrame()).toContain("item-25")

  const reordered = titles.filter((title) => title !== "item-25")
  reordered.splice(40, 0, "item-25")
  list.setItems(reordered.map((title) => item(title)))
  await setup!.flush()
  await setup!.renderOnce()
  await setup!.renderOnce()

  expect(setup!.captureCharFrame()).toContain("item-25")
  expect(await list.selectedId()).toBe("item-25")
})

test("keeps the keyboard selection when rows re-render under a resting mouse pointer", async () => {
  const list = await renderList([item("alpha", "ReadOnly"), item("beta", "ReadOnly"), item("gamma", "ReadOnly")])

  const gammaRow = setup!.captureCharFrame().split("\n").findIndex((line) => line.includes("gamma"))
  await setup!.mockMouse.moveTo(10, gammaRow)
  await setup!.flush()
  expect(await list.selectedId()).toBe("gamma")

  await list.press("k", 2)
  expect(await list.selectedId()).toBe("alpha")

  list.setItems([item("alpha", "AdministratorAccess"), item("beta", "ReadOnly"), item("gamma", "ReadOnly")])
  await setup!.flush()
  await setup!.renderOnce()

  expect(await list.selectedId()).toBe("alpha")
})
