import { registerPlugin } from '@capacitor/core';

import type { MyPrinterPlugin } from './definitions';

const MyPrinter = registerPlugin<MyPrinterPlugin>('MyPrinter', {
  web: () => import('./web').then((m) => new m.MyPrinterWeb()),
});

export * from './definitions';
export { MyPrinter };
