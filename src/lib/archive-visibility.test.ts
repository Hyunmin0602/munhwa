import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveArchiveVisibility, normalizeArchiveVisibility } from './archive-visibility';

test('normalizeArchiveVisibility accepts legacy public values', () => {
  assert.equal(normalizeArchiveVisibility('public'), 'EXTERNAL');
  assert.equal(normalizeArchiveVisibility('INTERNAL'), 'INTERNAL');
  assert.equal(normalizeArchiveVisibility('private'), 'PRIVATE');
});

test('getEffectiveArchiveVisibility falls back to published for legacy records', () => {
  assert.equal(getEffectiveArchiveVisibility({ published: true }), 'EXTERNAL');
  assert.equal(getEffectiveArchiveVisibility({ published: false }), 'PRIVATE');
  assert.equal(getEffectiveArchiveVisibility({ visibility: 'INTERNAL' }), 'INTERNAL');
});

test('private reads require author, collaborator, or management access', async () => {
  const { canReadArchivePost } = await import('./archive-visibility');
  const post = { visibility: 'PRIVATE', authorId: 'author', collaborators: [{ userId: 'collaborator' }] };
  assert.equal(canReadArchivePost(post, 'member', false), false);
  assert.equal(canReadArchivePost(post, 'author', false), true);
  assert.equal(canReadArchivePost(post, 'collaborator', false), true);
  assert.equal(canReadArchivePost(post, 'manager', true), true);
  assert.equal(canReadArchivePost({ ...post, visibility: 'INTERNAL' }, 'member', false), true);
});
