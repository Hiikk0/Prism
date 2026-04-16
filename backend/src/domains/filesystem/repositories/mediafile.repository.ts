import { MediaFileModel, IMediaFile } from '../models/mediafile.model';
import { ResolvedFileFilters } from '../types';

export class MediaFileRepository {
  async create(data: Partial<IMediaFile>): Promise<IMediaFile> {
    const mediaFile = new MediaFileModel(data);
    return mediaFile.save();
  }

  async createMany(data: Partial<IMediaFile>[]): Promise<void> {
    await MediaFileModel.insertMany(data);
  }

  async findById(id: string): Promise<IMediaFile | null> {
    return MediaFileModel.findById(id).exec();
  }

  async findByPath(filePath: string): Promise<IMediaFile | null> {
    return MediaFileModel.findOne({ path: filePath }).exec();
  }

  async findAllPaths(): Promise<Map<string, { id: string, hash?: string, size: number, modifiedAt?: Date }>> {
    const files = await MediaFileModel.find({}, { path: 1, hash: 1, size: 1, modifiedAt: 1 }).lean().exec();
    const map = new Map<string, { id: string, hash?: string, size: number, modifiedAt?: Date }>();
    for (const f of files) {
      map.set(f.path, { id: f._id.toString(), hash: f.hash, size: f.size, modifiedAt: f.modifiedAt });
    }
    return map;
  }

  async update(id: string, data: Partial<IMediaFile>): Promise<IMediaFile | null> {
    return MediaFileModel.findByIdAndUpdate(id, data, { returnDocument: 'after' }).exec();
  }

  async updateMany(ids: string[], data: Partial<IMediaFile>): Promise<void> {
    await MediaFileModel.updateMany({ _id: { $in: ids } }, data).exec();
  }

  async delete(id: string): Promise<IMediaFile | null> {
    return MediaFileModel.findByIdAndDelete(id).exec();
  }

  async deleteMany(ids: string[]): Promise<void> {
    await MediaFileModel.deleteMany({ _id: { $in: ids } }).exec();
  }

  async deleteByPathPrefix(pathPrefix: string): Promise<void> {
    const escaped = pathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await MediaFileModel.deleteMany({ path: { $regex: new RegExp(`^${escaped}[/\\\\]`) } }).exec();
  }

  async findByPathPrefix(pathPrefix: string): Promise<IMediaFile[]> {
    const escaped = pathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return MediaFileModel.find({ path: { $regex: new RegExp(`^${escaped}[/\\\\]`) } }).exec();
  }

  async findAll(filters: ResolvedFileFilters = {}): Promise<{ items: IMediaFile[], total: number }> {
    const conditions: Record<string, unknown>[] = [];

    // Type filter: show matching files OR any folders (unless isFolder=false is explicitly set)
    if (filters.type) {
      if (filters.isFolder === false) {
        conditions.push({ mimeType: { $regex: filters.type, $options: 'i' } });
      } else {
        conditions.push({
          $or: [
            { mimeType: { $regex: filters.type, $options: 'i' } },
            { isFolder: true }
          ]
        });
      }
    } else if (filters.isFolder !== undefined) {
      conditions.push({ isFolder: filters.isFolder });
    }

    if (filters.parentPath !== undefined) {
      if (filters.parentPath === null) {
        // Root level: match paths that don't contain any / or \
        conditions.push({ path: { $regex: /^[^/\\]+$/ } });
      } else {
        // Direct children: match parentPath followed by a separator and then no more separators
        const escapedPath = filters.parentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        conditions.push({ path: { $regex: new RegExp(`^${escapedPath}[/\\\\][^/\\\\]+$`) } });
      }
    }

    if (filters.search) {
      conditions.push({
        $or: [
          { originalName: { $regex: filters.search, $options: 'i' } },
          { tags: { $in: [new RegExp(filters.search, 'i')] } }
        ]
      });
    }

    if (filters.hash) {
      conditions.push({ hash: filters.hash });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const total = await MediaFileModel.countDocuments(query).exec();
    
    let dbQuery = MediaFileModel.find(query).sort({ isFolder: -1, originalName: 1 });
    
    if (filters.skip !== undefined) {
      dbQuery = dbQuery.skip(filters.skip);
    }
    if (filters.limit !== undefined) {
      dbQuery = dbQuery.limit(filters.limit);
    }

    const items = await dbQuery.exec();
    return { items, total };
  }
}
