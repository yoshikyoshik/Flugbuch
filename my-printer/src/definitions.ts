// Dateipfad: my-printer/src/definitions.ts

export interface MyPrinterPlugin {
  /**
   * Öffnet den nativen Druckdialog, um einen HTML-String zu drucken.
   */
  printHtml(options: {
    /**
     * Der zu druckende HTML-String.
     */
    content: string;
    /**
     * Der Name des Druck-Jobs (optional).
     */
    jobName?: string;
  }): Promise<void>;
}