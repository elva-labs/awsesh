// The prompt box's text, while it holds a /sesh command
export type Draft = string

declare module 'claude-code' {
  interface PluginState {
    awsesh: {
      draft: Draft
    }
  }
}
