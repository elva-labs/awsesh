import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { createAwsesh, createWorkflow, MANAGED_MARKER, Profiles } from "@awsesh/core";
import type { RoleCredentials, SSOSession } from "@awsesh/core";

describe("Profiles.apply", () => {
  const entry = { name: "dev", command: "/bin/awsesh profiles creds dev", region: "eu-north-1" };

  test("appends managed sections and keeps everything else as written", () => {
    const original = "# my settings\n[default]\nregion = us-east-1\n\n[profile mine]\n; comment\nsso_session = corp\n";
    const result = Profiles.apply(original, [entry]);
    expect(result.content).toBe(
      "# my settings\n[default]\nregion = us-east-1\n\n[profile mine]\n; comment\nsso_session = corp\n\n" +
        `[profile dev]\n${MANAGED_MARKER}\ncredential_process = /bin/awsesh profiles creds dev\nregion = eu-north-1\n`,
    );
    expect(result.written).toEqual(["dev"]);
  });

  test("rewrites managed sections in place and removes ones no longer defined", () => {
    const first = Profiles.apply("[default]\nregion = us-east-1\n", [entry, { name: "old", command: "x old" }]).content;
    const second = Profiles.apply(first + "[profile after]\nregion = eu-west-1\n", [{ ...entry, region: "us-west-2" }]);
    expect(second.removed).toEqual(["old"]);
    expect(second.content).toBe(
      `[default]\nregion = us-east-1\n\n[profile dev]\n${MANAGED_MARKER}\ncredential_process = /bin/awsesh profiles creds dev\nregion = us-west-2\n\n[profile after]\nregion = eu-west-1\n`,
    );
    expect(Profiles.apply(second.content, [{ ...entry, region: "us-west-2" }]).content).toBe(second.content);
  });

  test("never touches a profile it does not manage", () => {
    const original = "[profile dev]\nsso_session = corp\n";
    const result = Profiles.apply(original, [entry]);
    expect(result.conflicts).toEqual(["dev"]);
    expect(result.written).toEqual([]);
    expect(result.content).toBe(original);
  });

  test("quotes commands with spaces", () => {
    expect(Profiles.quoteCommand(["/Applications/My App/awsesh", "profiles", "creds", "dev"]))
      .toBe('"/Applications/My App/awsesh" profiles creds dev');
  });

  test("suggests a profile name from account name, account ID and role", () => {
    expect(Profiles.suggestName("elva-dev", "276513090910", "AWSAdministratorAccess")).toBe("elva-dev_276513090910_AWSAdministratorAccess");
    expect(Profiles.suggestName("Production / EU", "276513090910", "Ops+Billing@EU")).toBe("Production-EU_276513090910_Ops-Billing-EU");
  });
});

