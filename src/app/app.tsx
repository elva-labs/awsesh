import { render } from "@opentui/solid"
import { AppProvider } from "./context/app"
import { Main } from "./components/main"

function App() {
  return (
    <AppProvider>
      <Main />
    </AppProvider>
  )
}

export function start(): Promise<void> {
  return new Promise<void>((resolve) => {
    render(() => <App />)

    process.on("SIGINT", () => {
      resolve()
      process.exit(0)
    })
  })
}
