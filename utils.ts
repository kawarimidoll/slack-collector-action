/**
 * Slack URL markup を Markdown に変換
 * - <URL|label> → [label](URL)  (label ≠ URL の場合)
 * - <URL|URL>   → <URL>          (Markdown autolink)
 * - <URL>       → <URL>          (Markdown autolink)
 */
export function resolveSlackUrls(text: string): string {
  return text
    .replace(
      /<(https?:\/\/[^|>]+)\|([^>]+)>/g,
      (_, url, label) => (url === label ? `<${url}>` : `[${label}](${url})`),
    )
    .replace(/<(https?:\/\/[^|>]+)>/g, "<$1>");
}

/** テキストからコードブロックを除去（閉じられていないフェンスも対応） */
export function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replaceAll("```", "").trim();
}
