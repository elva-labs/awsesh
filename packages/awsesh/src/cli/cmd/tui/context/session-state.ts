let credentialsSetThisSession = false

interface CapturedEvalEnvironment {
  accountId: string
  accountName: string
  roleName: string
  sessionName: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: string
}

let capturedEvalEnvironment: CapturedEvalEnvironment | undefined

export function markCredentialsSet(): void {
  credentialsSetThisSession = true
}

export function wereCredentialsSet(): boolean {
  return credentialsSetThisSession
}

export function captureEvalEnvironment(environment: CapturedEvalEnvironment): void {
  capturedEvalEnvironment = environment
}

export function getCapturedEvalEnvironment(): CapturedEvalEnvironment | undefined {
  return capturedEvalEnvironment
}
