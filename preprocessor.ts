import { config } from "./config.ts";
import { resolveSlackUrls, stripCodeBlocks } from "./utils.ts";
import type {
  CategorizedMessages,
  ProcessedMessage,
  SlackMessage,
} from "./types.ts";

const SKIP_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "bot_message",
  "pinned_item",
  "unpinned_item",
]);

const SLACK_URL_PATTERN = /<(https?:\/\/[^|>]+)(?:\|([^>]+))?>/g;

/** URL抽出（Slackの <URL|label> 記法に対応） */
function extractUrls(text: string): string[] {
  const stripped = stripCodeBlocks(text);
  const excludeHosts = config.digest.excludeUrlHosts;

  const urls: string[] = [];
  for (const match of stripped.matchAll(SLACK_URL_PATTERN)) {
    const url = match[1];
    if (excludeHosts.some((host) => url.includes(host))) continue;
    urls.push(url);
  }

  return urls;
}

/** Slackテキストのアングルブラケット記法を解決してコンテキストを生成 */
function resolveContext(text: string): string {
  const stripped = stripCodeBlocks(text);
  return resolveSlackUrls(stripped)
    // <!here>, <!channel>, <!subteam^ID|name> → @here, @channel, @name
    .replace(
      /<!([^|>]+)(?:\|@?([^>]*))?>/g,
      (_, type, label) => `@${label ?? type}`,
    )
    .replace(/<(?!https?:\/\/)[^>]+>/g, "")
    .trim();
}

/** SlackMessage → ProcessedMessage に変換（不要メッセージは null） */
function processMessage(msg: SlackMessage): ProcessedMessage | null {
  if (msg.subtype && SKIP_SUBTYPES.has(msg.subtype)) return null;

  const text = msg.text?.trim();
  if (!text) return null;

  return {
    timestamp: msg.ts,
    user: msg.user ?? "unknown",
    text,
    urls: extractUrls(text),
    resolvedText: resolveContext(text),
    reactions: msg.reactions?.reduce((sum, r) => sum + r.count, 0) ?? 0,
    replyCount: msg.reply_count ?? 0,
    threadTs: msg.thread_ts,
    files: msg.files ?? [],
  };
}

/** メンションやキーワードでの無条件抽出判定 */
function isMustRead(msg: ProcessedMessage, myUserId: string): boolean {
  if (msg.text.includes(`<@${myUserId}>`)) return true;

  // <!channel>, <!here> or <!subteam^ID|name>
  for (const name of config.digest.mustReadMentions) {
    if (msg.text.includes(`<!${name}>`) || msg.text.includes(`|${name}>`)) {
      return true;
    }
  }

  const textLower = msg.text.toLowerCase();
  for (const keyword of config.digest.mustReadKeywords) {
    if (textLower.includes(keyword.toLowerCase())) return true;
  }

  return false;
}

/** 生メッセージ → ProcessedMessage（フィルタなし、全件保持） */
export function toRawProcessedMessages(
  messages: SlackMessage[],
): ProcessedMessage[] {
  return messages
    .filter((msg) => msg.text?.trim())
    .map((msg) => ({
      timestamp: msg.ts,
      user: msg.user ?? "unknown",
      text: msg.text.trim(),
      urls: [],
      resolvedText: "",
      reactions: msg.reactions?.reduce((sum, r) => sum + r.count, 0) ?? 0,
      replyCount: msg.reply_count ?? 0,
      threadTs: msg.thread_ts,
      files: msg.files ?? [],
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** メッセージ群をカテゴリ分け */
export function categorizeMessages(
  rawMessages: SlackMessage[],
  myUserId: string,
): CategorizedMessages {
  const result: CategorizedMessages = {
    mustRead: [],
    sharedLinks: [],
    general: [],
  };

  for (const raw of rawMessages) {
    const msg = processMessage(raw);
    if (!msg) continue;

    if (isMustRead(msg, myUserId)) {
      result.mustRead.push(msg);
    } else if (msg.urls.length > 0) {
      result.sharedLinks.push(msg);
    } else {
      result.general.push(msg);
    }
  }

  // リアクション数でソート（多い順）
  for (const category of Object.values(result)) {
    category.sort((a: ProcessedMessage, b: ProcessedMessage) =>
      b.reactions - a.reactions
    );
  }

  return result;
}
