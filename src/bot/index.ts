import { Bot } from 'grammy';
import config from '../config';
import { handleStart } from './handlers/start';
import { handleMessage } from './handlers/message';
import logger from '../utils/logger';

export function createBot(): Bot {
  const bot = new Bot(config.botToken);

  bot.command('start', handleStart);
  bot.on('message:text', handleMessage);

  bot.catch((err) => {
    logger.error('Bot xətası:', err.message, err.ctx?.update);
  });

  return bot;
}
