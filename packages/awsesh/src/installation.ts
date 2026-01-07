declare const AWSESH_VERSION: string

export namespace Installation {
  export const VERSION = typeof AWSESH_VERSION !== "undefined" ? AWSESH_VERSION : "1.0.0-dev"
}
