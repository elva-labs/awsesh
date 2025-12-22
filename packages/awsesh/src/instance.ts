import { createAwsesh, type Awsesh } from "@awsesh/core"
import { Global } from "@/global"

let instance: Awsesh | undefined

export function getAwsesh(): Awsesh {
  if (!instance) {
    instance = createAwsesh({
      configDir: Global.Path.config,
      dataDir: Global.Path.data,
      awsDir: Global.Path.aws,
    })
  }
  return instance
}
