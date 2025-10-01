console.log("running code from worker", globalThis.sessionStorage);

self.addEventListener("message", () => {
  setTimeout(() => {
    self.postMessage("from worker");
  }, 0);
});
