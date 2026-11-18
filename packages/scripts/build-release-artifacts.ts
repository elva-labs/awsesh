import { $ } from "bun"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { allTargets, targetName } from "../awsesh/script/targets"
import { desktopArchive, requireRepository, root, sdkArchive, validateTag } from "./release"

requireRepository()
process.chdir(root)
await validateTag()

await $`bun run packages/desktop/script/release.ts`
await import("../awsesh/script/publish.ts")
await import("../core/script/build.ts")

const directory = path.join(root, "dist", "release-build")
await mkdir(directory, { recursive: true })
await $`npm pack --ignore-scripts --pack-destination ${directory}`.cwd(path.join(root, "packages/core/dist"))
if (!await Bun.file(path.join(directory, sdkArchive)).exists()) throw new Error("SDK package archive was not created")
await Bun.write(path.join(directory, desktopArchive), Bun.file(path.join(root, "packages/desktop/dist", desktopArchive)))
for (const target of allTargets) {
  const name = `${targetName(target)}.${target.os === "linux" ? "tar.gz" : "zip"}`
  await Bun.write(path.join(directory, name), Bun.file(path.join(root, "packages/awsesh/dist", name)))
}
