import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

const simulatorList = run('xcrun', ['simctl', 'list', '--json', 'devices', 'available']);
if (simulatorList.status !== 0) {
  process.stderr.write(simulatorList.stderr || simulatorList.stdout);
  process.exit(simulatorList.status ?? 1);
}

const parsed = JSON.parse(simulatorList.stdout);
const simulators = Object.values(parsed.devices ?? {}).flat();
const iphone = simulators.find(
  device =>
    device &&
    device.isAvailable !== false &&
    typeof device.name === 'string' &&
    device.name.startsWith('iPhone') &&
    typeof device.udid === 'string',
);

if (!iphone) {
  console.error(
    '[face-profile-native] No available iPhone simulator was found. Install an iOS simulator runtime and create an iPhone simulator.',
  );
  process.exit(1);
}

console.info(`[face-profile-native] Testing on ${iphone.name} (${iphone.udid})`);
const test = run(
  'xcodebuild',
  [
    '-workspace',
    'apps/mobile/ios/AURA.xcworkspace',
    '-scheme',
    'AURA',
    '-configuration',
    'Debug',
    '-quiet',
    '-destination',
    `platform=iOS Simulator,id=${iphone.udid}`,
    '-derivedDataPath',
    `/tmp/aura-face-profile-native-derived-${iphone.udid}`,
    'CODE_SIGNING_ALLOWED=NO',
    'test',
    '-only-testing:AURATests',
  ],
);
if (test.status !== 0) {
  const output = `${test.stdout ?? ''}\n${test.stderr ?? ''}`;
  const decisiveLines = output
    .split('\n')
    .filter(line =>
      /error:\s|Undefined symbol|AURAFaceProfileDepthApprovedSummary|XCTAssert|Test Case .*failed|AURATransient(?:Depth|Matte)StoreTests|AURAFaceAnalysisMediaSanitizerTests|Testing failed|TEST FAILED|Build input file cannot be found|file not found/i.test(
        line,
      ),
    )
    .slice(-120);
  process.stderr.write(
    `${(decisiveLines.length > 0 ? decisiveLines : output.split('\n').slice(-120)).join('\n')}\n`,
  );
  process.exit(test.status ?? 1);
}

console.info('[face-profile-native] AURATests passed');
