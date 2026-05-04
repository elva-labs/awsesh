import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { createAwsesh } from "../src/index";
import type { RoleCredentials } from "../src/types";

describe("createAwsesh", () => {
  let tempConfigDir: string;
  let tempDataDir: string;
  let tempAwsDir: string;
  let awsesh: ReturnType<typeof createAwsesh>;

  beforeEach(async () => {
    const baseDir = path.join(import.meta.dir, ".tmp-awsesh-test-" + Date.now());
    tempConfigDir = path.join(baseDir, "config");
    tempDataDir = path.join(baseDir, "data");
    tempAwsDir = path.join(baseDir, "aws");
    await fs.mkdir(tempConfigDir, { recursive: true });
    await fs.mkdir(tempDataDir, { recursive: true });
    await fs.mkdir(tempAwsDir, { recursive: true });

    awsesh = createAwsesh({
      configDir: tempConfigDir,
      dataDir: tempDataDir,
      awsDir: tempAwsDir,
    });
  });

  afterEach(async () => {
    await fs.rm(path.dirname(tempConfigDir), { recursive: true, force: true });
  });

  const sampleCreds: RoleCredentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "FwoGZXIvYXdzEBYaDH...",
    expiration: new Date(Date.now() + 3600000),
  };

  describe("tokens", () => {
    describe("isValid", () => {
      test("returns true for non-expired token", () => {
        const token = {
          token: "abc123",
          expiresAt: new Date(Date.now() + 3600000),
          startUrl: "https://example.awsapps.com/start",
        };
        expect(awsesh.tokens.isValid(token)).toBe(true);
      });

      test("returns false for expired token", () => {
        const token = {
          token: "abc123",
          expiresAt: new Date(Date.now() - 3600000),
          startUrl: "https://example.awsapps.com/start",
        };
        expect(awsesh.tokens.isValid(token)).toBe(false);
      });
    });

    describe("save and get", () => {
      test("retrieves a saved token", async () => {
        const startUrl = "https://test.awsapps.com/start";
        const token = "test-token-value";
        const expiresAt = new Date(Date.now() + 3600000);

        await awsesh.tokens.save(startUrl, token, expiresAt);
        const result = await awsesh.tokens.get(startUrl);

        expect(result).toBeDefined();
        expect(result?.token).toBe(token);
        expect(result?.startUrl).toBe(startUrl);
      });

      test("returns undefined for non-existent token", async () => {
        const result = await awsesh.tokens.get("https://nonexistent.awsapps.com/start");
        expect(result).toBeUndefined();
      });

      test("returns undefined for expired token", async () => {
        const startUrl = "https://expired.awsapps.com/start";
        await awsesh.tokens.save(startUrl, "old-token", new Date(Date.now() - 3600000));

        const result = await awsesh.tokens.get(startUrl);
        expect(result).toBeUndefined();
      });

      test("getWithExpired returns expired tokens", async () => {
        const startUrl = "https://expired.awsapps.com/start";
        await awsesh.tokens.save(startUrl, "old-token", new Date(Date.now() - 3600000));

        const result = await awsesh.tokens.getWithExpired(startUrl);
        expect(result).toBeDefined();
        expect(result?.token).toBe("old-token");
      });
    });

    describe("remove", () => {
      test("removes a saved token", async () => {
        const startUrl = "https://toremove.awsapps.com/start";
        await awsesh.tokens.save(startUrl, "to-remove", new Date(Date.now() + 3600000));

        await awsesh.tokens.remove(startUrl);
        const result = await awsesh.tokens.get(startUrl);
        expect(result).toBeUndefined();
      });
    });
  });

  describe("sessions", () => {
    test("saves and retrieves a session", async () => {
      const session = {
        name: "test-session",
        startUrl: "https://test.awsapps.com/start",
        ssoRegion: "us-east-1",
        defaultRegion: "us-east-1",
      };

      await awsesh.sessions.save(session);
      const result = await awsesh.sessions.get("test-session");
      expect(result).toEqual(session);
    });

    test("lists all sessions", async () => {
      await awsesh.sessions.save({
        name: "session-a",
        startUrl: "https://a.awsapps.com/start",
        ssoRegion: "us-east-1",
        defaultRegion: "us-east-1",
      });
      await awsesh.sessions.save({
        name: "session-b",
        startUrl: "https://b.awsapps.com/start",
        ssoRegion: "eu-west-1",
        defaultRegion: "eu-west-1",
      });

      const result = await awsesh.sessions.list();
      expect(result).toHaveLength(2);
    });

    test("checks session existence", async () => {
      await awsesh.sessions.save({
        name: "exists",
        startUrl: "https://exists.awsapps.com/start",
        ssoRegion: "us-east-1",
        defaultRegion: "us-east-1",
      });

      expect(await awsesh.sessions.exists("exists")).toBe(true);
      expect(await awsesh.sessions.exists("missing")).toBe(false);
    });

    test("removes a session", async () => {
      await awsesh.sessions.save({
        name: "todelete",
        startUrl: "https://delete.awsapps.com/start",
        ssoRegion: "us-east-1",
        defaultRegion: "us-east-1",
      });

      await awsesh.sessions.remove("todelete");
      expect(await awsesh.sessions.exists("todelete")).toBe(false);
    });

    test("returns session count", async () => {
      expect(await awsesh.sessions.count()).toBe(0);

      await awsesh.sessions.save({
        name: "one",
        startUrl: "https://one.awsapps.com/start",
        ssoRegion: "us-east-1",
        defaultRegion: "us-east-1",
      });
      await awsesh.sessions.save({
        name: "two",
        startUrl: "https://two.awsapps.com/start",
        ssoRegion: "us-east-1",
        defaultRegion: "us-east-1",
      });

      expect(await awsesh.sessions.count()).toBe(2);
    });
  });

  describe("accounts", () => {
    test("saves and retrieves account cache", async () => {
      const cache = {
        accounts: [
          { accountId: "123", name: "dev", roles: ["Admin"], rolesLoaded: true },
        ],
        lastUpdated: Date.now(),
      };

      await awsesh.accounts.save("my-session", cache);
      const result = await awsesh.accounts.get("my-session");
      expect(result).toEqual(cache);
    });

    test("returns undefined for non-existent session", async () => {
      const result = await awsesh.accounts.get("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("lastSelected", () => {
    test("returns empty object when nothing saved", async () => {
      const result = await awsesh.lastSelected.get();
      expect(result).toEqual({});
    });

    test("saves and retrieves last selected", async () => {
      await awsesh.lastSelected.save({ session: "prod", account: "main", role: "Admin" });
      const result = await awsesh.lastSelected.get();
      expect(result).toEqual({ session: "prod", account: "main", role: "Admin" });
    });

    test("merges partial updates", async () => {
      await awsesh.lastSelected.save({ session: "prod" });
      await awsesh.lastSelected.save({ account: "main" });
      const result = await awsesh.lastSelected.get();
      expect(result).toEqual({ session: "prod", account: "main" });
    });
  });

  describe("lastSession", () => {
    test("returns undefined when nothing saved", async () => {
      const result = await awsesh.lastSession.get();
      expect(result).toBeUndefined();
    });

    test("saves and retrieves last session", async () => {
      await awsesh.lastSession.save("my-session");
      const result = await awsesh.lastSession.get();
      expect(result).toBe("my-session");
    });
  });

  describe("lastAccountPerSession", () => {
    test("returns undefined for non-existent session", async () => {
      const result = await awsesh.lastAccountPerSession.get("nonexistent");
      expect(result).toBeUndefined();
    });

    test("saves and retrieves account per session", async () => {
      await awsesh.lastAccountPerSession.save("session-a", "123456");
      await awsesh.lastAccountPerSession.save("session-b", "789012");

      expect(await awsesh.lastAccountPerSession.get("session-a")).toBe("123456");
      expect(await awsesh.lastAccountPerSession.get("session-b")).toBe("789012");
    });

    test("getAll returns all session accounts", async () => {
      await awsesh.lastAccountPerSession.save("session-a", "123");
      await awsesh.lastAccountPerSession.save("session-b", "456");

      const result = await awsesh.lastAccountPerSession.getAll();
      expect(result).toEqual({ "session-a": "123", "session-b": "456" });
    });
  });

  describe("profileNames", () => {
    test("returns undefined when nothing saved", async () => {
      const result = await awsesh.profileNames.get("session", "account", "role");
      expect(result).toBeUndefined();
    });

    test("saves and retrieves profile name", async () => {
      await awsesh.profileNames.save("session", "account", "role", "my-profile");
      const result = await awsesh.profileNames.get("session", "account", "role");
      expect(result).toBe("my-profile");
    });

    test("getForAccount returns all roles for an account", async () => {
      await awsesh.profileNames.save("session", "account", "role-a", "profile-a");
      await awsesh.profileNames.save("session", "account", "role-b", "profile-b");

      const result = await awsesh.profileNames.getForAccount("session", "account");
      expect(result).toEqual({ "role-a": "profile-a", "role-b": "profile-b" });
    });

    test("remove cleans up empty entries", async () => {
      await awsesh.profileNames.save("session", "account", "only-role", "profile");
      await awsesh.profileNames.remove("session", "account", "only-role");

      const result = await awsesh.profileNames.getForAccount("session", "account");
      expect(result).toEqual({});
    });
  });

  describe("preferredRoles", () => {
    test("returns undefined when nothing saved", async () => {
      const result = await awsesh.preferredRoles.get("session", "123");
      expect(result).toBeUndefined();
    });

    test("saves and retrieves preferred role", async () => {
      await awsesh.preferredRoles.save("session", "123", "AdministratorAccess");
      const result = await awsesh.preferredRoles.get("session", "123");
      expect(result).toBe("AdministratorAccess");
    });

    test("getAll returns all preferred roles for a session", async () => {
      await awsesh.preferredRoles.save("session", "123", "Admin");
      await awsesh.preferredRoles.save("session", "456", "ReadOnly");

      const result = await awsesh.preferredRoles.getAll("session");
      expect(result).toEqual({ "123": "Admin", "456": "ReadOnly" });
    });
  });

  describe("preferredRegions", () => {
    test("returns undefined when nothing saved", async () => {
      const result = await awsesh.preferredRegions.get("session", "123");
      expect(result).toBeUndefined();
    });

    test("saves and retrieves preferred region", async () => {
      await awsesh.preferredRegions.save("session", "123", "eu-west-1");
      const result = await awsesh.preferredRegions.get("session", "123");
      expect(result).toBe("eu-west-1");
    });

    test("getAll returns all preferred regions for a session", async () => {
      await awsesh.preferredRegions.save("session", "123", "us-east-1");
      await awsesh.preferredRegions.save("session", "456", "eu-west-1");

      const result = await awsesh.preferredRegions.getAll("session");
      expect(result).toEqual({ "123": "us-east-1", "456": "eu-west-1" });
    });
  });

  describe("credentials", () => {
    test("writes credential to aws directory", async () => {
      await awsesh.credentials.write("test-profile", sampleCreds);

      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).toContain("test-profile");
    });

    test("removes profile", async () => {
      await awsesh.credentials.write("to-remove", sampleCreds);
      await awsesh.credentials.removeProfile("to-remove");

      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).not.toContain("to-remove");
    });

    test("lists all profiles", async () => {
      await awsesh.credentials.write("profile-a", sampleCreds);
      await awsesh.credentials.write("profile-b", sampleCreds);

      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).toContain("profile-a");
      expect(profiles).toContain("profile-b");
    });
  });

  describe("activeCredentials", () => {
    test("returns empty array when nothing saved", async () => {
      const result = await awsesh.activeCredentials.list();
      expect(result).toEqual([]);
    });

    test("saves and lists active credential", async () => {
      const credential = {
        profileName: "dev",
        accountId: "123456",
        accountName: "Development",
        roleName: "Admin",
        sessionName: "my-session",
        expiration: new Date(Date.now() + 3600000).toISOString(),
        isDefault: true,
      };

      await awsesh.activeCredentials.save(credential);
      const result = await awsesh.activeCredentials.list();
      expect(result).toHaveLength(1);
      expect(result[0].profileName).toBe("dev");
    });

    test("filters out expired credentials", async () => {
      await awsesh.activeCredentials.save({
        profileName: "expired",
        accountId: "123",
        accountName: "Expired",
        roleName: "Admin",
        sessionName: "session",
        expiration: new Date(Date.now() - 3600000).toISOString(),
        isDefault: false,
      });

      const result = await awsesh.activeCredentials.list();
      expect(result).toEqual([]);
    });

    test("getForAccount returns credentials for specific account", async () => {
      await awsesh.activeCredentials.save({
        profileName: "dev",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        sessionName: "session",
        expiration: new Date(Date.now() + 3600000).toISOString(),
        isDefault: false,
      });
      await awsesh.activeCredentials.save({
        profileName: "prod",
        accountId: "456",
        accountName: "Prod",
        roleName: "Admin",
        sessionName: "session",
        expiration: new Date(Date.now() + 3600000).toISOString(),
        isDefault: false,
      });

      const result = await awsesh.activeCredentials.getForAccount("123");
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("123");
    });

    test("remove deletes a credential", async () => {
      await awsesh.activeCredentials.save({
        profileName: "toremove",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        sessionName: "session",
        expiration: new Date(Date.now() + 3600000).toISOString(),
        isDefault: false,
      });

      await awsesh.activeCredentials.remove("123", "Admin");
      const result = await awsesh.activeCredentials.list();
      expect(result).toEqual([]);
    });

    test("cleanup removes expired credentials", async () => {
      await awsesh.activeCredentials.save({
        profileName: "expired",
        accountId: "123",
        accountName: "Expired",
        roleName: "Admin",
        sessionName: "session",
        expiration: new Date(Date.now() - 3600000).toISOString(),
        isDefault: false,
      });
      await awsesh.activeCredentials.save({
        profileName: "valid",
        accountId: "456",
        accountName: "Valid",
        roleName: "Admin",
        sessionName: "session",
        expiration: new Date(Date.now() + 3600000).toISOString(),
        isDefault: false,
      });

      await awsesh.activeCredentials.cleanup();
      const result = await awsesh.activeCredentials.list();
      expect(result).toHaveLength(1);
      expect(result[0].profileName).toBe("valid");
    });
  });

  describe("lastSetCredential", () => {
    test("returns undefined when nothing saved", async () => {
      const result = await awsesh.lastSetCredential.get();
      expect(result).toBeUndefined();
    });

    test("saves and retrieves last set credential", async () => {
      const credential = {
        profileName: "dev",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        sessionName: "session",
        region: "us-east-1",
        setAt: new Date().toISOString(),
      };

      await awsesh.lastSetCredential.save(credential);
      const result = await awsesh.lastSetCredential.get();
      expect(result).toEqual(credential);
    });

    test("clear removes last set credential", async () => {
      await awsesh.lastSetCredential.save({
        profileName: "dev",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        sessionName: "session",
        setAt: new Date().toISOString(),
      });

      await awsesh.lastSetCredential.clear();
      const result = await awsesh.lastSetCredential.get();
      expect(result).toBeUndefined();
    });
  });

  describe("setCredential", () => {
    test("writes credential and tracks it", async () => {
      const result = await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "my-session",
        accountId: "123456",
        accountName: "Development",
        roleName: "Admin",
      });

      expect(result.profileName).toBe("default");
      expect(result.isDefault).toBe(true);

      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).toContain("default");

      const active = await awsesh.activeCredentials.list();
      expect(active).toHaveLength(1);
      expect(active[0].accountId).toBe("123456");
    });

    test("uses custom profile name when provided", async () => {
      const result = await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "my-session",
        accountId: "123456",
        accountName: "Development",
        roleName: "Admin",
        profileName: "my-custom-profile",
      });

      expect(result.profileName).toBe("my-custom-profile");
      expect(result.isDefault).toBe(false);
    });

    test("uses configured profile name when available", async () => {
      await awsesh.profileNames.save("my-session", "Development", "Admin", "configured-profile");

      const result = await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "my-session",
        accountId: "123456",
        accountName: "Development",
        roleName: "Admin",
      });

      expect(result.profileName).toBe("configured-profile");
      expect(result.isDefault).toBe(false);
    });

    test("updates last selected", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "my-session",
        accountId: "123456",
        accountName: "Development",
        roleName: "Admin",
      });

      const lastSelected = await awsesh.lastSelected.get();
      expect(lastSelected).toEqual({
        session: "my-session",
        account: "Development",
        role: "Admin",
      });
    });

    test("includes region when provided", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "my-session",
        accountId: "123456",
        accountName: "Development",
        roleName: "Admin",
        region: "eu-west-1",
      });

      const active = await awsesh.activeCredentials.list();
      expect(active[0].region).toBe("eu-west-1");
    });
  });

  describe("clearCredential", () => {
    test("removes credential from active list", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        profileName: "dev-profile",
      });

      await awsesh.clearCredential("123", "Admin", "dev-profile");
      const active = await awsesh.activeCredentials.list();
      expect(active).toEqual([]);
    });

    test("clears lastSetCredential if it matches", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
      });

      await awsesh.clearCredential("123", "Admin");
      const lastSet = await awsesh.lastSetCredential.get();
      expect(lastSet).toBeUndefined();
    });

    test("removes profile when specified", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        profileName: "to-clear",
      });

      await awsesh.clearCredential("123", "Admin", "to-clear");
      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).not.toContain("to-clear");
    });
  });

  describe("clearSessionCredentials", () => {
    test("removes all credentials for a session", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session-a",
        accountId: "111",
        accountName: "Account1",
        roleName: "Admin",
        profileName: "profile-1",
      });
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session-a",
        accountId: "222",
        accountName: "Account2",
        roleName: "Admin",
        profileName: "profile-2",
      });
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session-b",
        accountId: "333",
        accountName: "Account3",
        roleName: "Admin",
        profileName: "profile-3",
      });

      await awsesh.clearSessionCredentials("session-a");
      const active = await awsesh.activeCredentials.list();
      expect(active).toHaveLength(1);
      expect(active[0].sessionName).toBe("session-b");
    });

    test("removes profiles when requested", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        profileName: "session-profile",
      });

      await awsesh.clearSessionCredentials("session", true);
      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).not.toContain("session-profile");
    });

    test("clears lastSetCredential if it matches session", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
      });

      await awsesh.clearSessionCredentials("session");
      const lastSet = await awsesh.lastSetCredential.get();
      expect(lastSet).toBeUndefined();
    });
  });

  describe("clearAllCredentials", () => {
    test("removes all active credentials", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session-a",
        accountId: "111",
        accountName: "Account1",
        roleName: "Admin",
        profileName: "profile-1",
      });
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session-b",
        accountId: "222",
        accountName: "Account2",
        roleName: "Admin",
        profileName: "profile-2",
      });

      await awsesh.clearAllCredentials();
      const active = await awsesh.activeCredentials.list();
      expect(active).toEqual([]);
    });

    test("removes profiles when requested", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
        profileName: "all-clear-profile",
      });

      await awsesh.clearAllCredentials(true);
      const profiles = await awsesh.credentials.listProfiles();
      expect(profiles).not.toContain("all-clear-profile");
    });

    test("clears lastSetCredential", async () => {
      await awsesh.setCredential({
        credentials: sampleCreds,
        sessionName: "session",
        accountId: "123",
        accountName: "Dev",
        roleName: "Admin",
      });

      await awsesh.clearAllCredentials();
      const lastSet = await awsesh.lastSetCredential.get();
      expect(lastSet).toBeUndefined();
    });
  });
});
