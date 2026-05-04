import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { Credentials } from "../src/credentials";
import type { RoleCredentials } from "../src/types";

describe("Credentials", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(import.meta.dir, ".tmp-credentials-test-" + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleCreds: RoleCredentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "FwoGZXIvYXdzEBYaDH...",
    expiration: new Date("2026-01-01T00:00:00Z"),
  };

  describe("write", () => {
    test("writes credentials file with correct format", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "default",
        credentials: sampleCreds,
      });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).toContain("[default]");
      expect(content).toContain("aws_access_key_id = AKIAIOSFODNN7EXAMPLE");
      expect(content).toContain("aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
      expect(content).toContain("aws_session_token = FwoGZXIvYXdzEBYaDH...");
    });

    test("includes region when provided", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "dev",
        credentials: sampleCreds,
        region: "us-east-1",
      });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).toContain("[dev]");
      expect(content).toContain("region = us-east-1");
    });

    test("creates directory if it doesn't exist", async () => {
      const nestedDir = path.join(tempDir, "nested", "aws");

      await Credentials.write({
        awsDir: nestedDir,
        profileName: "default",
        credentials: sampleCreds,
      });

      const exists = await Bun.file(path.join(nestedDir, "credentials")).exists();
      expect(exists).toBe(true);
    });

    test("appends to existing file without overwriting other profiles", async () => {
      // Write first profile
      await Credentials.write({
        awsDir: tempDir,
        profileName: "profile-a",
        credentials: sampleCreds,
      });

      // Write second profile
      await Credentials.write({
        awsDir: tempDir,
        profileName: "profile-b",
        credentials: { ...sampleCreds, accessKeyId: "DIFFERENT_KEY" },
      });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).toContain("[profile-a]");
      expect(content).toContain("[profile-b]");
      expect(content).toContain("AKIAIOSFODNN7EXAMPLE");
      expect(content).toContain("DIFFERENT_KEY");
    });

    test("overwrites existing profile with same name", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "default",
        credentials: sampleCreds,
      });

      await Credentials.write({
        awsDir: tempDir,
        profileName: "default",
        credentials: { ...sampleCreds, accessKeyId: "NEW_KEY" },
      });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).toContain("NEW_KEY");
      expect(content).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });
  });

  describe("removeProfile", () => {
    test("removes a profile from credentials file", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "profile-a",
        credentials: sampleCreds,
      });
      await Credentials.write({
        awsDir: tempDir,
        profileName: "profile-b",
        credentials: sampleCreds,
      });

      await Credentials.removeProfile({ awsDir: tempDir, profileName: "profile-a" });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).not.toContain("[profile-a]");
      expect(content).toContain("[profile-b]");
    });

    test("does nothing if profile doesn't exist", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "existing",
        credentials: sampleCreds,
      });

      await Credentials.removeProfile({ awsDir: tempDir, profileName: "nonexistent" });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).toContain("[existing]");
    });

    test("writes empty file when last profile is removed", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "only-profile",
        credentials: sampleCreds,
      });

      await Credentials.removeProfile({ awsDir: tempDir, profileName: "only-profile" });

      const content = await Bun.file(path.join(tempDir, "credentials")).text();
      expect(content).toBe("");
    });

    test("does nothing if credentials file doesn't exist", async () => {
      await expect(
        Credentials.removeProfile({ awsDir: tempDir, profileName: "nonexistent" })
      ).resolves.toBeUndefined();
    });
  });

  describe("listProfiles", () => {
    test("returns empty array when no credentials file", async () => {
      const profiles = await Credentials.listProfiles(tempDir);
      expect(profiles).toEqual([]);
    });

    test("returns all profile names", async () => {
      await Credentials.write({
        awsDir: tempDir,
        profileName: "default",
        credentials: sampleCreds,
      });
      await Credentials.write({
        awsDir: tempDir,
        profileName: "production",
        credentials: sampleCreds,
      });
      await Credentials.write({
        awsDir: tempDir,
        profileName: "staging",
        credentials: sampleCreds,
      });

      const profiles = await Credentials.listProfiles(tempDir);
      expect(profiles).toEqual(["default", "production", "staging"]);
    });
  });
});
