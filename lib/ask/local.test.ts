import { handleLocal } from './local';

jest.mock('../local/overpass', () => ({
  searchNearbyOverpass: jest.fn(() => Promise.resolve({
    places: [{ name: 'Cafe', distance_m: 1000 }],
    usedCategory: 'cafe',
  })),
}));

test('handleLocal sends places and final', async () => {
  const events: any[] = [];
  await handleLocal('coffee', { lat: 0, lon: 0 }, (o) => events.push(o));
  expect(events.find((e) => e.event === 'places')).toBeTruthy();
  expect(events.find((e) => e.event === 'final')).toBeTruthy();
});
