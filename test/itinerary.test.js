import assert from 'node:assert/strict';
import test from 'node:test';
import { readItinerary } from '../site/itinerary.js';

test('loads a private itinerary through the authenticated Drive client', async () => {
  const itinerary = {
    period: '1–2 January',
    flights: [{
      date: '1 Jan', airline: 'Example Air', number: 'EX 123',
      from: 'Origin', fromCode: 'ORG', departure: '23:00',
      to: 'Destination', toCode: 'DST', arrival: '01:00', arrivalDate: '2 Jan',
      bookings: [
        { pnr: 'ABC123', passengers: ['Example One', 'Example Two'] },
        { pnr: 'DEF456', passengers: ['Example Three'] },
      ],
    }],
    stays: [{
      name: 'Example Hotel', location: 'Destination', address: '10 Main Street',
      checkIn: '1 Jan', checkOut: '2 Jan',
    }],
  };
  const signal = new AbortController().signal;
  const file = { id: 'example', name: 'trip-overview.json' };
  const drive = {
    preview(input, requestSignal) {
      assert.equal(input, file);
      assert.equal(requestSignal, signal);
      return new Blob([JSON.stringify(itinerary)]);
    },
  };
  assert.deepEqual(await readItinerary(drive, file, signal), itinerary);
});

test('rejects incomplete or oversized itinerary data', async () => {
  const drive = { preview: () => new Blob([JSON.stringify({ period: 'A date', flights: [null] })]) };
  await assert.rejects(readItinerary(drive, {}), /invalid format/);
  await assert.rejects(readItinerary(drive, { size: 65537 }), /too large/);
});

test('rejects booking groups without passenger names', async () => {
  const flight = {
    date: '1 Jan', airline: 'Example Air', number: 'EX 123',
    from: 'Origin', fromCode: 'ORG', departure: '23:00',
    to: 'Destination', toCode: 'DST', arrival: '01:00',
  };
  const drive = { preview: () => new Blob([JSON.stringify({
    period: '1–2 January', flights: [{ ...flight, bookings: [{ pnr: 'ABC123', passengers: [] }] }], stays: [],
  })]) };
  await assert.rejects(readItinerary(drive, {}), /invalid format/);
});
