export async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const clone = res.clone();
    const body = await clone.json() as { error?: string };
    return body?.error || fallback;
  } catch {
    try {
      const clone = res.clone();
      const text = await clone.text();
      return text || fallback;
    } catch {
      return fallback;
    }
  }
}
