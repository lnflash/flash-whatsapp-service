import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '@nestjs/common';

const execAsync = promisify(exec);
const logger = new Logger('ChromeCleanup');

interface ChromeProcess {
  pid: string;
  command: string;
}

export class ChromeCleanupUtil {
  private static readonly CHROME_PROCESS_PATTERNS = [
    'puppeteer',
    '--remote-debugging-port',
    '--user-data-dir',
    'whatsapp-sessions',
    '.wwebjs',
  ];

  private static readonly EXCLUDE_PATTERNS = [
    'Adobe',
    'Creative Cloud',
    'Google Chrome.app',
    'Microsoft',
    'Discord',
    'Slack',
    'Visual Studio',
    'Cursor',
  ];

  private static readonly SESSION_DIR_PATTERNS = [
    'puppeteer_dev_chrome_profile',
    'puppeteer_chrome',
    '.wwebjs_auth',
    '.wwebjs_cache',
  ];

  /**
   * Clean up all Chrome/Chromium processes and session directories
   */
  static async cleanup(): Promise<void> {
    logger.log('Starting Chrome cleanup process...');

    try {
      await Promise.all([
        this.killChromeProcesses(),
        this.cleanupSessionDirectories(),
        this.cleanupChromeLocks(),
      ]);

      logger.log('Chrome cleanup completed successfully');
    } catch (error) {
      logger.error('Error during Chrome cleanup:', error);
      // Don't throw - we want the app to continue even if cleanup fails
    }
  }

  /**
   * Find and kill Chrome/Chromium processes related to Puppeteer
   */
  private static async killChromeProcesses(): Promise<void> {
    const platform = os.platform();

    try {
      let processes: ChromeProcess[] = [];

      if (platform === 'darwin' || platform === 'linux') {
        processes = await this.findUnixChromeProcesses();
      } else if (platform === 'win32') {
        processes = await this.findWindowsChromeProcesses();
      }

      if (processes.length === 0) {
        logger.log('No Chrome/Chromium processes found');
        return;
      }

      logger.log(`Found ${processes.length} Chrome/Chromium processes to clean up`);

      for (const process of processes) {
        await this.killProcess(process.pid, platform);
      }

      logger.log(`Successfully killed ${processes.length} Chrome/Chromium processes`);
    } catch (error) {
      logger.error('Error killing Chrome processes:', error);
    }
  }

  /**
   * Find Chrome processes on Unix-like systems (macOS, Linux)
   */
  private static async findUnixChromeProcesses(): Promise<ChromeProcess[]> {
    const processes: ChromeProcess[] = [];

    try {
      // Use ps to find all Chrome-related processes
      const { stdout } = await execAsync('ps aux | grep -i chrome | grep -v grep || true');

      const lines = stdout.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        // Check if this process should be excluded
        const shouldExclude = this.EXCLUDE_PATTERNS.some((pattern) => line.includes(pattern));

        if (shouldExclude) {
          continue;
        }

        // Check if this process matches our patterns
        const matchesPattern = this.CHROME_PROCESS_PATTERNS.some((pattern) =>
          line.toLowerCase().includes(pattern.toLowerCase()),
        );

        if (matchesPattern) {
          const parts = line.split(/\s+/);
          const pid = parts[1];
          const command = parts.slice(10).join(' '); // Command is typically from column 11 onwards

          processes.push({ pid, command });
          logger.debug(`Found Chrome process: PID ${pid} - ${command.substring(0, 100)}...`);
        }
      }
    } catch (error) {
      logger.error('Error finding Unix Chrome processes:', error);
    }

