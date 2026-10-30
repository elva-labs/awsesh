import { afterEach, expect, mock, test } from "bun:test"
import { RGBA, type ParsedKey } from "@opentui/core"
import { Keybind } from "../util/keybind"
import { defaultConfig } from "@/config/config"
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

const defaultBindings: Record<string, string[]> = { ...defaultConfig.keybinds }
let bindings = { ...defaultBindings }

mock.module("../context/keybind", () => ({
  useKeybind: () => ({
    match: (key: string, evt: ParsedKey) => bindings[key]?.some((binding) => Keybind.match(Keybind.parse(binding), Keybind.fromParsedKey(evt))) ?? false,
    print: (key: string) => bindings[key]?.[0] ?? "",
  }),
}))

mock.module("../context/command", () => ({
  useCommand: () => ({ suspend: () => {} }),
}))

mock.module("../context/config", () => ({
  useConfig: () => ({ data: { mouseEdgeScroll: false } }),
}))

const { Dialog } = await import("./dialog")
mock.module("./dialog", () => ({
  Dialog,
  useDialog: () => ({ stack: [] }),
}))

const { FilterableList } = await import("./filterable-list")

type Item = FilterableListItem<string>

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
  bindings = { ...defaultBindings }
})

const item = (title: string, subtitle?: string): Item => ({ id: title, title, subtitle, value: title })

const renderList = async (initial: Item[], options?: { initialId?: string; height?: number; collapsed?: string[] }) => {
  const [items, setItems] = createSignal(initial)
  const [initialId, setInitialId] = createSignal(options?.initialId)
  const [collapsed, setCollapsed] = createSignal(options?.collapsed ?? [])
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
        onEmpty={() => { moved = undefined }}
        collapsedCategories={collapsed()}
        onCategoryToggle={options?.collapsed === undefined ? undefined : (category, collapse) => {
          setCollapsed((current) => [...current.filter((value) => value !== category), ...(collapse ? [category] : [])])
        }}
      />
    ),
    { width: 80, height: options?.height ?? 30, kittyKeyboard: true },
  )
  await setup.waitForFrame((frame) => frame.includes(initial[0].category ?? initial[0].title))

  const view = setup
  const selectedId = async (key = "RETURN"): Promise<string | undefined> => {
    selected = undefined
    view.mockInput.pressKey(key)
    await view.flush()
    return selected
  }

  const press = async (key: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      view.mockInput.pressKey(key)
      await view.renderOnce()
    }
  }

  const filter = async (text: string) => {
    await view.mockInput.typeText(bindings.filter[0])
    await view.mockInput.typeText(text)
    view.mockInput.pressKey(["return", "enter"].includes(bindings.select[0]) ? "RETURN" : bindings.select[0])
    await view.flush()
  }

  return { setItems, setInitialId, selectedId, movedId: () => moved, press, filter, frame: () => setup?.captureCharFrame() ?? "", flush: () => setup?.flush() }
}

test("keeps the selection when items reorder", async () => {
  const list = await renderList([item("alpha"), item("beta"), item("gamma")])

  await list.press("j")
  expect(await list.selectedId()).toBe("beta")

  list.setItems([item("gamma"), item("alpha"), item("beta")])
  await setup!.flush()

  expect(await list.selectedId()).toBe("beta")
})

test("reopening a Unicode filter appends text at the end", async () => {
  const list = await renderList([item("Lantmännen"), item("東京 [Production]")])
  await list.filter("東京")
  expect(await list.selectedId()).toBe("東京 [Production]")
  await list.filter(" [Production]")
  expect(await list.selectedId()).toBe("東京 [Production]")
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

test("navigates grouped rows in their rendered order", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "Production" },
    { ...item("beta"), category: "Development" },
    { ...item("gamma"), category: "Production" },
  ])
  await list.press("j")
  expect(await list.selectedId()).toBe("gamma")
  await list.press("j")
  expect(await list.selectedId()).toBe("beta")
})

test("collapsed categories retain headings and reveal matching accounts during search", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "Production", categoryId: "group:Production" },
    { ...item("beta"), category: "Development", categoryId: "group:Development" },
  ], { collapsed: [] })
  await list.press("h")
  expect(list.frame()).toContain("▸ Production")
  expect(list.frame()).not.toContain("alpha")
  expect(list.movedId()).toBeUndefined()
  await list.filter("alpha")
  expect(list.frame()).toContain("alpha")
  expect(list.frame()).toContain("▾ Production")
  expect(await list.selectedId()).toBe("alpha")
  await list.press("ESCAPE")
  expect(list.frame()).not.toContain("alpha")
  expect(list.movedId()).toBeUndefined()
  await list.press("l")
  expect(list.frame()).toContain("alpha")
  await list.press("j")
  expect(await list.selectedId()).toBe("alpha")
})

test("fully collapsed lists remain expandable and clear the account selection", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "Production", categoryId: "group:Production" },
  ], { collapsed: [] })
  await list.press("h")
  expect(list.frame()).toContain("▸ Production")
  expect(list.frame()).not.toContain("No items found")
  expect(list.movedId()).toBeUndefined()
  expect(await list.selectedId()).toBeUndefined()
  await list.press("l")
  expect(list.frame()).toContain("alpha")
  await list.press("j")
  expect(await list.selectedId()).toBe("alpha")
})

