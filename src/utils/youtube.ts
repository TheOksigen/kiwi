const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?.*v=[\w-]+/,
  /^https?:\/\/youtu\.be\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https?:\/\/m\.youtube\.com\/watch\?.*v=[\w-]+/,
];

export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url.trim()));
}
