// === User Domain ===

export type UserRole = 'guest' | 'user' | 'admin';

export interface UserPreferences {
  backgroundType: 'waves' | 'image' | 'video' | 'none';
  backgroundMediaId?: string;
  performanceMode: 'high' | 'low';
}

export interface User {
  _id: string;
  username: string;
  role: UserRole;
  isSystem: boolean;
  preferences?: UserPreferences;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  recoveryKey?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
}

// === MediaFile Domain ===

export interface MediaFile {
  _id: string;
  originalName: string;
  savedName: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: string | User;
  parentId?: string | null;
  isFolder: boolean;
  tags?: string[];
  hash?: string;
  metadata?: Record<string, unknown>;
  modifiedAt?: string;
  createdAt: string;
}

export interface FileListResponse {
  items: MediaFile[];
  total: number;
}

// === Settings ===

export interface SystemSettings {
  registrationEnabled: boolean;
  guestLoginEnabled: boolean;
  mediaRootDirectory: string;
  usePolling: boolean;
  pollingInterval: number;
  scannerConcurrency: number;
  scannerIoConcurrency: number;
  transcodeMode: 'JIT' | 'DISK' | 'OFF';
  hardwareEncoder: string;
  targetQualities: number[];
  keepJitResumeCache: boolean;
  updatedAt?: string;
}

export interface UpdateSettingsPayload {
  registrationEnabled?: boolean;
  guestLoginEnabled?: boolean;
  mediaRootDirectory?: string;
  usePolling?: boolean;
  pollingInterval?: number;
  scannerConcurrency?: number;
  scannerIoConcurrency?: number;
  transcodeMode?: 'JIT' | 'DISK' | 'OFF';
  hardwareEncoder?: string;
  targetQualities?: number[];
  keepJitResumeCache?: boolean;
  createIfMissing?: boolean;
}
