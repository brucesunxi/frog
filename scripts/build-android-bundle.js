import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const signingEnvPath = path.join(rootDir, 'android', 'release-signing.env');
const env = { ...process.env };

if (existsSync(signingEnvPath)) {
  const text = await readFile(signingEnvPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    env[line.slice(0, eq)] = line.slice(eq + 1);
  }
}

env.JAVA_HOME = env.JAVA_HOME || '/opt/homebrew/opt/openjdk@17';
env.ANDROID_HOME = env.ANDROID_HOME || '/opt/homebrew/share/android-commandlinetools';

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

await run('npm', ['run', 'android:prepare'], rootDir);
await run('./gradlew', ['bundleRelease'], path.join(rootDir, 'android'));
