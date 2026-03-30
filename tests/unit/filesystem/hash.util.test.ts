import { generateFastHash } from '@/domains/filesystem/utils/hash.util';
import path from 'path';
import fs from 'fs/promises';

describe('Fast Chunk Hashing Utility', () => {
  const TEST_DIR = path.join(__dirname, 'hash_test_temp');

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should generate identical hashes for identical large files', async () => {
    const file1 = path.join(TEST_DIR, 'large1.bin');
    const file2 = path.join(TEST_DIR, 'large2.bin');
    
    // Create a 3MB file
    const buffer = Buffer.alloc(3 * 1024 * 1024, 'a');
    await fs.writeFile(file1, buffer);
    await fs.writeFile(file2, buffer);

    const hash1 = await generateFastHash(file1);
    const hash2 = await generateFastHash(file2);

    expect(hash1).toBeDefined();
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different files of the same size', async () => {
    const file1 = path.join(TEST_DIR, 'diff1.bin');
    const file2 = path.join(TEST_DIR, 'diff2.bin');
    
    const buffer1 = Buffer.alloc(3 * 1024 * 1024, 'a');
    const buffer2 = Buffer.alloc(3 * 1024 * 1024, 'b');

    await fs.writeFile(file1, buffer1);
    await fs.writeFile(file2, buffer2);

    const hash1 = await generateFastHash(file1);
    const hash2 = await generateFastHash(file2);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle small files properly (less than 1MB)', async () => {
    const file1 = path.join(TEST_DIR, 'small1.txt');
    const file2 = path.join(TEST_DIR, 'small2.txt');
    
    await fs.writeFile(file1, 'Hello World');
    await fs.writeFile(file2, 'Hello World');

    const hash1 = await generateFastHash(file1);
    const hash2 = await generateFastHash(file2);

    expect(hash1).toBe(hash2);
  });
  
  it('should append file size to the hash to prevent collisions', async () => {
     const file1 = path.join(TEST_DIR, 'size_test.bin');
     const buffer = Buffer.alloc(500, 'x');
     await fs.writeFile(file1, buffer);
     
     const hash = await generateFastHash(file1);
     expect(hash).toContain('500'); // 500 bytes should be integrated in the output string
  });
});
