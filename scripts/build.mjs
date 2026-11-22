import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const site = new URL('site/', root);
const output = new URL('dist/', root);
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';

if (clientId && !/^[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
  throw new Error('GOOGLE_OAUTH_CLIENT_ID must be a Google OAuth web client ID.');
}

async function hashSource(directory, hash) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    hash.update(entry.name + '\0');
    if (entry.isDirectory()) await hashSource(new URL(entry.name + '/', directory), hash);
    else hash.update(await readFile(new URL(entry.name, directory)));
    hash.update('\0');
  }
}

const config = `export const clientId = ${JSON.stringify(clientId)};\n`;
const hash = createHash('sha256').update(config)
  .update(await readFile(new URL('package-lock.json', root)))
  .update(await readFile(new URL(import.meta.url)));
await hashSource(site, hash);
const releasePath = `releases/${hash.digest('hex').slice(0, 16)}/`;
const release = new URL(releasePath, output);
const index = await readFile(new URL('index.html', site), 'utf8');
const entries = await readdir(site);

const pdfDist = new URL('node_modules/pdfjs-dist/', root);
const pdfOutput = new URL('pdfjs/', release);
await mkdir(pdfOutput, { recursive: true });
await Promise.all([
  ...entries.filter(entry => entry !== 'index.html').map(entry =>
    cp(new URL(entry, site), new URL(entry, release), { recursive: true })),
  ...['pdf.mjs', 'pdf.worker.mjs'].map(file =>
    cp(new URL(`legacy/build/${file}`, pdfDist), new URL(file, pdfOutput))),
  ...['cmaps', 'iccs', 'standard_fonts', 'wasm', 'LICENSE'].map(path =>
    cp(new URL(path, pdfDist), new URL(path, pdfOutput), { recursive: true })),
]);

await Promise.all([
  writeFile(new URL('config.js', release), config),
  writeFile(new URL('config.js', output), config),
]);
await writeFile(new URL('index.html', output), index
  .replace('./styles.css', `./${releasePath}styles.css`)
  .replace('./app.js', `./${releasePath}app.js`));
