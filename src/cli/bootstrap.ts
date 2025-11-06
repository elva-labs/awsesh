import { Log } from "@/util/log"

const log = Log.create({ service: "bootstrap" })

export async function bootstrap<T>(
  directory: string,
  cb: () => Promise<T>
): Promise<T> {
  log.info("Bootstrap started", { directory })
  
  try {
    const result = await cb()
    log.info("Bootstrap completed")
    return result
  } catch (error) {
    log.error("Bootstrap failed", { error })
    throw error
  }
}
