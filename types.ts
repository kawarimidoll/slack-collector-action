/** Slack API から取得する生メッセージ */
export interface SlackMessage {
  type: string;
  subtype?: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: { name: string; count: number }[];
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  url_private?: string;
  preview?: string;
  content?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  user?: string;
  purpose?: { value: string };
  latest?: { ts: string } | null;
}

/** 前処理済みメッセージ */
export interface ProcessedMessage {
  timestamp: string;
  user: string;
  text: string;
  urls: string[];
  /** URL解決済みテキスト（共有リンクの表示用） */
  resolvedText: string;
  reactions: number;
  replyCount: number;
  threadTs?: string;
  files: SlackFile[];
}

/** カテゴリ分けされた結果 */
export interface CategorizedMessages {
  mustRead: ProcessedMessage[];
  sharedLinks: ProcessedMessage[];
  general: ProcessedMessage[];
}

/** チャンネル単位のダイジェスト */
export interface ChannelDigest {
  channelName: string;
  channelId: string;
  messageCount: number;
  /** DM用: 全メッセージをそのまま保持 */
  rawMessages?: ProcessedMessage[];
  mustRead: ProcessedMessage[];
  sharedLinks: { urls: string[]; context: string }[];
  summary: string;
}

/** 最終出力 */
export interface DigestReport {
  date: string;
  channels: ChannelDigest[];
}
