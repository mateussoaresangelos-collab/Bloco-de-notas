/* ============================================================
   Bloco de Notas — lógica principal
   ============================================================ */

const STORAGE_KEY = 'notionNotesApp-v1';
const THEME_KEY = 'notionNotesTheme';

const BLOCK_PATTERNS = [
  { type: 'heading', regex: /^#{1,2}\s+/ },
  { type: 'checklist', regex: /^(?:-|\*)\s\[ \]\s+/i, checked: false },
  { type: 'checklist', regex: /^(?:-|\*)\s\[x\]\s+/i, checked: true },
  { type: 'list-item', regex: /^(?:-|\*)\s+/ },
  { type: 'list-number', regex: /^\d+\.\s+/ },
];

const dom = {
  newNoteButton: document.getElementById('new-note-button'),
  searchInput: document.getElementById('search-input'),
  notesList: document.getElementById('notes-list'),
  noteTitle: document.getElementById('note-title'),
  blocksContainer: document.getElementById('blocks-container'),
  charCounter: document.getElementById('char-counter'),
  pinButton: document.getElementById('pin-button'),
  deleteButton: document.getElementById('delete-button'),
  editorMeta: document.getElementById('editor-meta'),
  editorTitle: document.getElementById('editor-title'),
  toggleThemeButton: document.getElementById('toggle-theme-button'),
};

const state = {
  notes: [],
  activeId: null,
  search: '',
};

/* ------------------------------------------------------------
   Persistência (localStorage)
   ------------------------------------------------------------ */

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  dom.toggleThemeButton.textContent = theme === 'light' ? '🌞 Light' : '🌙 Dark';
  localStorage.setItem(THEME_KEY, theme);
}

/* ------------------------------------------------------------
   Modelo de dados
   ------------------------------------------------------------ */

