// Boot: load the meshes, start the 3D viewer (or a stand-in without WebGL), then the app.

import { loadPack, Viewer, NullViewer } from './viewer.js';
import { App } from './app.js';

const boot = document.getElementById('boot');
const bootText = document.getElementById('boot-text');

async function main() {
  let viewer;
  let webgl = true;
  try {
    const pack = await loadPack('assets/foot.pack');
    viewer = new Viewer(document.getElementById('gl'), pack);
  } catch (err) {
    console.error(err);
    viewer = new NullViewer();
    webgl = false;
  }
  const app = new App({ viewer, webgl });
  window.skeletype = app;
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 500);
  app.start();
  if (!webgl) app.toast('3D is unavailable in this browser, so the bones are hidden. Typing still works.', 7000);
}

main().catch((err) => {
  console.error(err);
  bootText.textContent = `Something went wrong: ${err.message}`;
});
