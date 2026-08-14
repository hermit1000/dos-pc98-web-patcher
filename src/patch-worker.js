'use strict';

importScripts('vcdiff.js');

self.addEventListener('message', (event) => {
  const { id, source, patch } = event.data;
  try {
    const result = self.Vcdiff.applyVcdiff(source, patch);
    self.postMessage({ id, result: result.buffer }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});
