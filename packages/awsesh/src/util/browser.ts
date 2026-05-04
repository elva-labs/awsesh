import open from "open"

export async function openBrowser(url: string): Promise<void> {
  try {
    await open(url)
  } catch (error) {
    throw new Error(`Failed to open browser: ${error}`)
  }
}
