import { handleGeneral } from './general';

jest.mock('../tools/googleCSE', () => ({
  searchCSEMany: jest.fn(() => Promise.resolve([{ url: 'https://a.com', title: 'A', snippet: 'snip' }])) ,
}));
jest.mock('../learn/domains', () => ({
  domainScore: jest.fn(() => Promise.resolve(1)),
  recordShow: jest.fn(() => Promise.resolve()),
}));

test('handleGeneral sends cite and final', async () => {
  const events: any[] = [];
  await handleGeneral({ askFor: 'acme', send: (o) => events.push(o) });
  expect(events.find((e) => e.event === 'cite')).toBeTruthy();
  expect(events.find((e) => e.event === 'final')).toBeTruthy();
});
