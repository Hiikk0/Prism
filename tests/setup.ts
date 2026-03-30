import mongoose from 'mongoose';

beforeAll(async () => {
  // We'll use a local test database for integration tests if needed
  // For now, these are unit tests or we can mock mongoose
});

afterAll(async () => {
  await mongoose.disconnect();
});
