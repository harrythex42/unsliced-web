import { createRequire } from 'node:module';

const require = createRequire(new URL('../.upstream/source/package.json', import.meta.url));
export const { chromium } = require('@playwright/test');
