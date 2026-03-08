// app.slack.com のコンソールで実行 → .env 用テキストを出力＆コピー
(() => {
  const teams = Object.values(
    JSON.parse(localStorage.getItem("localConfig_v2"))?.teams ?? {},
  );
  if (!teams.length) {
    return console.error("❌ app.slack.com にログインして実行してください");
  }
  if (teams.length > 1) {
    console.log("複数WS検出。先頭を使用:");
    teams.forEach((t) => console.log(`  - ${t.domain}.slack.com`));
  }
  const t = teams[0];
  const env = [
    `SLACK_TOKEN=${t.token}`,
    `SLACK_COOKIE=<d cookie (xoxd-...)>`,
    `SLACK_WORKSPACE=${t.domain}`,
  ].join("\n");
  console.log(`✅ ${t.name}\n\n${env}\n`);
  navigator.clipboard.writeText(env).then(
    () => console.log("📋 コピー済み"),
    () => {},
  );
})();
