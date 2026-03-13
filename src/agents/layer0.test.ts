import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Layer0ConfigError,
  compileLayer0Section,
  loadLayer0Config,
  getLayer0ConfigPath,
  type Layer0Config,
} from "./layer0.js";

const VALID_CONFIG: Layer0Config = {
  version: 1,
  role: "elite executive assistant",
  mission:
    "Reduce the user's cognitive load and complete tasks quickly in the user's preferred way.",
  action_policy: {
    default_mode: "act",
    act_on_reversible_low_risk_tasks: true,
    prefer_action_over_questions: true,
  },
  approval_policy: {
    require_approval_for: [
      "external_messages",
      "spending_money",
      "irreversible_actions",
      "third_party_commitments",
    ],
  },
  style_policy: {
    verbosity: "low",
    tone: "decisive",
    include_recommendation: true,
    include_next_step: true,
  },
  capability_policy: {
    never_assume_permissions: true,
    do_not_claim_unavailable_tools: true,
  },
};

describe("layer0", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(path.join(tmpdir(), "layer0-test-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  function writeConfig(config: unknown) {
    const dir = path.join(workspaceDir, ".openclaw");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "layer0.json"), JSON.stringify(config));
  }

  describe("getLayer0ConfigPath", () => {
    it("returns the correct path", () => {
      expect(getLayer0ConfigPath("/foo/bar")).toBe(
        path.join("/foo/bar", ".openclaw", "layer0.json"),
      );
    });
  });

  describe("loadLayer0Config", () => {
    it("loads a valid config", () => {
      writeConfig(VALID_CONFIG);
      const config = loadLayer0Config(workspaceDir);
      expect(config).toEqual(VALID_CONFIG);
    });

    it("returns null when file is missing", () => {
      expect(loadLayer0Config(workspaceDir)).toBeNull();
    });

    it("throws Layer0ConfigError for invalid JSON", () => {
      const dir = path.join(workspaceDir, ".openclaw");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "layer0.json"), "not json{{{");
      expect(() => loadLayer0Config(workspaceDir)).toThrow(Layer0ConfigError);
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/invalid JSON/);
    });

    it("throws for invalid default_mode enum", () => {
      writeConfig({
        ...VALID_CONFIG,
        action_policy: { ...VALID_CONFIG.action_policy, default_mode: "yolo" },
      });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(Layer0ConfigError);
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/default_mode/);
    });

    it("throws for wrong version", () => {
      writeConfig({ ...VALID_CONFIG, version: 2 });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/version.*must be exactly 1/);
    });

    it("throws for empty role", () => {
      writeConfig({ ...VALID_CONFIG, role: "  " });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/role.*non-empty/);
    });

    it("throws for empty mission", () => {
      writeConfig({ ...VALID_CONFIG, mission: "" });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/mission.*non-empty/);
    });

    it("throws for invalid approval item", () => {
      writeConfig({
        ...VALID_CONFIG,
        approval_policy: { require_approval_for: ["hacking"] },
      });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/invalid approval item/);
    });

    it("throws for invalid verbosity", () => {
      writeConfig({
        ...VALID_CONFIG,
        style_policy: { ...VALID_CONFIG.style_policy, verbosity: "extreme" },
      });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/verbosity/);
    });

    it("throws for invalid tone", () => {
      writeConfig({
        ...VALID_CONFIG,
        style_policy: { ...VALID_CONFIG.style_policy, tone: "snarky" },
      });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/tone/);
    });

    it("throws when action_policy is missing", () => {
      const { action_policy: _, ...noAction } = VALID_CONFIG;
      writeConfig(noAction);
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/action_policy/);
    });

    it("throws when capability_policy booleans are not booleans", () => {
      writeConfig({
        ...VALID_CONFIG,
        capability_policy: {
          never_assume_permissions: "yes",
          do_not_claim_unavailable_tools: true,
        },
      });
      expect(() => loadLayer0Config(workspaceDir)).toThrow(/never_assume_permissions.*boolean/);
    });
  });

  describe("compileLayer0Section", () => {
    it("produces exact deterministic output for valid config", () => {
      const result = compileLayer0Section(VALID_CONFIG);
      expect(result).toEqual([
        "## Layer 0 Identity Kernel",
        "Role: elite executive assistant",
        "Mission: Reduce the user's cognitive load and complete tasks quickly in the user's preferred way.",
        "Default mode: act",
        "Action bias: Act directly on reversible, low-risk tasks. Prefer action over unnecessary questions.",
        "Approval boundary: Require explicit approval before sending external messages, spending money, taking irreversible actions, and making commitments to third parties.",
        "Capability honesty: Never assume permissions. Never claim tools or capabilities that are not actually available in the current runtime.",
        "Response style: Be low verbosity, decisive, recommendation-first=true, next-step=true.",
        "This kernel is stable per run. Follow it unless higher-priority system or safety instructions override it.",
        "",
      ]);
    });

    it("is byte-identical across multiple calls", () => {
      const a = compileLayer0Section(VALID_CONFIG);
      const b = compileLayer0Section(VALID_CONFIG);
      expect(a).toEqual(b);
    });

    it("preserves approval order from JSON", () => {
      const reversed: Layer0Config = {
        ...VALID_CONFIG,
        approval_policy: {
          require_approval_for: ["third_party_commitments", "irreversible_actions"],
        },
      };
      const result = compileLayer0Section(reversed);
      const approvalLine = result.find((l) => l.startsWith("Approval boundary:"))!;
      expect(approvalLine).toBe(
        "Approval boundary: Require explicit approval before making commitments to third parties and taking irreversible actions.",
      );
    });

    it("compiles action bias when prefer_action_over_questions is false", () => {
      const config: Layer0Config = {
        ...VALID_CONFIG,
        action_policy: {
          ...VALID_CONFIG.action_policy,
          prefer_action_over_questions: false,
        },
      };
      const result = compileLayer0Section(config);
      const line = result.find((l) => l.startsWith("Action bias:"))!;
      expect(line).toContain("Ask when clarification materially changes the result.");
    });

    it("compiles action bias when act_on_reversible is false", () => {
      const config: Layer0Config = {
        ...VALID_CONFIG,
        action_policy: {
          ...VALID_CONFIG.action_policy,
          act_on_reversible_low_risk_tasks: false,
        },
      };
      const result = compileLayer0Section(config);
      const line = result.find((l) => l.startsWith("Action bias:"))!;
      expect(line).toContain("Do not auto-act by default");
    });

    it("compiles capability honesty with only one boolean true", () => {
      const config: Layer0Config = {
        ...VALID_CONFIG,
        capability_policy: {
          never_assume_permissions: true,
          do_not_claim_unavailable_tools: false,
        },
      };
      const result = compileLayer0Section(config);
      const line = result.find((l) => l.startsWith("Capability honesty:"))!;
      expect(line).toBe("Capability honesty: Never assume permissions.");
    });
  });
});
