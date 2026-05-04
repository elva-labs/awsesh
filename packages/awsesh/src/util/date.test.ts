import { describe, expect, test } from "bun:test";
import { DateUtil } from "./date";
import type { DateFormat, TimeFormat } from "../config/config";

describe("DateUtil", () => {
  describe("formatDate", () => {
    test("formats dd/mm/yyyy", () => {
      const date = new Date(2026, 0, 5); // Jan 5, 2026
      expect(DateUtil.formatDate(date, "dd/mm/yyyy")).toBe("05/01/2026");
    });

    test("formats mm/dd/yyyy", () => {
      const date = new Date(2026, 0, 5); // Jan 5, 2026
      expect(DateUtil.formatDate(date, "mm/dd/yyyy")).toBe("01/05/2026");
    });

    test("pads single digit day", () => {
      const date = new Date(2026, 0, 1);
      expect(DateUtil.formatDate(date, "dd/mm/yyyy")).toBe("01/01/2026");
    });

    test("pads single digit month", () => {
      const date = new Date(2026, 8, 15); // Sep 15, 2026
      expect(DateUtil.formatDate(date, "dd/mm/yyyy")).toBe("15/09/2026");
    });

    test("handles December 31", () => {
      const date = new Date(2026, 11, 31);
      expect(DateUtil.formatDate(date, "dd/mm/yyyy")).toBe("31/12/2026");
      expect(DateUtil.formatDate(date, "mm/dd/yyyy")).toBe("12/31/2026");
    });

    test("accepts string date input", () => {
      expect(DateUtil.formatDate("2026-03-15T00:00:00Z", "dd/mm/yyyy")).toBe("15/03/2026");
    });
  });

  describe("formatTime", () => {
    test("formats 24h time", () => {
      const date = new Date(2026, 0, 1, 14, 30);
      expect(DateUtil.formatTime(date, "24h")).toBe("14:30");
    });

    test("formats 12h PM time", () => {
      const date = new Date(2026, 0, 1, 14, 30);
      expect(DateUtil.formatTime(date, "12h")).toBe("2:30 PM");
    });

    test("formats 12h AM time", () => {
      const date = new Date(2026, 0, 1, 2, 5);
      expect(DateUtil.formatTime(date, "12h")).toBe("2:05 AM");
    });

    test("formats midnight as 0:00 in 24h", () => {
      const date = new Date(2026, 0, 1, 0, 0);
      expect(DateUtil.formatTime(date, "24h")).toBe("00:00");
    });

    test("formats midnight as 12:00 AM in 12h", () => {
      const date = new Date(2026, 0, 1, 0, 0);
      expect(DateUtil.formatTime(date, "12h")).toBe("12:00 AM");
    });

    test("formats noon as 12:00 PM in 12h", () => {
      const date = new Date(2026, 0, 1, 12, 0);
      expect(DateUtil.formatTime(date, "12h")).toBe("12:00 PM");
    });

    test("formats noon as 12:00 in 24h", () => {
      const date = new Date(2026, 0, 1, 12, 0);
      expect(DateUtil.formatTime(date, "24h")).toBe("12:00");
    });

    test("pads minutes in 24h", () => {
      const date = new Date(2026, 0, 1, 9, 5);
      expect(DateUtil.formatTime(date, "24h")).toBe("09:05");
    });

    test("accepts string date input", () => {
      expect(DateUtil.formatTime("2026-01-01T16:45:00Z", "24h")).toBe("16:45");
    });
  });

  describe("format", () => {
    test("combines date and time", () => {
      const date = new Date(2026, 2, 15, 14, 30);
      const result = DateUtil.format(date, "dd/mm/yyyy", "24h");
      expect(result).toBe("15/03/2026 14:30");
    });

    test("combines with 12h time", () => {
      const date = new Date(2026, 2, 15, 14, 30);
      const result = DateUtil.format(date, "mm/dd/yyyy", "12h");
      expect(result).toBe("03/15/2026 2:30 PM");
    });
  });
});
