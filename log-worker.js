console.log("Logging from worker");

self.addEventListener("message", () => {
  console.log("logging from worker listener");
});
