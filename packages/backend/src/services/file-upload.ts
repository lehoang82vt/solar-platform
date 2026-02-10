/**
 * CON-06: File upload with S3 (or local mock), type/size validation, access control, soft delete.
 */
import { withOrgContext } from '../config/database';
import { getS3Config, getMockBaseUrl } from '../config/s3';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'] as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string): boolean {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

export interface ProjectFileRow {
  id: string;
  organization_id: string;
  project_id: string;
  file_type: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  related_to: string | null;
  related_id: string | null;
  description: string | null;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface UploadFileInput {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  description?: string | null;
  related_to?: 'project' | 'contract' | 'quote';
  related_id?: string | null;
}

export type UploadFileResult =
  | { kind: 'size_limit_exceeded'; maxBytes: number }
  | { kind: 'type_not_allowed'; mimeType: string }
  | { kind: 'project_not_found' }
  | { kind: 'ok'; file: ProjectFileRow };

function getFileTypeFromMime(mime: string): string {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime === 'application/pdf') return 'DOCUMENT';
  if (mime.includes('wordprocessingml')) return 'DOCUMENT';
  return 'FILE';
}

function validateFileType(mimeType: string, originalName: string): boolean {
  const mime = (mimeType || '').toLowerCase().trim();
  if (ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) return true;
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop()!.toLowerCase() : '';
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Generate mock or S3 key for URL. */
function generateFileUrl(organizationId: string, projectId: string, fileId: string, fileName: string): string {
  const config = getS3Config();
  if (config.useMock) {
    const base = getMockBaseUrl();
    return `${base}/${organizationId}/${projectId}/${fileId}/${encodeURIComponent(fileName)}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/org-${organizationId}/${projectId}/${fileId}/${encodeURIComponent(fileName)}`;
}

export async function uploadFile(
  organizationId: string,
  projectId: string,
  input: UploadFileInput,
  uploadedBy: string | null
): Promise<UploadFileResult> {
  if (input.size > MAX_FILE_SIZE_BYTES) {
    return { kind: 'size_limit_exceeded', maxBytes: MAX_FILE_SIZE_BYTES };
  }
  if (!validateFileType(input.mimeType, input.originalName)) {
    return { kind: 'type_not_allowed', mimeType: input.mimeType };
  }

  const projectExists = await withOrgContext(organizationId, async (client) => {
    const r = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND organization_id = $2',
      [projectId, organizationId]
    );
    return r.rows.length > 0;
  });
  if (!projectExists) return { kind: 'project_not_found' };

  const uploadedByUuid = uploadedBy && isValidUuid(uploadedBy) ? uploadedBy : null;
  return await withOrgContext(organizationId, async (client) => {
    const fileIdResult = await client.query(
      `INSERT INTO project_files (organization_id, project_id, file_type, file_name, file_url, file_size_bytes, mime_type, related_to, related_id, description, uploaded_by)
       VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        organizationId,
        projectId,
        getFileTypeFromMime(input.mimeType),
        input.originalName,
        input.size,
        input.mimeType,
        input.related_to ?? null,
        input.related_id ?? null,
        input.description ?? null,
        uploadedByUuid,
      ]
    );
    const fileId = (fileIdResult.rows[0] as { id: string }).id;
    const fileUrl = generateFileUrl(organizationId, projectId, fileId, input.originalName);
    await client.query('UPDATE project_files SET file_url = $1 WHERE id = $2', [fileUrl, fileId]);

    const row = await client.query(
      `SELECT id, organization_id, project_id, file_type, file_name, file_url, file_size_bytes, mime_type, related_to, related_id, description, uploaded_by, created_at FROM project_files WHERE id = $1`,
      [fileId]
    );
    const r = row.rows[0] as Record<string, unknown>;
    if (!('deleted_at' in r)) r.deleted_at = null;
    return {
      kind: 'ok',
      file: mapRow(r),
    };
  });
}

function mapRow(r: Record<string, unknown>): ProjectFileRow {
  return {
    id: r.id as string,
    organization_id: r.organization_id as string,
    project_id: r.project_id as string,
    file_type: r.file_type as string,
    file_name: r.file_name as string,
    file_url: r.file_url as string,
    file_size_bytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
    mime_type: (r.mime_type as string) ?? null,
    related_to: (r.related_to as string) ?? null,
    related_id: (r.related_id as string) ?? null,
    description: (r.description as string) ?? null,
    uploaded_by: (r.uploaded_by as string) ?? null,
    deleted_at: (r.deleted_at as string) ?? null,
    created_at: r.created_at as string,
  };
}

export type ListFilesResult = { kind: 'ok'; files: ProjectFileRow[] };

export async function listFilesByProject(
  organizationId: string,
  projectId: string,
  options?: { includeDeleted?: boolean }
): Promise<ListFilesResult> {
  const includeDeleted = options?.includeDeleted ?? false;
  return await withOrgContext(organizationId, async (client) => {
    const query = includeDeleted
      ? `SELECT id, organization_id, project_id, file_type, file_name, file_url, file_size_bytes, mime_type, related_to, related_id, description, uploaded_by, deleted_at, created_at FROM project_files WHERE project_id = $1 ORDER BY created_at DESC`
      : `SELECT id, organization_id, project_id, file_type, file_name, file_url, file_size_bytes, mime_type, related_to, related_id, description, uploaded_by, deleted_at, created_at FROM project_files WHERE project_id = $1 AND (deleted_at IS NULL) ORDER BY created_at DESC`;
    const result = await client.query(query, [projectId]);
    const files = result.rows.map((row) => mapRow(row as Record<string, unknown>));
    return { kind: 'ok', files };
  });
}

export async function getFileById(organizationId: string, fileId: string): Promise<ProjectFileRow | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, organization_id, project_id, file_type, file_name, file_url, file_size_bytes, mime_type, related_to, related_id, description, uploaded_by, deleted_at, created_at FROM project_files WHERE id = $1 AND organization_id = $2`,
      [fileId, organizationId]
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  });
}

export type SoftDeleteResult =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'ok'; file: ProjectFileRow };

/** Soft delete. Access: admin or uploader. */
export async function softDeleteFile(
  organizationId: string,
  fileId: string,
  userId: string,
  userRole: string
): Promise<SoftDeleteResult> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      'SELECT id, uploaded_by, deleted_at FROM project_files WHERE id = $1 AND organization_id = $2',
      [fileId, organizationId]
    );
    if (result.rows.length === 0) return { kind: 'not_found' };
    const row = result.rows[0] as { uploaded_by: string | null; deleted_at: string | null };
    if (row.deleted_at) return { kind: 'not_found' };
    const isAdmin = (userRole || '').toLowerCase() === 'admin';
    const isUploader = row.uploaded_by === userId;
    if (!isAdmin && !isUploader) return { kind: 'forbidden' };

    await client.query(
      'UPDATE project_files SET deleted_at = now() WHERE id = $1 AND organization_id = $2',
      [fileId, organizationId]
    );
    const updated = await client.query(
      `SELECT id, organization_id, project_id, file_type, file_name, file_url, file_size_bytes, mime_type, related_to, related_id, description, uploaded_by, deleted_at, created_at FROM project_files WHERE id = $1`,
      [fileId]
    );
    return { kind: 'ok', file: mapRow(updated.rows[0] as Record<string, unknown>) };
  });
}
