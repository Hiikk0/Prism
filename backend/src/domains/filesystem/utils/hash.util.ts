import fs from 'fs/promises';
import { loadEsm } from 'load-esm';

const CHUNK_SIZE = 1024 * 1024; // 1MB

type XXHashHasher = (input: Uint8Array) => bigint;

let hasher: XXHashHasher | null = null;

async function getHasher(): Promise<XXHashHasher> {
  if (!hasher) {
    const xxhashInstance = await loadEsm<{ default: () => Promise<{ h64Raw: XXHashHasher }> }>('xxhash-wasm');
    const { h64Raw } = await xxhashInstance.default();
    hasher = h64Raw;
  }
  return hasher;
}

export async function generateFastHash(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const size = stat.size;
  const hashFn = await getHasher();
  
  let finalHash: string;

  if (size <= CHUNK_SIZE * 2) {
    // If file is very small (< 2MB), just hash the whole thing
    const buffer = await fs.readFile(filePath);
    finalHash = hashFn(new Uint8Array(buffer)).toString(16);
  } else {
    // For large files, hash only the first 1MB and the last 1MB
    const fileHandle = await fs.open(filePath, 'r');
    
    try {
      const startBuffer = Buffer.alloc(CHUNK_SIZE);
      const endBuffer = Buffer.alloc(CHUNK_SIZE);

      await fileHandle.read(startBuffer, 0, CHUNK_SIZE, 0);
      await fileHandle.read(endBuffer, 0, CHUNK_SIZE, size - CHUNK_SIZE);
      
      const combined = Buffer.concat([startBuffer, endBuffer]);
      finalHash = hashFn(new Uint8Array(combined)).toString(16);
    } finally {
      await fileHandle.close();
    }
  }

  // Append size to the hash to dramatically reduce collision probability
  return `xx64-${finalHash}-${size}`;
}
