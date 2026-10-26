import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути: сборка работает и с корня сайта, и из подпапки (GitHub Pages: /typing-game/).
  base: './',
});
