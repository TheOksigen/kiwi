export enum DownloadErrorType {
  VIDEO_NOT_FOUND = 'VIDEO_NOT_FOUND',
  PRIVATE_VIDEO = 'PRIVATE_VIDEO',
  AGE_RESTRICTED = 'AGE_RESTRICTED',
  GEO_RESTRICTED = 'GEO_RESTRICTED',
  RATE_LIMITED = 'RATE_LIMITED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND',
  UNKNOWN = 'UNKNOWN',
}

export class DownloadError extends Error {
  constructor(
    public readonly type: DownloadErrorType,
    message?: string,
  ) {
    super(message ?? type);
    this.name = 'DownloadError';
  }
}

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  performer?: string;
}

export interface DownloadResult {
  filePath: string;
  title: string;
  duration: number;
  performer?: string;
  tempDir: string;
  isFallback: boolean;
}
