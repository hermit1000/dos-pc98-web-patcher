'use strict';

const games = window.GAME_CATALOG || [];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function gameCard(game, index) {
  return `<a class="game-card" href="patcher.html?game=${encodeURIComponent(game.id)}" style="--delay:${index * 55}ms">
    <div class="card-art palette-${escapeHtml(game.palette)}">
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
  const filters = [...document.querySelectorAll('.filter-button')];
  const empty = document.querySelector('#empty-state');
  const resultCount = document.querySelector('#result-count');
  let platform = 'all';

  document.querySelector('#game-count').textContent = games.length;

  function render() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    const visible = games.filter((game) => {
      const matchesPlatform = platform === 'all' || game.platform === platform;
      const haystack = `${game.title} ${game.originalTitle} ${game.genre}`.toLocaleLowerCase('ko');
      return matchesPlatform && haystack.includes(query);
    });
    grid.innerHTML = visible.map(gameCard).join('');
    empty.hidden = visible.length !== 0;
    resultCount.textContent = `${visible.length} / ${games.length} TITLES`;
  }

  search.addEventListener('input', render);
  filters.forEach((button) => button.addEventListener('click', () => {
    platform = button.dataset.platform;
    filters.forEach((item) => item.classList.toggle('active', item === button));
    render();
  }));
  render();
}

function initializeDetail() {
  const requestedId = new URLSearchParams(location.search).get('game');
  const game = games.find((item) => item.id === requestedId) || games[0];
  if (!game) return;

  document.title = `${game.title} 한국어 패치 — 고전어 번역소`;
  const values = {
    'detail-platform-top': game.platform,
    'detail-platform': game.platform,
    'detail-status': game.status,
    'detail-title': game.title,
    'detail-subtitle': `${game.originalTitle} · ${game.year}`,
    'detail-description': game.description,
    'detail-version': game.version,
    'detail-date': game.date,
    'detail-original': game.original,
    'detail-story': game.story,
    'art-monogram': game.mark,
    'requirement-platform': game.platform === 'PC-98' ? 'NEC PC-9801' : 'IBM PC / DOS',
    'requirement-files': `${game.files}개`
  };
  Object.entries(values).forEach(([id, value]) => { document.querySelector(`#${id}`).textContent = value; });
  document.querySelector('#detail-art').classList.add(`palette-${game.palette}`);

  const input = document.querySelector('#folder-input');
  const dropZone = document.querySelector('#drop-zone');
  const result = document.querySelector('#dummy-result');
  const patchButton = document.querySelector('#patch-button');

  function showSelection(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const firstPath = files[0].webkitRelativePath || files[0].name;
    const folderName = firstPath.includes('/') ? firstPath.split('/')[0] : '선택한 항목';
    document.querySelector('#folder-title').textContent = folderName;
    document.querySelector('#folder-help').textContent = `${files.length.toLocaleString('ko-KR')}개 파일을 선택했습니다.`;
    document.querySelector('#selected-summary').textContent = `${folderName} · ${files.length.toLocaleString('ko-KR')} files`;
    result.hidden = false;
    patchButton.disabled = false;
    patchButton.textContent = '더미 패치 동작 확인';
    dropZone.classList.add('has-files');
  }

  input.addEventListener('change', () => showSelection(input.files));
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  ['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault(); dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault(); dropZone.classList.remove('dragging');
    if (name === 'drop' && event.dataTransfer.files.length) showSelection(event.dataTransfer.files);
  }));
  patchButton.addEventListener('click', () => {
    patchButton.textContent = '실제 패치 엔진 연결 예정';
    result.querySelector('p').textContent = '두 페이지 UI가 정상적으로 연결되었습니다. 다음 단계에서 manifest 검사와 VCDIFF 적용 기능을 구현합니다.';
  });
}

const page = document.body.dataset.page;
if (page === 'catalog') initializeCatalog();
if (page === 'detail') initializeDetail();
