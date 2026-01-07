let credentialsSetThisSession = false

export function markCredentialsSet(): void {
  credentialsSetThisSession = true
}

export function wereCredentialsSet(): boolean {
  return credentialsSetThisSession
}
