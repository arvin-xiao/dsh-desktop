/// <reference types="vite/client" />
import type { DshDesktopApi } from '../preload';

declare global {
  interface Window {
    dsh: DshDesktopApi;
  }
}
export {};
