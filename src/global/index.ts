import path from "path"
import { homedir } from "os"
import { xdgConfig, xdgData } from "xdg-basedir"

export namespace Global {
  export const Path = {
    config: xdgConfig 
      ? path.join(xdgConfig, "awsesh") 
      : path.join(homedir(), ".config", "awsesh"),
    data: xdgData 
      ? path.join(xdgData, "awsesh") 
      : path.join(homedir(), ".local", "share", "awsesh"),
    // AWS standard paths (respecting environment variables)
    awsConfig: process.env.AWS_CONFIG_FILE || path.join(homedir(), ".aws", "config"),
    awsCredentials: process.env.AWS_SHARED_CREDENTIALS_FILE || path.join(homedir(), ".aws", "credentials"),
  }

  export const Limits = {
    // Don't auto-load roles if more than this many accounts
    maxAccountsForRoleLoading: 100,
  }
}
