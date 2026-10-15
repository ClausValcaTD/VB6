import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {extractPackage} from '../tools/ci/extract-package.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vb6 package extraction '));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const source = path.join(root, 'source'), destination = path.join(root, 'target with spaces');
  fs.mkdirSync(path.join(source, 'package'), {recursive: true});
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(source, 'package/index.js'), 'export const value = "Zażółć 😀";\n');
  const packed = spawnSync('tar', ['-czf', '-', 'package'], {cwd: source, timeout: 30_000});
  assert.equal(packed.status, 0, packed.stderr?.toString() || packed.error?.message);
  // Windows supplies the drive colon through its absolute temp path. POSIX can
  // additionally put a colon in the basename to exercise GNU's ambiguous -f.
  const archive = path.join(root, process.platform === 'win32' ? 'archive.tgz' : 'D:archive.tgz');
  fs.writeFileSync(archive, packed.stdout);
  return {root, archive, destination};
}

test('package extraction reads local bytes even with colon and spaced paths', t => {
  const {archive, destination} = fixture(t), result = extractPackage(archive, destination);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(fs.readFileSync(path.join(destination, 'package/index.js'), 'utf8'),
    'export const value = "Zażółć 😀";\n');
  // On Windows these operations also ensure no parent-held file descriptor leaks.
  fs.renameSync(archive, archive + '.moved');
  fs.rmSync(archive + '.moved');
});

test('corrupt packages retain independent tar failure and release the input', t => {
  const {archive, destination} = fixture(t);
  fs.writeFileSync(archive, 'not gzip or tar');
  const result = extractPackage(archive, destination);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr || result.error);
  assert.deepEqual(fs.readdirSync(destination), []);
  fs.rmSync(archive);
});

test('missing extraction directory preserves process-start error and closes input', t => {
  const {archive, root} = fixture(t);
  const result = extractPackage(archive, path.join(root, 'missing'));
  assert.equal(result.status, null);
  assert.ok(result.error);
  fs.rmSync(archive);
});

test('missing archive fails before launching the independent extractor', t => {
  const {archive, destination} = fixture(t);
  fs.rmSync(archive);
  assert.throws(() => extractPackage(archive, destination), {code: 'ENOENT'});
  assert.deepEqual(fs.readdirSync(destination), []);
});
