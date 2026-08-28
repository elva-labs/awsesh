import { afterEach, expect, mock, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"

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

let dialogClearCount = 0

mock.module("./dialog", () => ({
  useDialog: () => ({
    clear: () => dialogClearCount++,
  }),
}))

const { Layout } = await import("./layout")
const { DialogPrompt } = await import("./dialog-prompt")

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
  dialogClearCount = 0
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
