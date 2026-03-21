// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  output:  'server',  // SSR global ; pages statiques via export const prerender = true
  adapter: netlify(),
});
