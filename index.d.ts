import { MainModule } from "./extract";

type ReadCallback = (path: string, buffer: Uint8Array) => void;

type LLVMStorageType =
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "float"
  | "double"
  | "i8*"
  | "i16*"
  | "i32*"
  | "i64*"
  | "float*"
  | "double*";

type Extended = {
  addFunction(func: Function, types: string): number;
  UTF8ToString(ptr: number, maxLength?: number): string;
  getValue(ptr: number, type: LLVMStorageType): number;
  setValue(ptr: number, value: any, type: LLVMStorageType): void;

  HEAPU8: Uint8Array;
  HEAP8: Uint8Array;
  FS: {
    writeFile(path: string, data: File): number;
  };
};

export default function initialize(): Promise<MainModule & Extended>;
