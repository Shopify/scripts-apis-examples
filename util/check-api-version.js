import fs from 'fs/promises';
import fastGlob from 'fast-glob';
import dayjs from 'dayjs';

const ROOT_DIR = '.';
const FILE_PATTERN = '**/shopify.extension.toml.liquid';

// Method to get the latest API version based on today's date
function getLatestApiVersion() {
  const date = dayjs();
  const year = date.year();
  const month = date.month();
  const quarter = Math.floor(month / 3);

  const monthNum = quarter * 3 + 1;
  const paddedMonth = String(monthNum).padStart(2, '0');

  return `${year}-${paddedMonth}`;
}

// Method to find all shopify.extension.toml.liquid files
async function findAllExtensionFiles() {
  return fastGlob(FILE_PATTERN, { cwd: ROOT_DIR, absolute: true });
}

// Method to update the API version in the file
async function updateApiVersion(filePath, latestVersion) {
  const content = await fs.readFile(filePath, 'utf8');
  const updatedContent = content.replace(/api_version\s*=\s*"\d{4}-\d{2}"/, `api_version = "${latestVersion}"`);

  await fs.writeFile(filePath, updatedContent, 'utf8');
  console.log(`Updated API version in ${filePath}`);
}

// Main method to check and update API versions
async function checkAndUpdateApiVersions() {
  const latestVersion = getLatestApiVersion();
  const extensionFiles = await findAllExtensionFiles();

  for (const filePath of extensionFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const match = content.match(/api_version\s*=\s*"(\d{4}-\d{2})"/);
    if (match) {
      const currentVersion = match[1];
      
      if (currentVersion !== latestVersion) {
        await updateApiVersion(filePath, latestVersion);
      } else {
        console.log(`API version in ${filePath} is already up to date.`);
      }
    } else {
      console.warn(`No API version found in ${filePath}`);
    }
  }
}

checkAndUpdateApiVersions().catch(error => {
  console.error('Error checking and updating API versions:', error);
  process.exit(1);
});