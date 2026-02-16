import pkg from '../../package.json';

declare const __BUILD_HASH__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

type BuildInfo = {
  version: string;
  buildHash: string;
  buildTime: string;
};

const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const buildInfo: BuildInfo = {
  version: pkg.version,
  buildHash: (typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : runtimeEnv?.BUILD_HASH) ?? 'DEV',
  buildTime:
    (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : runtimeEnv?.BUILD_TIME) ?? new Date().toISOString()
};
