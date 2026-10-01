// Node globals a few Midnight.js dependencies still expect in the browser.
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: { env: Record<string, string | undefined> } };
g.Buffer ??= Buffer;
g.process ??= { env: {} };
