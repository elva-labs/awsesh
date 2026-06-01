import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";

const CLI = path.join(import.meta.dir, "../../../src/index.ts");

function tmpDir(name: string) {
  return path.join(import.meta.dir, `.tmp-cli-${name}-${Date.now()}`);
}

function makeEnv(overrides: Record<string, string> = {}) {
  return {
    ...process.env,
    HOME: overrides.HOME || "/tmp",
    XDG_CONFIG_HOME: overrides.XDG_CONFIG_HOME || "/tmp",
    XDG_DATA_HOME: overrides.XDG_DATA_HOME || "/tmp",
    ...overrides,
  };
}

async function runCli(args: string[], env: Record<string, string> = {}) {
  const result = await Bun.spawn(["bun", "run", CLI, ...args], {
    env: makeEnv(env),
    stderr: "pipe",
    stdout: "pipe",
  });

  const stdout = await new Response(result.stdout).text();
  const stderr = await new Response(result.stderr).text();
  const exitCode = await result.exited;

  return { stdout, stderr, exitCode };
}

describe("CLI", () => {
  let homeDir: string;

  beforeAll(async () => {
    homeDir = tmpDir("home");
    await fs.mkdir(homeDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  const testEnv = (name: string) => ({
    HOME: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    XDG_DATA_HOME: path.join(homeDir, ".local", "share"),
  });

  describe("whoami", () => {
    test("shows no credentials message when none set", async () => {
      const { stdout, exitCode } = await runCli(["whoami"], testEnv("whoami-empty"));
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No AWS credentials currently configured");
    });
  });

  describe("sessions", () => {
    test("shows no sessions message when none configured", async () => {
      const { stdout, exitCode } = await runCli(["sessions"], testEnv("sessions-empty"));
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No SSO sessions configured");
    });

    test("outputs empty list as JSON", async () => {
      const { stdout, exitCode } = await runCli(["sessions", "--json"], testEnv("sessions-json"));
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toEqual([]);
    });
  });

  describe("credentials", () => {
    test("shows no credentials message when none active", async () => {
      const { stdout, exitCode } = await runCli(["credentials"], testEnv("creds-empty"));
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No active credentials");
    });

    test("outputs empty list as JSON", async () => {
      const { stdout, exitCode } = await runCli(["credentials", "--json"], testEnv("creds-json"));
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toEqual([]);
    });
  });

  describe("auth --list", () => {
    test("shows no sessions message", async () => {
      const { stdout, exitCode } = await runCli(["auth", "--list"], testEnv("auth-list"));
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No SSO sessions configured");
    });
  });

  describe("set (no sessions)", () => {
    test("exits with error when no sessions configured", async () => {
      const { stderr, exitCode } = await runCli(["set"], testEnv("set-empty"));
      expect(exitCode).toBe(1);
      expect(stderr).toContain("No SSO sessions configured");
    });
  });

  describe("root browser flag", () => {
    test("exits with error when default profile is not active", async () => {
      const { stderr, exitCode } = await runCli(["-b"], testEnv("root-browser-no-default"));
      expect(exitCode).toBe(1);
      expect(stderr).toContain("No active credentials found for profile 'default'");
    });
  });

  describe("direct session command", () => {
    test("resolves positional args to session command", async () => {
      const { stderr, exitCode } = await runCli(["missing-session", "account", "role"], testEnv("session-direct"));
      expect(exitCode).toBe(1);
      expect(stderr).toContain("SSO session 'missing-session' not found");
    });
  });

  describe("auth (no session)", () => {
    test("exits with error when no session specified", async () => {
      const { stderr, exitCode } = await runCli(["auth"], testEnv("auth-no-session"));
      expect(exitCode).toBe(1);
      expect(stderr).toContain("No SSO session specified");
    });

    test("exits with error for nonexistent session", async () => {
      const { stderr, exitCode } = await runCli(["auth", "nonexistent"], testEnv("auth-bad-session"));
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("accounts (no sessions)", () => {
    test("exits with error when no sessions configured", async () => {
      const { stderr, exitCode } = await runCli(["accounts"], testEnv("accounts-empty"));
      expect(exitCode).toBe(1);
      expect(stderr).toContain("No SSO sessions configured");
    });
  });

  describe("help", () => {
    test("shows help with --help", async () => {
      const { stdout, exitCode } = await runCli(["--help"], testEnv("help"));
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Commands");
    });
  });
});
