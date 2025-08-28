export async function searchCSE(_query: string, _limit: number) {
  return [] as { url: string; title: string; snippet?: string }[];
}

export async function findSocialLinks(_query: string) {
  return { wiki: undefined, linkedin: undefined, insta: undefined, fb: undefined, x: undefined } as any;
}
