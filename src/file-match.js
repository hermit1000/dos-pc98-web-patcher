'use strict';

(function exposeFileMatcher(root) {
  async function matchMissingTargetsByHash(targets, files, digest) {
    const claimed = new Set(targets.map((item) => item.file).filter(Boolean));
    for (const item of targets) {
      if (item.file) continue;
      const matches = [];
      for (const { file } of files) {
        if (claimed.has(file) || (file.size !== item.target.originalSize && file.size !== item.target.patchedSize)) continue;
        const hash = await digest(file);
        if (hash === item.target.originalSha256 || hash === item.target.patchedSha256) matches.push(file);
      }
      if (matches.length === 1) {
        item.file = matches[0];
        item.matchedByHash = true;
        claimed.add(matches[0]);
      } else if (matches.length > 1) {
        item.ambiguous = true;
      }
    }
  }

  root.FileMatcher = { matchMissingTargetsByHash };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FileMatcher;
})(typeof window !== 'undefined' ? window : globalThis);
