import { clientId } from './config.js';
import { connectDrive, driveLink, driveScope, fileKind, folderErrorMessage, folderMime, previewType } from './drive.js';
import { openPdf, renderPage } from './pdf.js';
import { folderLabel, orderTripEntries, tripFolderId } from './trip.js';
import { flightCard, itineraryFile, readItinerary, stayCard } from './itinerary.js';

const $ = id => document.getElementById(id);
const connect = $('connect');
const disconnect = $('disconnect');
const welcome = $('welcome');
const dashboard = $('dashboard');
const overview = $('overview');
const overviewStatus = $('overview-status');
const overviewNav = $('overview-nav');
const documentsNav = $('documents-nav');
const folderNav = $('folder-nav');
const documents = $('documents');
const notice = $('notice');
const refresh = $('refresh');
const search = $('search');
const breadcrumbs = $('breadcrumbs');
const results = $('results');
const summary = $('summary');
const items = $('items');
const previewPanel = $('preview');
const previewTitle = $('preview-title');
const previewLink = $('preview-link');
const previewStatus = $('preview-status');
const previewContent = $('preview-content');
const pageControls = $('page-controls');
const previousPage = $('previous-page');
const nextPage = $('next-page');

let tokenClient;
let pendingSignIn = false;
let drive;
let expiry;
let folderRequest;
let overviewRequest;
let tripRoot;
let preview;
let path = [];
let files = [];

function itemCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function showNotice(message = '') {
  notice.textContent = message;
  notice.hidden = !message;
}

function allowConnect() {
  connect.disabled = !tokenClient || pendingSignIn;
}

function resetPreview() {
  const closing = preview;
  preview = null;
  closing?.controller.abort();
  closing?.renderTask?.cancel();
  closing?.loadingTask?.destroy().catch(() => {});
  if (closing?.imageUrl) URL.revokeObjectURL(closing.imageUrl);
  previewPanel.hidden = true;
  previewTitle.textContent = '';
  previewLink.removeAttribute('href');
  previewStatus.textContent = '';
  previewContent.replaceChildren();
  pageControls.hidden = true;
}

function endSession(message) {
  clearTimeout(expiry);
  drive = null;
  folderRequest?.abort();
  folderRequest = null;
  overviewRequest?.abort();
  overviewRequest = null;
  tripRoot = null;
  resetPreview();
  path = [];
  files = [];
  search.value = '';
  items.replaceChildren();
  breadcrumbs.replaceChildren();
  summary.textContent = '';
  results.setAttribute('aria-busy', 'false');
  documents.hidden = true;
  dashboard.hidden = true;
  folderNav.replaceChildren();
  clearItinerary();
  showOverviewStatus();
  disconnect.hidden = true;
  welcome.hidden = false;
  showNotice(message);
  allowConnect();
}

function sessionExpired(error) {
  if (error.status !== 401) return false;
  endSession('Your Google connection expired. Connect again to reopen the trip folder.');
  return true;
}

