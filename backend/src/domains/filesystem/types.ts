// JWT payload shape (що приходить через request.user після jwtVerify)
export interface JwtUser {
  id: string;
  username: string;
  role: 'guest' | 'user' | 'admin';
}

// Multipart file object shape (від @fastify/multipart)
export interface MultipartFile {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

// Фільтри для getFiles (замість any)  
export interface FileFilters {
  type?: string;
  parentId?: string;
  isFolder?: boolean;
  search?: string;
  hash?: string;
  skip?: number;
  limit?: number;
  sortBy?: 'name' | 'recent';
}

// Internal filter shape after parentId resolution
export interface ResolvedFileFilters {
  type?: string;
  parentPath?: string | null;
  isFolder?: boolean;
  search?: string;
  hash?: string;
  skip?: number;
  limit?: number;
  sortBy?: 'name' | 'recent';
}
