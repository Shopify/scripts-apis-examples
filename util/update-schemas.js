import fs from 'fs/promises';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const APP_TOML_FILE = 'shopify.app.toml';
const COMMAND_TEMPLATE = 'shopify app function schema --path ';

// Method to read shopify.app.toml and extract the extension directories
async function getExtensionDirectories() {
  try {
    const content = await fs.readFile(APP_TOML_FILE, 'utf8');
    const lines = content.split('\n');

    // Regular expression to match the extension directories
    const regex = /'([^']+)'/g;
    let match;
    const directories = [];

    // Extract all directories from the lines
    for (const line of lines) {
      while (match = regex.exec(line)) {
        directories.push(match[1]);
      }
    }

    return directories;
  } catch (error) {
    console.error(`Error reading ${APP_TOML_FILE}:`, error);
    throw error;
  }
}

// Method to run the command for each directory
async function updateSchemas() {
  try {
    const directories = await getExtensionDirectories();

    for (const dir of directories) {
      const command = `${COMMAND_TEMPLATE}${dir}`;
      console.log(`Running: ${command}`);

      try {
        const { stdout, stderr } = await execPromise(command);
        if (stdout) console.log(`Output:\n${stdout}`);
        if (stderr) console.error(`Error:\n${stderr}`);
      } catch (error) {
        console.error(`Failed to execute ${command}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to update schemas:', error);
  }
}

updateSchemas().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});