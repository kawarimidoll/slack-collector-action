import { assertEquals } from "@std/assert";
import { resolveSlackUrls, stripCodeBlocks } from "./utils.ts";

Deno.test("resolveSlackUrls: <URL|label> をマークダウンリンクに変換", () => {
  assertEquals(
    resolveSlackUrls("<https://example.com|Example>"),
    "[Example](https://example.com)",
  );
});

Deno.test("resolveSlackUrls: <URL|URL> を autolink に変換", () => {
  assertEquals(
    resolveSlackUrls("<https://example.com|https://example.com>"),
    "<https://example.com>",
  );
});

Deno.test("resolveSlackUrls: <URL> を autolink に変換", () => {
  assertEquals(
    resolveSlackUrls("<https://example.com>"),
    "<https://example.com>",
  );
});

Deno.test("resolveSlackUrls: 複数の URL を変換", () => {
  assertEquals(
    resolveSlackUrls("see <https://a.com|A> and <https://b.com>"),
    "see [A](https://a.com) and <https://b.com>",
  );
});

Deno.test("resolveSlackUrls: URL でないアングルブラケットはそのまま", () => {
  assertEquals(resolveSlackUrls("<@U12345>"), "<@U12345>");
});

Deno.test("stripCodeBlocks: コードブロックを除去", () => {
  assertEquals(stripCodeBlocks("before ```code``` after"), "before  after");
});

Deno.test("stripCodeBlocks: 複数行コードブロックを除去", () => {
  assertEquals(
    stripCodeBlocks("before ```\nline1\nline2\n``` after"),
    "before  after",
  );
});

Deno.test("stripCodeBlocks: 閉じられていないフェンスも除去", () => {
  assertEquals(stripCodeBlocks("before ``` unclosed"), "before  unclosed");
});

Deno.test("stripCodeBlocks: コードブロックがなければそのまま", () => {
  assertEquals(stripCodeBlocks("plain text"), "plain text");
});
