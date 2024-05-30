import fs from 'fs/promises';
import path from 'path';
import fastGlob from 'fast-glob';

const ROOT_DIR = '.';
const FILE_PATTERN = '**/shopify.extension.toml.liquid';
const EXCLUDED_DIR = 'samples';
const OUTPUT_FILE = 'shopify.app.toml';

// Method to find all shopify.extension.toml.liquid files excluding the samples directory
async function findAllExtensionFiles() {
  return fastGlob(FILE_PATTERN, {
    cwd: ROOT_DIR,
    absolute: true,
    ignore: [`${EXCLUDED_DIR}/**`]
  });
}

// Method to build the content for shopify.app.toml
function buildTomlContent(directories) {
  const formattedDirectories = directories.map(dir => `'${dir}'`).join(',\n  ');
  return `extension_directories = [
  ${formattedDirectories}
]

web_directories = []`;
}

// Main method to create the shopify.app.toml file
async function scaffoldAppToml() {
  const extensionFiles = await findAllExtensionFiles();

  // Transform paths to be relative to root and exclude the filenames
  const extensionDirectories = extensionFiles.map(filePath => path.relative(ROOT_DIR, path.dirname(filePath)));

  // Remove duplicates
  const uniqueDirectories = [...new Set(extensionDirectories)];

  // Build and write the toml content
  const tomlContent = buildTomlContent(uniqueDirectories);
  await fs.writeFile(OUTPUT_FILE, tomlContent, 'utf8');
  console.log(`Created ${OUTPUT_FILE}`);
}

scaffoldAppToml().catch(error => {
  console.error('Error creating shopify.app.toml file:', error);
  process.exit(1);
});