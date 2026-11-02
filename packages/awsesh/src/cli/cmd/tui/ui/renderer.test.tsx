import { afterEach, expect, mock, test } from "bun:test"
import { InputRenderable, RGBA, type ParsedKey } from "@opentui/core"
import { Keybind } from "../util/keybind"
import { defaultConfig } from "@/config/config"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { createSignal, Show } from "solid-js"
import { createAwsesh } from "@awsesh/core"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
const { Dialog } = await import("./dialog")

mock.module("./dialog", () => ({
  Dialog,
  useDialog: () => ({
    clear: () => dialogClearCount++,
  }),
}))

let sessionSdk: ReturnType<typeof createAwsesh> | undefined
const sessionErrors: unknown[] = []
mock.module("../context/awsesh", () => ({
  useAwsesh: () => {
    if (!sessionSdk) throw new Error("Session SDK is not initialized")
    return sessionSdk
  },
}))
mock.module("../context/aws", () => ({ useAWS: () => ({ refreshSessions: async () => {} }) }))
mock.module("./toast", () => ({ useToast: () => ({ show: () => {}, error: (error: unknown) => sessionErrors.push(error) }) }))

const { Layout } = await import("./layout")
const { DialogPrompt } = await import("./dialog-prompt")
const { DialogSelect } = await import("./dialog-select")
const { DialogSessionForm } = await import("../component/dialog-session-form")

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
  dialogClearCount = 0
  selectKey = defaultConfig.keybinds.select[0]
  navigation = { ...defaultNavigation }
  sessionErrors.length = 0
})

test("session form creates and renames a Unicode name without moving its cursor into the middle", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "awsesh-session-form-"))
  const sdk = createAwsesh({ configDir: path.join(directory, "config"), dataDir: path.join(directory, "data"), awsDir: path.join(directory, "aws") })
  sessionSdk = sdk
  const name = " Lantmännen / 東京 "
  const session = { name: "", startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1" }
  try {
    let saved = Promise.withResolvers<void>()
    setup = await testRender(() => <DialogSessionForm mode="create" session={session} onSuccess={() => saved.resolve()} />, { width: 80, height: 30 })
    await setup.waitForFrame(frame => frame.includes("Add SSO Session"))
    await setup.waitFor(async () => {
      await Bun.sleep(1)
      const input = setup?.renderer.currentFocusedRenderable
      return input instanceof InputRenderable && input.value === ""
    })
    await setup.mockInput.typeText(name)
    setup.mockInput.pressEnter()
    await saved.promise
    expect(await sdk.sessions.get(name)).toEqual({ ...session, name })
    setup.renderer.destroy()

    saved = Promise.withResolvers<void>()
    setup = await testRender(() => <DialogSessionForm mode="edit" session={{ ...session, name }} onSuccess={() => saved.resolve()} />, { width: 80, height: 30 })
    await setup.waitForFrame(frame => frame.includes("Edit SSO Session"))
    await setup.waitFor(async () => {
      await Bun.sleep(1)
      const input = setup?.renderer.currentFocusedRenderable
      return input instanceof InputRenderable && input.value === name
    })
    await setup.mockInput.typeText(" renamed")
    setup.mockInput.pressEnter()
    await saved.promise
    expect(sessionErrors).toEqual([])
    expect(await sdk.sessions.get(name)).toBeUndefined()
    expect(await sdk.sessions.get(`${name} renamed`)).toEqual({ ...session, name: `${name} renamed` })
  } finally {
    setup?.renderer.destroy()
    setup = undefined
    sessionSdk = undefined
    await rm(directory, { recursive: true, force: true })
  }
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

test("whitespace-only select searches do not hide every option", async () => {
  let selected: string | undefined
  setup = await testRender(() => <DialogSelect title="Roles" options={[{ title: "Admin", value: "admin" }]} onSelect={option => { selected = option.value }} />, { width: 80, height: 20 })
  await setup.waitForFrame(frame => frame.includes("Admin"))
  await Bun.sleep(5)
  await setup.mockInput.typeText("   ")
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(selected).toBe("admin")
})

test("select tracks the selected option when asynchronous results reorder or shrink", async () => {
  const [options, setOptions] = createSignal([{ title: "Alpha", value: "alpha" }, { title: "Beta", value: "beta" }])
  let selected: string | undefined
  setup = await testRender(() => <DialogSelect title="Roles" options={options()} onSelect={option => { selected = option.value }} />, { width: 80, height: 20 })
  await setup.waitForFrame(frame => frame.includes("Beta"))
  setup.mockInput.pressArrow("down")
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(selected).toBe("beta")
  setOptions([{ title: "Beta", value: "beta" }, { title: "Alpha", value: "alpha" }])
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(selected).toBe("beta")
  setOptions([{ title: "Gamma", value: "gamma" }])
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(selected).toBe("gamma")
  setOptions([])
  await setup.flush()
  setup.mockInput.pressArrow("up")
  setup.mockInput.pressKey("\x1b[6~")
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(selected).toBe("gamma")
  setOptions([{ title: "Delta", value: "delta" }])
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()
  expect(selected).toBe("delta")
})

test("repeated Enter saves once and completion after dismissal leaves the replacement dialog alone", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "awsesh-session-dismiss-"))
  const sdk = createAwsesh({ configDir: path.join(directory, "config"), dataDir: path.join(directory, "data"), awsDir: path.join(directory, "aws") })
  const pending = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<void>()
  let requests = 0
  let completed = 0
  sdk.sessions.exists = async () => false
  sdk.sessions.save = async () => { requests++; started.resolve(); await pending.promise; finished.resolve() }
  sessionSdk = sdk
  const [visible, setVisible] = createSignal(true)
  try {
    setup = await testRender(() => <Show when={visible()} fallback={<text>Replacement dialog</text>}><DialogSessionForm mode="create" session={{ name: "Pending", startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1" }} onSuccess={() => completed++} /></Show>, { width: 80, height: 30 })
    await setup.waitForFrame(frame => frame.includes("Add SSO Session"))
    setup.mockInput.pressEnter()
    setup.mockInput.pressEnter()
    await started.promise
    expect(requests).toBe(1)
    setVisible(false)
    await setup.flush()
    pending.resolve()
    await finished.promise
    await setup.flush()
    expect(setup.captureCharFrame()).toContain("Replacement dialog")
    expect(dialogClearCount).toBe(0)
    expect(requests).toBe(1)
    expect(completed).toBe(0)
    expect(sessionErrors).toEqual([])
  } finally {
    pending.resolve()
    setup?.renderer.destroy()
    setup = undefined
    sessionSdk = undefined
    await rm(directory, { recursive: true, force: true })
  }
})

test("tall dialogs remain scrollable after resizing to a tiny terminal", async () => {
  setup = await testRender(() => <Dialog onClose={() => {}}><box flexDirection="column"><text>First field</text><text>{Array.from({ length: 20 }, (_, index) => `Field ${index + 1}`).join("\n")}</text><text>Save changes</text></box></Dialog>, { width: 80, height: 30 })
  await setup.renderOnce()
  setup.resize(24, 8)
  await setup.flush()
  for (let index = 0; index < 20; index++) await setup.mockMouse.scroll(12, 4, "down")
  await setup.flush()
  expect(setup.captureCharFrame()).toContain("Save changes")
  setup.resize(1, 1)
  await setup.flush()
  setup.resize(80, 30)
  await setup.flush()
  for (let index = 0; index < 20; index++) await setup.mockMouse.scroll(40, 12, "down")
  await setup.flush()
  expect(setup.captureCharFrame()).toContain("Save changes")
})
