import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const port = 8080;

async function handler(): Promise<Response> {
  const body = await Deno.readFile("./index.html");

  return new Response(body, { status: 200 });
}

console.log(`HTTP webserver running. Access it at: http://localhost:8080/`);
await serve(handler, { port });
