export async function mockSearch(query: string) {
  // In real implementation, call Bing/Tavily/Serp APIs here.
  return [
    { url: 'https://en.wikipedia.org/wiki/Perplexity_AI', title: 'Perplexity AI - Wikipedia', snippet: 'Overview and background.'},
    { url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events', title: 'MDN: Server-Sent Events', snippet: 'How SSE works.'},
    { url: 'https://arxiv.org/abs/2308.00000', title: 'Hypothetical Paper on Reranking', snippet: 'Reranking concepts.'}
  ];
}
