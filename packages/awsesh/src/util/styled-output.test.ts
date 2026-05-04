import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import { printSessionInfo } from "./styled-output";

describe("printSessionInfo", () => {
  let writeSync: ReturnType<typeof spyOn>;
  let capturedOutput: string;

  beforeEach(() => {
    capturedOutput = "";
    writeSync = spyOn(fs, "writeSync").mockImplementation((fd: number, data: ArrayBufferView | string) => {
      if (typeof data === "string") {
        capturedOutput = data;
        return data.length;
      }

      capturedOutput = new TextDecoder().decode(data);
      return data.byteLength;
    });
  });

  afterEach(() => {
    writeSync.mockRestore();
  });

  test("prints session info with all fields", () => {
    printSessionInfo({
      sessionName: "production",
      accountName: "Main Account",
      accountId: "123456789012",
      roleName: "AdministratorAccess",
      region: "us-east-1",
      profileName: "custom-profile",
    });

    expect(capturedOutput).toContain("production");
    expect(capturedOutput).toContain("Main Account");
    expect(capturedOutput).toContain("123456789012");
    expect(capturedOutput).toContain("AdministratorAccess");
    expect(capturedOutput).toContain("us-east-1");
    expect(capturedOutput).toContain("custom-profile");
  });

  test("omits profile when default", () => {
    printSessionInfo({
      sessionName: "dev",
      accountName: "Dev Account",
      accountId: "111222333444",
      roleName: "Developer",
      region: "eu-west-1",
      profileName: "default",
    });

    expect(capturedOutput).not.toContain("Profile");
    expect(capturedOutput).toContain("Developer");
  });

  test("omits profile when undefined", () => {
    printSessionInfo({
      sessionName: "staging",
      accountName: "Staging",
      accountId: "555666777888",
      roleName: "ReadOnly",
      region: "ap-southeast-1",
    });

    expect(capturedOutput).not.toContain("Profile");
  });

  test("starts and ends with newline", () => {
    printSessionInfo({
      sessionName: "test",
      accountName: "Test",
      accountId: "000000000000",
      roleName: "Admin",
      region: "us-east-1",
    });

    expect(capturedOutput.startsWith("\n")).toBe(true);
    expect(capturedOutput.endsWith("\n\n")).toBe(true);
  });

  test("includes ANSI color codes", () => {
    printSessionInfo({
      sessionName: "test",
      accountName: "Test",
      accountId: "000000000000",
      roleName: "Admin",
      region: "us-east-1",
    });

    expect(capturedOutput).toContain("\x1b[38;2;107;114;128m");
    expect(capturedOutput).toContain("\x1b[0m");
  });

  test("includes dim accountId", () => {
    printSessionInfo({
      sessionName: "test",
      accountName: "Test",
      accountId: "000000000000",
      roleName: "Admin",
      region: "us-east-1",
    });

    expect(capturedOutput).toContain("\x1b[2m");
  });
});