    return processes;
  }

  /**
   * Find Chrome processes on Windows
   */
  private static async findWindowsChromeProcesses(): Promise<ChromeProcess[]> {
    const processes: ChromeProcess[] = [];

    try {
      // Use wmic to find Chrome processes
      const { stdout } = await execAsync(
        'wmic process where "name like \'%chrome%\'" get ProcessId,CommandLine /format:csv',
      );

      const lines = stdout.split('\n').filter((line) => line.trim() && !line.startsWith('Node'));

      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const command = parts[1];
          const pid = parts[2];

          // Check if this process should be excluded
          const shouldExclude = this.EXCLUDE_PATTERNS.some((pattern) => command.includes(pattern));

          if (shouldExclude) {
            continue;
          }

          // Check if this process matches our patterns
          const matchesPattern = this.CHROME_PROCESS_PATTERNS.some((pattern) =>
            command.toLowerCase().includes(pattern.toLowerCase()),
          );

          if (matchesPattern) {
            processes.push({ pid, command });
            logger.debug(`Found Chrome process: PID ${pid} - ${command.substring(0, 100)}...`);
          }
        }
      }
    } catch (error) {
      logger.error('Error finding Windows Chrome processes:', error);
    }

    return processes;
  }

  /**
   * Kill a process by PID
   */
  private static async killProcess(pid: string, platform: string): Promise<void> {
    try {
      if (platform === 'win32') {
        await execAsync(`taskkill /F /PID ${pid}`);
      } else {
        // Try graceful kill first, then force kill if needed
        try {
          await execAsync(`kill -TERM ${pid}`);
          // Wait a bit for graceful shutdown
          await new Promise((resolve) => setTimeout(resolve, 1000));
          // Check if process still exists and force kill if needed
          await execAsync(`kill -0 ${pid} 2>/dev/null && kill -KILL ${pid} || true`);
        } catch {
          // Process might already be dead, which is fine
        }
      }
      logger.debug(`Killed process ${pid}`);
    } catch (error) {
      // Process might already be dead or we might not have permissions
      logger.debug(`Could not kill process ${pid}:`, error.message);
    }
  }

  /**
   * Clean up orphaned session directories
   */
  private static async cleanupSessionDirectories(): Promise<void> {
    const tempDir = os.tmpdir();
    const projectRoot = process.cwd();
    const searchDirs = [tempDir, projectRoot];

    let totalDeleted = 0;

    for (const searchDir of searchDirs) {
      try {
        const entries = await fs.readdir(searchDir);

        for (const entry of entries) {
          // Check if this entry matches our session directory patterns
          const matchesPattern = this.SESSION_DIR_PATTERNS.some((pattern) =>
            entry.toLowerCase().includes(pattern.toLowerCase()),
          );

          if (matchesPattern) {
            const fullPath = path.join(searchDir, entry);

            try {
              const stat = await fs.stat(fullPath);

              if (stat.isDirectory()) {
                await this.removeDirectory(fullPath);
                totalDeleted++;
                logger.debug(`Removed session directory: ${fullPath}`);
              }
            } catch (error) {
              logger.debug(`Could not remove ${fullPath}:`, error.message);
            }
          }
        }
      } catch (error) {
        logger.debug(`Could not search directory ${searchDir}:`, error.message);
      }
    }

    if (totalDeleted > 0) {
      logger.log(`Cleaned up ${totalDeleted} orphaned session directories`);
    } else {
      logger.log('No orphaned session directories found');
    }
  }

  /**
   * Recursively remove a directory
   */
  private static async removeDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      logger.debug(`Error removing directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Check if there are any Chrome processes running
   */
  static async hasRunningChromeProcesses(): Promise<boolean> {
    const platform = os.platform();

    try {
      let processes: ChromeProcess[] = [];

      if (platform === 'darwin' || platform === 'linux') {
        processes = await this.findUnixChromeProcesses();
      } else if (platform === 'win32') {
        processes = await this.findWindowsChromeProcesses();
      }

      return processes.length > 0;
    } catch (error) {
      logger.error('Error checking for Chrome processes:', error);
      return false;
    }
  }

  /**
   * Clean up Chrome lock files that might prevent new sessions
   */
  private static async cleanupChromeLocks(): Promise<void> {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    const sessionPaths = [
      path.join(process.cwd(), 'whatsapp-sessions'),
      path.join(process.cwd(), 'whatsapp-sessions-new'),
      '/app/whatsapp-sessions', // Docker path
      '/app/whatsapp-sessions-new',
    ];

    let totalDeleted = 0;

    for (const sessionPath of sessionPaths) {
      try {
        // Check if directory exists
        await fs.access(sessionPath);

        // Find all subdirectories
        const entries = await fs.readdir(sessionPath);

        for (const entry of entries) {
          const entryPath = path.join(sessionPath, entry);
          const stat = await fs.stat(entryPath);

          if (stat.isDirectory()) {
            // Check for lock files in this directory
            for (const lockFile of lockFiles) {
              const lockPath = path.join(entryPath, lockFile);
              try {
                await fs.unlink(lockPath);
                totalDeleted++;
                logger.debug(`Removed Chrome lock file: ${lockPath}`);
              } catch (error) {
                // File doesn't exist or can't be deleted, which is fine
              }
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be accessed, which is fine
      }
    }

    if (totalDeleted > 0) {
      logger.log(`Cleaned up ${totalDeleted} Chrome lock files`);
    }
  }
}
