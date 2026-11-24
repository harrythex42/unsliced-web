import { createRequire } from 'node:module';

const require = createRequire(new URL('../.upstream/artifacts/package.json', import.meta.url));
export const { chromium } = require('playwright');
