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

function card(c, compact) {
  const dots = (c.labels ?? []).slice(0, 3).map(l =>
    `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${LABEL_COLORS[l.color] ?? '#888'};margin-right:2px;"></span>`
  ).join('');

  const dueStr = c.due
    ? new Date(c.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const overdue = c.due && !c.dueComplete && new Date(c.due) < new Date();
  const titleLen = compact ? 28 : 40;

  return `<div style="padding:3px 5px;margin-bottom:3px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:${compact ? 9 : 10}px;line-height:1.3;">
  ${dots ? `<div style="margin-bottom:2px;">${dots}</div>` : ''}
  <div>${esc(clip(c.name, titleLen))}</div>
  ${dueStr ? `<div style="font-size:8px;color:${overdue ? '#b84040' : '#888'};margin-top:1px;">${dueStr}</div>` : ''}
</div>`;
}

function column(list, cards, maxCards, compact) {
  const done = DONE_RE.test(list.name);
  const shown = cards.slice(0, maxCards);
  const extra = cards.length - shown.length;

  return `<div style="flex:1;min-width:0;border:1px solid #ccc;border-radius:4px;background:#f7f9fb;overflow:hidden;display:flex;flex-direction:column;">
  <div style="background:${done ? '#e8f5e9' : '#f0f4f8'};padding:4px 6px;border-bottom:1px solid #ccc;font-size:${compact ? 9 : 10}px;font-weight:700;color:${done ? '#2e7d32' : '#2c3e50'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(clip(list.name, 18))}${cards.length ? ` <span style="font-weight:400;opacity:.7;">(${cards.length})</span>` : ''}</div>
  <div style="padding:4px;overflow:hidden;flex:1;">
    ${shown.map(c => card(c, compact)).join('')}
    ${extra > 0 ? `<div style="font-size:8px;color:#888;text-align:center;margin-top:2px;">+${extra} more</div>` : ''}
    ${cards.length === 0 ? `<div style="font-size:9px;color:#bbb;text-align:center;padding:8px 0;">empty</div>` : ''}
  </div>
</div>`;
}

function cols(columns, max, maxCards, compact) {
  return columns.slice(0, max).map(list => column(list, list.cards, maxCards, compact)).join('');
}

function footer(name, full) {
  return `<div style="font-size:${full ? 11 : 9}px;${full ? 'font-weight:600;color:#333;' : 'color:#999;'}padding-top:${full ? 6 : 4}px;border-top:1px solid ${full ? '#ddd' : '#eee'};margin-top:${full ? 6 : 4}px;display:flex;align-items:center;">
  ${full ? `<span>⬡ ${esc(clip(name, 50))}</span><span style="margin-left:auto;font-size:9px;color:#aaa;">trmnlello</span>` : `${esc(clip(name, 30))} · trmnlello`}
</div>`;
}

export function full(boardName, columns) {
  const n = columns.length;
  const maxCards = n <= 3 ? 8 : n <= 4 ? 6 : n <= 5 ? 4 : 3;
  return `<div class="view view--full" style="font-family:'Inter',sans-serif;padding:8px;box-sizing:border-box;height:480px;display:flex;flex-direction:column;"><div style="display:flex;gap:6px;flex:1;overflow:hidden;">${cols(columns, 6, maxCards, n > 4)}</div>${footer(boardName, true)}</div>`;
}

export function halfVertical(boardName, columns) {
  return `<div class="view view--half_vertical" style="font-family:'Inter',sans-serif;padding:6px;box-sizing:border-box;height:480px;display:flex;flex-direction:column;"><div style="display:flex;gap:4px;flex:1;overflow:hidden;">${cols(columns, 3, 4, true)}</div>${footer(boardName, false)}</div>`;
}

export function halfHorizontal(boardName, columns) {
  return `<div class="view view--half_horizontal" style="font-family:'Inter',sans-serif;padding:6px;box-sizing:border-box;height:240px;display:flex;flex-direction:column;"><div style="display:flex;gap:4px;flex:1;overflow:hidden;">${cols(columns, 6, 2, true)}</div>${footer(boardName, false)}</div>`;
}

export function quadrant(boardName, columns) {
  return `<div class="view view--quadrant" style="font-family:'Inter',sans-serif;padding:5px;box-sizing:border-box;height:240px;display:flex;flex-direction:column;"><div style="display:flex;gap:4px;flex:1;overflow:hidden;">${cols(columns, 2, 3, true)}</div>${footer(boardName, false)}</div>`;
}

export function setup() {
  return `<div class="view view--full" style="font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;height:480px;flex-direction:column;gap:12px;"><div style="font-size:24px;">⬡</div><div style="font-size:16px;font-weight:600;">Trmnlello</div><div style="font-size:12px;color:#666;">Select a Trello board to complete setup</div></div>`;
}

export function error(msg) {
  return `<div class="view view--full" style="font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;height:480px;flex-direction:column;gap:8px;"><div style="font-size:14px;font-weight:600;color:#b84040;">Trmnlello Error</div><div style="font-size:11px;color:#666;max-width:400px;text-align:center;">${esc(msg)}</div></div>`;
}

export function allLayouts(boardName, columns) {
  return {
    markup: full(boardName, columns),
    markup_half_vertical: halfVertical(boardName, columns),
    markup_half_horizontal: halfHorizontal(boardName, columns),
    markup_quadrant: quadrant(boardName, columns),
  };
}
