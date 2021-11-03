import path from 'path';
import process from 'process';
import { parseCliOptions } from './internal/parseCliOptions';

/**
 * getHermesCLIPath
 * finds the Hermes Engine Node PKG installed and creates a path to the proper folder to use for Hermes Binary
 * @param projectDir - Current Project Directory or main project to find node_modules
 * @returns hermesCLIPath
 */
export function getHermesCLIPath(projectDir: string): string {
  const OS =
    process.platform === 'win32'
      ? 'win64-bin'
      : process.platform === 'darwin'
      ? 'osx-bin'
      : 'linux64-bin';
  const cliOptions = parseCliOptions();

  if (!cliOptions) {
    return path.join(projectDir, 'node_modules/hermes-engine/', OS, 'hermesc');
  }

  return path.join(
    cliOptions.config.reactNativePath,
    '../hermes-engine',
    OS,
    'hermesc'
  );
}
