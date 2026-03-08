/**
 * 接続チェック用スクリプト
 *
 * 使い方:
 *   deno task ping
 */

import { config, validateConfig } from "./config.ts";
import {
  authTest,
  getChannels,
  resolveConversationName,
} from "./slack-client.ts";

function testConfig(): boolean {
  console.log("\n── 1. 設定チェック ──");
  const errors = validateConfig();
  if (errors.length > 0) {
    errors.forEach((e) => console.error(`  ❌ ${e}`));
    return false;
  }

  console.log(`  ✅ Slack: セッショントークン (xoxc)`);
  console.log(`  ✅ LLM model: ${config.llm.model}`);
  return true;
}

async function testSlackApi(): Promise<boolean> {
  console.log("\n── 2. Slack API 接続テスト ──");
  try {
    const { userId } = await authTest();
    console.log(`  ✅ auth.test 成功 (userId: ${userId})`);

    const channels = await getChannels();
    const chCount = channels.filter((c) => !c.is_im && !c.is_mpim).length;
    const dmCount = channels.filter((c) => c.is_im).length;
    const mpimCount = channels.filter((c) => c.is_mpim).length;

    console.log(
      `  ✅ チャンネル: ${chCount}, DM: ${dmCount}, グループDM: ${mpimCount}`,
    );

    const namedChannels = channels.filter((c) => !c.is_im && !c.is_mpim).slice(
      0,
      10,
    );
    console.log(`\n  参加チャンネル（先頭10件）:`);
    for (const ch of namedChannels) console.log(`     #${ch.name}`);
    if (chCount > 10) console.log(`     ... 他 ${chCount - 10} チャンネル`);

    if (dmCount > 0) {
      console.log(`\n  DM（先頭5件）:`);
      for (const dm of channels.filter((c) => c.is_im).slice(0, 5)) {
        console.log(`     ${await resolveConversationName(dm)}`);
      }
      if (dmCount > 5) console.log(`     ... 他 ${dmCount - 5} DM`);
    }

    return true;
  } catch (err) {
    console.error(`  ❌ Slack API エラー: ${err}`);
    if (String(err).includes("invalid_auth")) {
      console.log("     → トークンが無効です。再取得してください。");
    }
    if (String(err).includes("not_authed")) {
      console.log("     → SLACK_COOKIE を確認してください。");
    }
    return false;
  }
}

async function testLlm(): Promise<boolean> {
  console.log("\n── 3. GitHub Models API テスト ──");
  try {
    const resp = await fetch(config.llm.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.githubToken}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        max_tokens: 50,
        messages: [
          { role: "system", content: "テスト。一言で返して。" },
          { role: "user", content: "動作確認です" },
        ],
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`${resp.status}: ${error}`);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content ?? "(空)";
    console.log(`  ✅ 接続成功（model: ${config.llm.model}）`);
    console.log(`     応答: "${reply.slice(0, 80)}"`);
    return true;
  } catch (err) {
    console.error(`  ❌ LLM API エラー: ${err}`);
    if (String(err).includes("401")) {
      console.log(
        "     → GITHUB_TOKEN を確認してください（models:read スコープ）",
      );
    }
    return false;
  }
}

async function main() {
  console.log("🏓 Slack Daily Digest — 接続チェック");

  if (!testConfig()) Deno.exit(1);
  if (!await testSlackApi()) Deno.exit(1);
  if (!await testLlm()) Deno.exit(1);

  console.log("\n────── 全て正常です ──────");
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  Deno.exit(1);
});
