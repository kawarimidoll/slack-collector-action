import { assertEquals } from "@std/assert";
import { config, validateConfig } from "./config.ts";

Deno.test("validateConfig: 環境変数未設定時にエラーを返す", () => {
  const errors = validateConfig();
  // CI 等で環境変数が設定されていなければエラーが返る
  if (!config.slack.token) {
    assertEquals(errors.some((e) => e.includes("SLACK_TOKEN")), true);
  }
  if (!config.slack.cookie) {
    assertEquals(errors.some((e) => e.includes("SLACK_COOKIE")), true);
  }
  if (!config.slack.workspace) {
    assertEquals(errors.some((e) => e.includes("SLACK_WORKSPACE")), true);
  }
  if (!config.llm.githubToken) {
    assertEquals(errors.some((e) => e.includes("GITHUB_TOKEN")), true);
  }
});

Deno.test("config.digest: デフォルト値が正しい", () => {
  // 環境変数が設定されていない場合のデフォルト値を確認
  if (!Deno.env.get("MUST_READ_MENTIONS")) {
    assertEquals(config.digest.mustReadMentions, ["channel", "here"]);
  }
  if (!Deno.env.get("INCLUDE_PUBLIC_CHANNELS")) {
    assertEquals(config.digest.includePublicChannels, true);
  }
  if (!Deno.env.get("INCLUDE_PRIVATE_CHANNELS")) {
    assertEquals(config.digest.includePrivateChannels, false);
  }
  if (!Deno.env.get("INCLUDE_GROUP_DMS")) {
    assertEquals(config.digest.includeGroupDMs, false);
  }
  if (!Deno.env.get("INCLUDE_DIRECT_DMS")) {
    assertEquals(config.digest.includeDirectDMs, false);
  }
  if (!Deno.env.get("HOURS_BACK")) {
    assertEquals(config.digest.hoursBack, 24);
  }
  if (!Deno.env.get("EXCLUDE_URL_HOSTS")) {
    assertEquals(config.digest.excludeUrlHosts, [
      "slack.com",
      "meet.google.com",
    ]);
  }
});
