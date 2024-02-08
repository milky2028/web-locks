/// <reference lib="WebWorker" />;

const __old = FileSystemSyncAccessHandle.prototype.read;
FileSystemSyncAccessHandle.prototype.read = function (...args) {
  console.log("hacked");
  return __old.apply(this, args);
};
