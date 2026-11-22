export const itineraryFile = 'trip-overview.json';

const flightFields = ['date', 'airline', 'number', 'from', 'fromCode', 'departure', 'to', 'toCode', 'arrival'];
const stayFields = ['name', 'location', 'address', 'checkIn', 'checkOut'];
const maxItineraryBytes = 64 * 1024;

function hasTextFields(value, fields) {
  return fields.every(field => typeof value?.[field] === 'string' && value[field].trim());
}

function validBookings(bookings) {
  return bookings === undefined || (Array.isArray(bookings) && bookings.every(booking =>
    hasTextFields(booking, ['pnr']) && Array.isArray(booking.passengers) &&
    booking.passengers.length > 0 && booking.passengers.every(name => typeof name === 'string' && name.trim())));
}

export async function readItinerary(drive, file, signal) {
  if (Number(file.size) > maxItineraryBytes) throw new Error('Trip overview is too large.');
  const blob = await drive.preview(file, signal);
  if (blob.size > maxItineraryBytes) throw new Error('Trip overview is too large.');

  const itinerary = JSON.parse(await blob.text());
  if (!hasTextFields(itinerary, ['period']) ||
      !Array.isArray(itinerary.flights) || !itinerary.flights.every(flight =>
        hasTextFields(flight, flightFields) &&
        (flight.arrivalDate === undefined || hasTextFields(flight, ['arrivalDate'])) &&
        (flight.bookingNote === undefined || hasTextFields(flight, ['bookingNote'])) &&
        validBookings(flight.bookings)) ||
      !Array.isArray(itinerary.stays) || !itinerary.stays.every(stay => hasTextFields(stay, stayFields))) {
    throw new Error('Trip overview has an invalid format.');
  }
  return itinerary;
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  node.className = className;
  if (label) node.textContent = label;
  return node;
}

function flightStop(label, code, time, date) {
  const stop = element('div', 'flight-stop');
  stop.append(
    element('div', 'detail-label', label),
    element('strong', 'airport-code', code),
    element('span', 'flight-time', time),
  );
  if (date) stop.append(element('span', 'arrival-date', date));
  return stop;
}

function accordionCard(kind, title, subtitle, meta) {
  const card = element('li', `itinerary-card ${kind}-card`);
  const details = element('details', 'itinerary-accordion');
  details.open = true;
  const summary = element('summary', 'accordion-summary');
  const heading = element('span', 'accordion-heading');
  heading.append(element('span', 'card-title', title), element('span', 'card-meta', subtitle));
  summary.append(heading);
  if (meta) summary.append(element('span', 'accordion-meta card-meta', meta));
  const body = element('div', `accordion-content ${kind}-content`);
  details.append(summary, body);
  card.append(details);
  return { card, body };
}

function flightBookings(flight) {
  const section = element('section', 'flight-bookings');
  section.append(element('h3', 'booking-heading', 'Passengers and PNRs'));
  if (!flight.bookings?.length) {
    section.append(element('p', 'card-meta', 'Passenger details are pending for this flight.'));
    return section;
  }

  const groups = element('ul', 'booking-groups');
  for (const booking of flight.bookings) {
    const group = element('li', 'booking-group');
    const reference = element('p', 'booking-reference');
    reference.append(element('span', 'detail-label', 'PNR'), element('code', 'booking-code', booking.pnr));
    const passengers = element('ul', 'booking-passengers');
    for (const passenger of booking.passengers) passengers.append(element('li', 'passenger', passenger));
    group.append(reference, passengers);
    groups.append(group);
  }
  section.append(groups);
  if (flight.bookingNote) section.append(element('p', 'booking-note card-meta', flight.bookingNote));
  return section;
}

export function flightCard(flight) {
  const { card, body } = accordionCard('flight', `${flight.from} to ${flight.to}`,
    `${flight.airline} · ${flight.number}`, flight.date);

  const route = element('div', 'flight-route');
  route.append(
    flightStop('Departs', flight.fromCode, flight.departure),
    flightStop('Arrives', flight.toCode, flight.arrival, flight.arrivalDate),
  );
  body.append(route, flightBookings(flight));
  return card;
}

export function stayCard(stay) {
  const { card, body } = accordionCard('stay', stay.name, stay.location);
  body.append(element('p', 'stay-address', stay.address));

  const dates = element('dl', 'stay-dates');
  for (const [label, date] of [['Check-in', stay.checkIn], ['Check-out', stay.checkOut]]) {
    const item = element('div', 'stay-date');
    item.append(element('dt', 'detail-label', label), element('dd', 'stay-time', date));
    dates.append(item);
  }
  body.append(dates);
  return card;
}
