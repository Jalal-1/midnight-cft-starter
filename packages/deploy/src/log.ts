// Tiny console helpers for the CLI.
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

export const heading = (text: string) => console.log(`\n${c.bold}${c.cyan}== ${text}${c.reset}`);
export const log = (text: string) => console.log(`   ${text}`);
export const ok = (text: string) => console.log(`${c.green} ✓ ${c.reset}${text}`);
export const warn = (text: string) => console.log(`${c.yellow} ! ${c.reset}${text}`);

/** Run `fn` while printing `label …`, then the elapsed time. */
export const withStatus = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  process.stdout.write(`${c.gray} … ${c.reset}${label}`);
  try {
    const result = await fn();
    process.stdout.write(` ${c.gray}(${((Date.now() - started) / 1000).toFixed(1)}s)${c.reset}\n`);
    return result;
  } catch (e) {
    process.stdout.write(` ${c.red}failed${c.reset}\n`);
    throw e;
  }
};

/** `--name value` from argv, with a default. */
export const arg = (name: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
