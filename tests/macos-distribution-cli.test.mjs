import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=args=>spawnSync(process.execPath,['tools/build-macos.mjs',...args],{encoding:'utf8',timeout:10000});
test('CLI explicitly distinguishes offline export, Clang and trusted local distribution',()=>{
  const result=run(['--help']);assert.equal(result.status,0);assert.match(result.stdout,/--distribute/);assert.match(result.stdout,/--notarize-profile/);assert.match(result.stdout,/O0\.\.O3/);assert.match(result.stdout,/explicitly uploads to Apple/);
});
for(const [args,message]of [
 [['--identity','Test'],/require explicit --clang or --distribute/],
 [['--notarize-profile','Local'],/require explicit --distribute/],
 [['--entitlements-json','secret.json'],/require explicit --distribute/],
 [['--sign-timeout','1000'],/require explicit --distribute/],
 [['--distribute'],/signing identity/],
 [['--distribute','--identity','-','--notarize-profile','Local'],/requires a Developer ID/],
 [['--distribute','--identity','Test','--clang'],/mutually exclusive/],
 [['--distribute','--identity','Test','--source-only'],/mutually exclusive/],
 [['--distribute','--identity','Test','--jobs','4'],/requires explicit --clang/],
 [['--distribute','--identity','Test','--identity','Other'],/Duplicate argument/],
 [['--distribute','--identity','Test','--sign-timeout','Infinity'],/timeout/],
 [['--distribute','--identity','Test','--password','not-accepted'],/Unknown or missing argument/]
])test('CLI rejects '+args.join(' ')+' before opening the project',()=>{
  const result=run(['this-project-must-not-be-opened.vb6web','--out','unused',...args]);assert.equal(result.status,1);assert.match(result.stderr,message);assert.doesNotMatch(result.stderr,/ENOENT/);
});
