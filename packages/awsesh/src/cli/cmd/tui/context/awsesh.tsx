import { createAwsesh } from "@awsesh/core"
import { Global } from "@/global"
import { useConfig } from "./config"
import { WSL } from "@/util/wsl"
import { createSimpleContext } from "./helper"

export const { use: useAwsesh, provider: AwseshProvider } = createSimpleContext({
  name: "Awsesh",
  init: () => {
    const config = useConfig()

    return createAwsesh({
      configDir: Global.Path.config,
      dataDir: Global.Path.data,
      awsDir: Global.Path.aws,
      resolveAwsDir: async () => {
        if (!config.data.useWslCredentials) return Global.Path.aws
        const dir = await WSL.resolveAwsDir()
        return dir ?? Global.Path.aws
      },
    })
  },
})
