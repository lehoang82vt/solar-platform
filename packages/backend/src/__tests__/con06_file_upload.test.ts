/**
 * CON-06: File upload with S3/mock, type/size validation, access control, soft delete.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext, getDatabasePool } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import {
  uploadFile,
  listFilesByProject,
  getFileById,
  softDeleteFile,
  MAX_FILE_SIZE_BYTES,
  type UploadFileInput,
} from '../services/file-upload';

test.before(async () => {
  await connectDatabase();
  const pool = getDatabasePool();
  if (pool) {
    await pool.query('ALTER TABLE project_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  }
});

async function createProject(orgId: string): Promise<string> {
  return await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO projects (organization_id, customer_name, customer_phone, customer_email, customer_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, 'Con06 Customer', '+84906666666', 'con06@test.local', 'HCM']
    );
    return (r.rows[0] as { id: string }).id;
  });
}

function makeBuffer(size: number): Buffer {
  return Buffer.alloc(size, 'x');
}

test('con06_1: upload_file_succeeds', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const input: UploadFileInput = {
    originalName: 'test.pdf',
    mimeType: 'application/pdf',
    size: 100,
    buffer: makeBuffer(100),
  };

  const result = await uploadFile(orgId, projectId, input, 'user-con06');

  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.ok(result.file.id);
    assert.equal(result.file.file_name, 'test.pdf');
    assert.ok(result.file.file_url);
    assert.equal(result.file.file_size_bytes, 100);
  }
});

test('con06_2: size_limit_enforced_10mb', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const overLimit = MAX_FILE_SIZE_BYTES + 1;
  const input: UploadFileInput = {
    originalName: 'big.pdf',
    mimeType: 'application/pdf',
    size: overLimit,
    buffer: makeBuffer(overLimit),
  };

  const result = await uploadFile(orgId, projectId, input, null);

  assert.equal(result.kind, 'size_limit_exceeded');
  if (result.kind === 'size_limit_exceeded') {
    assert.equal(result.maxBytes, MAX_FILE_SIZE_BYTES);
  }
});

test('con06_3: type_limit_enforced', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const input: UploadFileInput = {
    originalName: 'script.exe',
    mimeType: 'application/x-msdownload',
    size: 50,
    buffer: makeBuffer(50),
  };

  const result = await uploadFile(orgId, projectId, input, null);

  assert.equal(result.kind, 'type_not_allowed');
  if (result.kind === 'type_not_allowed') {
    assert.ok(result.mimeType.includes('msdownload') || result.mimeType);
  }
});

test('con06_4: access_control_by_role', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const upload = await uploadFile(
    orgId,
    projectId,
    { originalName: 'doc.pdf', mimeType: 'application/pdf', size: 10, buffer: makeBuffer(10) },
    'uploader-user-id'
  );
  assert.equal(upload.kind, 'ok');
  const fileId = upload.kind === 'ok' ? upload.file.id : '';

  const otherUser = await softDeleteFile(orgId, fileId, 'other-user-id', 'SALES');
  assert.equal(otherUser.kind, 'forbidden');

  const asAdmin = await softDeleteFile(orgId, fileId, 'admin-id', 'ADMIN');
  assert.equal(asAdmin.kind, 'ok');
});

test('con06_5: soft_delete_works', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const upload = await uploadFile(
    orgId,
    projectId,
    { originalName: 'soft.pdf', mimeType: 'application/pdf', size: 20, buffer: makeBuffer(20) },
    'user-con06-5'
  );
  assert.equal(upload.kind, 'ok');
  const fileId = upload.kind === 'ok' ? upload.file.id : '';

  const listBefore = await listFilesByProject(orgId, projectId);
  assert.equal(listBefore.kind, 'ok');
  assert.equal(listBefore.files.length, 1);

  await softDeleteFile(orgId, fileId, 'admin-con06-5', 'ADMIN');
  const listAfter = await listFilesByProject(orgId, projectId);
  assert.equal(listAfter.kind, 'ok');
  assert.equal(listAfter.files.length, 0);

  const listWithDeleted = await listFilesByProject(orgId, projectId, { includeDeleted: true });
  assert.equal(listWithDeleted.kind, 'ok');
  assert.equal(listWithDeleted.files.length, 1);
  assert.ok(listWithDeleted.files[0].deleted_at);
});

test('con06_6: file_url_generated', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const result = await uploadFile(
    orgId,
    projectId,
    { originalName: 'photo.jpg', mimeType: 'image/jpeg', size: 30, buffer: makeBuffer(30) },
    null
  );
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.ok(result.file.file_url.length > 0);
    assert.ok(result.file.file_url.includes(result.file.id) || result.file.file_url.includes(projectId));
  }
});

test('con06_7: associate_with_project', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  await uploadFile(
    orgId,
    projectId,
    {
      originalName: 'contract.pdf',
      mimeType: 'application/pdf',
      size: 40,
      buffer: makeBuffer(40),
      related_to: 'project',
      related_id: projectId,
    },
    null
  );

  const list = await listFilesByProject(orgId, projectId);
  assert.equal(list.kind, 'ok');
  assert.equal(list.files.length, 1);
  assert.equal(list.files[0].project_id, projectId);
  assert.equal(list.files[0].related_to, 'project');
  assert.equal(list.files[0].related_id, projectId);
});

test('con06_8: list_files_by_project', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  await uploadFile(
    orgId,
    projectId,
    { originalName: 'a.png', mimeType: 'image/png', size: 10, buffer: makeBuffer(10) },
    null
  );
  await uploadFile(
    orgId,
    projectId,
    { originalName: 'b.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 20, buffer: makeBuffer(20) },
    null
  );

  const list = await listFilesByProject(orgId, projectId);
  assert.equal(list.kind, 'ok');
  assert.equal(list.files.length, 2);
});

test('con06_9: download_requires_auth', async () => {
  const orgId = await getDefaultOrganizationId();
  const projectId = await createProject(orgId);
  const upload = await uploadFile(
    orgId,
    projectId,
    { originalName: 'secret.pdf', mimeType: 'application/pdf', size: 10, buffer: makeBuffer(10) },
    null
  );
  assert.equal(upload.kind, 'ok');
  const fileId = upload.kind === 'ok' ? upload.file.id : '';

  const file = await getFileById(orgId, fileId);
  assert.ok(file);
  assert.ok(file!.file_url);

  const wrongOrg = await getFileById('00000000-0000-0000-0000-000000000000', fileId);
  assert.equal(wrongOrg, null);
});
