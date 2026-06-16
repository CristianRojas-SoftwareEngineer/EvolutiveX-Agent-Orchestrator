#!/usr/bin/env tsx

import { computeNextChangeId, resolveDefaultChangesDir } from './change-id.js';

const changesDir = resolveDefaultChangesDir();
process.stdout.write(`${computeNextChangeId(changesDir)}\n`);
