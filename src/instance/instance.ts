import { Context } from "../util/context.js";
import { ConfigManager } from "../config/manager.js";
import { AWSClient } from "../aws/client.js";
import { MigrationHelper } from "../config/migration-helper.js";

/**
 * Application instance that holds shared state and services.
 * Follows OpenCode's instance pattern using AsyncLocalStorage.
 */
export interface Instance {
  config: typeof ConfigManager;
  aws: typeof AWSClient;
}

// Create context for instance
const InstanceContext = Context.create<Instance>("Instance");

/**
 * Create a new instance with all services initialized.
 */
export async function createInstance(): Promise<Instance> {
  return {
    config: ConfigManager,
    aws: AWSClient,
  };
}

/**
 * Get the current instance from AsyncLocalStorage context.
 * Throws if called outside of an instance context.
 */
export function useInstance(): Instance {
  return InstanceContext.use();
}

/**
 * Run a function within an instance context.
 * This makes the instance available via useInstance() within the callback.
 * 
 * Automatically checks for old config and prompts migration on first run.
 */
export async function withInstance<T>(
  fn: (instance: Instance) => Promise<T>
): Promise<T> {
  const instance = await createInstance();
  
  // Check if we're running the migrate command or --help - skip auto-detection
  const isMigrateCommand = process.argv.includes("migrate");
  const isHelpCommand = process.argv.includes("--help") || process.argv.includes("-h");
  const isVersionCommand = process.argv.includes("--version") || process.argv.includes("-v");
  
  if (!isMigrateCommand && !isHelpCommand && !isVersionCommand) {
    // Check for old config and prompt for migration if needed
    // This function returns true to continue or false to exit
    await MigrationHelper.checkAndPromptMigration();
  }
  
  return InstanceContext.provide(instance, () => fn(instance));
}
