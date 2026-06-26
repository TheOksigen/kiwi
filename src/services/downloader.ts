import { Innertube } from 'youtubei.js';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import config from '../config/index.js';
import { DownloadError, DownloadErrorType, DownloadResult } from '../types/index.js';
import { ensureDir, getFileSize } from '../utils/file.js';
import logger from '../utils/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

type ProgressFn = (percent: number) => void;
export type PhaseProgressFn = (phase: 'download' | 'convert', percent: number) => void;

// ── Innertube singleton ──────────────────────────────────────────────────────
// Session 55 dəqiqədən bir yenilənir.

let _yt: Innertube | null = null;
let _ytTime = 0;
const SESSION_TTL_MS = 55 * 60 * 1000;

async function getYt(): Promise<Innertube> {
  if (!_yt || Date.now() - _ytTime > SESSION_TTL_MS) {
    logger.info('Innertube session yaradılır...');
    _yt = await Innertube.create();
    _ytTime = Date.now();
  }
  return _yt;
}

// ── Video ID çıxarma ─────────────────────────────────────────────────────────

function extractVideoId(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (!m) throw new DownloadError(DownloadErrorType.VIDEO_NOT_FOUND, 'Video ID tapılmadı');
  return m[1];
}

// ── Xəta parser ──────────────────────────────────────────────────────────────

function parseError(err: unknown): DownloadError {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  if (msg.includes('private') || msg.includes('login_required'))
    return new DownloadError(DownloadErrorType.PRIVATE_VIDEO);
  if (msg.includes('age') || msg.includes('inappropriate'))
    return new DownloadError(DownloadErrorType.AGE_RESTRICTED);
  if (msg.includes('unavailable') || msg.includes('not found') || msg.includes('removed'))
    return new DownloadError(DownloadErrorType.VIDEO_NOT_FOUND);
  if (msg.includes('country') || msg.includes('region') || msg.includes('geo'))
    return new DownloadError(DownloadErrorType.GEO_RESTRICTED);
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate'))
    return new DownloadError(DownloadErrorType.RATE_LIMITED);
  return new DownloadError(DownloadErrorType.UNKNOWN, String(err).slice(0, 200));
}

// ── ffmpeg ────────────────────────────────────────────────────────────────────

function spawnFfmpeg(
  args: string[],
  duration?: number,
  onProgress?: ProgressFn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const useProgress = Boolean(onProgress && duration);
    const allArgs = useProgress ? ['-progress', 'pipe:1', ...args] : args;
    const proc = spawn('ffmpeg', allArgs);
    let stderrBuf = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      if (useProgress && duration && onProgress) {
        const m = chunk.toString().match(/out_time_us=(\d+)/);
        if (m) onProgress(Math.min(99, (parseInt(m[1]) / (duration * 1_000_000)) * 100));
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'ENOENT'
        ? new DownloadError(DownloadErrorType.FFMPEG_NOT_FOUND, 'ffmpeg tapılmadı')
        : new DownloadError(DownloadErrorType.UNKNOWN, err.message));
    });

    proc.on('close', (code) => {
      if (code === 0) { onProgress?.(100); resolve(); }
      else reject(new DownloadError(
        DownloadErrorType.FFMPEG_NOT_FOUND,
        stderrBuf.includes('No such file') ? 'ffmpeg tapılmadı' : stderrBuf.slice(-200),
      ));
    });
  });
}

async function convertWithFfmpeg(
  inputPath: string,
  outputFormat: 'm4a' | 'mp3',
  tempDir: string,
  duration: number,
  onProgress?: ProgressFn,
): Promise<string> {
  const id = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(tempDir, `${id}.${outputFormat}`);
  await spawnFfmpeg(['-i', inputPath, '-vn', '-y', outputPath], duration, onProgress);
  await fs.unlink(inputPath).catch(() => {});
  return outputPath;
}

// ── Əsas export ───────────────────────────────────────────────────────────────

export async function download(url: string, onProgress?: PhaseProgressFn): Promise<DownloadResult> {
  const videoId = extractVideoId(url);
  const downloadId = crypto.randomUUID();
  const tempDir = path.join(config.tempDir, downloadId);
  await ensureDir(tempDir);

  logger.info(`Yükləmə başladı: ${url} [id=${downloadId}]`);

  const yt = await getYt();

  // Video məlumatları — IOS client age restriction-ı bypass edir
  const info = await yt.getBasicInfo(videoId, { client: 'IOS' }).catch((err: unknown) => {
    logger.error('getBasicInfo xətası:', err);
    throw parseError(err);
  });

  const title = info.basic_info.title ?? 'Unknown';
  const duration = Math.round(info.basic_info.duration ?? 0);
  const performer = info.basic_info.author ?? undefined;
  logger.info(`Video: "${title}" [${videoId}], ${duration}s`);

  // mp4 (AAC/M4A) birbaşa yüklə, yoxdur → istənilən format (webm) → ffmpeg ilə çevir
  let nativeExt: 'm4a' | 'webm';
  let downloadStream: ReadableStream<Uint8Array>;

  try {
    downloadStream = await info.download({
      type: 'audio',
      quality: 'best',
      client: 'IOS',
      format: 'mp4',
    });
    nativeExt = 'm4a';
    logger.debug('mp4/AAC audio stream alındı');
  } catch {
    logger.debug('mp4 format yoxdur, istənilən audio formatı istifadə edilir');
    downloadStream = await info.download({
      type: 'audio',
      quality: 'best',
      client: 'IOS',
    }).catch((err: unknown) => { throw parseError(err); });
    nativeExt = 'webm';
  }

  // Yükləmə irəliləyiş trackeri
  const nativePath = path.join(tempDir, `${videoId}.${nativeExt}`);
  let downloadedBytes = 0;

  const tracker = new Transform({
    transform(chunk, _encoding, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      downloadedBytes += buf.length;
      // content_length-siz — faiz bilinmir, spinner animasiyası göstərilir
      cb(null, buf);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await pipeline(Readable.fromWeb(downloadStream as any), tracker, createWriteStream(nativePath));
  onProgress?.('download', 100);
  logger.info(`Audio yükləndi: .${nativeExt} (${downloadedBytes} byte)`);

  // Konvertasiya (lazım gələrsə)
  let filePath: string;
  let isFallback = false;

  if (nativeExt === 'm4a') {
    filePath = nativePath;
  } else {
    logger.info('M4A-ya çevrilir...');
    try {
      filePath = await convertWithFfmpeg(
        nativePath, 'm4a', tempDir, duration,
        onProgress ? (p) => onProgress('convert', p) : undefined,
      );
      logger.info('M4A çevrilməsi uğurlu');
    } catch (m4aErr) {
      logger.warn('M4A uğursuz, MP3 cəhdi:', m4aErr);
      filePath = await convertWithFfmpeg(
        nativePath, 'mp3', tempDir, duration,
        onProgress ? (p) => onProgress('convert', p) : undefined,
      );
      isFallback = true;
      logger.info('MP3 çevrilməsi uğurlu');
    }
  }

  const fileSize = await getFileSize(filePath);
  if (fileSize > config.maxFileSizeBytes) throw new DownloadError(DownloadErrorType.FILE_TOO_LARGE);

  return { filePath, title, duration, performer, tempDir, isFallback };
}
