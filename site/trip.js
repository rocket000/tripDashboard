import { folderMime } from './drive.js';

export const tripFolderId = '1jJXGnjCCySL4S-7e8hm0FdFH2c9kmYIH';

const categories = new Map([
  ['1abUA0BmkyQZPIT92GzZCyKJI3xabM-jl', { name: 'Tickets', order: 0 }],
  ['1a_jntBOigt8aZAd50yaLFMtehDifjFMt', { name: 'Insurance policy', order: 1 }],
  ['1GYB7FPjluhsOr4BBGkK4hPzVzTrLQzy_', { name: 'Currency exchange', order: 2 }],
]);

function category(file) {
  return file.mimeType === folderMime ? categories.get(file.id) : undefined;
}

export function folderLabel(file) {
  if (file.mimeType === folderMime && /^hotel[ _-]*bookings$/i.test(file.name)) return 'Hotel bookings';
  return category(file)?.name ?? file.name;
}

export function orderTripEntries(entries) {
  return [...entries].sort((a, b) =>
    (category(a)?.order ?? categories.size) - (category(b)?.order ?? categories.size));
}