test("favorite headings collapse independently from groups with the same label", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "★ Favorites", categoryId: "favorites", favorite: true },
    { ...item("beta"), category: "Favorites", categoryId: "group:Favorites" },
  ], { collapsed: [] })
  await list.press("h")
  expect(list.frame()).not.toContain("alpha")
  expect(list.frame()).toContain("★")
  await list.press("j")
  expect(list.frame()).toContain("beta")
  await list.selectedId()
  expect(list.frame()).not.toContain("beta")
  expect(list.movedId()).toBeUndefined()
})

test("navigates every collapsed heading and Enter toggles only the focused category", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "★ Favorites", categoryId: "favorites", favorite: true },
    { ...item("beta"), category: "Production", categoryId: "group:Production" },
    { ...item("gamma"), category: "Development", categoryId: "group:Development" },
  ], { collapsed: ["favorites", "group:Production", "group:Development"] })

  await list.press("j")
  await list.selectedId()
  expect(list.frame()).toContain("beta")
  expect(list.frame()).not.toContain("alpha")
  expect(list.frame()).not.toContain("gamma")
  expect(list.movedId()).toBeUndefined()
  await list.press("j")
  expect(await list.selectedId()).toBe("beta")
  await list.press("j")
  await list.selectedId()
  expect(list.frame()).toContain("gamma")
  expect(list.frame()).not.toContain("alpha")
  await list.press("h")
  expect(list.frame()).not.toContain("gamma")
  await list.press("k", 3)
  await list.press("l")
  expect(list.frame()).toContain("alpha")
})

test("account rows do not display favorite stars", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "★ Favorites", categoryId: "favorites", favorite: true },
  ], { collapsed: [], initialId: "alpha" })
  const row = list.frame().split("\n").find((line) => line.includes("alpha"))
  expect(row).toBeDefined()
  expect(row).not.toContain("★")
  expect(row).not.toContain("☆")
})

test("expanding from a favorite account never opens an unrelated section", async () => {
  const list = await renderList([
    { ...item("alpha"), category: "★ Favorites", categoryId: "favorites", favorite: true },
    { ...item("beta"), category: "Production", categoryId: "group:Production" },
  ], { collapsed: ["group:Production"], initialId: "alpha" })
  await list.press("l")
  expect(list.frame()).not.toContain("beta")
  expect(list.movedId()).toBe("alpha")
  await list.press("j")
  expect(list.movedId()).toBeUndefined()
  await list.press("l")
  expect(list.frame()).toContain("beta")
})

test("page navigation uses its remapped bindings", async () => {
  bindings = { ...bindings, nav_page_down: ["f6"], nav_page_up: ["f5"] }
  const list = await renderList(Array.from({ length: 15 }, (_, index) => item(`account-${index}`)))
  await list.press("\u001b[6~")
  expect(await list.selectedId()).toBe("account-0")
  await list.press("F6")
  expect(await list.selectedId()).toBe("account-10")
  await list.press("F5")
  expect(await list.selectedId()).toBe("account-0")
})

test("overflowing account lists keep their first heading below the search separator", async () => {
  const list = await renderList(Array.from({ length: 30 }, (_, index) => ({
    ...item(`account-${index}`, "111122223333 · AdministratorAccess · eu-north-1"),
    category: "Production",
    categoryId: "group:Production",
  })), { height: 12, collapsed: [] })
  if (!setup) throw new Error("List renderer was not initialized")
  const view = setup
  for (const dimensions of [{ width: 80, height: 12 }, { width: 45, height: 24 }, { width: 80, height: 8 }]) {
    view.resize(dimensions.width, dimensions.height)
    await view.flush()
    const lines = list.frame().split("\n")
    const search = lines.findIndex((line) => line.includes("Search..."))
    const heading = lines.findIndex((line) => line.includes("Production"))
    expect(search).toBeGreaterThanOrEqual(0)
    expect(lines[search + 1]?.trim()).toBe("─".repeat(dimensions.width))
    expect(heading).toBeGreaterThan(search + 1)
  }
})

test("overflowing ungrouped lists keep account rows below the search separator", async () => {
  const list = await renderList(Array.from({ length: 30 }, (_, index) => item(`account-${index}`, "AdministratorAccess")), { height: 12 })
  const lines = list.frame().split("\n")
  const search = lines.findIndex((line) => line.includes("Search..."))
  expect(search).toBeGreaterThanOrEqual(0)
  expect(lines[search + 1]?.trim()).toBe("─".repeat(80))
  expect(lines.findIndex((line) => line.includes("account-0"))).toBeGreaterThan(search + 1)
})

test("remapped navigation, activation, folding, filtering and back replace the default keys", async () => {
  bindings = { ...bindings, nav_down: ["n"], nav_up: ["u"], nav_left: ["x"], nav_right: ["y"], select: ["v"], filter: ["s"], back: ["b"] }
  const list = await renderList([
    { ...item("alpha"), category: "Production", categoryId: "group:Production" },
    { ...item("beta"), category: "Development", categoryId: "group:Development" },
  ], { collapsed: ["group:Production", "group:Development"] })
  await list.press("j")
  await list.press("l")
  await list.press("RETURN")
  expect(list.frame()).not.toContain("alpha")
  expect(list.frame()).not.toContain("beta")
  await list.press("n")
  await list.selectedId("v")
  expect(list.frame()).toContain("beta")
  expect(list.frame()).not.toContain("alpha")
  await list.press("x")
  expect(list.frame()).not.toContain("beta")
  await list.press("u")
  await list.press("y")
  expect(list.frame()).toContain("alpha")
  await list.press("x")
  await list.filter("alpha")
  expect(list.frame()).toContain("alpha")
  await list.press("b")
  expect(list.frame()).not.toContain("alpha")
})
