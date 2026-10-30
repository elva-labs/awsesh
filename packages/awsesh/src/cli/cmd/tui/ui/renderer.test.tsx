import { afterEach, expect, mock, test } from "bun:test"
import { RGBA, type ParsedKey } from "@opentui/core"
import { Keybind } from "../util/keybind"
import { defaultConfig } from "@/config/config"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { createSignal, Show } from "solid-js"

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

mock.module("../context/config", () => ({
  useConfig: () => ({ data: { mouseEdgeScroll: false } }),
}))

let selectKey = defaultConfig.keybinds.select[0]
const defaultNavigation = { nav_up: ["up", "k"], nav_down: ["down", "j"], nav_page_up: ["pageup"], nav_page_down: ["pagedown"] }
let navigation: Record<string, string[]> = { ...defaultNavigation }
mock.module("../context/keybind", () => ({
  useKeybind: () => ({
    match: (action: string, event: ParsedKey) => (action === "select" ? [selectKey] : navigation[action] ?? []).some((binding) => Keybind.match(Keybind.parse(binding), Keybind.fromParsedKey(event))),
    print: (action: string) => action === "back" ? "escape" : selectKey,
  }),
}))

let dialogClearCount = 0

mock.module("./dialog", () => ({
  useDialog: () => ({
    clear: () => dialogClearCount++,
  }),
}))

const { Layout } = await import("./layout")
const { DialogPrompt } = await import("./dialog-prompt")
const { DialogSelect } = await import("./dialog-select")

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
  dialogClearCount = 0
  selectKey = defaultConfig.keybinds.select[0]
  navigation = { ...defaultNavigation }
})

test("Layout renders and responds to terminal resize", async () => {
  setup = await testRender(
    () => (
      <Layout
        header={<text>Header</text>}
        footer={<text>Footer</text>}
        sidebar={<text>Sidebar</text>}
        sidebarWidth={12}
        showSidebar
      >
        <text>Content</text>
      </Layout>
    ),
    { width: 40, height: 8 },
  )

  await setup.renderOnce()
  const initialFrame = setup.captureCharFrame()

  expect(initialFrame).toContain("Header")
  expect(initialFrame).toContain("Content")
  expect(initialFrame).toContain("Footer")
  expect(initialFrame).toContain("Sidebar")

  setup.resize(48, 6)
  const resizedFrame = await setup.waitForFrame(
    (frame) => frame.split("\n")[0]?.length === 48 && frame.includes("Sidebar"),
  )

  expect(resizedFrame).toContain("Content")
  expect(resizedFrame).toContain("Sidebar")
})

test("DialogPrompt accepts input and submits with Enter", async () => {
  let confirmedValue: string | undefined

  setup = await testRender(
    () => (
      <DialogPrompt
        title="Profile name"
        placeholder="Enter a profile"
        onConfirm={(value) => {
          confirmedValue = value
        }}
      />
    ),
    { width: 80, height: 20 },
  )

  const promptFrame = await setup.waitForFrame((frame) => frame.includes("Profile name"))
  expect(promptFrame).toContain("Enter a profile")
  expect(promptFrame).toContain("Cancel")
  expect(promptFrame).toContain("Submit")

  await setup.mockInput.typeText("engineering")
  await setup.flush()
  expect(setup.captureCharFrame()).toContain("engineering")

  setup.mockInput.pressEnter()
  await setup.waitFor(() => confirmedValue !== undefined)

  expect(confirmedValue).toBe("engineering")
  expect(dialogClearCount).toBe(1)
})

test("DialogPrompt submits its default value when left empty", async () => {
  let confirmedValue: string | undefined

  setup = await testRender(
    () => (
      <DialogPrompt
        title="Region"
        defaultValue="eu-west-1"
        onConfirm={(value) => {
          confirmedValue = value
        }}
      />
    ),
    { width: 80, height: 20 },
  )

  await setup.waitForFrame((frame) => frame.includes("eu-west-1"))
  setup.mockInput.pressEnter()
  await setup.waitFor(() => confirmedValue !== undefined)

  expect(confirmedValue).toBe("eu-west-1")
})

test("closing a select before deferred focus does not focus a destroyed input", async () => {
  const [visible, setVisible] = createSignal(true)
  setup = await testRender(() => (
    <Show when={visible()}>
      <DialogSelect title="Roles" options={[{ title: "Administrator", value: "admin" }]} />
    </Show>
  ), { width: 80, height: 20 })

  setVisible(false)
  await setup.flush()
  await Bun.sleep(5)
  expect(setup.captureCharFrame()).not.toContain("Roles")
})

test("prompt confirmation honors its remapped binding instead of Enter", async () => {
  selectKey = "f8"
  let value: string | undefined
  setup = await testRender(() => <DialogPrompt title="Group name" onConfirm={(text) => { value = text }} />, { width: 80, height: 20 })
  await setup.waitForFrame((frame) => frame.includes("Group name"))
  await setup.mockInput.typeText("Engineering")
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(value).toBeUndefined()
  setup.mockInput.pressKey("F8")
  await setup.waitFor(() => value !== undefined)
  expect(value).toBe("Engineering")
})

test("searchable select honors remapped movement and activation", async () => {
  selectKey = "f8"
  navigation = { ...navigation, nav_down: ["f6"], nav_up: ["f5"] }
  let value: string | undefined
  setup = await testRender(() => (
    <DialogSelect title="Groups" options={[{ title: "Alpha", value: "alpha" }, { title: "Beta", value: "beta" }]} onSelect={(option) => { value = option.value }} />
  ), { width: 80, height: 20 })
  await setup.waitForFrame((frame) => frame.includes("Alpha"))
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(value).toBeUndefined()
  setup.mockInput.pressKey("F6")
  await setup.renderOnce()
  setup.mockInput.pressKey("F8")
  await setup.waitFor(() => value !== undefined)
  expect(value).toBe("beta")
})

test("searchable select keeps printable navigation bindings available for typing", async () => {
  let value: string | undefined
  let query = ""
  setup = await testRender(() => (
    <DialogSelect title="Groups" options={[{ title: "jack", value: "jack" }, { title: "other", value: "other" }]} onFilter={(text) => { query = text }} onSelect={(option) => { value = option.value }} />
  ), { width: 80, height: 20 })
  await setup.waitForFrame((frame) => frame.includes("jack"))
  await Bun.sleep(5)
  await setup.mockInput.typeText("j")
  expect(query).toBe("j")
  setup.mockInput.pressEnter()
  await setup.waitFor(() => value !== undefined)
  expect(value).toBe("jack")
})