function createNote() {
  const now = Date.now();
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2)}`,
    title: 'Nova nota',
    blocks: [createBlock()],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createBlock(overrides = {}) {
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'paragraph',
    text: '',
    checked: false,
    ...overrides,
  };
}

function getActiveNote() {
  return state.notes.find((note) => note.id === state.activeId) ?? null;
}

function touchNote(note) {
  note.updatedAt = Date.now();
  persistNotes();
}

/* ------------------------------------------------------------
   Utilitários de exibição
   ------------------------------------------------------------ */

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp);
}

function getPreviewText(note) {
  return [note.title, ...note.blocks.map((b) => b.text)].join(' ').trim().slice(0, 60);
}

function sortNotes(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

function getVisibleNotes() {
  const query = state.search.trim().toLowerCase();
  const matches = (note) =>
    !query || [note.title, ...note.blocks.map((b) => b.text)].join(' ').toLowerCase().includes(query);

  return state.notes.filter(matches).sort(sortNotes);
}

/* ------------------------------------------------------------
   Renderização — barra lateral
   ------------------------------------------------------------ */

function renderSidebar() {
  const notes = getVisibleNotes();
  dom.notesList.innerHTML = '';

  if (notes.length === 0) {
    dom.notesList.innerHTML = '<p class="note-empty">Nenhuma nota encontrada.</p>';
    return;
  }

  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);

  if (pinned.length > 0) {
    appendSectionLabel('Fixadas');
    pinned.forEach(renderNoteCard);
    if (others.length > 0) appendSectionLabel('Outras notas');
  }

  others.forEach(renderNoteCard);
}

function appendSectionLabel(label) {
  const section = document.createElement('div');
  section.className = 'notes-section';
  section.innerHTML = `<strong>${label}</strong>`;
  dom.notesList.appendChild(section);
}

function renderNoteCard(note) {
  const isActive = note.id === state.activeId;

  const card = document.createElement('button');
  card.type = 'button';
  card.className = `note-card${isActive ? ' active' : ''}`;
  card.dataset.id = note.id;
  card.innerHTML = `
    <div class="note-header">
      <h3>${escapeHtml(note.title || 'Sem título')}</h3>
      ${note.pinned ? '<span>📌</span>' : ''}
    </div>
    <p>${escapeHtml(getPreviewText(note))}</p>
    <div class="note-meta">
      <span>${formatDate(note.updatedAt)}</span>
      <span>${note.blocks.length} blocos</span>
    </div>
  `;
  card.addEventListener('click', () => setActiveNote(note.id));
  dom.notesList.appendChild(card);
}

/* ------------------------------------------------------------
   Renderização — editor
   ------------------------------------------------------------ */

function renderEditor() {
  const note = getActiveNote();

  if (!note) {
    renderEmptyEditor();
    return;
  }

  dom.noteTitle.disabled = false;
  dom.noteTitle.value = note.title;
  dom.editorTitle.textContent = note.title || 'Nova nota';
  dom.editorMeta.textContent = `Atualizada em ${formatDate(note.updatedAt)}`;
  dom.pinButton.disabled = false;
  dom.deleteButton.disabled = false;
  dom.pinButton.textContent = note.pinned ? '📌 Desfixar' : '📌 Fixar';

  renderBlocks(note);
  updateCharCounter(note);
}

function renderEmptyEditor() {
  dom.noteTitle.value = '';
  dom.noteTitle.disabled = true;
  dom.blocksContainer.innerHTML = '';
  dom.editorMeta.textContent = '';
  dom.editorTitle.textContent = 'Selecione ou crie uma nota';
  dom.pinButton.disabled = true;
  dom.deleteButton.disabled = true;
  dom.charCounter.textContent = '0 caracteres';
}

function renderBlocks(note) {
  if (note.blocks.length === 0) note.blocks.push(createBlock());

  dom.blocksContainer.innerHTML = '';

  let listNumber = 0;
  note.blocks.forEach((block) => {
    if (block.type === 'list-number') listNumber += 1;
    dom.blocksContainer.appendChild(renderBlockElement(block, listNumber));
  });
}

function renderBlockElement(block, order) {
  const wrapper = document.createElement('div');
  wrapper.className = `block ${block.type}`;
  wrapper.dataset.id = block.id;
  if (block.type === 'list-number') wrapper.dataset.order = order;

  if (block.type === 'checklist') {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(block.checked);
    checkbox.dataset.id = block.id;
    checkbox.addEventListener('change', handleChecklistToggle);
    wrapper.appendChild(checkbox);
  }

  const editable = document.createElement('div');
  editable.className = 'editable';
  editable.contentEditable = 'true';
  editable.dataset.id = block.id;
  editable.innerText = block.text;
  wrapper.appendChild(editable);

  return wrapper;
}

function updateCharCounter(note) {
  const total = note.title.length + note.blocks.reduce((sum, b) => sum + b.text.length, 0);
  dom.charCounter.textContent = `${total} caracteres`;
}

/* ------------------------------------------------------------
   Ações de nota
   ------------------------------------------------------------ */

function setActiveNote(id) {
  state.activeId = id;
  renderSidebar();
  renderEditor();
}

function addNote() {
  const note = createNote();
  state.notes.unshift(note);
  persistNotes();
  setActiveNote(note.id);
}

function deleteActiveNote() {
  const note = getActiveNote();
  if (!note) return;

  state.notes = state.notes.filter((n) => n.id !== note.id);
  state.activeId = state.notes[0]?.id ?? null;
  persistNotes();
  renderSidebar();
  renderEditor();
}

function togglePinActiveNote() {
  const note = getActiveNote();
  if (!note) return;

  note.pinned = !note.pinned;
  touchNote(note);
  renderSidebar();
  renderEditor();
}

function renameActiveNote(event) {
  const note = getActiveNote();
  if (!note) return;

  note.title = event.target.value;
  touchNote(note);
  renderSidebar();
  renderEditor();
}

/* ------------------------------------------------------------
   Edição de blocos
   ------------------------------------------------------------ */

function getBlockFromEvent(event, note) {
  const target = event.target.closest('.editable');
  if (!target || !note) return null;
  return note.blocks.find((block) => block.id === target.dataset.id) ?? null;
}

function handleEditorInput(event) {
  const note = getActiveNote();
  const block = getBlockFromEvent(event, note);
  if (!block) return;

  block.text = event.target.innerText.replace(/\u00A0/g, '');
  touchNote(note);
  updateCharCounter(note);
}

function handleEditorKeydown(event) {
  if (event.key !== 'Backspace') return;

  const note = getActiveNote();
  const target = event.target.closest('.editable');
  if (!note || !target) return;

  const index = note.blocks.findIndex((block) => block.id === target.dataset.id);
  const isEmpty = target.innerText.replace(/\u00A0/g, '') === '';
  if (index < 0 || !isEmpty || note.blocks.length <= 1) return;

  event.preventDefault();
  note.blocks.splice(index, 1);
  touchNote(note);
  renderEditor();
  focusBlock(note.blocks[Math.max(0, index - 1)].id);
}

function focusBlock(blockId) {
  requestAnimationFrame(() => {
    dom.blocksContainer.querySelector(`[data-id='${blockId}'] .editable`)?.focus();
  });
}

function handleEditorBlur(event) {
  const note = getActiveNote();
  const block = getBlockFromEvent(event, note);
  if (!block) return;

  const parsed = parseBlockMarkdown(event.target.innerText);
  const changed = parsed.type !== block.type || parsed.text !== block.text || parsed.checked !== block.checked;
  if (!changed) return;

  Object.assign(block, parsed);
  touchNote(note);
  renderEditor();
}

function handleChecklistToggle(event) {
  const note = getActiveNote();
  const block = note?.blocks.find((b) => b.id === event.target.dataset.id);
  if (!block) return;

  block.checked = event.target.checked;
  touchNote(note);
}

/* ------------------------------------------------------------
   Markdown leve (convertido ao sair do bloco)
   ------------------------------------------------------------ */

function parseBlockMarkdown(rawText) {
  const text = rawText.replace(/\u00A0/g, '');
  const trimmed = text.trimStart();

  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.regex.test(trimmed)) {
      return {
        type: pattern.type,
        text: trimmed.replace(pattern.regex, ''),
        checked: pattern.checked ?? false,
      };
    }
  }

  return { type: 'paragraph', text, checked: false };
}

/* ------------------------------------------------------------
   Inicialização
   ------------------------------------------------------------ */

function bindEvents() {
  dom.newNoteButton.addEventListener('click', addNote);
  dom.pinButton.addEventListener('click', togglePinActiveNote);
  dom.deleteButton.addEventListener('click', deleteActiveNote);
  dom.noteTitle.addEventListener('input', renameActiveNote);

  dom.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderSidebar();
  });

  dom.blocksContainer.addEventListener('input', handleEditorInput);
  dom.blocksContainer.addEventListener('keydown', handleEditorKeydown);
  dom.blocksContainer.addEventListener('blur', handleEditorBlur, true);

  dom.toggleThemeButton.addEventListener('click', () => {
    const next = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(next);
  });
}

function init() {
  state.notes = loadNotes();
  if (state.notes.length === 0) state.notes = [createNote()];
  state.activeId = state.notes[0].id;

  applyTheme(loadTheme());
  bindEvents();
  renderSidebar();
  renderEditor();
}

init();