describe("managed profiles", () => {
  let baseDir: string;
  let configDir: string;
  let dataDir: string;
  let awsDir: string;
  let awsesh: ReturnType<typeof createAwsesh>;
  const session: SSOSession = {
    name: "corp",
    startUrl: "https://corp.awsapps.com/start",
    ssoRegion: "eu-north-1",
    defaultRegion: "eu-west-1",
  };
  const creds = (key: string, ms = 3600000): RoleCredentials => ({
    accessKeyId: key,
    secretAccessKey: "secret",
    sessionToken: "token",
    expiration: new Date(Date.now() + ms),
  });

  beforeEach(async () => {
    baseDir = path.join(import.meta.dir, `.tmp-profiles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    configDir = path.join(baseDir, "config");
    dataDir = path.join(baseDir, "data");
    awsDir = path.join(baseDir, "aws");
    awsesh = createAwsesh({ configDir, dataDir, awsDir, credentialProcess: ["/usr/local/bin/awsesh", "profiles", "creds"] });
    await awsesh.sessions.save(session);
    await awsesh.accounts.save("corp", {
      accounts: [
        { accountId: "111111111111", name: "Dev", roles: ["Admin", "ReadOnly"], rolesLoaded: true },
        { accountId: "222222222222", name: "Prod", roles: ["ReadOnly"], rolesLoaded: true },
      ],
      lastUpdated: Date.now(),
    });
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  test("workflow marks several roles at once and writes them to the AWS config", async () => {
    const workflow = createWorkflow(awsesh);
    await awsesh.profileNames.save("corp", "Dev", "Admin", "dev-admin");
    await awsesh.preferredRegions.save("corp", "222222222222", "us-east-1");
    const { sync, snapshot } = await workflow.addProfiles("corp", [
      { accountId: "111111111111", role: "Admin" },
      { accountId: "222222222222", role: "ReadOnly" },
    ]);
    expect(sync.written.sort()).toEqual(["Prod_222222222222_ReadOnly", "dev-admin"]);
    expect(snapshot.accounts.find((a) => a.name === "Dev")?.managedProfiles).toEqual({ Admin: "dev-admin" });
    const config = await fs.readFile(path.join(awsDir, "config"), "utf-8");
    expect(config).toContain("[profile dev-admin]\n" + MANAGED_MARKER + "\ncredential_process = /usr/local/bin/awsesh profiles creds dev-admin\nregion = eu-west-1");
    expect(config).toContain("credential_process = /usr/local/bin/awsesh profiles creds Prod_222222222222_ReadOnly\nregion = us-east-1");
    const stored = JSON.parse(await fs.readFile(path.join(configDir, "profiles.json"), "utf-8"));
    expect(stored.profiles["dev-admin"]).toEqual({ session: "corp", account: "111111111111", role: "Admin", region: "eu-west-1" });

    await expect(workflow.addProfiles("corp", [{ accountId: "111111111111", role: "ReadOnly", profile: "dev-admin" }]))
      .rejects.toThrow("already used");

    // In a bulk add, items that cannot be added are reported and the rest still go through
    await fs.appendFile(path.join(awsDir, "config"), "\n[profile mine]\nsso_session = corp\n");
    const bulk = await workflow.addProfiles("corp", [
      { accountId: "111111111111", role: "ReadOnly", profile: "dev-ro" },
      { accountId: "222222222222", role: "ReadOnly", profile: "dev-ro" },
      { accountId: "222222222222", role: "Admin" },
      { accountId: "222222222222", role: "ReadOnly", profile: "mine" },
    ]);
    expect(bulk.sync.written).toContain("dev-ro");
    expect(bulk.skipped.map((item) => item.reason)).toEqual([
      expect.stringContaining("already used"),
      expect.stringContaining("not available"),
      expect.stringContaining("does not manage"),
    ]);
    await workflow.removeProfiles(["dev-ro"], "corp");

    const removed = await workflow.removeProfiles(["dev-admin"], "corp");
    expect(removed.sync.removed).toEqual(["dev-admin"]);
    expect(await fs.readFile(path.join(awsDir, "config"), "utf-8")).not.toContain("dev-admin");
  });

  test("sync clears stale temporary keys that would shadow the profile, but keeps long-lived keys", async () => {
    await fs.mkdir(awsDir, { recursive: true });
    await fs.writeFile(
      path.join(awsDir, "credentials"),
      "[dev]\naws_access_key_id = OLD\naws_secret_access_key = s\naws_session_token = t\n\n[ci]\naws_access_key_id = AKIA\naws_secret_access_key = s\n",
    );
    await awsesh.activeCredentials.save({
      profileName: "dev", accountId: "111111111111", accountName: "Dev", roleName: "Admin", sessionName: "corp",
      expiration: new Date(Date.now() + 3600000).toISOString(), isDefault: false,
    });
    await awsesh.profiles.save([
      { name: "dev", session: "corp", account: "Dev", role: "Admin" },
      { name: "ci", session: "corp", account: "Dev", role: "ReadOnly" },
    ]);
    const result = await awsesh.profiles.sync();
    expect(result.cleared).toEqual(["dev"]);
    expect(await awsesh.activeCredentials.list()).toEqual([]);
    expect(await awsesh.credentials.listProfiles()).toEqual(["ci"]);
  });

  test("credential_process output is cached until close to expiry and needs a valid login", async () => {
    await awsesh.profiles.save([{ name: "dev", session: "corp", account: "Dev", role: "Admin" }]);
    let calls = 0;
    awsesh.sso.getCredentials = async (_s, token, accountId, role) => {
      calls++;
      expect([token, accountId, role]).toEqual(["sso-token", "111111111111", "Admin"]);
      return creds(`KEY${calls}`, calls === 1 ? 60000 : 3600000);
    };
    await expect(awsesh.profiles.credentials("dev")).rejects.toThrow("sesh auth corp");
    await awsesh.tokens.save(session.startUrl, "sso-token", new Date(Date.now() + 3600000));

    // The first keys expire within the refresh margin, so the next call fetches new ones
    expect((await awsesh.profiles.credentials("dev")).AccessKeyId).toBe("KEY1");
    expect(await awsesh.profiles.credentials("dev")).toMatchObject({ Version: 1, AccessKeyId: "KEY2", SessionToken: "token" });
    expect((await awsesh.profiles.credentials("dev")).AccessKeyId).toBe("KEY2");
    expect(calls).toBe(2);

    await awsesh.clearSessionCredentials("corp", true);
    expect((await awsesh.profiles.credentials("dev")).AccessKeyId).toBe("KEY3");
    await expect(awsesh.profiles.credentials("missing")).rejects.toThrow("No awsesh profile");
  });

  test("setCredential leaves a managed profile to credential_process and refuses another role's profile", async () => {
    await awsesh.profiles.save([{ name: "dev", session: "corp", account: "111111111111", role: "Admin" }]);
    const base = { credentials: creds("K"), sessionName: "corp", accountId: "111111111111", accountName: "Dev" };
    await awsesh.setCredential({ ...base, roleName: "Admin", profileName: "dev" });
    expect(await awsesh.credentials.listProfiles()).toEqual([]);
    await expect(awsesh.setCredential({ ...base, roleName: "ReadOnly", profileName: "dev" })).rejects.toThrow("managed profile");
  });

  test("validates names and keeps profiles when a session is renamed", async () => {
    await expect(awsesh.profiles.save([{ name: "default", session: "corp", account: "Dev", role: "Admin" }])).rejects.toThrow("reserved");
    await expect(awsesh.profiles.save([{ name: "has space", session: "corp", account: "Dev", role: "Admin" }])).rejects.toThrow();
    await expect(awsesh.profiles.save([{ name: "x", session: "nope", account: "Dev", role: "Admin" }])).rejects.toThrow("not found");
    await fs.mkdir(awsDir, { recursive: true });
    await fs.writeFile(path.join(awsDir, "config"), "[profile mine]\nsso_session = corp\n");
    await expect(awsesh.profiles.save([{ name: "mine", session: "corp", account: "Dev", role: "Admin" }])).rejects.toThrow("does not manage");
    await awsesh.profiles.save([{ name: "dev", session: "corp", account: "Dev", role: "Admin" }]);
    await awsesh.sessions.save({ ...session, name: "renamed" }, "corp");
    expect(await awsesh.profiles.get("dev")).toMatchObject({ session: "renamed" });
  });

  test("a client without a credential command cannot sync profiles", async () => {
    const plain = createAwsesh({ configDir, dataDir, awsDir });
    expect(await plain.profiles.sync()).toMatchObject({ written: [] });
    await expect(plain.profiles.save([{ name: "dev", session: "corp", account: "Dev", role: "Admin" }])).rejects.toThrow("cannot serve");
    expect(await plain.profiles.list()).toEqual([]);
  });
});
