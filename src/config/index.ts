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
  maxFileSizeBytes: 45 * 1024 * 1024,
  ytDlpPath: process.env.YTDLP_PATH ?? 'yt-dlp',
  // YouTube cookies faylının yolu (serverdə age-restricted videoları üçün tələb olunur)
  cookiesFile: process.env.COOKIES_FILE ?? '',
} as const;

export default config;
