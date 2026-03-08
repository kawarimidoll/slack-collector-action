import type { ChannelDigest, DigestReport, ProcessedMessage } from "./types.ts";
import { getUserName, resolveSlackMrkdwn } from "./slack-client.ts";
import { stripCodeBlocks } from "./utils.ts";

function tsToTime(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function formatMustReadMessage(msg: ProcessedMessage): Promise<string> {
  const name = await getUserName(msg.user);
  const text = stripCodeBlocks(resolveSlackMrkdwn(msg.text));
  const time = tsToTime(msg.timestamp);
  return `> **[${time}] @${name}**\n> ${text.replace(/\n/g, "\n> ")}`;
}

async function formatChannelDigest(digest: ChannelDigest): Promise<string> {
  const lines: string[] = [];

  lines.push(`## ${digest.channelName}`);
  lines.push(`_${digest.messageCount}件のメッセージ_\n`);

  // DM: 全文表示
  if (digest.rawMessages && digest.rawMessages.length > 0) {
    for (const msg of digest.rawMessages) {
      const name = await getUserName(msg.user);
      const text = stripCodeBlocks(resolveSlackMrkdwn(msg.text));
      const time = tsToTime(msg.timestamp);
      lines.push(`> **[${time}] @${name}**`);
      lines.push(`> ${text.replace(/\n/g, "\n> ")}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  // チャンネル: カテゴリ別表示

  if (digest.mustRead.length > 0) {
    lines.push(`### 📌 あなた宛て / 重要キーワード`);
    for (const msg of digest.mustRead) {
      lines.push(await formatMustReadMessage(msg));
      lines.push("");
    }
  }

  if (digest.sharedLinks.length > 0) {
    lines.push(`### 🔗 共有されたリンク`);
    for (const link of digest.sharedLinks) {
      const text = link.context
        ? stripCodeBlocks(link.context).slice(0, 200)
        : link.urls.join(" ");
      lines.push(`- ${text.replace(/\n/g, "\n  ")}`);
    }
    lines.push("");
  }

  if (digest.summary && digest.summary !== "特になし") {
    lines.push(`### 💬 今日の話題`);
    lines.push(digest.summary);
    lines.push("");
  }

  return lines.join("\n");
}

/** レポート全体をMarkdownに変換 */
export async function formatReport(report: DigestReport): Promise<string> {
  const lines: string[] = [];

  lines.push(`# 📋 Slack Daily Digest`);
  lines.push(`**${report.date}**\n`);

  // 必読メッセージがあるチャンネルを先に
  const sorted = [...report.channels].sort((a, b) => {
    if (a.mustRead.length > 0 && b.mustRead.length === 0) return -1;
    if (a.mustRead.length === 0 && b.mustRead.length > 0) return 1;
    return b.messageCount - a.messageCount;
  });

  const active = sorted.filter((ch) => ch.messageCount > 0);

  if (active.length === 0) {
    lines.push("今日は特に動きがありませんでした。");
  } else {
    const channelDigests = active.filter((ch) => !ch.rawMessages);
    const dmDigests = active.filter((ch) => ch.rawMessages);

    if (channelDigests.length > 0) {
      for (const ch of channelDigests) {
        const anchor = ch.channelName.toLowerCase().replace(/\s+/g, "-");
        const mustRead = ch.mustRead.length > 0
          ? ` / 📌${ch.mustRead.length}`
          : "";
        lines.push(
          `- [${ch.channelName} (${ch.messageCount}${mustRead})](#${anchor})`,
        );
      }
      lines.push("");
    }

    if (dmDigests.length > 0) {
      for (const ch of dmDigests) {
        const anchor = ch.channelName.toLowerCase().replace(/\s+/g, "-");
        lines.push(
          `- [${ch.channelName} (${ch.messageCount})](#${anchor})`,
        );
      }
      lines.push("");
    }

    lines.push("---\n");

    for (const ch of [...channelDigests, ...dmDigests]) {
      lines.push(await formatChannelDigest(ch));
      lines.push("---\n");
    }
  }

  return lines.join("\n");
}
