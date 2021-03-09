/* eslint-env browser */
/// <reference lib="DOM" />

interface HMRInfo {
  type: string;
  chain: Array<string | number>;
  error?: Error;
  moduleId: string | number;
}

interface HotModule {
  hot: {
    status():
      | 'idle'
      | 'check'
      | 'prepare'
      | 'ready'
      | 'dispose'
      | 'apply'
      | 'abort'
      | 'fail';
    check(autoPlay: boolean): Promise<Array<string | number>>;
    apply(options: {
      ignoreUnaccepted?: boolean;
      ignoreDeclined?: boolean;
      ignoreErrored?: boolean;
      onDeclined?: (info: HMRInfo) => void;
      onUnaccepted?: (info: HMRInfo) => void;
      onAccepted?: (info: HMRInfo) => void;
      onDisposed?: (info: HMRInfo) => void;
      onErrored?: (info: HMRInfo) => void;
    }): Promise<Array<string | number>>;
  };
}

declare var __resourceQuery: string;
declare var __webpack_hash__: string;
declare var __webpack_require__: { l: Function };
declare var module: HotModule;

import querystring from 'querystring';
import type { HMRMessage, HMRMessageBody } from '../types';

class HmrEvent {
  target: { src: string };

  constructor(public type: string, src: string) {
    this.target = { src };
  }
}

class HMRClient {
  url: string;
  socket: WebSocket;
  lastHash = '';

  constructor(
    host: string,
    private app: {
      reload: () => void;
      dismissErrors: () => void;
      LoadingView: {
        showMessage(text: string, type: 'load' | 'refresh'): void;
        hide(): void;
      };
    }
  ) {
    this.url = `ws://${host}/__hmr`;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      console.log('[HMRClient] connected');
    };

    this.socket.onclose = () => {
      console.log('[HMRClient] disconnected');
    };

    this.socket.onerror = (event) => {
      console.log('[HMRClient] error', event);
    };

    this.socket.onmessage = (event) => {
      try {
        this.processMessage(JSON.parse(event.data.toString()));
      } catch (error) {
        console.warn('[HMRClient] Invalid HMR message', { event, error });
      }
    };
  }

  upToDate(hash?: string) {
    if (hash) {
      this.lastHash = hash;
    }
    return this.lastHash === __webpack_hash__;
  }

  processMessage(message: HMRMessage) {
    switch (message.action) {
      case 'building':
        this.app.LoadingView.showMessage('Rebuilding...', 'refresh');
        console.log('[HMRClient] Bundle rebuilding', {
          name: message.body?.name,
        });
        break;
      case 'built':
        console.log('[HMRClient] Bundle rebuilt', {
          name: message.body?.name,
          time: message.body?.time,
        });
      // Fall through
      case 'sync':
        if (!message.body) {
          console.warn('[HMRClient] HMR message body is empty');
          return;
        }

        if (message.body.errors?.length) {
          message.body.errors.forEach((error) => {
            console.error('Cannot apply update due to error:', error);
          });
          this.app.LoadingView.hide();
          return;
        }

        if (message.body.warnings?.length) {
          message.body.warnings.forEach((warning) => {
            console.warn('[HMRClient] Bundle contains warnings:', warning);
          });
        }

        this.applyUpdate(message.body);
    }
  }

  applyUpdate(update: HMRMessageBody) {
    if (!module.hot) {
      throw new Error('[HMRClient] Hot Module Replacement is disabled.');
    }

    if (!this.upToDate(update.hash) && module.hot.status() === 'idle') {
      console.log('[HMRClient] Checking for updates on the server...');
      this.checkUpdates(update);
    }
  }

  async checkUpdates(update: HMRMessageBody) {
    try {
      this.app.LoadingView.showMessage('Refreshing...', 'refresh');
      const updatedModules = await module.hot.check(false);
      if (!updatedModules) {
        console.warn('[HMRClient] Cannot find update - full reload needed');
        this.app.reload();
        return;
      }

      const renewedModules = await module.hot.apply({
        ignoreDeclined: true,
        ignoreUnaccepted: false,
        ignoreErrored: false,
        onDeclined: (data) => {
          // This module declined update, no need to do anything
          console.warn('[HMRClient] Ignored an update due to declined module', {
            chain: data.chain,
          });
        },
      });

      if (!this.upToDate()) {
        this.checkUpdates(update);
      }

      // Double check to make sure all updated modules were accepted (renewed)
      const unacceptedModules = updatedModules.filter((moduleId) => {
        return renewedModules && renewedModules.indexOf(moduleId) < 0;
      });

      if (unacceptedModules.length) {
        console.warn(
          '[HMRClient] Not every module was accepted - full reload needed',
          { unacceptedModules }
        );
        this.app.reload();
      } else {
        console.log('[HMRClient] Renewed modules - app is up to date', {
          renewedModules,
        });
        this.app.dismissErrors();
      }
    } catch (error) {
      if (module.hot.status() === 'fail' || module.hot.status() === 'abort') {
        console.warn(
          '[HMRClient] Cannot check for update - full reload needed'
        );
        console.warn('[HMRClient]', error);
        this.app.reload();
      } else {
        console.warn('[HMRClient] Update check failed', { error });
      }
    } finally {
      this.app.LoadingView.hide();
    }
  }
}

if (__resourceQuery) {
  const query = querystring.parse(__resourceQuery.slice(1));
  const host = query.host as string | undefined | null;

  if (!host) {
    console.warn(
      'Host resource query is missing in HMRClient - HMR cannot be initialized.'
    );
  } else {
    // TODO: move it somewhere else
    __webpack_require__.l = async (
      url: string,
      cb: (event?: HmrEvent) => void
    ) => {
      const response = await fetch(url);
      if (!response.ok) {
        cb(new HmrEvent(response.statusText, url));
      } else {
        const script = await response.text();
        try {
          const factory = new Function(script);
          factory.call(this);
          cb();
        } catch (error) {
          console.error('[__webpack_require__.l] Error:', error);
          cb(new HmrEvent('exec', url));
        }
      }
    };

    const { DevSettings, Platform } = require('react-native');
    const LoadingView = require('react-native/Libraries/Utilities/LoadingView');

    const reload = () => DevSettings.reload();
    const dismissErrors = () => {
      if (Platform.OS === 'ios') {
        const NativeRedBox = require('react-native/Libraries/NativeModules/specs/NativeRedBox')
          .default;
        NativeRedBox?.dismiss?.();
      } else {
        const NativeExceptionsManager = require('react-native/Libraries/Core/NativeExceptionsManager')
          .default;
        NativeExceptionsManager?.dismissRedbox();
      }

      const LogBoxData = require('react-native/Libraries/LogBox/Data/LogBoxData');
      LogBoxData.clear();
    };

    new HMRClient(host, { reload, dismissErrors, LoadingView });
  }
}