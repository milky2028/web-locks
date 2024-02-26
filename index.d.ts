import { MainModule } from "./extract";

declare global {
  namespace WebAssembly {
    export class Exception {}
  }
}

type Extended = {
  getExceptionMessage(error: WebAssembly.Exception): [string, string];
  HEAPU8: Uint8Array;
};

export default function initialize(): Promise<MainModule & Extended>;
