export type AskOptions = {
  query: string;
  coords?: { lat: number; lon: number };
  provider?: 'auto' | 'openai' | 'gemini';
};

/**
 * Placeholder orchestrator. Real logic lives in the API route.
 * The file exists to mirror project structure and future refactor.
 */
export async function* orchestrate(_opts: AskOptions) {
  return;
}
