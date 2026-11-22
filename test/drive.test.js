import assert from 'node:assert/strict';
import test from 'node:test';
import { connectDrive, driveLink, folderErrorMessage, folderMime, previewType } from '../site/drive.js';
import { folderLabel, orderTripEntries } from '../site/trip.js';

test('prioritizes configured categories only when Drive lists them', () => {
  const entries = [
    { id: 'other', name: 'Hotels', mimeType: folderMime },
    { id: '1GYB7FPjluhsOr4BBGkK4hPzVzTrLQzy_', name: 'Currency', mimeType: folderMime },
    { id: '1abUA0BmkyQZPIT92GzZCyKJI3xabM-jl', name: 'Flights', mimeType: folderMime },
    { id: 'file', name: 'Itinerary.pdf', mimeType: 'application/pdf' },
  ];
  assert.deepEqual(orderTripEntries(entries).map(folderLabel), [
    'Tickets', 'Currency exchange', 'Hotels', 'Itinerary.pdf',
  ]);
});

test('fetches every page in the requested folder and omits inaccessible folders', async () => {
  const responses = [
    { nextPageToken: 'next', files: [
      { name: 'Flight 10', mimeType: 'application/pdf' },
      { name: 'Private folder', mimeType: folderMime, capabilities: { canListChildren: false } },
    ] },
    { files: [
      { name: 'Flight 2', mimeType: 'application/pdf' },
      { name: 'Hotels', mimeType: folderMime },
    ] },
  ];
  const calls = [];
  const drive = connectDrive('test-token', (url, options) => {
    calls.push(new URL(url));
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.cache, 'no-store');
    return Response.json(responses.shift());
  });

  const files = await drive.children('trip');
  assert.deepEqual(files.map(file => file.name), ['Hotels', 'Flight 2', 'Flight 10']);
  assert.equal(calls[0].searchParams.get('q'), "'trip' in parents and trashed = false");
  assert.equal(calls[0].searchParams.has('pageToken'), false);
  assert.equal(calls[1].searchParams.get('pageToken'), 'next');
});

test('rejects an inaccessible or invalid root before listing any files', async () => {
  const denied = connectDrive('test-token', () => new Response(null, { status: 403 }));
  await assert.rejects(denied.folder('trip'), { status: 403 });
  const invalid = connectDrive('test-token', () => Response.json({ mimeType: 'application/pdf' }));
  await assert.rejects(invalid.folder('trip'), { status: 404 });
});

test('uses the Drive response reason to explain common 403 errors', async () => {
  const examples = [
    [{ details: [{ reason: 'SERVICE_DISABLED' }] }, /Enable the Google Drive API/],
    [{ errors: [{ reason: 'insufficientPermissions' }] }, /missing Drive read access/],
    [{ errors: [{ reason: 'domainPolicy' }] }, /administrator has blocked/],
  ];
  for (const [error, message] of examples) {
    const drive = connectDrive('test-token', () => Response.json({ error }, { status: 403 }));
    await assert.rejects(drive.folder('trip'), failure => {
      assert.equal(failure.status, 403);
      assert.match(folderErrorMessage(failure), message);
      return true;
    });
  }
});

test('limits preview types and size and keeps navigable links on Google Drive', async () => {
  assert.equal(previewType({ mimeType: 'image/svg+xml' }), null);
  assert.equal(previewType({ mimeType: 'image/png' }), 'image');
  assert.equal(driveLink({ id: 'example', webViewLink: 'https://invalid.example/?next=drive.google.com' }),
    'https://drive.google.com/open?id=example');
  assert.equal(driveLink({ webViewLink: 'https://docs.google.com/document/d/abc/edit' }),
    'https://docs.google.com/document/d/abc/edit');

  const drive = connectDrive('test-token', url => {
    assert.equal(new URL(url).searchParams.get('alt'), 'media');
    return new Response('sample');
  });
  const file = { id: 'example', mimeType: 'image/png' };
  assert.equal((await drive.preview(file)).type, 'image/png');
  await assert.rejects(drive.preview({ ...file, size: String(31 * 1024 * 1024) }), { status: 413 });
});
