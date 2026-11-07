(() => {
  const H = window.Hangul;
  const $ = (id) => document.getElementById(id);

  const els = {
    target: $('target'), roman: $('targetRoman'), meaning: $('meaning'), upnext: $('upnext'),
    dialogueBar: $('dialogueBar'),
    input: $('typing'), hint: $('hint'), options: $('options'),
    keyboard: $('keyboard'), keyboardTip: $('keyboardTip'), jamoList: $('jamoList'), modes: $('modes'),
    ime: $('builtinIme'), acc: $('statAcc'),
    done: $('statDone'), reset: $('resetBtn'),
    card: document.querySelector('.target-card'),
  };

  // ---------- 狀態 ----------
  const saved = JSON.parse(localStorage.getItem('kt-settings') || '{}');
  const state = {
    mode: saved.mode || 'jamo',
    builtin: saved.builtin !== false,
    opt: Object.assign(
      {
        jamo: 'all',
        syllable: 'basic',
        word: 'all',
        sentence: 'all',
        dialogue: DIALOGUES[0].id,
        showRoman: true,
        showKeyboard: true,
      },
      saved.opt || {}
    ),
    dlgIdx: 0,          // 情境對話目前的句數索引
    history: [],        // 已出現過的題目歷史紀錄（供回到上一題）
    queue: [], current: null,
    seq: [],            // 內建輸入法的字母序列
    total: 0, errors: 0, // 按鍵數 / 錯誤按鍵數
    doneKeys: 0, done: 0,
    lastKeysLen: 0, completing: false,
  };
  els.ime.checked = state.builtin;

  const save = () => localStorage.setItem('kt-settings', JSON.stringify({ mode: state.mode, builtin: state.builtin, opt: state.opt }));

  function updateKeyboardVisibility() {
    const show = state.opt.showKeyboard !== false;
    els.keyboard.hidden = !show;
    if (els.keyboardTip) els.keyboardTip.hidden = !show;
  }

  // ---------- 題目產生 ----------
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const BASIC_CONS = JAMO_GROUPS[0].items.map((i) => i[0]);
  const DOUBLE_CONS = JAMO_GROUPS[1].items.map((i) => i[0]);
  const BASIC_VOW = JAMO_GROUPS[2].items.map((i) => i[0]);
  const COMP_VOW = JAMO_GROUPS[3].items.map((i) => i[0]);
  const ROMAN = {};
  JAMO_GROUPS.forEach((g) => g.items.forEach(([j, r]) => (ROMAN[j] = r)));

  const bags = {};
  function fromBag(name, list) {
    if (!bags[name] || bags[name].length === 0) {
      bags[name] = list.slice().sort(() => Math.random() - 0.5);
    }
    return bags[name].pop();
  }

  const MODE_OPTIONS = {
    jamo: [['all', '全部字母'], ['cons', '基本子音'], ['vow', '基本母音'], ['adv', '雙子音＋複合母音']],
    syllable: [['basic', '子音＋母音'], ['batchim', '含收音（받침）'], ['complex', '含複合母音']],
    word: WORD_CATS,
    sentence: SENTENCE_CATS,
    dialogue: DIALOGUES.map((d) => [d.id, d.title]),
  };

  function currentDialogue() {
    return DIALOGUES.find((d) => d.id === state.opt.dialogue) || DIALOGUES[0];
  }

  function makeDialogueItem(idx) {
    const d = currentDialogue();
    const lines = d.lines;
    const i = ((idx % lines.length) + lines.length) % lines.length;
    const line = lines[i];
    return {
      text: line.ko,
      meaning: line.zh,
      roman: line.rom || H.romanize(line.ko),
      role: line.role,
      step: i + 1,
      totalSteps: lines.length,
      dlgTitle: d.title,
      dlgDesc: d.desc,
    };
  }

  function makeItem() {
    switch (state.mode) {
      case 'jamo': {
        const pool = {
          all: [...BASIC_CONS, ...DOUBLE_CONS, ...BASIC_VOW, ...COMP_VOW],
          cons: BASIC_CONS, vow: BASIC_VOW, adv: [...DOUBLE_CONS, ...COMP_VOW],
        }[state.opt.jamo];
        const picks = Array.from({ length: 6 }, () => rand(pool));
        const text = picks.join(' ');
        const rom = picks.map((p) => ROMAN[p]).join(' ');
        return { text, meaning: picks.map((p) => ROMAN[p]).join(' · '), roman: rom };
      }
      case 'syllable': {
        const o = state.opt.syllable;
        const vowels = o === 'complex' ? [...BASIC_VOW, ...COMP_VOW] : BASIC_VOW;
        const finals = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ', 'ㄲ', 'ㅆ'];
        const sy = Array.from({ length: 5 }, () => {
          const keys = [rand(H.CHO), ...H.expand(rand(vowels))];
          if (o === 'batchim' || (o === 'complex' && Math.random() < 0.4)) keys.push(rand(finals));
          return H.compose(keys);
        });
        const text = sy.join(' ');
        return { text, meaning: '隨機音節練習', roman: H.romanize(text) };
      }
      case 'word': {
        const cat = state.opt.word || 'all';
        const list = Bank.enabled('word', cat);
        if (!list.length) return { text: '없음', meaning: '⚠️ 這個分類沒有啟用的單字，請到右上角「📚 題庫管理」新增或勾選題目' };
        const it = fromBag('word:' + cat, list);
        return { text: it.ko, meaning: it.zh, roman: Bank.roman(it) };
      }
      case 'sentence': {
        const cat = state.opt.sentence || 'all';
        const list = Bank.enabled('sentence', cat);
        if (!list.length) return { text: '없음', meaning: '⚠️ 這個分類沒有啟用的句子，請到右上角「📚 題庫管理」新增或勾選題目' };
        const it = fromBag('sentence:' + cat, list);
        return { text: it.ko, meaning: it.zh, roman: Bank.roman(it) };
      }
      case 'dialogue': {
        return makeDialogueItem(state.dlgIdx);
      }
    }
  }

  // 題庫變動時：重新洗牌，若正在練該類別則立即套用
  window.addEventListener('bank-changed', (e) => {
    Object.keys(bags).forEach((k) => {
      if (k === e.detail.type || k.startsWith(e.detail.type + ':')) delete bags[k];
    });
    if (state.mode === e.detail.type) { state.history = []; state.queue = []; state.current = null; nextItem(); }
  });

  function updatePrevBtn() {
    const btn = $('prevItemBtn');
    if (btn) btn.disabled = state.mode !== 'dialogue' && state.history.length === 0;
  }

  function stepDialogue(delta) {
    const d = currentDialogue();
    state.dlgIdx = (state.dlgIdx + delta + d.lines.length) % d.lines.length;
    state.current = makeDialogueItem(state.dlgIdx);
    const nextIdx = (state.dlgIdx + 1) % d.lines.length;
    const nextLine = d.lines[nextIdx];
    els.upnext.textContent = nextIdx === 0
      ? `🎉 本篇最後一句（完成後將從第 1 句重新開始）`
      : `下一句（${nextLine.role}）：${nextLine.ko}`;
    updatePrevBtn();
    clearInput();
  }

  function prevItem() {
    if (state.mode === 'dialogue') {
      stepDialogue(-1);
      return;
    }
    if (!state.history.length) return;
    if (state.current) state.queue.unshift(state.current);
    state.current = state.history.pop();
    els.upnext.textContent = '下一題：' + state.queue[0].text;
    updatePrevBtn();
    clearInput();
  }

  function nextItem() {
    if (state.mode === 'dialogue') {
      state.current = makeDialogueItem(state.dlgIdx);
      const d = currentDialogue();
      const nextIdx = (state.dlgIdx + 1) % d.lines.length;
      const nextLine = d.lines[nextIdx];
      els.upnext.textContent = nextIdx === 0
        ? `🎉 本篇最後一句（完成後將從第 1 句重新開始）`
        : `下一句（${nextLine.role}）：${nextLine.ko}`;
      updatePrevBtn();
      clearInput();
      return;
    }
    if (state.current) {
      state.history.push(state.current);
      if (state.history.length > 50) state.history.shift();
    }
    while (state.queue.length < 2) state.queue.push(makeItem());
    state.current = state.queue.shift();
    state.queue.push(makeItem());
    els.upnext.textContent = '下一題：' + state.queue[0].text;
    updatePrevBtn();
    clearInput();
  }

  function advanceItem() {
    if (state.mode === 'dialogue') {
      const d = currentDialogue();
      state.dlgIdx = (state.dlgIdx + 1) % d.lines.length;
    }
    nextItem();
  }

  // ---------- 輸入處理 ----------
  function clearInput() {
    state.seq = [];
    els.input.value = '';
    state.lastKeysLen = 0;
    render();
  }

  function analyze() {
    const target = state.current.text;
    const input = els.input.value;
    const tKeys = H.toKeys(target);
    const iKeys = H.toKeys(input);
    let prefixOk = iKeys.length <= tKeys.length;
    for (let i = 0; prefixOk && i < iKeys.length; i++) if (iKeys[i] !== tKeys[i]) prefixOk = false;
    return { target, input, tKeys, iKeys, prefixOk, complete: input === target };
  }

  function onInputChanged(fromKey = true) {
    const a = analyze();
    if (fromKey && a.iKeys.length > state.lastKeysLen) {
      state.total += a.iKeys.length - state.lastKeysLen;
      if (!a.prefixOk) state.errors += 1;
    }
    state.lastKeysLen = a.iKeys.length;
    if (a.complete) return complete(a);
    render(a);
  }

  function complete(a) {
    if (state.completing) return;
    state.completing = true;
    state.doneKeys += a.tKeys.length;
    state.done += 1;
    render(a);
    els.card.classList.remove('flash');
    void els.card.offsetWidth;
    els.card.classList.add('flash');
    const finish = () => {
      state.completing = false;
      advanceItem();
      els.input.focus();
      updateStats();
    };
    if (!state.builtin) {
      // 讓系統輸入法先結束組字，避免殘字留在輸入框
      els.input.blur();
      setTimeout(finish, 0);
    } else finish();
  }

  els.input.addEventListener('keydown', (e) => {
    flashKey(e.code);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prevItem();
      else advanceItem();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); clearInput(); return; }
    if (!state.builtin) return;

    if (e.isComposing || e.keyCode === 229) {
      showHint('⚠️ 偵測到系統輸入法正在組字：請把系統輸入法切換成英文，或關閉右上角「內建韓文輸入」。', 'warn');
      return;
    }
    let handled = true;
    if (e.key === 'Backspace') state.seq.pop();
    else if (H.KEYMAP[e.code]) state.seq.push(H.KEYMAP[e.code][e.shiftKey ? 1 : 0]);
    else if (e.key.length === 1) state.seq.push(e.key);
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    els.input.value = H.compose(state.seq);
    onInputChanged(e.key !== 'Backspace');
  });

  els.input.addEventListener('input', () => {
    if (state.builtin) state.seq = H.toKeys(els.input.value); // 貼上等情況同步
    onInputChanged(true);
  });

  // ---------- 繪製 ----------
  function renderDialogueBar() {
    if (!els.dialogueBar) return;
    if (state.mode !== 'dialogue' || !state.current.role) {
      els.dialogueBar.hidden = true;
      return;
    }
    els.dialogueBar.hidden = false;
    const c = state.current;
    els.dialogueBar.innerHTML = `
      <span class="dlg-title" title="${c.dlgDesc || ''}">${c.dlgTitle}</span>
      <span class="dlg-role">🗣️ ${c.role}</span>
      <span class="dlg-step">第 ${c.step} / ${c.totalSteps} 句</span>
      <div class="dlg-nav">
        <button type="button" id="dlgPrev" title="上一句">◀</button>
        <button type="button" id="dlgNext" title="下一句">▶</button>
      </div>
    `;
    $('dlgPrev').onclick = (e) => { e.stopPropagation(); stepDialogue(-1); els.input.focus(); };
    $('dlgNext').onclick = (e) => { e.stopPropagation(); stepDialogue(1); els.input.focus(); };
  }

  function render(a = analyze()) {
    renderDialogueBar();
    const { target, input, prefixOk } = a;
    const frag = document.createDocumentFragment();
    const last = input.length - 1;
    const makeChar = (ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      span.className = 'ch';
      if (ch === ' ') span.classList.add('space');
      if (i < last) span.classList.add(input[i] === ch ? 'ok' : 'bad');
      else if (i === last) span.classList.add(input[i] === ch ? 'ok' : prefixOk ? 'pending' : 'bad');
      if (i === input.length || (i === last && input[i] !== ch && prefixOk)) span.classList.add('cursor');
      return span;
    };

    // 每個詞下方標註拼音
    const roman = state.opt.showRoman ? state.current.roman || '' : '';
    const words = target.split(' ');
    const romWords = roman.split(' ');
    const perWord = roman && romWords.length === words.length;
    let idx = 0;
    words.forEach((w, wi) => {
      if (wi > 0) {
        frag.appendChild(makeChar(' ', idx++));
        frag.appendChild(document.createTextNode('\u200B')); // 允許在詞與詞之間換行
      }
      const group = document.createElement('span');
      group.className = 'word';
      const chars = document.createElement('span');
      [...w].forEach((ch) => chars.appendChild(makeChar(ch, idx++)));
      group.appendChild(chars);
      if (perWord) {
        const r = document.createElement('span');
        r.className = 'wrom';
        r.textContent = romWords[wi];
        group.appendChild(r);
      }
      frag.appendChild(group);
    });
    els.target.replaceChildren(frag);
    els.target.classList.toggle('long', target.length > 14);
    els.target.classList.toggle('has-rom', !!perWord);
    els.roman.textContent = roman && !perWord ? roman : '';
    els.meaning.textContent = a.complete ? '✓ ' + state.current.meaning : state.current.meaning;

    // 下一個按鍵
    let next = null;
    if (!prefixOk) {
      next = 'Backspace';
      showHint('❌ 打錯了，按 Backspace 刪除後重打', 'bad');
    } else if (a.iKeys.length < a.tKeys.length) {
      next = a.tKeys[a.iKeys.length];
      const k = H.JAMO_KEY[next];
      if (k) showHint(`下一個：<b>${next}</b> → 按 <kbd>${k.shift ? 'Shift + ' : ''}${k.code.slice(3)}</kbd>`);
      else if (next === ' ') showHint('下一個：<kbd>空白鍵</kbd>');
      else showHint(`下一個：<kbd>${next}</kbd>`);
    } else showHint('');
    highlightKeyboard(next);
    highlightSidebar(next);
  }

  function showHint(html, cls = '') {
    els.hint.innerHTML = html;
    els.hint.className = 'hint ' + cls;
  }

  // ---------- 虛擬鍵盤 ----------
  const ROWS = [
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'Backspace'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
    ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'ShiftRight'],
    ['Space'],
  ];
  const keyEls = {};
  function buildKeyboard() {
    ROWS.forEach((row) => {
      const r = document.createElement('div');
      r.className = 'kb-row';
      row.forEach((code) => {
        const k = document.createElement('div');
        k.className = 'key';
        k.dataset.code = code;
        if (H.KEYMAP[code]) {
          const [n, s] = H.KEYMAP[code];
          k.classList.add(H.isVowel(n) ? 'vowel' : 'cons');
          if (code === 'KeyF' || code === 'KeyJ') {
            k.classList.add('homing');
          }
          k.innerHTML = `<span class="jm">${n}</span><span class="lt">${code.slice(3)}</span>${s !== n ? `<span class="sh">${s}</span>` : ''}`;
        } else {
          k.classList.add('wide', code.toLowerCase());
          k.textContent = { Backspace: '⌫ Back', ShiftLeft: '⇧ Shift', ShiftRight: '⇧ Shift', Space: '空白鍵 Space' }[code];
        }
        keyEls[code] = k;
        r.appendChild(k);
      });
      els.keyboard.appendChild(r);
    });
  }

  function keysForJamo(j) {
    if (j === ' ') return ['Space'];
    if (j === 'Backspace') return ['Backspace'];
    const k = H.JAMO_KEY[j];
    if (!k) return [];
    return k.shift ? [k.code, 'ShiftLeft', 'ShiftRight'] : [k.code];
  }

  function highlightKeyboard(next) {
    Object.values(keyEls).forEach((k) => k.classList.remove('next', 'err'));
    keysForJamo(next).forEach((c) => keyEls[c] && keyEls[c].classList.add(next === 'Backspace' ? 'err' : 'next'));
  }

  function flashKey(code) {
    const k = keyEls[code];
    if (!k) return;
    k.classList.add('pressed');
    setTimeout(() => k.classList.remove('pressed'), 140);
  }

  function peekKeys(jamo) {
    const codes = H.expand(jamo).flatMap(keysForJamo);
    codes.forEach((c) => keyEls[c] && keyEls[c].classList.add('peek'));
    setTimeout(() => codes.forEach((c) => keyEls[c] && keyEls[c].classList.remove('peek')), 1500);
  }

  // ---------- 字母表 ----------
  const cardEls = {};
  function keyLabel(j) {
    return H.expand(j).map((x) => {
      const k = H.JAMO_KEY[x];
      return k ? (k.shift ? '⇧' : '') + k.code.slice(3) : '';
    }).join(' + ');
  }

  function buildSidebar() {
    JAMO_GROUPS.forEach((g, gi) => {
      const sec = document.createElement('section');
      sec.className = 'jamo-group';
      sec.innerHTML = `<h3>${g.title}<small>${g.sub}</small></h3>`;
      const grid = document.createElement('div');
      grid.className = 'jamo-grid';
      g.items.forEach(([j, roman, name]) => {
        const c = document.createElement('button');
        c.className = 'jamo-card ' + (gi < 2 ? 'cons' : 'vowel');
        c.innerHTML = `<span class="j">${j}</span><span class="r">${roman}</span><span class="n">${name}</span><span class="k">${keyLabel(j)}</span>`;
        c.title = `${j}（${name}）· 發音 ${roman} · 按鍵 ${keyLabel(j)}`;
        c.addEventListener('click', () => { speak(name); peekKeys(j); els.input.focus(); });
        cardEls[j] = c;
        grid.appendChild(c);
      });
      sec.appendChild(grid);
      els.jamoList.appendChild(sec);
    });

    const sec = document.createElement('section');
    sec.className = 'jamo-group';
    sec.innerHTML = `<h3>複合收音（받침）<small>11 個 · 只出現在字尾</small></h3>
      <div class="chips">${FINAL_COMPOUNDS.map((j) => `<span class="chip" title="${keyLabel(j)}">${j}<em>${H.expand(j).join('+')}</em></span>`).join('')}</div>
      <p class="note">音節結構：<b>初聲</b>（子音）＋<b>中聲</b>（母音）＋（<b>終聲</b>／收音）。例：한 = ㅎ + ㅏ + ㄴ。母音單獨成字時前面要加 ㅇ，如 아、오。</p>`;
    els.jamoList.appendChild(sec);
  }

  function highlightSidebar(next) {
    Object.values(cardEls).forEach((c) => c.classList.remove('need'));
    if (next && cardEls[next]) cardEls[next].classList.add('need');
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.85;
    const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('ko'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // ---------- 模式 / 選項 ----------
  function buildOptions() {
    els.options.innerHTML = '';
    const opts = MODE_OPTIONS[state.mode];
    if (opts) {
      const group = document.createElement('div');
      group.className = 'opt-submodes';
      opts.forEach(([val, label]) => {
        const b = document.createElement('button');
        b.className = 'chip-btn' + (state.opt[state.mode] === val ? ' active' : '');
        b.textContent = label;
        b.onclick = () => {
          state.opt[state.mode] = val;
          if (state.mode === 'dialogue') state.dlgIdx = 0;
          save();
          buildOptions();
          state.history = [];
          state.queue = [];
          state.current = null;
          nextItem();
          els.input.focus();
        };
        group.appendChild(b);
      });
      els.options.appendChild(group);
    }

    const tools = document.createElement('div');
    tools.className = 'opt-tools';

    const prevBtn = document.createElement('button');
    prevBtn.id = 'prevItemBtn';
    prevBtn.className = 'chip-btn';
    prevBtn.textContent = '◀ 上一題';
    prevBtn.title = '回到上一題（Shift + Enter）';
    prevBtn.disabled = state.mode !== 'dialogue' && state.history.length === 0;
    prevBtn.onclick = () => { prevItem(); els.input.focus(); };
    tools.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'chip-btn';
    nextBtn.textContent = '下一題 ▶';
    nextBtn.title = '跳到下一題（Enter）';
    nextBtn.onclick = () => { advanceItem(); els.input.focus(); };
    tools.appendChild(nextBtn);

    const romBtn = document.createElement('button');
    romBtn.className = 'chip-btn' + (state.opt.showRoman ? ' active' : '');
    romBtn.textContent = state.opt.showRoman ? '🔤 拼音：顯示' : '🔤 拼音：隱藏';
    romBtn.onclick = () => {
      state.opt.showRoman = !state.opt.showRoman;
      save();
      buildOptions();
      render();
      els.input.focus();
    };
    tools.appendChild(romBtn);

    const kbBtn = document.createElement('button');
    const showKb = state.opt.showKeyboard !== false;
    kbBtn.className = 'chip-btn' + (showKb ? ' active' : '');
    kbBtn.textContent = showKb ? '⌨️ 鍵盤：顯示' : '⌨️ 鍵盤：隱藏';
    kbBtn.onclick = () => {
      state.opt.showKeyboard = !showKb;
      save();
      updateKeyboardVisibility();
      buildOptions();
      els.input.focus();
    };
    tools.appendChild(kbBtn);

    const sp = document.createElement('button');
    sp.className = 'chip-btn speak';
    sp.textContent = '🔊 朗讀題目';
    sp.onclick = () => { speak(state.current.text); els.input.focus(); };
    tools.appendChild(sp);

    els.options.appendChild(tools);
  }

  function setMode(mode) {
    state.mode = mode;
    if (mode === 'dialogue') state.dlgIdx = 0;
    save();
    [...els.modes.children].forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    state.history = [];
    state.queue = [];
    state.current = null;
    buildOptions();
    nextItem();
    els.input.focus();
  }

  els.modes.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setMode(b.dataset.mode);
  });

  els.ime.addEventListener('change', () => {
    state.builtin = els.ime.checked;
    save();
    clearInput();
    showHint(state.builtin ? '已啟用內建韓文輸入：請使用「英文」輸入法打字。' : '已切換為系統輸入法：請把系統輸入法切到「韓文 2-Set（두벌식）」。');
    els.input.focus();
  });

  // ---------- 統計 ----------
  function resetStats() {
    Object.assign(state, { total: 0, errors: 0, doneKeys: 0, done: 0 });
    updateStats();
  }

  function updateStats() {
    const acc = state.total ? Math.max(0, Math.round(((state.total - state.errors) / state.total) * 100)) : 100;
    if (els.acc) els.acc.textContent = acc + '%';
    if (els.done) els.done.textContent = state.done;
  }

  els.reset.addEventListener('click', () => { resetStats(); state.history = []; state.queue = []; state.current = null; nextItem(); els.input.focus(); });

  // 點擊題目區也聚焦輸入框
  els.card.addEventListener('click', () => els.input.focus());

  // ---------- 啟動 ----------
  buildKeyboard();
  updateKeyboardVisibility();
  buildSidebar();
  setMode(state.mode);
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
})();
