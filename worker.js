console.log("running code from worker ");
self.addEventListener("message", () => {
  setTimeout(() => {
    self.postMessage("from worker");
  }, 0);
});
