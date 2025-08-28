export type Related = { label: string; prompt: string };

export function relatedFor(intent: 'people'|'company'|'local'|'general', subject: string): Related[] {
  if (intent === 'people') {
    return [
      { label: 'Achievements', prompt: `What are ${subject}’s most notable achievements?` },
      { label: 'Controversies', prompt: `What controversies or legal issues has ${subject} faced?` },
      { label: 'Early life', prompt: `What was ${subject}’s early life and background?` },
      { label: 'Career timeline', prompt: `Give a brief career timeline of ${subject} with dates.` },
      { label: 'Interviews', prompt: `Summarize recent interviews with ${subject}.` }
    ];
  }
  if (intent === 'company') {
    return [
      { label: 'Founders', prompt: `Who founded ${subject}, and when?` },
      { label: 'Leadership', prompt: `Who are the key leaders at ${subject}?` },
      { label: 'Financials', prompt: `What are the latest revenue/funding details for ${subject}?` },
      { label: 'Competitors', prompt: `Who are the main competitors of ${subject}?` },
      { label: 'News', prompt: `What are the latest news headlines about ${subject}?` }
    ];
  }
  if (intent === 'local') {
    return [
      { label: 'Closest options', prompt: `Show the closest ${subject} options.` },
      { label: 'Open now', prompt: `Which ${subject} nearby are open now?` },
      { label: 'Call & contact', prompt: `List ${subject} near me with phone numbers.` },
      { label: 'Top rated', prompt: `Which ${subject} near me are best rated online?` },
      { label: 'Map view', prompt: `Show ${subject} near me with map links.` }
    ];
  }
  return [
    { label: 'Overview', prompt: `Give a concise overview of ${subject}.` },
    { label: 'Pros & cons', prompt: `What are the pros and cons of ${subject}?` },
    { label: 'How-to', prompt: `How do I get started with ${subject}?` },
    { label: 'Alternatives', prompt: `What are good alternatives to ${subject}?` },
    { label: 'Deeper dive', prompt: `Deep dive into ${subject} with references.` }
  ];
}
