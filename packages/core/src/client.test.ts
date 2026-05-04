import { describe, expect, test } from "bun:test";
import { AWSClient } from "../src/client";

describe("AWSClient", () => {
  describe("getDashboardURL", () => {
    test("returns dashboard URL from start URL", () => {
      const client = new AWSClient("us-east-1");
      const result = client.getDashboardURL("https://my-sso.awsapps.com/start");
      expect(result).toBe("https://my-sso.awsapps.com/start/#/?tab=accounts");
    });

    test("handles start URL with trailing slash", () => {
      const client = new AWSClient("us-east-1");
      const result = client.getDashboardURL("https://my-sso.awsapps.com/start/");
      expect(result).toBe("https://my-sso.awsapps.com/start/#/?tab=accounts");
    });
  });

  describe("getAccountURL", () => {
    test("returns console URL with account and role", () => {
      const client = new AWSClient("us-east-1");
      const result = client.getAccountURL(
        "123456789012",
        "https://my-sso.awsapps.com/start",
        "AdministratorAccess"
      );
      expect(result).toBe(
        "https://my-sso.awsapps.com/start/#/console?account_id=123456789012&role_name=AdministratorAccess"
      );
    });

    test("handles start URL with trailing slash", () => {
      const client = new AWSClient("us-east-1");
      const result = client.getAccountURL(
        "123456789012",
        "https://my-sso.awsapps.com/start/",
        "Admin"
      );
      expect(result).toBe(
        "https://my-sso.awsapps.com/start/#/console?account_id=123456789012&role_name=Admin"
      );
    });
  });

  describe("getRegion", () => {
    test("returns the region passed to constructor", () => {
      const client = new AWSClient("eu-west-1");
      expect(client.getRegion()).toBe("eu-west-1");
    });
  });
});
