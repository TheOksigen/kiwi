import { Context, InputFile } from 'grammy';
import path from 'path';
import { download } from '../../services/downloader';
import { DownloadError, DownloadErrorType } from '../../types';
import { removeDir } from '../../utils/file';
import { isValidYouTubeUrl } from '../../utils/youtube';
import { AnimatedStatus } from '../../utils/spinner';
import logger from '../../utils/logger';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getUserErrorMessage(error: unknown): string {
  if (error instanceof DownloadError) {
    switch (error.type) {
      case DownloadErrorType.VIDEO_NOT_FOUND:
        return '❌ Video tapılmadı. Linkin düzgün olduğunu yoxlayın.';
      case DownloadErrorType.PRIVATE_VIDEO:
        return '🔒 Bu video şəxsi (private) olaraq qeyd edilib. Ona daxil olmaq mümkün deyil.';
      case DownloadErrorType.AGE_RESTRICTED:
        return '🔞 Bu videoya yaş məhdudiyyəti qoyulub. Yükləmək mümkün deyil.';
      case DownloadErrorType.GEO_RESTRICTED:
        return '🌍 Bu video sizin ölkənizdə mövcud deyil.';
      case DownloadErrorType.RATE_LIMITED:
        return '⏳ YouTube müvəqqəti olaraq bu sorğunu blokladı. Bir az sonra yenidən cəhd edin.';
      case DownloadErrorType.FILE_TOO_LARGE:
        return '📦 Bu videonun audio faylı çox böyükdür (50 MB limiti). Təəssüf ki, göndərmək mümkün deyil.';
      case DownloadErrorType.FFMPEG_NOT_FOUND:
        return '⚙️ Bu audio formatı üçün FFmpeg tələb olunur, lakin quraşdırılmayıb. Docker ilə işlətdiyinizdə bu problem olmayacaq.';
      default:
        return '⚠️ Xəta baş verdi. Bir az sonra yenidən cəhd edin.';
    }
  }
  return '⚠️ Xəta baş verdi. Bir az sonra yenidən cəhd edin.';
}

export async function handleMessage(ctx: Context): Promise<void> {
  const url = ctx.message?.text?.trim();
  if (!url) return;

  if (!isValidYouTubeUrl(url)) {
    await ctx.reply(
      '🔗 Zəhmət olmasa düzgün YouTube linki göndərin.\n\nNümunə:\nhttps://youtube.com/watch?v=...',
    );
    return;
  }

  const chatId = ctx.chat?.id;
  const userMsgId = ctx.message?.message_id;
  if (!chatId || !userMsgId) return;

  const statusMsg = await ctx.reply('📥 Linkini qəbul etdim...');
  const spinner = new AnimatedStatus(ctx.api, chatId, statusMsg.message_id);

  let tempDir: string | undefined;

  try {
    spinner.start('🎵 Audio yüklənir...');

    const result = await download(url, (phase, percent) => {
      spinner.setLabel(phase === 'download' ? '🎵 Audio yüklənir...' : '🔄 Audio çevrilir...');
      spinner.setProgress(percent);
    });

    tempDir = result.tempDir;

    spinner.setProgress(null);
    spinner.setLabel('📤 Göndərilir...');

    const ext = path.extname(result.filePath).slice(1);
    const filename = `${result.title}.${ext}`;

    let caption = `<a href="${escapeHtml(url)}">${escapeHtml(result.title)}</a>`;
    if (result.isFallback) {
      caption += '\n\n⚠️ M4A formatı əlçatmaz olduğundan MP3 formatında göndərildi.';
    }

    await ctx.replyWithAudio(new InputFile(result.filePath, filename), {
      title: result.title,
      performer: result.performer,
      duration: result.duration || undefined,
      caption,
      parse_mode: 'HTML',
    });

    // Spinner və istifadəçinin link mesajını sil
    await Promise.allSettled([
      spinner.delete(),
      ctx.api.deleteMessage(chatId, userMsgId),
    ]);

    logger.info(`Audio göndərildi: "${result.title}" → user ${ctx.from?.id ?? 'unknown'}`);
  } catch (error) {
    logger.error(`Yükləmə xətası (user ${ctx.from?.id ?? 'unknown'}):`, error);
    await spinner.stop(getUserErrorMessage(error));
  } finally {
    if (tempDir) await removeDir(tempDir);
  }
}
