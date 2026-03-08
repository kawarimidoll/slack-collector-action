import { config } from "./config.ts";
import { resolveSlackUrls } from "./utils.ts";
import type { SlackChannel, SlackMessage } from "./types.ts";

async function slackApi<T>(
  method: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const baseUrl = `https://${config.slack.workspace}.slack.com/api`;

  const body = new URLSearchParams();
  body.set("token", config.slack.token);
  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": `d=${config.slack.cookie}`,
  };

  const resp = await fetch(`${baseUrl}/${method}`, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Slack API ${method}: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  if (!data.ok) {
    throw new Error(
      `Slack API ${method}: ${data.error ?? JSON.stringify(data)}`,
    );
  }

  return data as T;
}

/** authTest() で取得した自分の情報のキャッシュ（resolveSlackMrkdwn で使用） */
let _myUserId = "";
let _myUserName = "";

/** auth.test で自分のユーザーID・表示名を取得 */
export async function authTest(): Promise<
  { userId: string; userName: string }
> {
  const data = await slackApi<{ user_id: string }>("auth.test");
  _myUserId = data.user_id;
  _myUserName = await getUserName(_myUserId);
  return { userId: _myUserId, userName: _myUserName };
}

function getConversationTypes(): string {
  const types: string[] = [];
  if (config.digest.includePublicChannels) types.push("public_channel");
  if (config.digest.includePrivateChannels) types.push("private_channel");
  if (config.digest.includeGroupDMs) types.push("mpim");
  if (config.digest.includeDirectDMs) types.push("im");
  return types.join(",");
}

/** 参加中のチャンネル・DM一覧を取得 */
export async function getChannels(): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor = "";

  do {
    const params: Record<string, string | number> = {
      types: getConversationTypes(),
      exclude_archived: "true",
      limit: 200,
    };
    if (cursor) params.cursor = cursor;

    const data = await slackApi<{
      channels: SlackChannel[];
      response_metadata?: { next_cursor?: string };
    }>("conversations.list", params);

    channels.push(...data.channels);
    cursor = data.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return channels;
}

/** チャンネルのメッセージ履歴を取得 */
export async function getChannelHistory(
  channelId: string,
  oldestTs: string,
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor = "";

  do {
    const params: Record<string, string | number> = {
      channel: channelId,
      oldest: oldestTs,
      limit: 200,
      inclusive: "true",
    };
    if (cursor) params.cursor = cursor;

    const data = await slackApi<{
      messages: SlackMessage[];
      response_metadata?: { next_cursor?: string };
    }>("conversations.history", params);

    messages.push(...data.messages);
    cursor = data.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return messages;
}

/** ユーザー情報のキャッシュ */
const userCache = new Map<string, string>();

/** ユーザーIDから表示名を取得 */
export async function getUserName(userId: string): Promise<string> {
  if (userCache.has(userId)) return userCache.get(userId)!;

  try {
    const data = await slackApi<{
      user: {
        real_name?: string;
        name: string;
        profile?: { display_name?: string };
      };
    }>("users.info", { user: userId });

    const name = data.user.profile?.display_name || data.user.real_name ||
      data.user.name;
    userCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

/** メッセージ中のSlack記法を変換（メンション・URL） */
function resolveAngleBrackets(text: string): string {
  const withMentions = text.replace(
    /<@([A-Z0-9]+)>/g,
    (_, userId) => userId === _myUserId ? `@${_myUserName}` : "@mention",
  );
  // <!here>, <!channel>, <!subteam^ID|name> などの特殊メンションを解決
  const withSpecialMentions = withMentions.replace(
    /<!([^|>]+)(?:\|@?([^>]*))?>/g,
    (_, type, label) => `@${label ?? type}`,
  );
  return resolveSlackUrls(withSpecialMentions);
}

/** Slack mrkdwn の打ち消し線 ~text~ を Markdown の ~~text~~ に変換 */
function resolveStrikethrough(text: string): string {
  return text.replace(
    /(?<=^|\s)~([^\s~][^~\n]*?[^\s~]|[^\s~])~(?=$|\s|[?.,!;:'")\]}>」）])/gm,
    "~~$1~~",
  );
}

/** Slack mrkdwn を Markdown に変換（メンション・URL・打ち消し線） */
export function resolveSlackMrkdwn(text: string): string {
  return resolveStrikethrough(resolveAngleBrackets(text));
}

/** DM/グループDMの表示名を解決する */
export async function resolveConversationName(
  channel: SlackChannel,
): Promise<string> {
  if (channel.is_im && channel.user) {
    const name = await getUserName(channel.user);
    return `DM: ${name}`;
  }
  if (channel.is_mpim) {
    return channel.name ?? `GroupDM: ${channel.id}`;
  }
  return channel.name ?? channel.id;
}
