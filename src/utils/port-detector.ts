/**
 * OpenCode Serve Port Detection Utility
 * 
 * Utility to detect the port where opencode serve is running
 * since it may choose a random port if 53998 is occupied.
 * 
 * @author Joshua Rentrope <joshua@opencode.ai>
 * @issue JOS-145
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Detect the port where opencode serve is running
 */
export async function detectOpenCodeServePort(): Promise<string> {
  try {
    // Try to detect from running processes
    const { stdout } = await execAsync('netstat -an | findstr LISTEN | findstr 127.0.0.1', { 
      shell: 'cmd.exe'
    });
    
    // Look for common opencode serve ports
    const commonPorts = [53998, 53999, 54000, 54001, 54002];
    
    for (const port of commonPorts) {
      if (stdout.includes(`127.0.0.1:${port}`)) {
        console.log(`🔍 Detected OpenCode serve running on port ${port}`);
        return `http://127.0.0.1:${port}`;
      }
    }
    
    // Try default port if no specific port found
    console.log('🔍 Using default OpenCode serve port 53998');
    return 'http://127.0.0.1:53998';
    
  } catch (error) {
    console.log('🔍 Could not detect port, using default 53998');
    return 'http://127.0.0.1:53998';
  }
}

/**
 * Test if opencode serve is available on a specific URL
 */
export async function testOpenCodeServeUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get the best available opencode serve URL
 */
export async function getOpenCodeServeUrl(): Promise<string> {
  const configuredUrl = process.env.OPENCODE_SERVE_URL;
  
  // If explicitly configured, test it
  if (configuredUrl) {
    const isWorking = await testOpenCodeServeUrl(configuredUrl);
    if (isWorking) {
      console.log(`✅ Using configured OpenCode serve URL: ${configuredUrl}`);
      return configuredUrl;
    } else {
      console.warn(`⚠️ Configured URL ${configuredUrl} not responding, detecting port...`);
    }
  }
  
  // Detect port automatically
  const detectedUrl = await detectOpenCodeServePort();
  const isWorking = await testOpenCodeServeUrl(detectedUrl);
  
  if (isWorking) {
    console.log(`✅ Using detected OpenCode serve URL: ${detectedUrl}`);
    return detectedUrl;
  }
  
  // Fallback to default
  console.warn(`⚠️ Could not detect working OpenCode serve, using default`);
  return 'http://127.0.0.1:53998';
}