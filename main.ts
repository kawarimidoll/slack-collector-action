import { config, validateConfig } from "./config.ts";
import {
  authTest,
  getChannelHistory,
  getChannels,
  resolveConversationName,
} from "./slack-client.ts";
import { categorizeMessages, toRawProcessedMessages } from "./preprocessor.ts";
import { generateChannelDigest } from "./summarizer.ts";
import { formatReport } from "./formatter.ts";
import type { ChannelDigest, DigestReport, SlackChannel } from "./types.ts";

const encoder = new TextEncoder();
function write(s: string): void {
  Deno.stdout.writeSync(encoder.encode(s));
}

function shouldIncludeChannel(ch: SlackChannel): boolean {
  if (ch.is_im || ch.is_mpim) return true;

  const { targetChannels, excludeChannels } = config.digest;

  // targetChannels に明示指定されたチャンネルは未参加でも含める
  if (targetChannels.includes(ch.name)) return true;

  if (!ch.is_member) return false;

  for (const exclude of excludeChannels) {
    if (exclude.endsWith("*")) {
      if (ch.name.startsWith(exclude.slice(0, -1))) return false;
    } else {
      if (ch.name === exclude) return false;
    }
  }

  return true;
}

/** DM を並列でフェッチして、メッセージがあるものだけ返す */
async function fetchDMs(
  dms: SlackChannel[],
  oldestTs: string,
  concurrency: number = 5,
): Promise<ChannelDigest[]> {
  const results: ChannelDigest[] = [];

  write(`  DM ${dms.length}件を確認中...`);

  // concurrency 制限付き並列フェッチ
  const queue = [...dms];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const dm = queue.shift()!;
      try {
        const messages = await getChannelHistory(dm.id, oldestTs);
        if (messages.length > 0) {
          const displayName = await resolveConversationName(dm);
          const raw = toRawProcessedMessages(messages);
          results.push({
            channelName: displayName,
            channelId: dm.id,
            messageCount: raw.length,
            rawMessages: raw,
            mustRead: [],
            sharedLinks: [],
            summary: "",
          });
        }
      } catch {
        // 権限エラー等は無視
      }
    }
  });

  await Promise.all(workers);
  console.log(` ${results.length}件にメッセージあり`);

  // メッセージ件数が多い順にソート
  for (const r of results) {
    console.log(`    💬 ${r.channelName} ... ${r.messageCount}件`);
  }

  return results;
}

async function processChannel(
  channel: SlackChannel,
  oldestTs: string,
  myUserId: string,
): Promise<ChannelDigest | null> {
  const displayName = await resolveConversationName(channel);
  write(`  📨 #${displayName} ...`);

  const messages = await getChannelHistory(channel.id, oldestTs);

  if (messages.length === 0) {
    console.log(` 0件`);
    return null;
  }

  console.log(` ${messages.length}件`);
  const categorized = categorizeMessages(messages, myUserId);

  const needsLlm = categorized.general.length > 3;
  if (needsLlm) write(`    → LLM要約中...`);

  const digest = await generateChannelDigest(
    displayName,
    channel.id,
    categorized,
  );
  if (needsLlm) console.log(` done`);

  // rate limit 対策
  await new Promise((r) => setTimeout(r, 500));
  return digest;
}

async function main() {
  console.log("🚀 Slack Daily Digest を生成中...\n");

  const errors = validateConfig();
  if (errors.length > 0) {
    console.error("❌ 設定エラー:");
    errors.forEach((e) => console.error(`  - ${e}`));
    Deno.exit(1);
  }

  const now = new Date();
  const oldest = new Date(
    now.getTime() - config.digest.hoursBack * 60 * 60 * 1000,
  );
  const oldestTs = String(oldest.getTime() / 1000);

  const dateStr = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  console.log(
    `📅 対象期間: ${oldest.toLocaleString("ja-JP")} 〜 ${
      now.toLocaleString("ja-JP")
    }`,
  );

  console.log("📡 認証情報を確認中...");
  const { userId: myUserId } = await authTest();

  console.log("📡 チャンネル・DM一覧を取得中...");
  const allChannels = await getChannels();
  const targets = allChannels.filter(shouldIncludeChannel);

  // latest.ts で対象期間にメッセージがないものを除外（API コール削減）
  const hasRecentActivity = (ch: SlackChannel) =>
    ch.latest === undefined || (ch.latest !== null && ch.latest.ts >= oldestTs);

  const channels = targets.filter((c) =>
    !(c.is_im || c.is_mpim) && hasRecentActivity(c)
  );
  const dms = targets.filter((c) =>
    (c.is_im || c.is_mpim) && hasRecentActivity(c)
  );
  const skipped = targets.length - channels.length - dms.length;
  console.log(
    `  チャンネル: ${channels.length}, DM+グループDM: ${dms.length}` +
      (skipped > 0 ? ` (${skipped}件スキップ: 期間内メッセージなし)` : "") +
      "\n",
  );

  const report: DigestReport = { date: dateStr, channels: [] };

  // チャンネル: 逐次処理（LLMコールを挟むため）
  console.log("── チャンネル ──");
  for (const ch of channels) {
    try {
      const digest = await processChannel(ch, oldestTs, myUserId);
      if (digest) report.channels.push(digest);
    } catch (err) {
      console.error(` ❌ エラー: ${err}`);
    }
  }

  // DM: 並列フェッチ（LLMコール不要なので高速化）
  console.log("\n── DM ──");
  const dmDigests = await fetchDMs(dms, oldestTs);
  report.channels.push(...dmDigests);

  console.log("\n📝 レポートを生成中...");
  const markdown = await formatReport(report);

  await Deno.mkdir(config.output.dir, { recursive: true });
  const filename = `digest-${now.toISOString().slice(0, 10)}.md`;
  const outputPath = `${config.output.dir}/${filename}`;
  await Deno.writeTextFile(outputPath, markdown);

  // GitHub Actions output
  const githubOutput = Deno.env.get("GITHUB_OUTPUT");
  if (githubOutput) {
    await Deno.writeTextFile(githubOutput, `digest-path=${outputPath}\n`, {
      append: true,
    });
  }

  console.log(`\n✅ 完了: ${outputPath}`);

  const totalMustRead = report.channels.reduce(
    (sum, ch) => sum + ch.mustRead.length,
    0,
  );
  if (totalMustRead > 0) {
    console.log(`   ⚠️  ${totalMustRead}件のあなた宛てメッセージがあります！`);
  }
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  Deno.exit(1);
});
