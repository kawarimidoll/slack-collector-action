import { config } from "./config.ts";
import type {
  CategorizedMessages,
  ChannelDigest,
  ProcessedMessage,
} from "./types.ts";
import { getUserName, resolveSlackMrkdwn } from "./slack-client.ts";

interface ChatCompletionResponse {
  choices: { message: { role: string; content: string } }[];
}

async function chatCompletion(
  system: string,
  userMessage: string,
): Promise<string> {
  const resp = await fetch(config.llm.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.githubToken}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`GitHub Models API error: ${resp.status} ${error}`);
  }

  const data: ChatCompletionResponse = await resp.json();
  return data.choices[0]?.message?.content ?? "";
}

const SYSTEM_PROMPT =
  `あなたはSlackチャンネルのデイリーダイジェストを作成するアシスタントです。
与えられたメッセージ群から、その日の会話の流れを簡潔に要約してください。

## ルール
- 雑談・挨拶・リアクションだけのメッセージは無視
- 話題ごとにまとめて、それぞれ1〜2文で要約
- 技術的な話題、有益な情報、面白い議論を優先
- 便利そうなコマンド・設定・コードスニペットが共有されていれば、要約とは別にピックアップ
- 参加者名は省略してよい（「〜という話が出た」程度）
- 日本語で書く
- 特筆すべき話題がなければ「特になし」とだけ書く
- マークダウン形式で箇条書き
- 各項目は短く、全体で10項目以内
- コードフェンス(\`\`\`)は使わない（出力はマークダウンに埋め込まれるため）`;

/** 一般メッセージをLLMで要約 */
async function summarizeGeneralMessages(
  channelName: string,
  messages: ProcessedMessage[],
): Promise<string> {
  if (messages.length === 0) return "特になし";

  // メッセージが少なければLLM不要
  if (messages.length <= 3) {
    return messages.map((m) => {
      const resolved = resolveSlackMrkdwn(m.text);
      const truncated = resolved.length > 200
        ? resolved.slice(0, 200) + "..."
        : resolved;
      return `- ${truncated}`;
    }).join("\n");
  }

  // メッセージをテキスト化
  const formatted = await Promise.all(
    messages.map(async (m) => {
      const name = await getUserName(m.user);
      const resolved = resolveSlackMrkdwn(m.text);
      const truncated = resolved.length > 500
        ? resolved.slice(0, 500) + "..."
        : resolved;
      const meta = [];
      if (m.reactions > 0) meta.push(`reactions:${m.reactions}`);
      if (m.replyCount > 0) meta.push(`replies:${m.replyCount}`);
      const metaStr = meta.length > 0 ? ` [${meta.join(", ")}]` : "";
      return `[${name}]${metaStr} ${truncated}`;
    }),
  );

  const input = formatted.join("\n---\n");
  const maxChars = 30000;
  const trimmedInput = input.length > maxChars
    ? input.slice(0, maxChars) + "\n...(以下省略)"
    : input;

  return await chatCompletion(
    SYSTEM_PROMPT,
    `# #${channelName} の今日のメッセージ（${messages.length}件）\n\n${trimmedInput}`,
  );
}

/** チャンネル単位のダイジェストを生成 */
export async function generateChannelDigest(
  channelName: string,
  channelId: string,
  categorized: CategorizedMessages,
): Promise<ChannelDigest> {
  const totalMessages = categorized.mustRead.length +
    categorized.sharedLinks.length +
    categorized.general.length;

  const summary = await summarizeGeneralMessages(
    channelName,
    categorized.general,
  );

  const sharedLinks = categorized.sharedLinks.map((msg) => ({
    urls: msg.urls,
    context: msg.resolvedText,
  }));

  return {
    channelName,
    channelId,
    messageCount: totalMessages,
    mustRead: categorized.mustRead,
    sharedLinks,
    summary,
  };
}
