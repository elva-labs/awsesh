import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { createAwsesh, createWorkflow } from "@awsesh/core";
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

  test("interactive workflow owns account selection and credential lifecycle", async () => {
    const workflow = createWorkflow(awsesh);
    await workflow.saveSession(sampleSession, true);
    await awsesh.tokens.save(sampleSession.startUrl, "private-token", new Date(Date.now() + 3600000));
    let requests = 0;
    awsesh.sso.listAccounts = async () => {
      requests++;
      return [{ accountId: "123456789012", name: "Main", roles: [], rolesLoaded: false }];
    };
    let roleRequests = 0;
    awsesh.sso.listRoles = async () => {
      roleRequests++;
      return ["Admin", "ReadOnly"];
    };
    awsesh.sso.getCredentials = async () => sampleCreds;
    await workflow.selectSession("production");
    await workflow.selectSession("production");
    expect(requests).toBe(1);
    await workflow.selectSession("production", true);
    expect(requests).toBe(2);
    await workflow.loadRoles("production", "123456789012");
    await workflow.loadRoles("production", "123456789012");
    expect(roleRequests).toBe(1);
    await workflow.loadRoles("production", "123456789012", true);
    expect(roleRequests).toBe(2);
    expect((await workflow.snapshot("production")).accounts[0].preferredRole).toBeUndefined();
    await workflow.preferRole("production", "123456789012", "ReadOnly");
    await workflow.setRegion("production", "123456789012", "eu-north-1");
    await workflow.setProfile("production", "123456789012", "ReadOnly", "main-readonly");
    expect(await awsesh.credentials.listProfiles()).toEqual([]);
    const state = await workflow.assumeRole("production", "123456789012", "ReadOnly");
    expect(state.accounts[0].preferredRole).toBe("ReadOnly");
    expect(state.accounts[0].region).toBe("eu-north-1");
    expect(state.credentials[0].profileName).toBe("main-readonly");
    expect(state.lastAccount).toBe("123456789012");
    expect(JSON.stringify(state)).not.toContain("private-token");
    expect(JSON.stringify(state)).not.toContain(sampleCreds.secretAccessKey);
    expect(await awsesh.credentials.listProfiles()).toEqual(["main-readonly"]);
    expect(await workflow.consoleUrl("production", "123456789012", "ReadOnly")).toContain("role_name=ReadOnly");
    await expect(workflow.clearCredential("123456789012", "ReadOnly", "other-profile")).rejects.toThrow("not found");
    const cleared = await workflow.clearCredential("123456789012", "ReadOnly", "main-readonly", "production");
    expect(cleared.credentials).toEqual([]);
    expect(await awsesh.credentials.listProfiles()).toEqual([]);
    await workflow.assumeRole("production", "123456789012", "ReadOnly");
    const signedOut = await workflow.signOut("production");
    expect(signedOut.credentials).toEqual([]);
    expect(signedOut.sessions[0].authenticated).toBe(false);
    expect(await awsesh.credentials.listProfiles()).toEqual([]);
  });

  test("interactive workflow validates session and preference inputs before writing", async () => {
    const workflow = createWorkflow(awsesh);
    await expect(workflow.saveSession({ ...sampleSession, name: "../escape" })).rejects.toThrow("Session names");
    await expect(workflow.saveSession({ ...sampleSession, startUrl: "http://example.com" })).rejects.toThrow("HTTPS");
    await expect(workflow.saveSession({ ...sampleSession, ssoRegion: "invalid" })).rejects.toThrow("region");
    expect(await awsesh.sessions.count()).toBe(0);
    await workflow.saveSession(sampleSession, true);
    await expect(workflow.saveSession(sampleSession, true)).rejects.toThrow("already exists");
    await awsesh.accounts.save(sampleSession.name, {
      accounts: [{ accountId: "123", name: "Main", roles: ["Admin"], rolesLoaded: true }],
      lastUpdated: Date.now(),
    });
    await expect(workflow.setRegion("production", "123", "region\ninjection")).rejects.toThrow("region");
    await expect(workflow.setProfile("production", "123", "Admin", "profile\n[default]")).rejects.toThrow("profile");
    await expect(workflow.preferRole("production", "123", "Unknown")).rejects.toThrow("not available");
    await expect(workflow.assumeRole("production", "123", "Admin")).rejects.toThrow("Sign in");
    await expect(workflow.snapshot("../escape")).rejects.toThrow("Session names");
    const removed = await workflow.removeSession("production");
    expect(removed.sessions).toEqual([]);
  });

  test("interactive workflow keeps device authorization inside the SDK", async () => {
    const workflow = createWorkflow(awsesh);
    await workflow.saveSession(sampleSession);
    awsesh.sso.startLogin = async () => ({
      verificationUri: "https://example.com/verify",
      verificationUriComplete: "https://example.com/verify?code=ABC",
      userCode: "ABC", deviceCode: "private-device-code", interval: 0,
      clientId: "private-client-id", clientSecret: "private-client-secret",
      expiresAt: new Date(Date.now() + 60000), startUrl: sampleSession.startUrl,
    });
    awsesh.sso.pollForToken = async () => ({ token: "private-token", expiresAt: new Date(Date.now() + 3600000) });
    expect(await workflow.startLogin("production")).toEqual({ url: "https://example.com/verify?code=ABC", code: "ABC" });
    expect(await workflow.pollLogin("production")).toEqual({ complete: true });
    expect((await workflow.snapshot()).sessions[0].authenticated).toBe(true);
    await workflow.startLogin("production");
    await workflow.cancelLogin("production");
    await expect(workflow.pollLogin("production")).rejects.toThrow("Start a new");
    awsesh.sso.startLogin = async () => ({
      verificationUri: "https://example.com", verificationUriComplete: "https://example.com",
      userCode: "ABC", deviceCode: "private", interval: 1, clientId: "private", clientSecret: "private",
      expiresAt: new Date(Date.now() - 1), startUrl: sampleSession.startUrl,
    });
    await workflow.startLogin("production");
    await expect(workflow.pollLogin("production")).rejects.toThrow("expired");
  });

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
