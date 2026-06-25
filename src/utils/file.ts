import fs from 'fs/promises';
import logger from './logger';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removeDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    logger.warn(`Müvəqqəti qovluq silinə bilmədi: ${dirPath}`, err);
  }
}

export async function getFileSize(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  return stat.size;
}

export async function findFileByPrefix(dir: string, prefix: string): Promise<string | null> {
  const files = await fs.readdir(dir);
  const match = files.find((f) => f.startsWith(prefix));
  return match ? `${dir}/${match}` : null;
}
