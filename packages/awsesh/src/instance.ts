import { createAwsesh, type Awsesh } from "@awsesh/core"
import { Global } from "@/global"
import { Config } from "@/config/config"
import { WSL } from "@/util/wsl"

let instance: Awsesh | undefined

export function getAwsesh(): Awsesh {
  if (!instance) {
    instance = createAwsesh({
      configDir: Global.Path.config,
      dataDir: Global.Path.data,
      awsDir: Global.Path.aws,
      resolveAwsDir: wslAwareAwsDir,
    })
  }
  return instance
}

async function wslAwareAwsDir(): Promise<string> {
  const config = await Config.load()
  if (!config.useWslCredentials) return Global.Path.aws
  const dir = await WSL.resolveAwsDir()
  return dir ?? Global.Path.aws
}
