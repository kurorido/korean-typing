// 題庫管理：資料存在 localStorage，預設內容來自 data.js
const Bank = (() => {
  const KEY = 'kt-bank-v1';
  const TYPES = { word: '單字', sentence: '句子' };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const CAT_MAP = {
    word: Object.fromEntries(WORD_CATS),
    sentence: Object.fromEntries(SENTENCE_CATS),
  };
  // rom：手動指定的拼音（留空則自動產生）；cat：分類（預設 daily）
  const mk = (ko, zh, on = true, rom = '', cat = 'daily') => ({
    id: uid(),
    ko: String(ko).trim(),
    zh: String(zh || '').trim(),
    rom: String(rom || '').trim(),
    cat: cat || 'daily',
    on: on !== false,
  });

  const defaults = () => ({
    word: WORDS.map(([ko, zh, rom, cat]) => mk(ko, zh, true, rom, cat || 'daily')),
    sentence: SENTENCES.map(([ko, zh, rom, cat]) => mk(ko, zh, true, rom, cat || 'daily')),
  });

  // 自動補齊舊版 localStorage 缺少的新預設單字、句子與分類
  function syncList(list, source) {
    const defMap = new Map(source.map(([ko, zh, rom, cat]) => [ko.trim(), { zh, rom: rom || '', cat: cat || 'daily' }]));
    const existing = new Set();
    list.forEach((item) => {
      existing.add(item.ko);
      const def = defMap.get(item.ko);
      if (!item.cat) item.cat = def ? def.cat : 'daily';
    });
    source.forEach(([ko, zh, rom, cat]) => {
      if (!existing.has(ko.trim())) {
        list.push(mk(ko, zh, true, rom, cat || 'daily'));
      }
    });
  }

  function syncDefaults(d) {
    syncList(d.word, WORDS);
    syncList(d.sentence, SENTENCES);
    return d;
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.word) && Array.isArray(d.sentence)) return syncDefaults(d);
    } catch (_) { /* 資料損毀時使用預設值 */ }
    return defaults();
  }

  let data = load();

  function commit(type) {
    localStorage.setItem(KEY, JSON.stringify(data));
    (type ? [type] : Object.keys(TYPES)).forEach((t) =>
      window.dispatchEvent(new CustomEvent('bank-changed', { detail: { type: t } })));
  }

  const exists = (type, ko, exceptId) => data[type].some((i) => i.ko === ko.trim() && i.id !== exceptId);

  return {
    TYPES,
    CAT_MAP,
    all: (type) => data[type],
    enabled: (type, cat) => data[type].filter((i) => i.on && i.ko && (!cat || cat === 'all' || (i.cat || 'daily') === cat)),
    exists,
    roman: (item) => item.rom || Hangul.romanize(item.ko),
    add(type, ko, zh, rom, cat = 'daily') {
      if (!ko.trim() || exists(type, ko)) return false;
      data[type].unshift(mk(ko, zh, true, rom, cat));
      commit(type);
      return true;
    },
    insertAt(type, item, index) { data[type].splice(index, 0, item); commit(type); },
    update(type, id, patch) {
      const it = data[type].find((i) => i.id === id);
      if (!it) return;
      Object.assign(it, patch);
      commit(type);
    },
    remove(type, id) {
      const idx = data[type].findIndex((i) => i.id === id);
      if (idx < 0) return null;
      const [it] = data[type].splice(idx, 1);
      commit(type);
      return { item: it, index: idx };
    },
    setAll(type, on, ids) {
      data[type].forEach((i) => { if (!ids || ids.has(i.id)) i.on = on; });
      commit(type);
    },
    // 每行一題：「韓文 | 中文 | 拼音(選填)」，也接受 Tab；沒有 | 時以最後一個逗號分隔
    importLines(type, text, defaultCat = 'daily') {
      let added = 0, skipped = 0;
      text.split(/\r?\n/).forEach((line) => {
        if (!line.trim()) return;
        let ko, zh = '', rom = '';
        if (/[|\t]/.test(line)) [ko, zh = '', rom = ''] = line.split(/[|\t]/);
        else {
          const c = Math.max(line.lastIndexOf(','), line.lastIndexOf('，'));
          if (c >= 0) { ko = line.slice(0, c); zh = line.slice(c + 1); } else ko = line;
        }
        ko = ko.trim();
        if (!ko || exists(type, ko)) { skipped++; return; }
        data[type].push(mk(ko, zh, true, rom, defaultCat));
        added++;
      });
      commit(type);
      return { added, skipped };
    },
    exportJSON() {
      const strip = (arr) => arr.map(({ ko, zh, rom, cat, on }) => {
        const o = { ko, zh, on };
        if (rom) o.rom = rom;
        if (cat) o.cat = cat;
        return o;
      });
      return JSON.stringify({ app: 'korean-typing', version: 2, word: strip(data.word), sentence: strip(data.sentence) }, null, 2);
    },
    importJSON(json, replace) {
      const d = JSON.parse(json);
      let added = 0;
      Object.keys(TYPES).forEach((t) => {
        if (!Array.isArray(d[t])) return;
        if (replace) data[t] = [];
        d[t].forEach((i) => {
          if (i && i.ko && !exists(t, i.ko)) { data[t].push(mk(i.ko, i.zh, i.on, i.rom, i.cat || 'daily')); added++; }
        });
      });
      commit();
      return added;
    },
    reset() { data = defaults(); commit(); },
  };
})();

