import crypto from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const keystoreDir = path.join(rootDir, 'android', 'keystores');
const keystorePath = path.join(keystoreDir, 'frog-release.keystore');
const envPath = path.join(rootDir, 'android', 'release-signing.env');
const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@17';
const keytool = path.join(javaHome, 'bin', 'keytool');
const storePassword = crypto.randomBytes(24).toString('base64url');
const keyPassword = storePassword;
const alias = 'frog-release';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

await mkdir(keystoreDir, { recursive: true });
await rm(keystorePath, { force: true });
await run(keytool, [
  '-genkeypair',
  '-v',
  '-keystore', keystorePath,
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '2048',
  '-validity', '10000',
  '-storepass', storePassword,
  '-keypass', keyPassword,
  '-dname', 'CN=Frog Frenzy, OU=Games, O=Frog Frenzy, L=Unknown, ST=Unknown, C=US'
]);

const env = [
  `ANDROID_KEYSTORE_PATH=${keystorePath}`,
  `ANDROID_KEYSTORE_PASSWORD=${storePassword}`,
  `ANDROID_KEY_ALIAS=${alias}`,
  `ANDROID_KEY_PASSWORD=${keyPassword}`,
  ''
].join('\n');

await writeFile(envPath, env, { mode: 0o600 });
await chmod(envPath, 0o600);

console.log(`Android release keystore created at ${keystorePath}`);
console.log(`Signing environment written to ${envPath}`);
