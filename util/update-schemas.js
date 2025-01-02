import fs from 'fs/promises';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const APP_TOML_FILE = 'shopify.app.toml';
const COMMAND_TEMPLATE = 'shopify app function schema';

// Method to read shopify.app.toml and extract needed configuration
async function getConfig() {
  try {
    const content = await fs.readFile(APP_TOML_FILE, 'utf8');
    const lines = content.split('\n');
    
    const config = {
      clientId: '',
      directories: []
    };

    let inExtensionDirectories = false;
    const regex = /"([^"]+)"/g;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Extract client_id
      if (trimmedLine.startsWith('client_id')) {
        const match = line.match(regex);
        if (match) {
          config.clientId = match[0].replace(/"/g, '');
        }
        continue;
      }

      // Check if we're entering the extension_directories section
      if (trimmedLine.startsWith('extension_directories')) {
        inExtensionDirectories = true;
        continue;
      }

      // Check if we're leaving the extension_directories section
      if (inExtensionDirectories && trimmedLine.startsWith(']')) {
        inExtensionDirectories = false;
        continue;
      }

      // Extract directories only when in extension_directories section
      if (inExtensionDirectories && trimmedLine.startsWith('"')) {
        const match = trimmedLine.match(regex);
        if (match) {
          config.directories.push(match[0].replace(/"/g, ''));
        }
      }
    }

    return config;
  } catch (error) {
    console.error(`Error reading ${APP_TOML_FILE}:`, error);
    throw error;
  }
}

// Method to run the command for each directory
async function updateSchemas() {
  try {
    const config = await getConfig();

    if (!config.clientId) {
      throw new Error('Client ID not found in shopify.app.toml');
    }

    for (const dir of config.directories) {
      const command = `${COMMAND_TEMPLATE} --path ${dir} --client-id ${config.clientId}`;
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