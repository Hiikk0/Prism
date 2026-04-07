import { MediaFileModel, IMediaFile } from '../models/mediafile.model';

export class MediaFileRepository {
  async create(data: any): Promise<IMediaFile> {
    const mediaFile = new MediaFileModel(data);
    return mediaFile.save();
  }

  async findById(id: string): Promise<IMediaFile | null> {
    return MediaFileModel.findById(id).exec();
  }

  async update(id: string, data: any): Promise<IMediaFile | null> {
    return MediaFileModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async updateMany(ids: string[], data: any): Promise<void> {
    await MediaFileModel.updateMany({ _id: { $in: ids } }, data).exec();
  }

  async delete(id: string): Promise<IMediaFile | null> {
    return MediaFileModel.findByIdAndDelete(id).exec();
  }

  async deleteMany(ids: string[]): Promise<void> {
    await MediaFileModel.deleteMany({ _id: { $in: ids } }).exec();
  }

  async findAll(filters: any = {}): Promise<IMediaFile[]> {
    const query: any = {};
    if (filters.type) {
      query.mimeType = { $regex: filters.type, $options: 'i' };
    }
    if (filters.parentId !== undefined) {
      query.parentId = filters.parentId === 'root' ? null : filters.parentId;
    }
    if (filters.isFolder !== undefined) {
      query.isFolder = filters.isFolder;
    }
    if (filters.search) {
      query.$or = [
        { originalName: { $regex: filters.search, $options: 'i' } },
        { tags: { $in: [new RegExp(filters.search, 'i')] } }
      ];
    }
    if (filters.hash) {
      query.hash = filters.hash;
    }
    return MediaFileModel.find(query).sort({ isFolder: -1, originalName: 1 }).exec();
  }
}
