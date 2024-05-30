import fs from 'fs/promises';
import fastGlob from 'fast-glob';
import toml from '@iarna/toml';

const ROOT_DIR = '.';
const FILE_PATTERNS = ['**/Cargo.toml', '**/Cargo.toml.liquid'];
const LIQUID_PLACEHOLDER = 'LIQUID_PLACEHOLDER';

async function findAllCargoFiles() {
  return fastGlob(FILE_PATTERNS, { cwd: ROOT_DIR, absolute: true });
}

async function getLatestVersion(packageName) {
  try {
    // Fetch the latest version of a package from crates.io
    const response = await fetch(`https://crates.io/api/v1/crates/${packageName}`);
    const jsonResponse = await response.json();
    return jsonResponse.crate.max_version;
  } catch (error) {
    console.warn(`Could not fetch version for package ${packageName}:`, error.message);
    return null;
  }
}

async function updateDependencyVersion(name, currentVersion) {
  const latestVersion = await getLatestVersion(name);

  if (latestVersion) {
    if (typeof currentVersion === 'string') {
      if (!currentVersion.includes(latestVersion)) {
        console.log(`Updating ${name} from ${currentVersion} to ${latestVersion}`);
        return latestVersion;
      }
    } else if (typeof currentVersion === 'object' && 'version' in currentVersion) {
      if (!currentVersion.version.includes(latestVersion)) {
        console.log(`Updating ${name} from ${currentVersion.version} to ${latestVersion}`);
        return { ...currentVersion, version: latestVersion };
      }
    }
  }
  return currentVersion;
}

function preprocessLiquidSyntax(content) {
  const liquidExpressions = [];
  const placeholderContent = content.replace(/\{\{.*?\}\}|\{%\s.*?\s%\}/g, (match) => {
    liquidExpressions.push(match);
    return `{${LIQUID_PLACEHOLDER}:${liquidExpressions.length - 1}}`;
  });
  return { placeholderContent, liquidExpressions };
}

function restoreLiquidSyntax(content, liquidExpressions) {
  return content.replace(new RegExp(`\\{${LIQUID_PLACEHOLDER}:(\\d+)\\}`, 'g'), (match, index) => {
    return liquidExpressions[Number(index)];
  });
}

async function checkAndUpdateDependencies(filePath) {
  let content = await fs.readFile(filePath, 'utf8');

  const isLiquidFile = filePath.endsWith('.liquid');
  let liquidExpressions = [];
  
  if (isLiquidFile) {
    const processed = preprocessLiquidSyntax(content);
    content = processed.placeholderContent;
    liquidExpressions = processed.liquidExpressions;
  }
  
  let tomlData;
  try {
    tomlData = toml.parse(content);
  } catch (error) {
    console.error(`Failed to parse TOML in file: ${filePath}`, error.message);
    return;
  }

  if (tomlData.dependencies) {
    const dependencyNames = Object.keys(tomlData.dependencies);
    for (const name of dependencyNames) {
      const currentVersion = tomlData.dependencies[name];
      tomlData.dependencies[name] = await updateDependencyVersion(name, currentVersion);
    }
  }

  let updatedContent = toml.stringify(tomlData);
  if (isLiquidFile) {
    updatedContent = restoreLiquidSyntax(updatedContent, liquidExpressions);
  }

  await fs.writeFile(filePath, updatedContent, 'utf8');
  console.log(`Updated dependencies in ${filePath}`);
}

async function main() {
  const cargoFiles = await findAllCargoFiles();
  for (const filePath of cargoFiles) {
    await checkAndUpdateDependencies(filePath);
  }
}

main().catch(error => {
  console.error('Error checking and updating dependencies:', error);
  process.exit(1);
});