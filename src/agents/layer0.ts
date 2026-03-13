import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Layer0Config = {
  version: 1;
  role: string;
  mission: string;
  action_policy: {
    default_mode: "act" | "recommend" | "ask";
    act_on_reversible_low_risk_tasks: boolean;
    prefer_action_over_questions: boolean;
  };
  approval_policy: {
    require_approval_for: Array<
      "external_messages" | "spending_money" | "irreversible_actions" | "third_party_commitments"
    >;
  };
  style_policy: {
    verbosity: "low" | "medium" | "high";
    tone: "decisive" | "warm" | "formal" | "concise";
    include_recommendation: boolean;
    include_next_step: boolean;
  };
  capability_policy: {
    never_assume_permissions: boolean;
    do_not_claim_unavailable_tools: boolean;
  };
};

export class Layer0ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Layer0ConfigError";
  }
}

const VALID_DEFAULT_MODES = new Set(["act", "recommend", "ask"]);
const VALID_APPROVAL_ITEMS = new Set([
  "external_messages",
  "spending_money",
  "irreversible_actions",
  "third_party_commitments",
]);
const VALID_VERBOSITY = new Set(["low", "medium", "high"]);
const VALID_TONE = new Set(["decisive", "warm", "formal", "concise"]);

export function getLayer0ConfigPath(workspaceDir: string): string {
  return path.join(workspaceDir, ".openclaw", "layer0.json");
}

/**
 * Load and validate layer0.json from the workspace.
 * Returns null if the file does not exist (Layer 0 not configured).
 * Throws Layer0ConfigError if the file exists but is invalid.
 */
export function loadLayer0Config(workspaceDir: string): Layer0Config | null {
  const configPath = getLayer0ConfigPath(workspaceDir);

  if (!existsSync(configPath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Layer0ConfigError(
      `Layer 0 configuration error: unreadable \`.openclaw/layer0.json\` at ${configPath}. Fix the file before continuing.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Layer0ConfigError(
      `Layer 0 configuration error: invalid JSON in \`.openclaw/layer0.json\`. Fix the file before continuing.`,
    );
  }

  return validateLayer0Config(parsed);
}

function validateLayer0Config(data: unknown): Layer0Config {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Layer0ConfigError("Layer 0 configuration error: root must be a JSON object.");
  }

  const obj = data as Record<string, unknown>;

  // version
  if (obj.version !== 1) {
    throw new Layer0ConfigError("Layer 0 configuration error: `version` must be exactly 1.");
  }

  // role
  if (typeof obj.role !== "string" || obj.role.trim() === "") {
    throw new Layer0ConfigError("Layer 0 configuration error: `role` must be a non-empty string.");
  }

  // mission
  if (typeof obj.mission !== "string" || obj.mission.trim() === "") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `mission` must be a non-empty string.",
    );
  }

  // action_policy
  const ap = obj.action_policy;
  if (typeof ap !== "object" || ap === null || Array.isArray(ap)) {
    throw new Layer0ConfigError("Layer 0 configuration error: `action_policy` must be an object.");
  }
  const actionPolicy = ap as Record<string, unknown>;
  if (!VALID_DEFAULT_MODES.has(actionPolicy.default_mode as string)) {
    throw new Layer0ConfigError(
      `Layer 0 configuration error: \`action_policy.default_mode\` must be one of: act, recommend, ask.`,
    );
  }
  if (typeof actionPolicy.act_on_reversible_low_risk_tasks !== "boolean") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `action_policy.act_on_reversible_low_risk_tasks` must be a boolean.",
    );
  }
  if (typeof actionPolicy.prefer_action_over_questions !== "boolean") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `action_policy.prefer_action_over_questions` must be a boolean.",
    );
  }

  // approval_policy
  const approvalPolicy = obj.approval_policy;
  if (
    typeof approvalPolicy !== "object" ||
    approvalPolicy === null ||
    Array.isArray(approvalPolicy)
  ) {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `approval_policy` must be an object.",
    );
  }
  const approvalObj = approvalPolicy as Record<string, unknown>;
  if (!Array.isArray(approvalObj.require_approval_for)) {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `approval_policy.require_approval_for` must be an array.",
    );
  }
  for (const item of approvalObj.require_approval_for) {
    if (!VALID_APPROVAL_ITEMS.has(item as string)) {
      throw new Layer0ConfigError(
        `Layer 0 configuration error: invalid approval item "${String(item)}". Allowed: external_messages, spending_money, irreversible_actions, third_party_commitments.`,
      );
    }
  }

  // style_policy
  const sp = obj.style_policy;
  if (typeof sp !== "object" || sp === null || Array.isArray(sp)) {
    throw new Layer0ConfigError("Layer 0 configuration error: `style_policy` must be an object.");
  }
  const stylePolicy = sp as Record<string, unknown>;
  if (!VALID_VERBOSITY.has(stylePolicy.verbosity as string)) {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `style_policy.verbosity` must be one of: low, medium, high.",
    );
  }
  if (!VALID_TONE.has(stylePolicy.tone as string)) {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `style_policy.tone` must be one of: decisive, warm, formal, concise.",
    );
  }
  if (typeof stylePolicy.include_recommendation !== "boolean") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `style_policy.include_recommendation` must be a boolean.",
    );
  }
  if (typeof stylePolicy.include_next_step !== "boolean") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `style_policy.include_next_step` must be a boolean.",
    );
  }

  // capability_policy
  const cp = obj.capability_policy;
  if (typeof cp !== "object" || cp === null || Array.isArray(cp)) {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `capability_policy` must be an object.",
    );
  }
  const capPolicy = cp as Record<string, unknown>;
  if (typeof capPolicy.never_assume_permissions !== "boolean") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `capability_policy.never_assume_permissions` must be a boolean.",
    );
  }
  if (typeof capPolicy.do_not_claim_unavailable_tools !== "boolean") {
    throw new Layer0ConfigError(
      "Layer 0 configuration error: `capability_policy.do_not_claim_unavailable_tools` must be a boolean.",
    );
  }

  return data as Layer0Config;
}

