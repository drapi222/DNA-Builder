import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.env.PORT || '8081';
const ADB_CANDIDATES = [
  process.env.ADB,
  'adb',
  path.join(os.homedir(), 'Downloads', 'platform-tools', 'adb'),
  path.join(os.homedir(), 'platform-tools', 'adb'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
].filter(Boolean);

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function findAdb() {
  for (const candidate of ADB_CANDIDATES) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;

    try {
      run(candidate, ['version']);
      return candidate;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
    }
  }

  return null;
}

try {
  const adb = findAdb();
  if (!adb) {
    fail([
      'adb is not installed or not on PATH.',
      '',
      'Install Android Platform Tools, or install Meta Quest Developer Hub, then try again.',
      'If you already installed it somewhere unusual, run:',
      '  ADB=/path/to/platform-tools/adb npm run quest:reverse',
    ].join('\n'));
  }

  const devices = run(adb, ['devices']).trim().split(/\r?\n/).slice(1);
  const authorized = devices.filter((line) => /\tdevice$/.test(line));
  const unauthorized = devices.filter((line) => /\tunauthorized$/.test(line));

  if (unauthorized.length) {
    fail([
      'Quest detected, but USB debugging is not authorized yet.',
      'Put on the headset, accept the USB debugging prompt, then run this again.',
    ].join('\n'));
  }

  if (!authorized.length) {
    fail([
      'No authorized Quest headset found over ADB.',
      'Checklist:',
      '  1. Enable Developer Mode for the Quest.',
      '  2. Plug the Quest into this Mac with USB-C.',
      '  3. Put on the headset and allow USB debugging.',
      `  4. Run: ${adb} devices`,
      '  5. Then run this command again.',
    ].join('\n'));
  }

  run(adb, ['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);

  console.log(`Quest USB tunnel ready: tcp:${PORT} -> Mac tcp:${PORT}`);
  console.log(`Open this in Meta Quest Browser: http://localhost:${PORT}`);
} catch (error) {
  fail(error.stderr?.toString() || error.message);
}
