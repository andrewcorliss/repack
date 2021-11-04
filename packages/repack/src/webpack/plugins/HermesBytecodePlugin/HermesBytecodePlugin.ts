import path from 'path';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';
import webpack from 'webpack';
import { Rule, WebpackPlugin } from '../../../types';

const getHermesOSBin = () => {
  switch (os.platform()) {
    case 'darwin':
      return 'osx-bin';
    case 'win32':
      return 'win64-bin';
    case 'linux':
      return 'linux64-bin';
    default:
      throw new Error(
        'OS not recognized. Please set hermesCLIPath to the path of a working Hermes compiler.'
      );
  }
};

const getHermesCLIPath = (root: string) => {
  const osBin = getHermesOSBin();
  return `${root}/node_modules/hermes-engine/${osBin}/hermesc`;
};

export interface HermesBytecodePluginConfig {
  devServerEnabled?: boolean;
  test?: Rule | Rule[];
  include?: Rule | Rule[];
  exclude?: Rule | Rule[];
  hermesCLIPath?: string;
  root: string;
}

export class HermesBytecodePlugin implements WebpackPlugin {
  config: HermesBytecodePluginConfig = {
    root: path.join(__dirname, '../../../../../'),
  };

  constructor(
    { root, ...config }: HermesBytecodePluginConfig = {
      root: path.join(__dirname, '../../../../../'),
    }
  ) {
    this.config = { ...this.config, root, ...config };
    this.config.root = root;
    this.config.hermesCLIPath = getHermesCLIPath(this.config.root);
  }

  apply(compiler: webpack.Compiler) {
    const logger = compiler.getInfrastructureLogger('HermesByteCodeCompiler');
    logger.info(this.config.root);
    const shouldUseHermesByteCode = (filename: string) =>
      webpack.ModuleFilenameHelpers.matchObject(this.config, filename);

    const workingCmd = JSON.parse(process.env.RNWT_CLI_OPTIONS as string);
    const { bundleOutput, sourcemapOutput } = workingCmd.arguments.bundle;
    const bundleOutputDir = path.dirname(bundleOutput);
    const sourcemapOutputDir = sourcemapOutput
      ? path.dirname(sourcemapOutput)
      : bundleOutputDir;

    compiler.hooks.afterEmit.tap(
      'HermesBytecodeCompiler',
      (compilation: webpack.Compilation) => {
        const assetsInCompilation = compilation.getAssets();

        assetsInCompilation.forEach((asset: any) => {
          if (!shouldUseHermesByteCode(asset.name)) {
            return;
          }
          const assetPath = compilation.getPath(asset.name);
          const bundleOutputPath =
            asset.name === 'index.bundle'
              ? bundleOutput
              : path.join(bundleOutputDir, compilation.getPath(asset.name));

          const sourcemapOutputPath = path.join(
            sourcemapOutputDir,
            `${path.basename(bundleOutputPath)}.map`
          );
          const packagerMapPath = path.join(
            bundleOutputDir,
            `${path.basename(bundleOutputPath)}.packager.map`
          );
          const hermesBundlePath = `${bundleOutputPath}.hbc`;
          const hermesMapPath = `${hermesBundlePath}.map`;

          if (fs.existsSync(sourcemapOutputPath)) {
            fs.renameSync(sourcemapOutputPath, packagerMapPath);

            exec(
              [
                this.config.hermesCLIPath,
                '-w', // silence warnings
                '-O', // Enable optimizations
                '-output-source-map',
                '-emit-binary',
                `-out ${hermesBundlePath}`,
                bundleOutputPath,
              ].join(' '),
              (error) => {
                if (error) {
                  return logger.info(
                    `ERROR HERMES BYTE COMPILE ::: ${assetPath} ::: ${error}`
                  );
                }
                fs.unlinkSync(bundleOutputPath);
                fs.renameSync(hermesBundlePath, bundleOutputPath);
                exec(
                  [
                    'node',
                    path.join(
                      this.config.root,
                      '/node_modules/react-native/scripts/compose-source-maps.js'
                    ),
                    packagerMapPath,
                    hermesMapPath,
                    `-o ${sourcemapOutputPath}`,
                  ].join(' '),
                  (error) => {
                    if (error) {
                      return logger.info(`ERROR HERMES SOURCEMAP ::: ${error}`);
                    }
                    fs.unlinkSync(hermesMapPath);
                    fs.unlinkSync(packagerMapPath);
                  }
                );
              }
            );
          }
        });
      }
    );
  }
}
