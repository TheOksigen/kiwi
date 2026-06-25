import { Context } from 'grammy';

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    `Salam! Mən Kiwi 🥝-yəm.\n\n` +
      `YouTube videosunun linkini mənə göndər, mən isə sənə audio faylını M4A formatında göndərim.\n\n` +
      `📌 *Necə istifadə etmək olar:*\n` +
      `Sadəcə YouTube linkini bu chata yapışdır və göndər.\n\n` +
      `Nümunə:\n` +
      `https://youtube.com/watch?v=...\n` +
      `https://youtu.be/...`,
    { parse_mode: 'Markdown' },
  );
}
