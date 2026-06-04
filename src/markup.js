const DONE_RE = /\b(done|complete|completed|finished|shipped|closed|deployed)\b/i;

const LABEL_COLORS = {
  green: '#4a9b6f', yellow: '#b8860b', orange: '#cc6b28', red: '#b84040',
  purple: '#7b68ae', blue: '#4a7fb5', sky: '#4a9bb5', lime: '#6aaa48',
  pink: '#c45b8a', black: '#555',
};

function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function card(c) {
  const dots = (c.labels ?? []).slice(0, 3).map(l =>
    `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${LABEL_COLORS[l.color] ?? '#888'};margin-right:2px;"></span>`
  ).join('');

  const dueStr = c.due
    ? new Date(c.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const overdue = c.due && !c.dueComplete && new Date(c.due) < new Date();
  const b = c.badges ?? {};
  const done = c.dueComplete || (b.checkItems > 0 && b.checkItems === b.checkItemsChecked);

  return `<div class="item">
  <div class="content">
    ${dots ? `<div style="margin-bottom:2px;">${dots}</div>` : ''}
    <span class="title title--small lg:title--base" data-clamp="2"${done ? ' style="text-decoration:line-through;opacity:0.5;"' : ''}>${esc(c.name)}</span>
    ${dueStr ? `<span class="label label--small${overdue ? ' label--red' : ' label--gray'}">${dueStr}</span>` : ''}
  </div>
</div>`;
}

function column(list, cards, maxCards) {
  const done = DONE_RE.test(list.name);
  const shown = cards.slice(0, maxCards);
  const extra = cards.length - shown.length;

  return `<div class="column" data-overflow="true" data-overflow-counter="true">
  <span class="title title--small lg:title--base group-header${done ? ' label--gray' : ''}">${esc(clip(list.name, 20))}${cards.length ? ` (${cards.length})` : ''}</span>
  ${shown.map(c => card(c)).join('')}
  ${extra > 0 ? `<span class="label label--small label--gray">+${extra} more</span>` : ''}
  ${cards.length === 0 ? `<span class="label label--small label--gray">empty</span>` : ''}
</div>`;
}

function cols(columns, max, maxCards) {
  return columns.slice(0, max).map(list => column(list, list.cards, maxCards)).join('');
}

export function full(boardName, columns) {
  const n = columns.length;
  const maxCards = n <= 3 ? 8 : n <= 4 ? 6 : n <= 5 ? 4 : 3;
  return `<div class="view view--full">
  <div class="layout layout--col layout--stretch gap">
    <div class="columns">${cols(columns, 6, maxCards)}</div>
  </div>
  <div class="title_bar">
    <span class="title">Trmnlello - Trello private boards</span>
    <span class="instance">${esc(clip(boardName, 50))}</span>
  </div>
</div>`;
}

export function halfVertical(boardName, columns) {
  return `<div class="view view--half_vertical">
  <div class="layout layout--col layout--stretch gap">
    <div class="columns">${cols(columns, 3, 4)}</div>
  </div>
  <div class="title_bar">
    <span class="title">Trmnlello - Trello private boards</span>
    <span class="instance">${esc(clip(boardName, 30))}</span>
  </div>
</div>`;
}

export function halfHorizontal(boardName, columns) {
  return `<div class="view view--half_horizontal">
  <div class="layout layout--col layout--stretch gap">
    <div class="columns">${cols(columns, 6, 2)}</div>
  </div>
  <div class="title_bar">
    <span class="title">Trmnlello - Trello private boards</span>
    <span class="instance">${esc(clip(boardName, 30))}</span>
  </div>
</div>`;
}

export function quadrant(boardName, columns) {
  return `<div class="view view--quadrant">
  <div class="layout layout--col layout--stretch gap">
    <div class="columns">${cols(columns, 2, 3)}</div>
  </div>
  <div class="title_bar">
    <span class="title">Trmnlello - Trello private boards</span>
    <span class="instance">${esc(clip(boardName, 30))}</span>
  </div>
</div>`;
}

export function setup() {
  return `<div class="view view--full">
  <div class="layout layout--col layout--stretch" style="align-items:center;justify-content:center;gap:12px;">
    <span class="title" style="font-size:24px;">⬡</span>
    <span class="title">Trmnlello - Trello private boards</span>
    <span class="label label--base label--gray">Select a Trello board to complete setup</span>
  </div>
</div>`;
}

export function error(msg) {
  return `<div class="view view--full">
  <div class="layout layout--col layout--stretch" style="align-items:center;justify-content:center;gap:8px;">
    <span class="title label--red">Trmnlello Error</span>
    <span class="label label--base label--gray" style="max-width:400px;text-align:center;">${esc(msg)}</span>
  </div>
</div>`;
}

export function allLayouts(boardName, columns) {
  return {
    markup: full(boardName, columns),
    markup_half_vertical: halfVertical(boardName, columns),
    markup_half_horizontal: halfHorizontal(boardName, columns),
    markup_quadrant: quadrant(boardName, columns),
  };
}
