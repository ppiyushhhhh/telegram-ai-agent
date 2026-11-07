import type { Env } from '../../types';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../config/constants';

export class R2StorageService {
  constructor(private readonly bucket?: R2Bucket) {}

  public isReady(): boolean {
    return Boolean(this.bucket);
  }

  public async upload(
    key: string,
    data: ReadableStream | ArrayBuffer | string,
    contentType?: string,
    customMetadata?: Record<string, string>
  ): Promise<R2Object> {
    if (!this.bucket) {
      throw new AppError('R2 Media Bucket binding (MEDIA_BUCKET) is not available.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    return this.bucket.put(key, data, {
      httpMetadata: contentType ? { contentType } : undefined,
      customMetadata
    });
  }

  public async get(key: string): Promise<R2ObjectBody | null> {
    if (!this.bucket) {
      throw new AppError('R2 Media Bucket binding (MEDIA_BUCKET) is not available.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    return this.bucket.get(key);
  }

  public async delete(key: string): Promise<void> {
    if (!this.bucket) {
      throw new AppError('R2 Media Bucket binding (MEDIA_BUCKET) is not available.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    await this.bucket.delete(key);
  }

  public async list(prefix?: string, limit = 50): Promise<R2Objects> {
    if (!this.bucket) {
      throw new AppError('R2 Media Bucket binding (MEDIA_BUCKET) is not available.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    return this.bucket.list({ prefix, limit });
  }
}