const APPROVAL_LABELS: Record<string, string> = {
  external_messages: "sending external messages",
  spending_money: "spending money",
  irreversible_actions: "taking irreversible actions",
  third_party_commitments: "making commitments to third parties",
};

function compileActionBias(policy: Layer0Config["action_policy"]): string {
  if (!policy.act_on_reversible_low_risk_tasks) {
    return "Do not auto-act by default, even on reversible low-risk tasks.";
  }
  if (policy.prefer_action_over_questions) {
    return "Act directly on reversible, low-risk tasks. Prefer action over unnecessary questions.";
  }
  return "Act directly on reversible, low-risk tasks. Ask when clarification materially changes the result.";
}

function compileApprovalBoundary(
  items: Layer0Config["approval_policy"]["require_approval_for"],
): string {
  if (items.length === 0) {
    return "No explicit approval boundaries configured.";
  }
  const labels = items.map((item) => APPROVAL_LABELS[item]);
  const joined =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  return `Require explicit approval before ${joined}.`;
}

function compileCapabilityHonesty(policy: Layer0Config["capability_policy"]): string {
  const clauses: string[] = [];
  if (policy.never_assume_permissions) {
    clauses.push("Never assume permissions.");
  }
  if (policy.do_not_claim_unavailable_tools) {
    clauses.push(
      "Never claim tools or capabilities that are not actually available in the current runtime.",
    );
  }
  return clauses.length > 0 ? clauses.join(" ") : "No capability constraints configured.";
}

function compileResponseStyle(policy: Layer0Config["style_policy"]): string {
  return `Be ${policy.verbosity} verbosity, ${policy.tone}, recommendation-first=${policy.include_recommendation}, next-step=${policy.include_next_step}.`;
}

export function compileLayer0Section(config: Layer0Config): string[] {
  return [
    "## Layer 0 Identity Kernel",
    `Role: ${config.role}`,
    `Mission: ${config.mission}`,
    `Default mode: ${config.action_policy.default_mode}`,
    `Action bias: ${compileActionBias(config.action_policy)}`,
    `Approval boundary: ${compileApprovalBoundary(config.approval_policy.require_approval_for)}`,
    `Capability honesty: ${compileCapabilityHonesty(config.capability_policy)}`,
    `Response style: ${compileResponseStyle(config.style_policy)}`,
    "This kernel is stable per run. Follow it unless higher-priority system or safety instructions override it.",
    "",
  ];
}