// ---------- 題庫管理介面 ----------
(() => {
  const $ = (id) => document.getElementById(id);
  const dlg = $('bankDialog');
  const ui = {
    tabs: $('bankTabs'), list: $('bankList'), search: $('bankSearch'), count: $('bankCount'),
    catFilter: $('bankCatFilter'), addCat: $('bankAddCat'),
    addKo: $('bankAddKo'), addZh: $('bankAddZh'), addBtn: $('bankAddBtn'), msg: $('bankMsg'),
    batch: $('bankBatch'), batchText: $('bankBatchText'), file: $('bankFile'),
  };
  let type = 'word';
  let undo = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const currentCats = () => (type === 'word' ? WORD_CATS : SENTENCE_CATS);

  function populateCatSelects() {
    if (!ui.catFilter || !ui.addCat) return;
    const cats = currentCats();
    ui.catFilter.innerHTML = cats.map(([val, label]) => `<option value="${val}">${label}</option>`).join('');
    ui.addCat.innerHTML = cats.filter(([val]) => val !== 'all').map(([val, label]) => `<option value="${val}">${label}</option>`).join('');
  }
  populateCatSelects();

  function flash(html, cls = '') {
    ui.msg.innerHTML = html;
    ui.msg.className = 'bank-msg show ' + cls;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => ui.msg.classList.remove('show'), 5000);
  }

  function visible() {
    const q = ui.search.value.trim().toLowerCase();
    const cat = ui.catFilter ? ui.catFilter.value : 'all';
    return Bank.all(type).filter((i) => {
      if (cat !== 'all' && (i.cat || 'daily') !== cat) return false;
      return !q || i.ko.toLowerCase().includes(q) || i.zh.toLowerCase().includes(q) || Bank.roman(i).toLowerCase().includes(q);
    });
  }

  const catOptionsHtml = (selected) =>
    currentCats().filter(([val]) => val !== 'all')
      .map(([val, label]) => `<option value="${val}" ${(selected || 'daily') === val ? 'selected' : ''}>${label}</option>`)
      .join('');

  function render() {
    [...ui.tabs.children].forEach((b) => {
      b.classList.toggle('active', b.dataset.type === type);
      b.querySelector('em').textContent = Bank.all(b.dataset.type).length;
    });
    const isWord = type === 'word';
    ui.addKo.placeholder = isWord ? '韓文單字，例：사랑' : '韓文句子，例：안녕하세요.';
    const all = Bank.all(type), rows = visible();
    ui.count.textContent = `共 ${all.length} 題，已啟用 ${all.filter((i) => i.on).length} 題` + (rows.length !== all.length ? `（目前篩選 ${rows.length} 題）` : '');
    if (!rows.length) {
      ui.list.innerHTML = `<tr><td colspan="7" class="empty">${all.length ? '找不到符合的題目' : '題庫是空的，從上方新增吧！'}</td></tr>`;
      return;
    }
    ui.list.innerHTML = rows.map((i, n) => `
      <tr data-id="${i.id}" class="${i.on ? '' : 'off'}">
        <td><input type="checkbox" class="b-on" ${i.on ? 'checked' : ''} title="是否出現在練習中"></td>
        <td class="num">${n + 1}</td>
        <td><select class="b-cat">${catOptionsHtml(i.cat)}</select></td>
        <td><input class="b-ko" value="${esc(i.ko)}" lang="ko">${/[A-Za-z]/.test(i.ko) ? '<span class="warn" title="內建韓文輸入無法打出英文字母，建議改用系統輸入法練習此題">⚠️</span>' : ''}</td>
        <td><input class="b-rom" value="${esc(i.rom || '')}" placeholder="${esc(Hangul.romanize(i.ko))}" title="灰字為自動產生的拼音；輸入文字可自訂，清空則恢復自動"></td>
        <td><input class="b-zh" value="${esc(i.zh)}" placeholder="（中文意思）"></td>
        <td class="ops"><button class="b-say" title="朗讀">🔊</button><button class="b-del" title="刪除">🗑</button></td>
      </tr>`).join('');
  }

  function add() {
    const ko = ui.addKo.value.trim(), zh = ui.addZh.value.trim();
    const cat = ui.addCat ? ui.addCat.value : 'daily';
    if (!ko) { ui.addKo.focus(); return; }
    if (!Bank.add(type, ko, zh, '', cat)) { flash(`「${esc(ko)}」已經在題庫裡了`, 'bad'); return; }
    ui.addKo.value = ''; ui.addZh.value = '';
    ui.addKo.focus();
    flash(`已新增「${esc(ko)}」`);
    render();
  }

  ui.addBtn.onclick = add;
  [ui.addKo, ui.addZh].forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target === ui.addKo ? ui.addZh.focus() : add(); }
  }));

  ui.tabs.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    type = b.dataset.type;
    ui.search.value = '';
    populateCatSelects();
    render();
  };
  ui.search.oninput = render;
  if (ui.catFilter) ui.catFilter.onchange = () => {
    if (ui.addCat && ui.catFilter.value !== 'all') ui.addCat.value = ui.catFilter.value;
    render();
  };

  ui.list.addEventListener('change', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.classList.contains('b-on')) { Bank.update(type, id, { on: e.target.checked }); render(); }
    if (e.target.classList.contains('b-cat')) { Bank.update(type, id, { cat: e.target.value }); render(); }
    if (e.target.classList.contains('b-ko')) {
      const v = e.target.value.trim();
      if (!v || Bank.exists(type, v, id)) { flash(v ? `「${esc(v)}」已存在` : '韓文不能是空的', 'bad'); render(); return; }
      Bank.update(type, id, { ko: v });
      tr.querySelector('.b-rom').placeholder = Hangul.romanize(v);
    }
    if (e.target.classList.contains('b-rom')) Bank.update(type, id, { rom: e.target.value.trim() });
    if (e.target.classList.contains('b-zh')) Bank.update(type, id, { zh: e.target.value.trim() });
  });

  ui.list.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr || !tr.dataset.id) return;
    if (e.target.closest('.b-say')) {
      const u = new SpeechSynthesisUtterance(tr.querySelector('.b-ko').value);
      u.lang = 'ko-KR'; u.rate = 0.85;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }
    if (e.target.closest('.b-del')) {
      const r = Bank.remove(type, tr.dataset.id);
      undo = { type, ...r };
      flash(`已刪除「${esc(r.item.ko)}」 <button id="bankUndo">復原</button>`);
      $('bankUndo').onclick = () => {
        if (!undo) return;
        Bank.insertAt(undo.type, undo.item, undo.index);
        undo = null;
        flash('已復原');
        render();
      };
      render();
    }
  });

  $('bankAllOn').onclick = () => { Bank.setAll(type, true, new Set(visible().map((i) => i.id))); render(); };
  $('bankAllOff').onclick = () => { Bank.setAll(type, false, new Set(visible().map((i) => i.id))); render(); };

  $('bankBatchBtn').onclick = () => { ui.batch.hidden = !ui.batch.hidden; if (!ui.batch.hidden) ui.batchText.focus(); };
  $('bankBatchAdd').onclick = () => {
    const cat = ui.addCat ? ui.addCat.value : 'daily';
    const { added, skipped } = Bank.importLines(type, ui.batchText.value, cat);
    flash(`批次新增 ${added} 題` + (skipped ? `，略過 ${skipped} 題（空白或重複）` : ''));
    if (added) { ui.batchText.value = ''; ui.batch.hidden = true; }
    render();
  };

  $('bankExport').onclick = () => {
    const blob = new Blob([Bank.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `韓文打字題庫-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('bankImport').onclick = () => ui.file.click();
  ui.file.onchange = async () => {
    const f = ui.file.files[0]; if (!f) return;
    try {
      const replace = confirm('要「取代」目前的題庫嗎？\n\n按「確定」= 取代全部\n按「取消」= 合併（略過重複題目）');
      const n = Bank.importJSON(await f.text(), replace);
      flash(`匯入完成，共加入 ${n} 題`);
    } catch (err) {
      flash('匯入失敗：檔案格式不正確', 'bad');
    }
    ui.file.value = '';
    render();
  };
  $('bankReset').onclick = () => {
    if (!confirm('確定要恢復成預設題庫嗎？你新增或修改的題目都會消失。\n（建議先「匯出」備份）')) return;
    Bank.reset();
    flash('已恢復預設題庫');
    render();
  };

  $('bankOpen').onclick = () => { render(); dlg.showModal(); };
  $('bankClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => $('typing').focus());
})();
