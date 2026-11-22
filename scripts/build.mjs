import { cp, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';

if (clientId && !/^[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
  throw new Error('GOOGLE_OAUTH_CLIENT_ID must be a Google OAuth web client ID.');
}

const pdfDist = new URL('node_modules/pdfjs-dist/', root);
const pdfOutput = new URL('pdfjs/', output);
await mkdir(pdfOutput, { recursive: true });
await Promise.all([
  cp(new URL('site/', root), output, { recursive: true }),
  ...['pdf.mjs', 'pdf.worker.mjs'].map(file =>
    cp(new URL(`legacy/build/${file}`, pdfDist), new URL(file, pdfOutput))),
  ...['cmaps', 'iccs', 'standard_fonts', 'wasm', 'LICENSE'].map(path =>
    cp(new URL(path, pdfDist), new URL(path, pdfOutput), { recursive: true })),
]);

await writeFile(new URL('config.js', output), `export const clientId = ${JSON.stringify(clientId)};\n`);
