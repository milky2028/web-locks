import { ignore } from "./ignore.js";

export async function getPathHandle(path, options) {
  try {
    if (path.startsWith("./") || !path.startsWith("/")) {
      throw new Error(
        `getPathHandle can only be used with absolute paths, attempted path: ${path}`
      );
    }

    const kind = options?.kind ?? "file";
    const create = options?.create ?? false;

    const segments = path.split("/").filter(Boolean);
    const fileName = kind === "file" ? segments.pop() : "";

    let directory = await navigator.storage.getDirectory();
    if (path === "/" && kind === "directory") {
      return directory;
    }

    if ((path === "/" && kind === "file") || fileName === undefined) {
      throw new Error(`Invalid path: ${path}`);
    }

    for (const segment of segments) {
      // eslint-disable-next-line no-await-in-loop
      directory = await directory.getDirectoryHandle(segment, { create });
    }

    return kind === "directory"
      ? directory
      : await directory.getFileHandle(fileName, { create });
  } catch (error) {
    ignore(error);
    return undefined;
  }
}
