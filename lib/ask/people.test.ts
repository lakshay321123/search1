import { handlePeople } from './people';

jest.mock('../people/discover', () => ({
  discoverPeople: jest.fn(() => Promise.resolve({
    primary: { name: 'Alice', description: 'desc', image: 'img', wikiUrl: 'wiki' },
    others: [],
  })),
}));

jest.mock('../tools/wikidata', () => ({ getWikidataSocials: jest.fn(() => Promise.resolve({})) }));
jest.mock('../tools/googleCSE', () => ({
  findSocialLinks: jest.fn(() => Promise.resolve({})),
  searchCSEMany: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../learn/domains', () => ({
  domainScore: jest.fn(() => Promise.resolve(1)),
  recordShow: jest.fn(() => Promise.resolve()),
}));

const bias = { prefer: new Map<string, number>(), avoid: new Map<string, number>() };

test('handlePeople sends profile and final', async () => {
  const events: any[] = [];
  await handlePeople({ query: 'Alice', workingQuery: 'Alice', askFor: 'Alice', bias, send: (o) => events.push(o) });
  expect(events.find((e) => e.event === 'profile')).toBeTruthy();
  expect(events.find((e) => e.event === 'final')).toBeTruthy();
});
