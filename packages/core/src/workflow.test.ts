import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { createAwsesh } from "@awsesh/core";
import type { SSOSession, RoleCredentials } from "@awsesh/core";

describe("Full Workflow", () => {
  let tempConfigDir: string;
  let tempDataDir: string;
  let tempAwsDir: string;
  let awsesh: ReturnType<typeof createAwsesh>;

  beforeEach(async () => {
    const baseDir = path.join(import.meta.dir, ".tmp-workflow-" + Date.now());
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

  const sampleSession: SSOSession = {
    name: "production",
    startUrl: "https://my-org.awsapps.com/start",
    ssoRegion: "us-east-1",
    defaultRegion: "us-east-1",
  };

  const sampleCreds: RoleCredentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "FwoGZXIvYXdzEBYaDH...",
    expiration: new Date(Date.now() + 3600000),
  };

  test("complete credential lifecycle", async () => {
    // 1. Create session
    await awsesh.sessions.save(sampleSession);
    expect(await awsesh.sessions.exists("production")).toBe(true);

    // 2. Save token
    const expiresAt = new Date(Date.now() + 3600000);
    await awsesh.tokens.save(sampleSession.startUrl, "test-token", expiresAt);
    const token = await awsesh.tokens.get(sampleSession.startUrl);
    expect(token).toBeDefined();
    expect(token?.token).toBe("test-token");

    // 3. Cache accounts
    await awsesh.accounts.save("production", {
      accounts: [
        { accountId: "123456789012", name: "Main", roles: ["AdministratorAccess"], rolesLoaded: true },
        { accountId: "111222333444", name: "Dev", roles: ["Developer"], rolesLoaded: true },
      ],
      lastUpdated: Date.now(),
    });
    const cached = await awsesh.accounts.get("production");
    expect(cached?.accounts).toHaveLength(2);

    // 4. Set credential for Main account
    const result = await awsesh.setCredential({
      credentials: sampleCreds,
      sessionName: "production",
      accountId: "123456789012",
      accountName: "Main",
      roleName: "AdministratorAccess",
      region: "us-east-1",
    });

    expect(result.profileName).toBe("default");
    expect(result.isDefault).toBe(true);

    // 5. Verify credential tracking
    const active = await awsesh.activeCredentials.list();
    expect(active).toHaveLength(1);
    expect(active[0].accountId).toBe("123456789012");
    expect(active[0].sessionName).toBe("production");

    // 6. Verify last-set credential
    const lastSet = await awsesh.lastSetCredential.get();
    expect(lastSet).toBeDefined();
    expect(lastSet?.accountId).toBe("123456789012");
    expect(lastSet?.roleName).toBe("AdministratorAccess");

    // 7. Verify last-selected
    const lastSelected = await awsesh.lastSelected.get();
    expect(lastSelected).toEqual({
      session: "production",
      account: "Main",
      role: "AdministratorAccess",
    });

    // 8. Verify last-session
    await awsesh.lastSession.save("production");
    expect(await awsesh.lastSession.get()).toBe("production");

    // 9. Set credential for Dev account with custom profile
    const devResult = await awsesh.setCredential({
      credentials: { ...sampleCreds, accessKeyId: "DEV_KEY" },
      sessionName: "production",
      accountId: "111222333444",
      accountName: "Dev",
      roleName: "Developer",
      profileName: "dev-profile",
      region: "eu-west-1",
    });
    expect(devResult.profileName).toBe("dev-profile");
    expect(devResult.isDefault).toBe(false);

    // 10. Verify both credentials are active
    const activeAfterTwo = await awsesh.activeCredentials.list();
    expect(activeAfterTwo).toHaveLength(2);

    // 11. Clear Dev credential
    await awsesh.clearCredential("111222333444", "Developer", "dev-profile");
    const activeAfterClear = await awsesh.activeCredentials.list();
    expect(activeAfterClear).toHaveLength(1);
    expect(activeAfterClear[0].accountId).toBe("123456789012");

    // 12. Clear all credentials
    await awsesh.clearAllCredentials(true);
    const activeAfterAllClear = await awsesh.activeCredentials.list();
    expect(activeAfterAllClear).toEqual([]);

    // 13. Verify last-set is cleared
    const lastSetAfterClear = await awsesh.lastSetCredential.get();
    expect(lastSetAfterClear).toBeUndefined();

    // 14. Verify profiles are removed
    const profiles = await awsesh.credentials.listProfiles();
    expect(profiles).toEqual([]);
  });

  test("session CRUD workflow", async () => {
    // Create sessions
    await awsesh.sessions.save({
      name: "dev",
      startUrl: "https://dev.awsapps.com/start",
      ssoRegion: "us-east-1",
      defaultRegion: "us-east-1",
    });
    await awsesh.sessions.save({
      name: "staging",
      startUrl: "https://staging.awsapps.com/start",
      ssoRegion: "eu-west-1",
      defaultRegion: "eu-west-1",
    });
    await awsesh.sessions.save({
      name: "prod",
      startUrl: "https://prod.awsapps.com/start",
      ssoRegion: "us-west-2",
      defaultRegion: "us-west-2",
    });

    expect(await awsesh.sessions.count()).toBe(3);

    // List sessions
    const sessions = await awsesh.sessions.list();
    expect(sessions).toHaveLength(3);

    // Load a specific session
    const staging = await awsesh.sessions.get("staging");
    expect(staging?.ssoRegion).toBe("eu-west-1");

    // Update a session
    await awsesh.sessions.save({
      name: "staging",
      startUrl: "https://new-staging.awsapps.com/start",
      ssoRegion: "eu-west-1",
      defaultRegion: "eu-central-1",
    });
    const updated = await awsesh.sessions.get("staging");
    expect(updated?.defaultRegion).toBe("eu-central-1");

    // Delete a session
    await awsesh.sessions.remove("dev");
    expect(await awsesh.sessions.count()).toBe(2);
    expect(await awsesh.sessions.exists("dev")).toBe(false);
  });

  test("token management workflow", async () => {
    const startUrl = "https://test.awsapps.com/start";

    // Save and retrieve token
    await awsesh.tokens.save(startUrl, "fresh-token", new Date(Date.now() + 3600000));
    const valid = await awsesh.tokens.get(startUrl);
    expect(valid).toBeDefined();
    expect(awsesh.tokens.isValid(valid!)).toBe(true);

    // Expired token is not returned by get()
    await awsesh.tokens.save(startUrl, "expired-token", new Date(Date.now() - 3600000));
    const expired = await awsesh.tokens.get(startUrl);
    expect(expired).toBeUndefined();

    // But getWithExpired returns it
    const expiredWith = await awsesh.tokens.getWithExpired(startUrl);
    expect(expiredWith).toBeDefined();
    expect(expiredWith?.token).toBe("expired-token");
    expect(awsesh.tokens.isValid(expiredWith!)).toBe(false);

    // Remove token
    await awsesh.tokens.remove(startUrl);
    const afterRemove = await awsesh.tokens.get(startUrl);
    expect(afterRemove).toBeUndefined();
  });

  test("preference tracking workflow", async () => {
    const sessionName = "production";

    // Preferred roles
    await awsesh.preferredRoles.save(sessionName, "123", "Admin");
    await awsesh.preferredRoles.save(sessionName, "456", "ReadOnly");
    expect(await awsesh.preferredRoles.get(sessionName, "123")).toBe("Admin");
    expect(await awsesh.preferredRoles.getAll(sessionName)).toEqual({
      "123": "Admin",
      "456": "ReadOnly",
    });

    // Preferred regions
    await awsesh.preferredRegions.save(sessionName, "123", "us-east-1");
    await awsesh.preferredRegions.save(sessionName, "456", "eu-west-1");
    expect(await awsesh.preferredRegions.get(sessionName, "123")).toBe("us-east-1");

    // Profile names
    await awsesh.profileNames.save(sessionName, "Main", "Admin", "main-admin");
    await awsesh.profileNames.save(sessionName, "Main", "ReadOnly", "main-ro");
    expect(await awsesh.profileNames.get(sessionName, "Main", "Admin")).toBe("main-admin");
    expect(await awsesh.profileNames.getForAccount(sessionName, "Main")).toEqual({
      Admin: "main-admin",
      ReadOnly: "main-ro",
    });

    // Remove profile name
    await awsesh.profileNames.remove(sessionName, "Main", "Admin");
    expect(await awsesh.profileNames.get(sessionName, "Main", "Admin")).toBeUndefined();
    expect(await awsesh.profileNames.getForAccount(sessionName, "Main")).toEqual({
      ReadOnly: "main-ro",
    });
  });

  test("clearSessionCredentials clears all session data", async () => {
    // Set up credentials for two sessions
    await awsesh.setCredential({
      credentials: sampleCreds,
      sessionName: "session-a",
      accountId: "111",
      accountName: "Account1",
      roleName: "Admin",
      profileName: "profile-a",
    });
    await awsesh.setCredential({
      credentials: sampleCreds,
      sessionName: "session-a",
      accountId: "222",
      accountName: "Account2",
      roleName: "Admin",
      profileName: "profile-b",
    });
    await awsesh.setCredential({
      credentials: sampleCreds,
      sessionName: "session-b",
      accountId: "333",
      accountName: "Account3",
      roleName: "Admin",
      profileName: "profile-c",
    });

    // Clear session-a credentials
    await awsesh.clearSessionCredentials("session-a", true);

    const active = await awsesh.activeCredentials.list();
    expect(active).toHaveLength(1);
    expect(active[0].sessionName).toBe("session-b");

    const profiles = await awsesh.credentials.listProfiles();
    expect(profiles).toContain("profile-c");
    expect(profiles).not.toContain("profile-a");
    expect(profiles).not.toContain("profile-b");
  });
});
