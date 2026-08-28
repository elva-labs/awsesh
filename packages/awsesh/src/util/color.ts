/**
 * Whether ANSI color/styling should be emitted.
 *
 * Honors the NO_COLOR convention (https://no-color.org): if NO_COLOR is present
 * with any value, color is disabled. FORCE_COLOR overrides and forces it on
 * (useful for tests and for piping into pagers that understand ANSI). Otherwise
 * color is only emitted when stdout is a TTY, so captured/piped output stays
 * plain — which is what non-interactive callers (agents, scripts) want.
 */
export function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) return false
  if (process.env.FORCE_COLOR) return true
  return process.stdout.isTTY === true
}
