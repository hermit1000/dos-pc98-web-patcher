'use strict';

let games = [];

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`데이터를 불러오지 못했습니다: ${url} (${response.status})`);
  return response.json();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function gameCard(game, index) {
  return `<a class="game-card" href="patcher.html?game=${encodeURIComponent(game.id)}" style="--delay:${index * 55}ms">
    <div class="card-art palette-${escapeHtml(game.palette)}${game.cover ? ' has-cover' : ''}">
      ${game.cover ? `<img src="${escapeHtml(game.cover)}" alt="${escapeHtml(game.title)} 타이틀 화면" loading="lazy">` : ''}
      <span class="card-platform">${escapeHtml(game.platform)}</span>
      <b>${escapeHtml(game.mark)}</b>
      <span class="card-year">${escapeHtml(game.year)}</span>
    </div>
    <div class="card-body">
      <div class="card-kicker"><span>${escapeHtml(game.genre)}</span><span>${escapeHtml(game.status)}</span></div>
      <h3>${escapeHtml(game.title)}</h3>
      <p>${escapeHtml(game.originalTitle)}</p>
      <div class="card-footer"><span>${escapeHtml(game.version)}</span><span>패치 페이지로 <b>↗</b></span></div>
    </div>
  </a>`;
}

function initializeCatalog() {
  const grid = document.querySelector('#game-grid');
  const search = document.querySelector('#search-input');
  const sortSelect = document.querySelector('#sort-select');
  const filters = [...document.querySelectorAll('.filter-button')];
  const empty = document.querySelector('#empty-state');
  const resultCount = document.querySelector('#result-count');
  let platform = 'all';

  document.querySelector('#game-count').textContent = games.length;

  function render() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    const visible = games.filter((game) => {
      const matchesPlatform = platform === 'all' || game.platform === platform;
      const haystack = `${game.title} ${game.originalTitle} ${game.englishTitle || ''} ${game.developer || ''} ${game.genre}`.toLocaleLowerCase('ko');
      return matchesPlatform && haystack.includes(query);
    });
    const sorters = {
      released: (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'ko'),
      title: (a, b) => a.title.localeCompare(b.title, 'ko'),
      year: (a, b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title, 'ko'),
      platform: (a, b) => a.platform.localeCompare(b.platform, 'en') || a.title.localeCompare(b.title, 'ko')
    };
    visible.sort(sorters[sortSelect.value] || sorters.released);
    grid.innerHTML = visible.map(gameCard).join('');
    empty.hidden = visible.length !== 0;
    resultCount.textContent = `${visible.length} / ${games.length} TITLES`;
  }

  search.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
  filters.forEach((button) => button.addEventListener('click', () => {
    platform = button.dataset.platform;
    filters.forEach((item) => item.classList.toggle('active', item === button));
    render();
  }));
  render();
}

function normalizeRelativePath(value) {
  const normalized = String(value).replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '..')) {
    throw new Error(`안전하지 않은 상대 경로입니다: ${value}`);
  }
  return normalized;
}

async function sha256(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function validateManifest(manifest) {
  if (!manifest || manifest.format !== 'folder-patch-v1' || !Array.isArray(manifest.targets)) throw new Error('지원하지 않는 패치 manifest입니다.');
  const paths = new Set();
  for (const target of manifest.targets) {
    target.path = normalizeRelativePath(target.path);
    target.patch = normalizeRelativePath(target.patch);
    const key = target.path.toLocaleUpperCase('en-US');
    if (paths.has(key)) throw new Error(`중복 패치 대상입니다: ${target.path}`);
    paths.add(key);
    if (!/^[a-f0-9]{64}$/.test(target.originalSha256) || !/^[a-f0-9]{64}$/.test(target.patchedSha256)) throw new Error(`SHA-256 정보가 잘못되었습니다: ${target.path}`);
    if (!Number.isSafeInteger(target.originalSize) || !Number.isSafeInteger(target.patchedSize) || target.originalSize < 0 || target.patchedSize < 0) throw new Error(`파일 크기 정보가 잘못되었습니다: ${target.path}`);
  }
  for (const asset of manifest.sharedAssets || []) {
    asset.source = normalizeRelativePath(asset.source);
    asset.outputPath = normalizeRelativePath(asset.outputPath || `_emulator-font/${asset.fileName}`);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size < 0) throw new Error(`공용 에셋 정보가 잘못되었습니다: ${asset.id}`);
  }
  return manifest;
}

