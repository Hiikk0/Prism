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

  async delete(id: string): Promise<IMediaFile | null> {
    return MediaFileModel.findByIdAndDelete(id).exec();
  }

  async findAll(filters: any = {}): Promise<IMediaFile[]> {
    const query: any = {};
    if (filters.type) {
      query.mimeType = { $regex: filters.type, $options: 'i' };
    }
    if (filters.hash) {
      query.hash = filters.hash;
    }
    if (filters.path) {
      query.path = filters.path;
    }
    return MediaFileModel.find(query).sort({ createdAt: -1 }).exec();
  }
}
