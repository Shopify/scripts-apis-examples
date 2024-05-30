import fs from 'fs/promises';
import path from 'path';
import fastGlob from 'fast-glob';

const SETTINGS_PATH = './.vscode/settings.json';
const ROOT_DIR = '.';

async function findAllCargoTomlFiles() {
  // Find all Cargo.toml files recursively from the root directory
  const pattern = '**/Cargo.toml';
  const files = await fastGlob(pattern, { cwd: ROOT_DIR, absolute: true });
  return files.map(file => path.relative(ROOT_DIR, file).replace(/\\/g, '/'));
}

async function loadSettingsJson() {
  const content = await fs.readFile(SETTINGS_PATH, 'utf8');
  return JSON.parse(content);
}

async function writeSettingsJson(settings) {
  const content = JSON.stringify(settings, null, 2);
  await fs.writeFile(SETTINGS_PATH, content, 'utf8');
}

async function validateAndUpdateSettings() {
  const cargoTomlFiles = await findAllCargoTomlFiles();
  const settings = await loadSettingsJson();

  const linkedProjects = new Set(settings['rust-analyzer.linkedProjects']);
  const missingFiles = cargoTomlFiles.filter(file => !linkedProjects.has(file));

  if (missingFiles.length > 0) {
    console.log(`Missing Cargo.toml files in settings.json: ${missingFiles}`);
    missingFiles.forEach(file => linkedProjects.add(file));
  }
  
  settings['rust-analyzer.linkedProjects'] = Array.from(linkedProjects).sort();

  await writeSettingsJson(settings);
  console.log('settings.json updated and sorted.');
}

validateAndUpdateSettings().catch(error => {
  console.error('Error validating and updating settings:', error);
  process.exit(1);
});