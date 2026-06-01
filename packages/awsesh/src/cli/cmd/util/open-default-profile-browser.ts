import { UI } from "@/cli/ui"
import { getAwsesh } from "@/instance"
import { openBrowser } from "@/util/browser"

export async function openDefaultProfileInBrowser(): Promise<void> {
  const awsesh = getAwsesh()
  const activeCredentials = await awsesh.activeCredentials.list()
  const credential =
    activeCredentials.find((activeCredential) => activeCredential.isDefault) ||
    activeCredentials.find((activeCredential) => activeCredential.profileName === "default")

  if (!credential) {
    UI.error("No active credentials found for profile 'default'.")
    UI.info("Run 'awsesh set' to configure credentials for the default profile.")
    process.exit(1)
  }
  const session = await awsesh.sessions.get(credential.sessionName)

  if (!session) {
    UI.error(`SSO session '${credential.sessionName}' not found.`)
    UI.info("Run 'awsesh sessions' to see available sessions.")
    process.exit(1)
  }

  const url = awsesh.sso.getAccountUrl(session, credential.accountId, "", credential.roleName)
  UI.info("Opening AWS console in browser...")
  await openBrowser(url)
  UI.success("Browser opened successfully!")
}
