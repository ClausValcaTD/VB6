import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

/** Extract a trusted, locally built npm package with an independent tar process.
 * Pass the file descriptor, not a drive-letter filename: GNU tar interprets a
 * colon in -f as a remote host. Setting cwd also avoids -C path dialect issues.
 * This is not a sanitizer for arbitrary, untrusted archives.
 * https://www.gnu.org/software/tar/manual/html_node/file.html
 */
export function extractPackage(archive, directory) {
  const input = fs.openSync(archive, 'r');
  try {
    return spawnSync('tar', ['-xzf', '-'], {
      cwd: directory, stdio: [input, 'pipe', 'pipe'], encoding: 'utf8',
      windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024,
    });
  } finally {
    fs.closeSync(input);
  }
}
