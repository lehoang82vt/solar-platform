/**
 * CON-06: S3 config. Use real S3 when env is set; otherwise local mock for tests/dev.
 */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** If true, use mock storage (no real upload). */
  useMock: boolean;
}

export function getS3Config(): S3Config {
  const bucket = process.env.S3_BUCKET ?? '';
  const region = process.env.S3_REGION ?? 'ap-southeast-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';
  const useMock = !bucket || !accessKeyId || process.env.S3_USE_MOCK === 'true';

  return {
    bucket: bucket || 'mock-bucket',
    region,
    accessKeyId,
    secretAccessKey,
    useMock,
  };
}

/** Base URL for mock/local file URLs when S3 is not used. */
export function getMockBaseUrl(): string {
  return process.env.MOCK_FILE_BASE_URL ?? 'https://mock-files.local/uploads';
}
