#!/usr/bin/env node
// Standalone Zig installer. Usage:
//   eval "$(node setup-zig.js [version])"
// version: "latest" (default), "master", or specific like "0.14.1"
// Set ZIG_HOME to override install dir (default: ~/.zig)

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ZIG_DIR = process.env.ZIG_HOME || path.join(os.homedir(), '.zig');
const VERSION = process.argv[2] || 'latest';

const MIRRORS = [
  'https://pkg.machengine.org/zig',
  'https://zigmirror.hryx.net/zig',
  'https://ziglang.org/download',
];

function fetch(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeoutMs);
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'setup-zig' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) { clearTimeout(timer); return reject(new Error(`HTTP ${res.statusCode}: ${u}`)); }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
        res.on('error', (e) => { clearTimeout(timer); reject(e); });
      }).on('error', (e) => { clearTimeout(timer); reject(e); });
    };
    get(url);
  });
}

async function fetchIndex() {
  for (const mirror of MIRRORS) {
    try {
      return JSON.parse(await fetch(`${mirror}/index.json`));
    } catch (e) {
      process.stderr.write(`Mirror ${mirror} failed: ${e.message}\n`);
    }
  }
  throw new Error('All mirrors failed to serve index.json');
}

function resolveVersion(index, requested) {
  if (requested === 'master') return 'master';
  if (requested === 'latest') {
    const releases = Object.keys(index).filter(k => k !== 'master');
    if (!releases.length) throw new Error('No releases found');
    return releases[0];
  }
  if (index[requested]) return requested;
  throw new Error(`Unknown version: ${requested}. Available: ${Object.keys(index).join(', ')}`);
}

function getPlatformKey() {
  const arch = { x64: 'x86_64', arm64: 'aarch64', arm: 'armv7a' }[os.arch()];
  const plat = { linux: 'linux', darwin: 'macos', win32: 'windows' }[os.platform()];
  if (!arch || !plat) throw new Error(`Unsupported: ${os.platform()}-${os.arch()}`);
  return `${arch}-${plat}`;
}

async function downloadTarball(tarball_url) {
  // Try mirrors by replacing the base URL
  const filename = path.basename(tarball_url.split('?')[0]);
  for (const mirror of MIRRORS) {
    const url = `${mirror}/${filename}`;
    try {
      process.stderr.write(`Trying ${url}\n`);
      return await fetch(url, 120000);
    } catch (e) {
      process.stderr.write(`  Failed: ${e.message}\n`);
    }
  }
  throw new Error('All mirrors failed');
}

async function main() {
  const index = await fetchIndex();
  const version = resolveVersion(index, VERSION);
  const key = getPlatformKey();
  const build = index[version]?.[key];
  if (!build) throw new Error(`No build for ${key} at version ${version}`);

  const tarball_url = build.tarball;
  const tarball_name = path.basename(tarball_url);
  const ext = tarball_name.endsWith('.zip') ? '.zip' : '.tar.xz';
  const dir_name = tarball_name.replace(ext, '');
  const install_dir = path.join(ZIG_DIR, dir_name);

  if (fs.existsSync(path.join(install_dir, 'zig'))) {
    process.stderr.write(`Already installed: ${install_dir}\n`);
  } else {
    const tarball = await downloadTarball(tarball_url);
    fs.mkdirSync(ZIG_DIR, { recursive: true });
    const tmp = path.join(ZIG_DIR, tarball_name);
    fs.writeFileSync(tmp, tarball);

    process.stderr.write(`Extracting to ${install_dir}\n`);
    if (ext === '.zip') {
      execSync(`unzip -qo "${tmp}" -d "${ZIG_DIR}"`);
    } else {
      execSync(`tar -xJf "${tmp}" -C "${ZIG_DIR}"`);
    }
    fs.unlinkSync(tmp);
  }

  // Symlink ~/.zig/current -> installed version
  const current = path.join(ZIG_DIR, 'current');
  try { fs.unlinkSync(current); } catch {}
  fs.symlinkSync(install_dir, current);

  // Print eval-able output to stdout (logs go to stderr)
  console.log(`export PATH="${current}:$PATH"`);

  // Verify
  const zig_ver = execSync(path.join(install_dir, 'zig') + ' version').toString().trim();
  process.stderr.write(`✓ Zig ${zig_ver} installed\n`);
}

main().catch((e) => { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); });
