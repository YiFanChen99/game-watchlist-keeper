import { copyFile, mkdir } from 'node:fs/promises';
import * as esbuild from 'esbuild';

import { buildBanner, metadata } from './metadata.mjs';

const outDir = 'dist';

await mkdir(outDir, { recursive: true });

await esbuild.build({
    entryPoints: ['src/main.ts'],
    outfile: `${outDir}/Script.user.js`,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    // Deliberately unminified: Tampermonkey shows this file to the user as-is.
    minify: false,
    banner: { js: buildBanner() },
});

await copyFile('logo.png', `${outDir}/logo.png`);

console.log(`Built ${metadata.name} v${metadata.version} -> ${outDir}/`);
