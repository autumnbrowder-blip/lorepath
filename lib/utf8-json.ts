/**
 * Parse a fetch Response body as UTF-8 JSON.
 * Never honor a latin1 / windows-1252 Content-Type charset — catalog APIs
 * send UTF-8 bytes even when the header is missing or wrong.
 */
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });

export async function parseUtf8Json<T>(response: Response): Promise<T> {
  const bytes = await response.arrayBuffer();
  const text = UTF8_DECODER.decode(bytes);
  return JSON.parse(text) as T;
}
