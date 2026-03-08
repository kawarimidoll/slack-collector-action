import { assertEquals } from "@std/assert";
import { categorizeMessages, toRawProcessedMessages } from "./preprocessor.ts";
import type { SlackMessage } from "./types.ts";

function msg(
  overrides: Partial<SlackMessage> & { text: string; ts: string },
): SlackMessage {
  return { type: "message", ...overrides };
}

// --- toRawProcessedMessages ---

Deno.test("toRawProcessedMessages: 空テキストのメッセージを除外", () => {
  const messages = [
    msg({ ts: "1", text: "hello" }),
    msg({ ts: "2", text: "" }),
    msg({ ts: "3", text: "  " }),
  ];
  const result = toRawProcessedMessages(messages);
  assertEquals(result.length, 1);
  assertEquals(result[0].text, "hello");
});

Deno.test("toRawProcessedMessages: タイムスタンプ昇順にソート", () => {
  const messages = [
    msg({ ts: "3", text: "c" }),
    msg({ ts: "1", text: "a" }),
    msg({ ts: "2", text: "b" }),
  ];
  const result = toRawProcessedMessages(messages);
  assertEquals(result.map((m) => m.text), ["a", "b", "c"]);
});

Deno.test("toRawProcessedMessages: リアクション数を集計", () => {
  const messages = [
    msg({
      ts: "1",
      text: "popular",
      reactions: [{ name: "thumbsup", count: 3 }, { name: "heart", count: 2 }],
    }),
  ];
  const result = toRawProcessedMessages(messages);
  assertEquals(result[0].reactions, 5);
});

// --- categorizeMessages ---

Deno.test("categorizeMessages: bot_message をスキップ", () => {
  const messages = [
    msg({ ts: "1", text: "bot says", subtype: "bot_message" }),
    msg({ ts: "2", text: "human says" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.general.length, 1);
  assertEquals(result.general[0].text, "human says");
});

Deno.test("categorizeMessages: channel_join をスキップ", () => {
  const messages = [
    msg({ ts: "1", text: "joined", subtype: "channel_join" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.mustRead.length, 0);
  assertEquals(result.sharedLinks.length, 0);
  assertEquals(result.general.length, 0);
});

Deno.test("categorizeMessages: 自分宛てメンションを mustRead に分類", () => {
  const messages = [
    msg({ ts: "1", text: "hey <@U_ME> check this" }),
    msg({ ts: "2", text: "normal message" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.mustRead.length, 1);
  assertEquals(result.general.length, 1);
});

Deno.test("categorizeMessages: <!channel> を mustRead に分類", () => {
  const messages = [
    msg({ ts: "1", text: "<!channel> important announcement" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.mustRead.length, 1);
});

Deno.test("categorizeMessages: <!here> を mustRead に分類", () => {
  const messages = [
    msg({ ts: "1", text: "<!here> please respond" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.mustRead.length, 1);
});

Deno.test("categorizeMessages: URL を含むメッセージを sharedLinks に分類", () => {
  const messages = [
    msg({ ts: "1", text: "check <https://example.com|example>" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.sharedLinks.length, 1);
  assertEquals(result.sharedLinks[0].urls, ["https://example.com"]);
});

Deno.test("categorizeMessages: excludeUrlHosts に該当する URL は sharedLinks にしない", () => {
  const messages = [
    msg({ ts: "1", text: "link <https://slack.com/archives/C123>" }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.sharedLinks.length, 0);
  assertEquals(result.general.length, 1);
});

Deno.test("categorizeMessages: リアクション数でソート（多い順）", () => {
  const messages = [
    msg({ ts: "1", text: "few", reactions: [{ name: "a", count: 1 }] }),
    msg({ ts: "2", text: "many", reactions: [{ name: "a", count: 10 }] }),
    msg({ ts: "3", text: "mid", reactions: [{ name: "a", count: 5 }] }),
  ];
  const result = categorizeMessages(messages, "U_ME");
  assertEquals(result.general.map((m) => m.text), ["many", "mid", "few"]);
});
