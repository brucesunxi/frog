import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const wwwDir = path.join(rootDir, 'www');

await rm(wwwDir, { recursive: true, force: true });
await mkdir(wwwDir, { recursive: true });
await cp(path.join(rootDir, 'game.html'), path.join(wwwDir, 'index.html'));
await cp(path.join(rootDir, 'assets'), path.join(wwwDir, 'assets'), { recursive: true });

console.log('Capacitor web assets prepared in www/');