function createPatchWorker() {
  const worker = new Worker('src/patch-worker.js');
  let sequence = 0;
  const pending = new Map();
  worker.addEventListener('message', (event) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(new Uint8Array(event.data.result));
  });
  worker.addEventListener('error', (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || '패치 작업자 오류입니다.'));
    pending.clear();
  });
  return {
    apply(source, patch) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, source, patch }, [source, patch]);
      });
    },
    close() { worker.terminate(); }
  };
}

function downloadBytes(bytes, fileName, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function initializeDetail() {
  const requestedId = new URLSearchParams(location.search).get('game');
  const catalogEntry = games.find((item) => item.id === requestedId) || games[0];
  if (!catalogEntry) return;
  const game = catalogEntry.data ? { ...catalogEntry, ...await loadJson(catalogEntry.data) } : catalogEntry;

  document.title = `${game.title} 한국어 패치 — 2KOR LAB`;
  const values = {
    'detail-platform-top': game.platform,
    'detail-platform': game.platform,
    'detail-status': game.status,
    'detail-title': game.title,
    'detail-subtitle': `${game.developer || game.originalTitle} · ${game.platform} · ${game.year}`,
    'detail-version': game.version,
    'detail-date': game.date,
    'detail-release': game.release || game.year,
    'detail-developer': game.developer || '-',
    'detail-original': game.original,
    'detail-story': game.story,
    'art-monogram': game.mark,
    'requirement-platform': game.platform === 'PC-98' ? 'NEC PC-9801 · MS-DOS' : 'IBM PC 호환기종 · MS-DOS',
    'requirement-files': `${game.files}개`
  };
  Object.entries(values).forEach(([id, value]) => { document.querySelector(`#${id}`).textContent = value; });
  document.querySelector('#detail-art').classList.add(`palette-${game.palette}`);
  if (game.koreanTitle || game.originalTitle || game.englishTitle) {
    const titles = document.querySelector('#detail-titles');
    const titleRows = [
      ['KO', game.koreanTitle || game.title],
      ['JP', game.originalTitle],
      ['EN', game.englishTitle]
    ].filter(([, value]) => value);
    titles.innerHTML = titleRows.map(([language, value]) => `<span><b>${language}</b>${escapeHtml(value)}</span>`).join('');
    titles.hidden = false;
  }
  if (game.cover) {
    const detailArt = document.querySelector('#detail-art');
    const detailCover = document.querySelector('#detail-cover');
    detailCover.src = game.cover;
    detailCover.alt = `${game.title} 타이틀 화면`;
    detailArt.classList.add('has-cover');
    detailArt.removeAttribute('aria-hidden');
  }

  if (game.verifiedOriginals?.length) {
    const verified = document.querySelector('#verified-originals');
    verified.querySelector('ul').innerHTML = game.verifiedOriginals.map((original) => `<li><span aria-hidden="true">✓</span><code>${escapeHtml(original.label)}</code></li>`).join('');
    verified.hidden = false;
  }
  if (game.screenshots?.length) {
    const screenshotGrid = document.querySelector('#screenshot-grid');
    screenshotGrid.classList.toggle('single', game.screenshots.length === 1);
    screenshotGrid.innerHTML = game.screenshots.map((shot) => `<figure class="screen">
      <img src="${escapeHtml(shot.src)}" alt="${escapeHtml(shot.alt)}" loading="lazy">
      <figcaption>${escapeHtml(shot.caption)}</figcaption>
    </figure>`).join('');
  }
  if (game.credits?.length) {
    const introCredits = document.querySelector('#intro-credits');
    const names = [];
    game.credits.forEach((credit) => {
      credit.name.split(',').map((name) => name.trim()).filter(Boolean).forEach((name) => {
        if (!names.includes(name)) names.push(name);
      });
    });
    introCredits.querySelector('p').textContent = names.join(' · ');
    introCredits.hidden = false;
  }
  const legacyPost = game.references?.find((reference) => reference.type === 'legacy-post');
  if (legacyPost?.url) {
    const originalPostLink = document.querySelector('#original-post-link');
    originalPostLink.href = legacyPost.url;
    originalPostLink.hidden = false;
  }
  const input = document.querySelector('#folder-input');
  const dropZone = document.querySelector('#drop-zone');
  const result = document.querySelector('#dummy-result');
  const patchButton = document.querySelector('#patch-button');
  const fileResults = document.querySelector('#file-results');
  const progress = document.querySelector('#patch-progress');
  const progressBar = progress.querySelector('span');
  const progressText = progress.querySelector('b');
  let manifest;
  let manifestUrl;
  let selectedTargets = [];
  let lastZip = null;

  function setResult(label, summary, message) {
    document.querySelector('#result-label').textContent = label;
    document.querySelector('#selected-summary').textContent = summary;
    document.querySelector('#result-message').textContent = message;
    result.hidden = false;
  }

  function renderTargetResults() {
    fileResults.innerHTML = selectedTargets.map(({ target, status }) => {
      const labels = { ready: ['✓', '패치 가능'], patched: ['✓', '이미 패치됨'], missing: ['×', '파일 없음'], mismatch: ['×', '다른 원본'], checking: ['…', '검사 중'], applied: ['✓', '완료'] };
      const [symbol, label] = labels[status] || ['!', '오류'];
      const className = ['ready', 'patched', 'applied'].includes(status) ? (status === 'patched' ? 'patched' : 'ready') : status === 'checking' ? '' : 'error';
      return `<div class="file-result ${className}" data-target="${escapeHtml(target.path)}"><span>${symbol}</span><b>${escapeHtml(target.path)}</b><small>${label}</small></div>`;
    }).join('');
    fileResults.hidden = false;
  }

  function updateTargetStatus(path, status) {
    const item = selectedTargets.find((entry) => entry.target.path === path);
    if (item) item.status = status;
    renderTargetResults();
  }

  function updateProgress(done, total, message) {
    progress.hidden = false;
    progressBar.style.width = `${total ? Math.round(done / total * 100) : 0}%`;
    progressText.textContent = `${message} · ${done}/${total}`;
  }

  async function loadManifest() {
    if (!game.package) {
      input.disabled = true;
      setResult('준비 중', game.title, '이 게임은 UI 예시이며 실제 패치 패키지가 아직 등록되지 않았습니다.');
      return;
    }
    try {
      manifestUrl = new URL(game.package, document.baseURI);
      const response = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`manifest 다운로드 실패 (${response.status})`);
      manifest = validateManifest(await response.json());
      document.querySelector('#requirement-files').textContent = `${manifest.targets.length}개`;
      input.disabled = false;
    } catch (error) {
      input.disabled = true;
      setResult('패키지 오류', game.title, error.message);
    }
  }

  async function showSelection(fileList) {
    const files = [...fileList];
    if (!files.length || !manifest) return;
    const firstPath = files[0].webkitRelativePath || files[0].name;
    const folderName = firstPath.includes('/') ? firstPath.split('/')[0] : '선택한 항목';
    document.querySelector('#folder-title').textContent = folderName;
    document.querySelector('#folder-help').textContent = `${files.length.toLocaleString('ko-KR')}개 파일을 선택했습니다.`;
    dropZone.classList.add('has-files');
    patchButton.disabled = true;
    lastZip = null;
    patchButton.textContent = '파일 검사 중…';
    setResult('SHA-256 검사', `${folderName} · ${files.length.toLocaleString('ko-KR')} files`, '패치 대상 파일을 확인하고 있습니다.');

    const fileMap = new Map();
    const fileEntries = [];
    const duplicatePaths = new Set();
    for (const file of files) {
      const suppliedPath = (file.webkitRelativePath || file.name).replaceAll('\\', '/');
      const relative = suppliedPath.includes('/') ? suppliedPath.split('/').slice(1).join('/') : suppliedPath;
      const key = relative.toLocaleUpperCase('en-US');
      if (fileMap.has(key)) duplicatePaths.add(relative);
      fileMap.set(key, file);
      fileEntries.push({ path: relative, file });
    }
    if (duplicatePaths.size) {
      setResult('폴더 오류', folderName, `대소문자만 다른 중복 경로가 있습니다: ${[...duplicatePaths][0]}`);
      return;
    }

    selectedTargets = manifest.targets.map((target) => {
      const targetKey = target.path.toLocaleUpperCase('en-US');
      let file = fileMap.get(targetKey);
      if (!file) {
        const suffix = `/${targetKey}`;
        const matches = fileEntries.filter((entry) => entry.path.toLocaleUpperCase('en-US').endsWith(suffix));
        if (matches.length === 1) file = matches[0].file;
      }
      return { target, file, status: 'checking' };
    });
    renderTargetResults();
    let checked = 0;
    for (const item of selectedTargets) {
      if (!item.file) {
        item.status = 'missing';
      } else if (item.file.size !== item.target.originalSize && item.file.size !== item.target.patchedSize) {
        item.status = 'mismatch';
      } else {
        const hash = await sha256(await item.file.arrayBuffer());
        item.status = hash === item.target.originalSha256 ? 'ready' : hash === item.target.patchedSha256 ? 'patched' : 'mismatch';
      }
      checked += 1;
      renderTargetResults();
      setResult('SHA-256 검사', `${folderName} · ${checked}/${selectedTargets.length}`, '선택한 게임 파일은 브라우저 밖으로 전송되지 않습니다.');
    }
    const errors = selectedTargets.filter((item) => ['missing', 'mismatch'].includes(item.status));
    const ready = selectedTargets.filter((item) => item.status === 'ready');
    if (errors.length) {
      setResult('패치 불가', `${errors.length}개 파일 확인 필요`, '지원되는 일본어판 원본 폴더인지 확인해 주세요. 어떤 파일도 변경되지 않았습니다.');
      patchButton.textContent = '원본을 확인해 주세요';
      return;
    }
    setResult('검사 완료', `${ready.length}개 패치 가능`, ready.length ? '모든 대상 파일이 확인됐습니다. 결과는 ZIP으로 내려받습니다.' : '모든 대상 파일이 이미 패치되어 있습니다.');
    patchButton.disabled = false;
    patchButton.textContent = ready.length ? '한국어 패치 ZIP 만들기' : '공용 폰트 ZIP 받기';
  }

  input.disabled = true;
  input.addEventListener('change', () => { showSelection(input.files).catch((error) => setResult('검사 오류', game.title, error.message)); });
  async function collectDroppedFiles(dataTransfer) {
    const items = [...(dataTransfer.items || [])];
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return [...dataTransfer.files];
    const files = [];
    const readDirectory = (directory) => new Promise((resolve, reject) => {
      const reader = directory.createReader();
      const collected = [];
      const readBatch = () => reader.readEntries((batch) => {
        if (!batch.length) return resolve(collected);
        collected.push(...batch);
        readBatch();
      }, reject);
      readBatch();
    });
    const walk = async (entry, prefix) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true });
        files.push(file);
        return;
      }
      for (const child of await readDirectory(entry)) await walk(child, relativePath);
    };
    for (const entry of entries) await walk(entry, '');
    return files;
  }
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  ['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault(); dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault(); dropZone.classList.remove('dragging');
    if (name === 'drop' && (event.dataTransfer.items.length || event.dataTransfer.files.length)) {
      collectDroppedFiles(event.dataTransfer)
        .then((files) => showSelection(files))
        .catch((error) => setResult('검사 오류', game.title, error.message));
    }
  }));
  patchButton.addEventListener('click', async () => {
    if (lastZip) {
      downloadBytes(lastZip, `${game.id}-${manifest.patchVersion}.zip`, 'application/zip');
      return;
    }
    const ready = selectedTargets.filter((item) => item.status === 'ready');
    patchButton.disabled = true;
    const worker = createPatchWorker();
    const zipEntries = [];
    const total = ready.length + (manifest.sharedAssets || []).length;
    let done = 0;
    try {
      for (const item of ready) {
        updateProgress(done, total, item.target.path);
        const response = await fetch(new URL(item.target.patch, manifestUrl));
        if (!response.ok) throw new Error(`패치 다운로드 실패: ${item.target.path}`);
        const sourceBuffer = await item.file.arrayBuffer();
        const patchBuffer = await response.arrayBuffer();
        const patched = await worker.apply(sourceBuffer, patchBuffer);
        if (patched.length !== item.target.patchedSize || await sha256(patched) !== item.target.patchedSha256) throw new Error(`패치 결과 검증 실패: ${item.target.path}`);
        zipEntries.push({ name: item.target.path, data: patched });
        updateTargetStatus(item.target.path, 'applied');
        done += 1;
      }
      for (const asset of manifest.sharedAssets || []) {
        updateProgress(done, total, asset.fileName);
        const response = await fetch(new URL(asset.source, document.baseURI));
        if (!response.ok) throw new Error(`공용 에셋 다운로드 실패: ${asset.fileName}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== asset.size || await sha256(bytes) !== asset.sha256) throw new Error(`공용 에셋 검증 실패: ${asset.fileName}`);
        zipEntries.push({ name: asset.outputPath, data: bytes });
        done += 1;
      }
      const assets = manifest.sharedAssets || [];
      const fontGuide = [
        assets.some((asset) => asset.type === 'emulator-font') ? '_emulator-font 폴더의 BMP는 에뮬레이터용 공용 한글 폰트입니다. 게임 폴더에 덮어쓰지 마세요.' : '',
        assets.some((asset) => asset.type === 'game-font') ? '_font-options 폴더의 FNT는 게임용 선택 글꼴입니다. 사용할 파일을 JIS.FNT로 이름을 바꾸어 게임 폴더에 덮어쓰세요.' : ''
      ].filter(Boolean).join('\r\n');
      const guide = new TextEncoder().encode(`${game.title} 한국어 패치 ${manifest.patchVersion}\r\n\r\n[상업적 이용 금지]\r\n본 한글 패치와 이를 적용한 결과물을 판매, 유료 배포하거나 영리 목적으로 이용하지 마십시오.\r\n이를 위반하여 발생하는 법적·금전적 책임은 이용자 본인에게 있습니다.\r\n\r\nZIP 안의 게임 파일을 원본 게임 폴더에 덮어쓰기 전에 반드시 백업해 주세요.${fontGuide ? `\r\n${fontGuide}` : ''}\r\n`);
      zipEntries.push({ name: 'PATCH-README.txt', data: guide });
      updateProgress(total, total, 'ZIP 생성 완료');
      const zip = window.SimpleZip.createZip(zipEntries);
      lastZip = zip;
      downloadBytes(zip, `${game.id}-${manifest.patchVersion}.zip`, 'application/zip');
      setResult('패치 완료', `${ready.length}개 파일 · 공용 폰트 포함`, '검증된 결과 ZIP 다운로드를 시작했습니다. 원본을 백업한 뒤 압축을 해제해 주세요.');
      patchButton.textContent = 'ZIP 다시 다운로드';
      patchButton.disabled = false;
    } catch (error) {
      setResult('패치 실패', game.title, error.message);
      patchButton.textContent = '다시 시도';
      patchButton.disabled = false;
    } finally {
      worker.close();
    }
  });
  loadManifest();
}

async function bootstrap() {
  games = await loadJson('games/catalog.json');
  const page = document.body.dataset.page;
  if (page === 'catalog') initializeCatalog();
  if (page === 'detail') await initializeDetail();
}

bootstrap().catch((error) => {
  console.error(error);
  const root = document.querySelector('#game-grid, #detail-root');
  if (root) root.innerHTML = `<p class="load-error">${escapeHtml(error.message)}</p>`;
});
