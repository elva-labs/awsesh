import path from "node:path"
import { homedir } from "node:os"
import { xdgConfig, xdgData } from "xdg-basedir"

export namespace Global {
  export const Path = {
    config: xdgConfig 
      ? path.join(xdgConfig, "awsesh") 
      : path.join(homedir(), ".config", "awsesh"),
    data: xdgData 
      ? path.join(xdgData, "awsesh") 
      : path.join(homedir(), ".local", "share", "awsesh"),
    aws: path.join(homedir(), ".aws"),
    awsConfig: process.env.AWS_CONFIG_FILE || path.join(homedir(), ".aws", "config"),
    awsCredentials: process.env.AWS_SHARED_CREDENTIALS_FILE || path.join(homedir(), ".aws", "credentials"),
  }

  export const Limits = {
    maxAccountsForRoleLoading: 100,
  }
}
