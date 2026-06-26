import { ensureDir } from './utils/file.js';
import { createBot } from './bot/index.js';
import config from './config/index.js';
import logger from './utils/logger.js';

async function main(): Promise<void> {
  await ensureDir(config.tempDir);

  const bot = createBot();

  process.once('SIGINT', () => {
    logger.info('SIGINT alındı, bot dayandırılır...');
    void bot.stop();
  });
  process.once('SIGTERM', () => {
    logger.info('SIGTERM alındı, bot dayandırılır...');
    void bot.stop();
  });

  logger.info('Kiwi 🥝 botu işə salınır...');
  await bot.start({
    onStart: (info) => logger.info(`Bot işə düşdü: @${info.username}`),
  });
}

main().catch((err: unknown) => {
  logger.error('Kritik xəta:', err);
  process.exit(1);
});
