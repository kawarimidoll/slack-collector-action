// --- Helper functions for parsing environment variables ---

function envString(key: string, fallback: string): string {
  return Deno.env.get(key)?.trim() || fallback;
}

function envList(key: string, fallback: string[]): string[] {
  const val = Deno.env.get(key)?.trim();
  if (!val) return fallback;
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // not JSON — ignore
  }
  return fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const val = Deno.env.get(key)?.trim().toLowerCase();
  if (val === undefined || val === "") return fallback;
  return val === "true" || val === "1";
}

function envNumber(key: string, fallback: number): number {
  const val = Deno.env.get(key)?.trim();
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

// --- Type definitions ---

export interface SlackConfig {
  token: string;
  cookie: string;
  workspace: string;
}

export interface LlmConfig {
  githubToken: string;
  model: string;
  endpoint: string;
}

export interface DigestConfig {
  mustReadKeywords: string[];
  mustReadMentions: string[];
  includePublicChannels: boolean;
  includePrivateChannels: boolean;
  includeGroupDMs: boolean;
  includeDirectDMs: boolean;
  targetChannels: string[];
  excludeChannels: string[];
  excludeUrlHosts: string[];
  hoursBack: number;
}

export interface Config {
  slack: SlackConfig;
  llm: LlmConfig;
  digest: DigestConfig;
  output: { dir: string };
}

// --- Config (populated from environment variables) ---

export const config: Config = {
  slack: {
    token: envString("SLACK_TOKEN", ""),
    cookie: envString("SLACK_COOKIE", ""),
    workspace: envString("SLACK_WORKSPACE", ""),
  },

  llm: {
    githubToken: Deno.env.get("GITHUB_TOKEN") ?? "",
    model: envString("LLM_MODEL", "openai/gpt-4.1-mini"),
    endpoint: "https://models.github.ai/inference/chat/completions",
  },

  digest: {
    mustReadKeywords: envList("MUST_READ_KEYWORDS", []),
    mustReadMentions: envList("MUST_READ_MENTIONS", ["channel", "here"]),
    includePublicChannels: envBool("INCLUDE_PUBLIC_CHANNELS", true),
    includePrivateChannels: envBool("INCLUDE_PRIVATE_CHANNELS", true),
    includeGroupDMs: envBool("INCLUDE_GROUP_DMS", false),
    includeDirectDMs: envBool("INCLUDE_DIRECT_DMS", false),
    targetChannels: envList("TARGET_CHANNELS", []),
    excludeChannels: envList("EXCLUDE_CHANNELS", []),
    excludeUrlHosts: envList("EXCLUDE_URL_HOSTS", [
      "slack.com",
      "meet.google.com",
    ]),
    hoursBack: envNumber("HOURS_BACK", 24),
  },

  output: {
    dir: envString("OUTPUT_DIR", "./output"),
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.slack.token) {
    errors.push("SLACK_TOKEN が未設定です");
  }
  if (!config.slack.cookie) {
    errors.push("SLACK_COOKIE (xoxd-...) が未設定です");
  }
  if (!config.slack.workspace) {
    errors.push("SLACK_WORKSPACE が未設定です");
  }
  if (!config.llm.githubToken) {
    errors.push(
      "GITHUB_TOKEN が未設定です（models:read スコープの PAT を設定してください）",
    );
  }
  return errors;
}