function action(label, onClick, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function showOverviewStatus(message = '') {
  overviewStatus.textContent = message;
  overviewStatus.hidden = !message;
}

function clearItinerary() {
  $('itinerary').hidden = true;
  $('flights').replaceChildren();
  $('stays').replaceChildren();
  $('trip-period').textContent = 'Flights, hotel stays, and trip documents.';
}

function openOverview() {
  folderRequest?.abort();
  folderRequest = null;
  resetPreview();
  documents.hidden = true;
  overview.hidden = false;
  markSection(overviewNav);
  showNotice();
}

function markSection(active) {
  for (const button of [overviewNav, documentsNav, ...folderNav.children]) {
    if (button === active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function openDocuments(nextPath) {
  if (!tripRoot) return;
  overview.hidden = true;
  documents.hidden = false;
  markSection([...folderNav.children].find(button => button.dataset.folderId === nextPath[1]?.id) ?? documentsNav);
  loadFolder(nextPath);
}

function renderFolderNav(entries) {
  const buttons = entries.filter(file => file.mimeType === folderMime).map(folder => {
    const button = action(folderLabel(folder), () => openDocuments([tripRoot, folder]), 'nav-button');
    button.dataset.folderId = folder.id;
    return button;
  });
  folderNav.replaceChildren(...buttons);
}

async function loadOverview(entries) {
  overviewRequest?.abort();
  const request = new AbortController();
  overviewRequest = request;
  const file = entries.find(item => item.name === itineraryFile && item.mimeType !== folderMime);
  clearItinerary();
  if (!file) {
    showOverviewStatus('The organizer needs to upload trip-overview.json to the main trip folder in Drive. You can open the original files from All documents.');
    return;
  }

  showOverviewStatus('Loading your itinerary…');
  try {
    const itinerary = await readItinerary(drive, file, request.signal);
    if (overviewRequest !== request) return;
    $('trip-period').textContent = itinerary.period;
    $('flights-jump').textContent = itemCount(itinerary.flights.length, 'flight', 'flights');
    $('stays-jump').textContent = itemCount(itinerary.stays.length, 'hotel stay', 'hotel stays');
    $('flights').replaceChildren(...itinerary.flights.map(flightCard));
    $('stays').replaceChildren(...itinerary.stays.map(stayCard));
    $('itinerary').hidden = false;
    showOverviewStatus();
  } catch (error) {
    if (overviewRequest !== request || sessionExpired(error)) return;
    showOverviewStatus('Could not load the trip overview. You can still open the original documents.');
  }
}

function renderPath() {
  const trail = document.createElement('ol');
  trail.className = 'trail';
  path.forEach((folder, index) => {
    const item = document.createElement('li');
    if (index > 0) {
      const separator = document.createElement('span');
      separator.textContent = '/';
      separator.setAttribute('aria-hidden', 'true');
      item.append(separator);
    }
    if (index === path.length - 1) {
      const current = document.createElement('span');
      current.textContent = folderLabel(folder);
      current.setAttribute('aria-current', 'location');
      item.append(current);
    } else {
      item.append(action(folderLabel(folder), () => loadFolder(path.slice(0, index + 1)), 'crumb'));
    }
    trail.append(item);
  });
  breadcrumbs.replaceChildren(trail);
}

function renderFiles() {
  if (results.getAttribute('aria-busy') === 'true') return;
  const query = search.value.trim().toLocaleLowerCase();
  const matches = files.filter(file => folderLabel(file).toLocaleLowerCase().includes(query));
  summary.textContent = matches.length
    ? itemCount(matches.length, 'item', 'items')
    : query ? 'No files or folders match your search.' : 'This folder is empty.';

  const rows = matches.map(file => {
    const row = document.createElement('li');
    row.className = 'item';
    const folder = file.mimeType === folderMime;
    const button = action(folderLabel(file), () => {
      if (folder) openDocuments([...path, file]);
      else showPreview(file, { selectedByTraveler: true });
    }, 'item-name');
    const label = document.createElement('span');
    label.className = 'kind';
    label.textContent = fileKind(file);
    label.setAttribute('aria-hidden', 'true');
    button.prepend(label);

    if (!folder) {
      button.dataset.fileId = file.id;
      button.setAttribute('aria-controls', 'preview');
      button.setAttribute('aria-pressed', String(file.id === preview?.fileId));
    }
    row.append(button);
    return row;
  });
  items.replaceChildren(...rows);
}

async function loadFolder(nextPath, { resetSearch = true, startOnOverview = false } = {}) {
  if (!drive) return;
  folderRequest?.abort();
  const request = new AbortController();
  folderRequest = request;
  const initial = !path.length;
  const selectedId = resetSearch ? null : preview?.fileId;

  showNotice();
  resetPreview();
  refresh.disabled = true;
  search.disabled = true;
  results.setAttribute('aria-busy', 'true');
  summary.textContent = 'Loading folder…';
  items.replaceChildren();

  try {
    const current = nextPath.at(-1);
    const verified = await drive.folder(current.id, request.signal);
    const entries = await drive.children(verified.id, request.signal);
    if (folderRequest !== request) return;

    path = [...nextPath.slice(0, -1), verified];
    const atRoot = verified.id === tripFolderId;
    files = atRoot
      ? orderTripEntries(entries.filter(file => file.name !== itineraryFile || file.mimeType === folderMime))
      : entries;
    if (resetSearch) search.value = '';
    welcome.hidden = true;
    dashboard.hidden = false;
    if (atRoot) {
      tripRoot = verified;
      renderFolderNav(files);
      if (!startOnOverview) markSection(documentsNav);
      loadOverview(entries);
    }
    if (startOnOverview) {
      overview.hidden = false;
      documents.hidden = true;
      markSection(overviewNav);
      return;
    }
    renderPath();
    results.setAttribute('aria-busy', 'false');
    renderFiles();
    const selected = files.find(file => file.id === selectedId)
      ?? files.find(file => previewType(file) && file.capabilities?.canDownload !== false)
      ?? files.find(file => file.mimeType !== folderMime);
    if (selected) showPreview(selected);
  } catch (error) {
    if (folderRequest !== request || sessionExpired(error)) return;
    const message = folderErrorMessage(error);
    if (initial) endSession(message);
    else {
      files = [];
      showNotice(message);
      summary.textContent = 'Folder could not be loaded.';
    }
  } finally {
    if (folderRequest === request) {
      folderRequest = null;
      results.setAttribute('aria-busy', 'false');
      refresh.disabled = false;
      search.disabled = false;
    }
  }
}

async function showPdfPage(view, page) {
  const paint = (view.paint ?? 0) + 1;
  view.paint = paint;
  const active = () => preview === view && view.paint === paint;
  view.renderTask?.cancel();
  previousPage.disabled = true;
  nextPage.disabled = true;
  previewStatus.textContent = 'Rendering PDF…';

  try {
    const canvas = await renderPage(view.pdf, page, previewContent.clientWidth, active,
      task => { view.renderTask = task; });
    if (!active()) return;
    previewContent.replaceChildren(canvas);
    view.page = page;
    $('page-number').textContent = `Page ${page} of ${view.pdf.numPages}`;
    pageControls.hidden = false;
    previewStatus.textContent = '';
  } catch {
    if (active()) previewStatus.textContent = 'This page could not be displayed. Open the file in Drive to view it.';
  } finally {
    if (active()) {
      view.renderTask = null;
      previousPage.disabled = view.page <= 1;
      nextPage.disabled = view.page >= view.pdf.numPages;
    }
  }
}

async function showPreview(file, { selectedByTraveler = false } = {}) {
  if (preview?.fileId === file.id) {
    if (selectedByTraveler && !matchMedia('(min-width: 48rem)').matches) previewTitle.focus();
    return;
  }
  resetPreview();
  const view = { fileId: file.id, controller: new AbortController(), page: 1 };
  preview = view;
  const type = previewType(file);
  previewTitle.textContent = file.name;
  previewLink.href = driveLink(file);
  previewPanel.hidden = false;
  for (const card of items.querySelectorAll('[data-file-id]')) {
    card.setAttribute('aria-pressed', String(card.dataset.fileId === file.id));
  }
  if (selectedByTraveler && !matchMedia('(min-width: 48rem)').matches) previewTitle.focus();

  if (!type || file.capabilities?.canDownload === false) {
    previewStatus.textContent = 'This file can be viewed in Drive.';
    return;
  }
  previewStatus.textContent = 'Loading preview…';
  try {
    const blob = await drive.preview(file, view.controller.signal);
    if (preview !== view) return;
    if (type === 'pdf') {
      view.pdf = await openPdf(blob, () => preview === view, task => { view.loadingTask = task; });
      if (preview === view && view.pdf) await showPdfPage(view, 1);
      return;
    }

    const image = document.createElement('img');
    image.alt = file.name;
    view.imageUrl = URL.createObjectURL(blob);
    image.src = view.imageUrl;
    await image.decode();
    if (preview !== view) return;
    previewContent.replaceChildren(image);
    previewStatus.textContent = '';
  } catch (error) {
    if (preview !== view || sessionExpired(error)) return;
    previewStatus.textContent = error.status === 413
      ? 'This file is too large to preview here. Open it in Drive to view it.'
      : 'The preview could not be loaded. Open the file in Drive to view it.';
  }
}

function authorize(response) {
  if (!pendingSignIn) return;
  pendingSignIn = false;
  if (response.error || !response.access_token ||
      !google.accounts.oauth2.hasGrantedAllScopes(response, driveScope)) {
    endSession('Google Drive access was not granted. Connect again to try another account.');
    return;
  }
  drive = connectDrive(response.access_token);
  const lifetime = Number(response.expires_in);
  expiry = setTimeout(() => {
    endSession('Your Google connection expired. Connect again to reopen the trip folder.');
  }, (lifetime > 0 ? lifetime : 3600) * 1000);
  disconnect.hidden = false;
  loadFolder([{ id: tripFolderId }], { startOnOverview: true });
}

function setup() {
  if (!clientId) {
    showNotice('Google Drive is not configured. Ask your trip organizer to finish setting up the dashboard.');
    return;
  }
  const sdk = document.createElement('script');
  sdk.src = 'https://accounts.google.com/gsi/client';
  sdk.async = true;
  sdk.addEventListener('load', () => {
    try {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: driveScope,
        include_granted_scopes: false,
        callback: authorize,
        error_callback: () => {
          pendingSignIn = false;
          showNotice('Google sign-in did not finish. Try again and allow the Google pop-up.');
          allowConnect();
        },
      });
      allowConnect();
    } catch {
      showNotice('Google sign-in is unavailable. Reload the dashboard to try again.');
    }
  }, { once: true });
  sdk.addEventListener('error', () => {
    showNotice('Google sign-in could not load. Check your connection and reload the dashboard.');
  }, { once: true });
  document.head.append(sdk);
}

connect.addEventListener('click', () => {
  showNotice();
  pendingSignIn = true;
  allowConnect();
  try {
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  } catch {
    pendingSignIn = false;
    showNotice('Google sign-in could not start. Try again.');
    allowConnect();
  }
});
disconnect.addEventListener('click', () => endSession());
overviewNav.addEventListener('click', openOverview);
documentsNav.addEventListener('click', () => openDocuments([tripRoot]));
refresh.addEventListener('click', () => loadFolder(path, { resetSearch: false }));
search.addEventListener('input', renderFiles);
previousPage.addEventListener('click', () => showPdfPage(preview, preview.page - 1));
nextPage.addEventListener('click', () => showPdfPage(preview, preview.page + 1));
setup();
