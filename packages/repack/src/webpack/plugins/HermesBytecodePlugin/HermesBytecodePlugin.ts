import path from 'path';
import { exec } from 'child_process';
import webpack from 'webpack';
import { Rule, WebpackPlugin } from '../../../types';

const HERMES_BYTE_CODE_CLI = '-emit-binary -out';
const HERMES_OUTPUT_DIR = (output: string, filename: string) =>
  `${output}/${filename}.hbc`;

export interface HermesBytecodePluginConfig {
  devServerEnabled?: boolean;
  test?: Rule | Rule[];
  include?: Rule | Rule[];
  exclude?: Rule | Rule[];
  platform: string;
  hermesCLIPath?: string;
}

export class HermesBytecodePlugin implements WebpackPlugin {
  constructor(private config: HermesBytecodePluginConfig) {
    this.config = { ...this.config, ...config };
  }

  apply(compiler: webpack.Compiler) {
    const logger = compiler.getInfrastructureLogger('HermesByteCodeCompiler');

    const shouldUseHermesByteCode = (filename: string) =>
      webpack.ModuleFilenameHelpers.matchObject(this.config, filename);

    const hermesRunCmd = `${this.config.hermesCLIPath}osx-bin/hermesc ${HERMES_BYTE_CODE_CLI}`;
    const workingCmd = JSON.parse(process.env.RNWT_CLI_OPTIONS as string);

    const outputMainFilePath = path.join(
      workingCmd.arguments.bundle.bundleOutput,
      '../'
    );

    compiler.hooks.afterEmit.tap(
      'HermesBytecodeCompiler',
      (compilation: webpack.Compilation) => {
        const assetsInCompilation = compilation.getAssets();
        const outputDir = compilation.outputOptions.path?.toString();

        assetsInCompilation.forEach((asset: any) => {
          if (!shouldUseHermesByteCode(asset.name)) {
            return;
          }
          const assetPath = compilation.getPath(asset.name);
          logger.info(`CREATE BUNDLE ::: ${asset.name}`);
          const cmd = `${hermesRunCmd} ${HERMES_OUTPUT_DIR(
            outputMainFilePath,
            assetPath
          )} ${outputDir}/${assetPath} -output-source-map`;

          exec(`mkdir ${outputMainFilePath}`);
          exec(cmd, (error) => {
            if (error) {
              logger.info(`ERROR ::: ${assetPath} ::: ${error}`);
            }
            return;
          });
          return;
        });
        return;
      }
    );
  }
}
