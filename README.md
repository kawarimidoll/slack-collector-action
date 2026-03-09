# Slack Daily Digest

Slack の参加チャンネル・DM から 1 日分のメッセージを自動でダイジェスト化する
GitHub Action。管理者権限不要。

## 機能

- **必読**: 自分へのメンション・指定キーワードを含むメッセージを無条件抽出
- **リンク**: 紹介された URL と紹介コメントをセットで抽出
- **サマリ**: その他の会話を LLM で自動要約
- **DM 対応**: 1 対 1 DM・グループ DM も対象にできる

> [!NOTE]
> スレッド内の返信は取得対象外です（API コール数の抑制のため）。
> 取得されるのはチャンネルのトップレベルメッセージのみです。

## 使い方

### 1. Slack のトークンを取得

ブラウザで https://app.slack.com にログインし、DevTools（F12）を開く。

**Console タブ** に `extract-token.js` の中身を貼り付けて実行:

```
SLACK_TOKEN=xoxc-...
SLACK_WORKSPACE=your-workspace
```

**Application タブ** > Cookies > `https://app.slack.com` > Name `d` の値
(`xoxd-...`) をコピーして `SLACK_COOKIE` に設定。

> d cookie の有効期限は 1
> 年以上らしい。ログアウトやパスワード変更をしない限りすぐには失効しないはず。
> 失効したら再取得してください。

### 2. ワークフローを設定

リポジトリの Settings > Secrets and variables > Actions に以下を設定:

| Secret 名         | 値               |
| ----------------- | ---------------- |
| `SLACK_TOKEN`     | `xoxc-...`       |
| `SLACK_COOKIE`    | `xoxd-...`       |
| `SLACK_WORKSPACE` | ワークスペース名 |

> `GITHUB_TOKEN` は設定不要。ワークフローに `permissions: models: read`
> を付ければ、Actions が自動提供するトークンで GitHub Models API が使えます。

ワークフローファイル (`.github/workflows/daily-digest.yml`):

```yaml
name: Slack Daily Digest

on:
  schedule:
    - cron: "0 19 * * *" # JST 04:00
  workflow_dispatch:

permissions:
  contents: read
  models: read

jobs:
  digest:
    runs-on: ubuntu-latest
    env:
      TZ: Asia/Tokyo
    steps:
      - uses: kawarimidoll/slack-collector-action@<version>
        id: digest
        with:
          slack-token: ${{ secrets.SLACK_TOKEN }}
          slack-cookie: ${{ secrets.SLACK_COOKIE }}
          slack-workspace: ${{ secrets.SLACK_WORKSPACE }}
          must-read-keywords: '["myname", "important-keyword"]'

      - uses: actions/upload-artifact@<version>
        with:
          name: digest-${{ github.run_id }}
          path: ${{ steps.digest.outputs.digest-path }}
          retention-days: 45
```

## 入力パラメータ

| パラメータ                 | デフォルト                         | 説明                                                                           |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `slack-token`              | **(必須)**                         | Slack セッショントークン (`xoxc-...`)                                          |
| `slack-cookie`             | **(必須)**                         | Slack の d cookie (`xoxd-...`)                                                 |
| `slack-workspace`          | **(必須)**                         | ワークスペース名                                                               |
| `must-read-keywords`       | `[]`                               | 必読抽出キーワード (例: `["myname", "important"]`)                             |
| `must-read-mentions`       | `["channel", "here"]`              | 必読抽出メンショングループ (例: `["channel", "here"]`)                         |
| `include-public-channels`  | `"true"`                           | パブリックチャンネルを含める                                                   |
| `include-private-channels` | `"false"`                          | プライベートチャンネルを含める                                                 |
| `include-group-dms`        | `"false"`                          | グループ DM を含める                                                           |
| `include-direct-dms`       | `"false"`                          | 1 対 1 DM を含める                                                             |
| `target-channels`          | `[]`                               | 未参加でも取得するチャンネル (例: `["general"]`)                               |
| `exclude-channels`         | `[]`                               | 除外するチャンネル。末尾 `*` でプレフィックスマッチ (例: `["notify-*"]`)       |
| `exclude-url-hosts`        | `["slack.com", "meet.google.com"]` | リンク抽出から除外するホスト                                                   |
| `hours-back`               | `"24"`                             | 何時間前までのメッセージを対象にするか                                         |
| `llm-model`                | `"openai/gpt-4.1-mini"`            | 要約に使う LLM モデル ([GitHub Models](https://github.com/marketplace/models)) |
| `output-dir`               | `"./output"`                       | 出力ディレクトリ                                                               |

## 出力

| 出力          | 説明                                        |
| ------------- | ------------------------------------------- |
| `digest-path` | 生成されたダイジェスト `.md` ファイルのパス |

## カスタマイズ

inputs では対応しきれないカスタマイズ（LLM
プロンプトの変更、カテゴリ分けロジックの調整、
出力フォーマットの変更など）が必要な場合は、このリポジトリをフォークしてコードを
直接編集し、`uses: your-fork/slack-collector-action@main` で使用できます。

## ローカル開発

ローカルで実行する場合は `GITHUB_TOKEN` の設定も必要です。

```sh
# 環境変数を設定
cp .envrc.example .envrc

# 接続テスト
deno task ping

# ダイジェスト生成
deno task start
```

## ファイル構成

```
action.yml           # GitHub Action 定義 (composite)
main.ts              # エントリポイント
ping.ts              # 接続チェック用スクリプト
config.ts            # 設定（環境変数ベース、型定義付き）
slack-client.ts      # Slack API クライアント（xoxc + cookie 認証）
preprocessor.ts      # メッセージのカテゴリ分け
summarizer.ts        # GitHub Models API による要約
formatter.ts         # Markdown 生成
types.ts             # 型定義
utils.ts             # 共通ユーティリティ
```
