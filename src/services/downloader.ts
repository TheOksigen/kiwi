import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import config from '../config';
import { DownloadError, DownloadErrorType, DownloadResult, VideoInfo } from '../types';
import { ensureDir, findFileByPrefix, getFileSize } from '../utils/file';
import logger from '../utils/logger';

// ── Types ───────────────────────────────────────────────────────────────────

type ProgressFn = (percent: number) => void;
export type PhaseProgressFn = (phase: 'download' | 'convert', percent: number) => void;

// ── Error parser ────────────────────────────────────────────────────────────

function parseYtDlpError(stderr: string): DownloadError {
  const s = stderr.toLowerCase();
  if (s.includes('video unavailable') || s.includes('this video does not exist'))
    return new DownloadError(DownloadErrorType.VIDEO_NOT_FOUND);
  if (s.includes('private video') || s.includes('this video is private'))
    return new DownloadError(DownloadErrorType.PRIVATE_VIDEO);
  if (s.includes('age') || s.includes('sign in to confirm') || s.includes('age-restricted'))
    return new DownloadError(DownloadErrorType.AGE_RESTRICTED);
  if (s.includes('not available in your country') || s.includes('blocked it in your country'))
    return new DownloadError(DownloadErrorType.GEO_RESTRICTED);
  if (s.includes('429') || s.includes('too many requests'))
    return new DownloadError(DownloadErrorType.RATE_LIMITED);
  return new DownloadError(DownloadErrorType.UNKNOWN, stderr.slice(0, 300));
}

// ── yt-dlp spawn ─────────────────────────────────────────────────────────────
// Progress is reported on stderr: "[download]  47.5% of ..."

function spawnYtDlp(args: string[], onProgress?: ProgressFn): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ytDlpPath, args);
    let stdout = '';
    let stderrBuf = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuf += text;
      if (onProgress) {
        const m = text.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (m) onProgress(parseFloat(m[1]));
      }
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'ENOENT'
        ? new DownloadError(DownloadErrorType.UNKNOWN, 'yt-dlp tapılmadı')
        : new DownloadError(DownloadErrorType.UNKNOWN, err.message));
    });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(parseYtDlpError(stderrBuf));
    });
  });
}

// ── ffmpeg spawn ──────────────────────────────────────────────────────────────
// Progress via "-progress pipe:1" → stdout lines: "out_time_us=12345678"

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
        if (m) {
          const pct = Math.min(99, (parseInt(m[1]) / (duration * 1_000_000)) * 100);
          onProgress(pct);
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'ENOENT'
        ? new DownloadError(DownloadErrorType.FFMPEG_NOT_FOUND, 'ffmpeg tapılmadı')
        : new DownloadError(DownloadErrorType.UNKNOWN, err.message));
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new DownloadError(
        DownloadErrorType.FFMPEG_NOT_FOUND,
        stderrBuf.includes('No such file') ? 'ffmpeg tapılmadı' : stderrBuf.slice(-200),
      ));
    });
  });
}

// ── Video info ───────────────────────────────────────────────────────────────

async function getVideoInfo(url: string): Promise<VideoInfo> {
  const stdout = await spawnYtDlp(['--dump-json', '--no-playlist', '--no-warnings', url]);
  const info = JSON.parse(stdout) as {
    id: string;
    title: string;
    duration?: number;
    artist?: string;
    creator?: string;
    uploader?: string;
  };
  return {
    id: info.id,
    title: info.title,
    duration: Math.round(info.duration ?? 0),
    performer: info.artist ?? info.creator ?? info.uploader,
  };
}

// ── Native audio download (no ffmpeg) ────────────────────────────────────────
// Docs format: "ba[acodec^=aac]/ba[acodec^=mp4a.40.]/ba/b"
// Prioritises native AAC/M4A (YouTube format 140) before any audio stream.

async function downloadNativeAudio(
  url: string,
  videoId: string,
  tempDir: string,
  onProgress?: ProgressFn,
): Promise<string> {
  await spawnYtDlp([
    '-f', 'ba[acodec^=aac]/ba[acodec^=mp4a.40.]/ba/b',
    '-o', path.join(tempDir, '%(id)s.%(ext)s'),
    '--no-playlist',
    '--no-warnings',
    url,
  ], onProgress);

  const filePath = await findFileByPrefix(tempDir, videoId);
  if (!filePath) throw new DownloadError(DownloadErrorType.UNKNOWN, 'Yüklənmiş fayl tapılmadı');
  return filePath;
}

// ── ffmpeg conversion ─────────────────────────────────────────────────────────

async function convertWithFfmpeg(
  inputPath: string,
  outputFormat: 'm4a' | 'mp3',
  tempDir: string,
  duration: number,
  onProgress?: ProgressFn,
): Promise<string> {
  const videoId = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(tempDir, `${videoId}.${outputFormat}`);

  await spawnFfmpeg(
    ['-i', inputPath, '-vn', '-y', outputPath],
    duration,
    onProgress,
  );

  await fs.unlink(inputPath).catch(() => {});
  return outputPath;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function download(url: string, onProgress?: PhaseProgressFn): Promise<DownloadResult> {
  const downloadId = crypto.randomUUID();
  const tempDir = path.join(config.tempDir, downloadId);
  await ensureDir(tempDir);

  logger.info(`Yükləmə başladı: ${url} [id=${downloadId}]`);

  const videoInfo = await getVideoInfo(url);
  logger.info(`Video məlumatları alındı: "${videoInfo.title}" [${videoInfo.id}]`);

  const nativePath = await downloadNativeAudio(
    url, videoInfo.id, tempDir,
    onProgress ? (p) => onProgress('download', p) : undefined,
  );

  const nativeExt = path.extname(nativePath).slice(1).toLowerCase();
  logger.info(`Native audio yükləndi: .${nativeExt}`);

  let filePath: string;
  let isFallback = false;

  if (nativeExt === 'm4a') {
    filePath = nativePath;
  } else {
    logger.info(`Native format .${nativeExt}, M4A-ya çevrilir...`);
    try {
      filePath = await convertWithFfmpeg(
        nativePath, 'm4a', tempDir, videoInfo.duration,
        onProgress ? (p) => onProgress('convert', p) : undefined,
      );
      logger.info('M4A çevrilməsi uğurlu');
    } catch (m4aErr) {
      logger.warn('M4A çevrilməsi uğursuz, MP3 cəhdi:', m4aErr);
      try {
        filePath = await convertWithFfmpeg(
          nativePath, 'mp3', tempDir, videoInfo.duration,
          onProgress ? (p) => onProgress('convert', p) : undefined,
        );
        isFallback = true;
        logger.info('MP3 çevrilməsi uğurlu');
      } catch (mp3Err) {
        throw mp3Err instanceof DownloadError ? mp3Err : new DownloadError(DownloadErrorType.UNKNOWN);
      }
    }
  }

  const fileSize = await getFileSize(filePath);
  if (fileSize > config.maxFileSizeBytes) throw new DownloadError(DownloadErrorType.FILE_TOO_LARGE);

  return {
    filePath,
    title: videoInfo.title,
    duration: videoInfo.duration,
    performer: videoInfo.performer,
    tempDir,
    isFallback,
  };
}
