import fs from 'fs/promises';
import crypto from 'crypto';

const CHUNK_SIZE = 1024 * 1024; // 1MB

export async function generateFastHash(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const size = stat.size;
  
  const hash = crypto.createHash('md5');

  if (size <= CHUNK_SIZE * 2) {
    // If file is very small (< 2MB), just hash the whole thing
    const buffer = await fs.readFile(filePath);
    hash.update(buffer);
  } else {
    // For large files, hash only the first 1MB and the last 1MB
    const fileHandle = await fs.open(filePath, 'r');
    
    try {
      const startBuffer = Buffer.alloc(CHUNK_SIZE);
      const endBuffer = Buffer.alloc(CHUNK_SIZE);

      await fileHandle.read(startBuffer, 0, CHUNK_SIZE, 0);
      hash.update(startBuffer);

      await fileHandle.read(endBuffer, 0, CHUNK_SIZE, size - CHUNK_SIZE);
      hash.update(endBuffer);
    } finally {
      await fileHandle.close();
    }
  }

  // Append size to the hash to dramatically reduce collision probability
  return `${hash.digest('hex')}-${size}`;
}
