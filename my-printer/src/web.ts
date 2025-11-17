// Dateipfad: my-printer/src/web.ts

import { WebPlugin } from '@capacitor/core';

import type { MyPrinterPlugin } from './definitions';

export class MyPrinterWeb extends WebPlugin implements MyPrinterPlugin {
  async printHtml(options: { content: string, jobName?: string }): Promise<void> {
    console.log('printHtml (Web):', options.jobName);
    // Fallback für den Browser (einfaches window.print)
    window.print();
    return Promise.resolve();
  }
}