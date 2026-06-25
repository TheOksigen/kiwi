import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  throw new Error('BOT_TOKEN mühit dəyişəni tələb olunur');
}

const config = {
  botToken,
  tempDir: path.join(process.cwd(), 'temp'),
  maxFileSizeBytes: 45 * 1024 * 1024, // 45 MB — Telegram 50 MB limitindən aşağı
  ytDlpPath: process.env.YTDLP_PATH ?? 'yt-dlp',
} as const;

export default config;
