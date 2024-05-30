import fs from 'fs/promises';
import path from 'path';
import fastGlob from 'fast-glob';
import { execSync } from 'child_process';

const ROOT_DIR = '.';
const FILE_PATTERN = '**/package.json.liquid';

async function findAllPackageFiles() {
  return fastGlob(FILE_PATTERN, { cwd: ROOT_DIR, absolute: true });
}

async function getLatestVersion(packageName) {
  try {
    // Fetch the latest version of a package from the npm registry
    const output = execSync(`npm show ${packageName} version`, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    console.warn(`Could not fetch version for package ${packageName}:`, error.message);
    return null;
  }
}

async function checkAndUpdateDependencies(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const jsonContent = JSON.parse(content);

  const { dependencies = {}, devDependencies = {} } = jsonContent;

  const updateDependencyVersion = async (dependencies) => {
    for (const [name, currentVersion] of Object.entries(dependencies)) {
      const latestVersion = await getLatestVersion(name);
      if (latestVersion && currentVersion !== `^${latestVersion}`) {
        console.log(`Updating ${name} from ${currentVersion} to ^${latestVersion}`);
        dependencies[name] = `^${latestVersion}`;
      }
    }
  };

  await updateDependencyVersion(dependencies);
  await updateDependencyVersion(devDependencies);

  const updatedContent = JSON.stringify(jsonContent, null, 2);
  await fs.writeFile(filePath, updatedContent, 'utf8');
  console.log(`Updated dependencies in ${filePath}`);
}

async function main() {
  const packageFiles = await findAllPackageFiles();
  for (const filePath of packageFiles) {
    await checkAndUpdateDependencies(filePath);
  }
}

main().catch(error => {
  console.error('Error checking and updating dependencies:', error);
  process.exit(1);
});