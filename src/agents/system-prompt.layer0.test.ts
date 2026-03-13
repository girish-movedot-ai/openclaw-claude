import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Layer0ConfigError } from "./layer0.js";
import type { Layer0Config } from "./layer0.js";
import { buildAgentSystemPrompt } from "./system-prompt.js";

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

describe("system-prompt Layer 0 integration", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(path.join(tmpdir(), "sysprompt-layer0-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  function writeConfig(config: unknown) {
    const dir = path.join(workspaceDir, ".openclaw");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "layer0.json"), JSON.stringify(config));
  }

  it("Layer 0 appears after Safety section", () => {
    writeConfig(VALID_CONFIG);
    const prompt = buildAgentSystemPrompt({ workspaceDir });
    const safetyIdx = prompt.indexOf("## Safety");
    const layer0Idx = prompt.indexOf("## Layer 0 Identity Kernel");
    expect(safetyIdx).toBeGreaterThan(-1);
    expect(layer0Idx).toBeGreaterThan(-1);
    expect(layer0Idx).toBeGreaterThan(safetyIdx);
  });

  it("Layer 0 appears before OpenClaw CLI Quick Reference", () => {
    writeConfig(VALID_CONFIG);
    const prompt = buildAgentSystemPrompt({ workspaceDir });
    const layer0Idx = prompt.indexOf("## Layer 0 Identity Kernel");
    const cliIdx = prompt.indexOf("## OpenClaw CLI Quick Reference");
    expect(layer0Idx).toBeGreaterThan(-1);
    expect(cliIdx).toBeGreaterThan(-1);
    expect(layer0Idx).toBeLessThan(cliIdx);
  });

  it("Layer 0 appears before Project Context", () => {
    writeConfig(VALID_CONFIG);
    const prompt = buildAgentSystemPrompt({
      workspaceDir,
      contextFiles: [
        { path: "SOUL.md", content: "soul content" },
        { path: "IDENTITY.md", content: "identity content" },
      ],
    });
    const layer0Idx = prompt.indexOf("## Layer 0 Identity Kernel");
    const projectIdx = prompt.indexOf("# Project Context");
    expect(layer0Idx).toBeGreaterThan(-1);
    // Project Context may not appear if no contextFiles triggers it, but if it does, Layer 0 is first
    if (projectIdx !== -1) {
      expect(layer0Idx).toBeLessThan(projectIdx);
    }
  });

  it("missing Layer 0 file is gracefully skipped", () => {
    const prompt = buildAgentSystemPrompt({ workspaceDir });
    expect(prompt).not.toContain("## Layer 0 Identity Kernel");
  });

  it("invalid Layer 0 content aborts prompt construction", () => {
    writeConfig({ version: 99 });
    expect(() => buildAgentSystemPrompt({ workspaceDir })).toThrow(Layer0ConfigError);
  });

  it("Telegram-triggered run still gets Layer 0", () => {
    writeConfig(VALID_CONFIG);
    const prompt = buildAgentSystemPrompt({
      workspaceDir,
      runtimeInfo: {
        channel: "telegram",
      },
    });
    expect(prompt).toContain("## Layer 0 Identity Kernel");
    expect(prompt).toContain("Role: elite executive assistant");
  });

  it("contains all compiled Layer 0 fields", () => {
    writeConfig(VALID_CONFIG);
    const prompt = buildAgentSystemPrompt({ workspaceDir });
    expect(prompt).toContain("Role: elite executive assistant");
    expect(prompt).toContain("Mission: Reduce the user's cognitive load");
    expect(prompt).toContain("Default mode: act");
    expect(prompt).toContain("Action bias:");
    expect(prompt).toContain("Approval boundary:");
    expect(prompt).toContain("Capability honesty:");
    expect(prompt).toContain("Response style:");
    expect(prompt).toContain("This kernel is stable per run.");
  });
});
