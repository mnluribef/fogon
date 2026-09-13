/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type D1DatabaseEnv = {
  fogon: D1Database;
  DB: D1Database;
};

type Runtime = import('@astrojs/cloudflare').Runtime<D1DatabaseEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
