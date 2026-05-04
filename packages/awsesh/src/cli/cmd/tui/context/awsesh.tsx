import { createAwsesh } from "@awsesh/core"
import { Global } from "@/global"
import { createSimpleContext } from "./helper"

export const { use: useAwsesh, provider: AwseshProvider } = createSimpleContext({
  name: "Awsesh",
  init: () => {
    return createAwsesh({
      configDir: Global.Path.config,
      dataDir: Global.Path.data,
      awsDir: Global.Path.aws,
    })
  },
})
