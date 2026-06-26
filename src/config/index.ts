import 'dotenv/config';
import path from 'path';

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  throw new Error('BOT_TOKEN mühit dəyişəni tələb olunur');
}

const config = {
  botToken,
  tempDir: path.join(process.cwd(), 'temp'),
  maxFileSizeBytes: 45 * 1024 * 1024,
} as const;

export default config;
