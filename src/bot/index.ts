import { Bot } from 'grammy';
import config from '../config/index.js';
import { handleStart } from './handlers/start.js';
import { handleMessage } from './handlers/message.js';
import logger from '../utils/logger.js';

export function createBot(): Bot {
  const bot = new Bot(config.botToken);

  bot.command('start', handleStart);
  bot.on('message:text', handleMessage);

  bot.catch((err) => {
    logger.error('Bot xətası:', err.message, err.ctx?.update);
  });

  return bot;
}
