import { cmd } from "./cmd.js";
import { UI } from "../ui.js";
import { withInstance } from "@/instance/instance.js";
import path from "path";
import { homedir } from "os";
import fs from "fs/promises";
import type { SSOProfile, Account } from "@/types";

interface OldAccountCache {
  ProfileName: string;
  StartURL: string;
  Accounts: Array<{
    Name: string;
    AccountID: string;
    Roles: string[];
    Region?: string;
    SelectedRole?: string;
    RolesLoaded: boolean;
  }>;
  LastUpdated: string;
}

/**
 * Parse INI format file
 */
function parseINI(content: string): Record<string, Record<string, string>> {
  const lines = content.split("\n");
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    // Section header
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1);
      sections[currentSection] = sections[currentSection] || {};
    } 
    // Key-value pair
    else if (currentSection && trimmed.includes("=")) {
      const [key, ...valueParts] = trimmed.split("=");
      sections[currentSection][key.trim()] = valueParts.join("=").trim();
    }
  }

  return sections;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const migrate = cmd({
  command: "migrate",
  describe: "Migrate from old INI-based config to new JSON storage",
  builder: (yargs) =>
    yargs
      .option("dry-run", {
        type: "boolean",
        describe: "Show what would be migrated without actually migrating",
        default: false,
      })
      .option("force", {
        type: "boolean",
        describe: "Force migration even if new config exists",
        default: false,
      })
      .option("backup", {
        type: "boolean",
        describe: "Create backup of old files",
        default: true,
      }),
  handler: async (args) => {
    const { dryRun, force, backup } = args as {
      dryRun: boolean;
      force: boolean;
      backup: boolean;
    };

    UI.info("🔄 AWS Session Manager Migration Tool");
    console.log();

    await withInstance(async (instance) => {
      const { config } = instance;

      try {
        // 1. Detect old config files
        const oldConfigDir = process.env.AWS_CONFIG_FILE
          ? path.dirname(process.env.AWS_CONFIG_FILE)
          : path.join(homedir(), ".aws");

        const oldProfilesPath = path.join(oldConfigDir, "awsesh");
        const oldTokensPath = path.join(oldConfigDir, "awsesh-tokens");
        const oldAccountsPath = path.join(oldConfigDir, "awsesh-accounts");

        // Check what exists
        const profilesExist = await fileExists(oldProfilesPath);
        const tokensExist = await fileExists(oldTokensPath);
        const accountsExist = await fileExists(oldAccountsPath);

        if (!profilesExist && !tokensExist && !accountsExist) {
          UI.success("✓ No old config files found. Nothing to migrate.");
          return;
        }

        UI.info("📋 Found old config files:");
        if (profilesExist) UI.info(`  • ${oldProfilesPath}`);
        if (tokensExist) UI.info(`  • ${oldTokensPath}`);
        if (accountsExist) UI.info(`  • ${oldAccountsPath}`);
        console.log();

        // 2. Check if new config exists
        const existingProfiles = await config.loadProfiles();
        if (existingProfiles.length > 0 && !force) {
          UI.warn("⚠  You already have profiles in the new format.");
          UI.info(`  Found ${existingProfiles.length} profile(s)`);
          console.log();
          UI.info("Use --force to migrate anyway (will merge with existing)");
          return;
        }

        // 3. Parse old configs
        let oldProfiles: Record<string, Record<string, string>> = {};
        let oldTokens: Record<string, Record<string, string>> = {};
        let oldAccounts: OldAccountCache[] = [];

        if (profilesExist) {
          const profilesContent = await fs.readFile(oldProfilesPath, "utf-8");
          oldProfiles = parseINI(profilesContent);
        }

        if (tokensExist) {
          const tokensContent = await fs.readFile(oldTokensPath, "utf-8");
          oldTokens = parseINI(tokensContent);
        }

        if (accountsExist) {
          const accountsContent = await fs.readFile(oldAccountsPath, "utf-8");
          oldAccounts = JSON.parse(accountsContent);
        }

        // 4. Show migration preview
        UI.info("📦 Migration Preview:");
        console.log();

        const profileCount = Object.keys(oldProfiles).length;
        const tokenCount = Object.keys(oldTokens).length;
        const accountCacheCount = oldAccounts.length;

        UI.info(`  Profiles: ${profileCount}`);
        for (const name in oldProfiles) {
          UI.info(`    • ${name}`);
        }
        console.log();

        UI.info(`  Tokens: ${tokenCount}`);
        UI.info(`  Account Caches: ${accountCacheCount}`);
        console.log();

        if (dryRun) {
          UI.success("✓ Dry run complete. No changes made.");
          UI.info("Run without --dry-run to perform migration.");
          return;
        }

        // 5. Confirm migration
        UI.warn("⚠  This will convert your config to the new format.");
        if (backup) {
          UI.info("  Old files will be backed up with .bak extension");
        }
        console.log();

        UI.info("Press Ctrl+C to cancel, or Enter to continue...");
        await new Promise<void>((resolve) => {
          const handler = () => {
            process.stdin.removeListener("data", handler);
            resolve();
          };
          process.stdin.once("data", handler);
        });

        // 6. Perform migration
        UI.info("🚀 Starting migration...");
        console.log();

        // Migrate profiles
        for (const [name, oldProfile] of Object.entries(oldProfiles)) {
          const newProfile: SSOProfile = {
            name,
            startUrl: oldProfile.start_url || oldProfile.startUrl || "",
            ssoRegion: oldProfile.sso_region || oldProfile.ssoRegion || "",
            defaultRegion: oldProfile.default_region || oldProfile.defaultRegion || "",
          };

          await config.saveProfile(newProfile);
          UI.success(`  ✓ Migrated profile: ${name}`);
        }

        // Migrate tokens
        for (const [startUrl, oldToken] of Object.entries(oldTokens)) {
          const expiresAtStr = oldToken.expires_at || oldToken.expiresAt;
          if (!expiresAtStr) continue;

          const expiresAt = new Date(expiresAtStr);

          // Only migrate if not expired
          if (expiresAt > new Date()) {
            const token = oldToken.access_token || oldToken.accessToken;
            if (token) {
              await config.saveToken(startUrl, token, expiresAt);
              UI.success(`  ✓ Migrated token for: ${startUrl.slice(0, 40)}...`);
            }
          } else {
            UI.info(`  ⊘ Skipped expired token: ${startUrl.slice(0, 40)}...`);
          }
        }

        // Migrate account caches
        for (const cache of oldAccounts) {
          const accounts: Account[] = cache.Accounts.map((acc) => ({
            name: acc.Name,
            accountId: acc.AccountID,
            roles: acc.Roles || [],
            rolesLoaded: acc.RolesLoaded || false,
            region: acc.Region,
          }));

          await config.saveAccounts(cache.ProfileName, accounts);
          UI.success(`  ✓ Migrated accounts for: ${cache.ProfileName}`);
        }

        console.log();
        UI.success("✓ Migration complete!");
        console.log();

        // 7. Backup old files
        if (backup) {
          UI.info("📦 Creating backups...");

          if (profilesExist) {
            await fs.copyFile(oldProfilesPath, oldProfilesPath + ".bak");
            UI.info(`  • ${oldProfilesPath}.bak`);
          }
          if (tokensExist) {
            await fs.copyFile(oldTokensPath, oldTokensPath + ".bak");
            UI.info(`  • ${oldTokensPath}.bak`);
          }
          if (accountsExist) {
            await fs.copyFile(oldAccountsPath, oldAccountsPath + ".bak");
            UI.info(`  • ${oldAccountsPath}.bak`);
          }

          console.log();
          UI.success("✓ Backups created");
          UI.info("  You can safely delete the old files and backups after testing.");
        }

        console.log();
        UI.success("🎉 Migration successful!");
        UI.info("You can now use awsesh with the new configuration.");
      } catch (error) {
        UI.error(`Migration failed: ${error}`);
        UI.info("Your old config files were not modified.");
        process.exit(1);
      }
    });
  },
});
