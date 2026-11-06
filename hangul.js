// 韓文（兩班式 / 두벌식）組字與拆字引擎
(function (global) {
  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  // 實體鍵位 (event.code) -> 字母
  const KEYMAP = {
    KeyQ: ['ㅂ','ㅃ'], KeyW: ['ㅈ','ㅉ'], KeyE: ['ㄷ','ㄸ'], KeyR: ['ㄱ','ㄲ'], KeyT: ['ㅅ','ㅆ'],
    KeyY: ['ㅛ','ㅛ'], KeyU: ['ㅕ','ㅕ'], KeyI: ['ㅑ','ㅑ'], KeyO: ['ㅐ','ㅒ'], KeyP: ['ㅔ','ㅖ'],
    KeyA: ['ㅁ','ㅁ'], KeyS: ['ㄴ','ㄴ'], KeyD: ['ㅇ','ㅇ'], KeyF: ['ㄹ','ㄹ'], KeyG: ['ㅎ','ㅎ'],
    KeyH: ['ㅗ','ㅗ'], KeyJ: ['ㅓ','ㅓ'], KeyK: ['ㅏ','ㅏ'], KeyL: ['ㅣ','ㅣ'],
    KeyZ: ['ㅋ','ㅋ'], KeyX: ['ㅌ','ㅌ'], KeyC: ['ㅊ','ㅊ'], KeyV: ['ㅍ','ㅍ'], KeyB: ['ㅠ','ㅠ'],
    KeyN: ['ㅜ','ㅜ'], KeyM: ['ㅡ','ㅡ'],
  };

  // 字母 -> {code, shift}
  const JAMO_KEY = {};
  for (const [code, [n, s]] of Object.entries(KEYMAP)) {
    if (!(n in JAMO_KEY)) JAMO_KEY[n] = { code, shift: false };
    if (s !== n) JAMO_KEY[s] = { code, shift: true };
  }

  const VOWEL_COMBINE = { 'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ' };
  const JONG_COMBINE = { 'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ' };
  const SPLIT = {};
  for (const [k, v] of Object.entries(VOWEL_COMBINE)) SPLIT[v] = [k[0], k[1]];
  for (const [k, v] of Object.entries(JONG_COMBINE)) SPLIT[v] = [k[0], k[1]];

  const isConsonant = (c) => CHO.includes(c) || (JONG.includes(c) && c !== '');
  const isVowel = (c) => JUNG.includes(c);

  function syllable(cho, jung, jong) {
    return String.fromCharCode(0xAC00 + (CHO.indexOf(cho) * 21 + JUNG.indexOf(jung)) * 28 + JONG.indexOf(jong || ''));
  }

  // 將基本字母序列（含空白、標點）組合成韓文字串
  function compose(seq) {
    let out = '';
    let cur = null; // {cho, jung, jong}
    const flush = () => {
      if (!cur) return;
      if (cur.cho && cur.jung) out += syllable(cur.cho, cur.jung, cur.jong);
      else out += (cur.cho || '') + (cur.jung || '');
      cur = null;
    };
    for (const j of seq) {
      if (isConsonant(j)) {
        if (cur && cur.cho && cur.jung && !cur.jong) {
          if (JONG.includes(j)) cur.jong = j; else { flush(); cur = { cho: j }; }
        } else if (cur && cur.jong) {
          const c = JONG_COMBINE[cur.jong + j];
          if (c) cur.jong = c; else { flush(); cur = { cho: j }; }
        } else { flush(); cur = { cho: j }; }
      } else if (isVowel(j)) {
        if (cur && cur.jong) {
          let newCho;
          if (SPLIT[cur.jong]) { newCho = SPLIT[cur.jong][1]; cur.jong = SPLIT[cur.jong][0]; }
          else { newCho = cur.jong; cur.jong = ''; }
          flush();
          cur = { cho: newCho, jung: j };
        } else if (cur && cur.jung) {
          const c = VOWEL_COMBINE[cur.jung + j];
          if (c) cur.jung = c; else { flush(); cur = { jung: j }; }
        } else if (cur && cur.cho) {
          cur.jung = j;
        } else { flush(); cur = { jung: j }; }
      } else { flush(); out += j; }
    }
    flush();
    return out;
  }

  const expand = (j) => (SPLIT[j] ? SPLIT[j] : [j]);

  // 將字串拆成「按鍵字母」序列（複合母音/收音拆成基本字母）
  function toKeys(str) {
    const keys = [];
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const idx = code - 0xAC00;
        const cho = CHO[Math.floor(idx / 588)];
        const jung = JUNG[Math.floor((idx % 588) / 28)];
        const jong = JONG[idx % 28];
        keys.push(cho, ...expand(jung));
        if (jong) keys.push(...expand(jong));
      } else if (isConsonant(ch) || isVowel(ch)) {
        keys.push(...expand(ch));
      } else {
        keys.push(ch);
      }
    }
    return keys;
  }

  // ---------- 羅馬拼音（韓國文化觀光部 國語羅馬字表記法，含常見音變） ----------
  const R_CHO = { 'ㄱ':'g','ㄲ':'kk','ㄴ':'n','ㄷ':'d','ㄸ':'tt','ㄹ':'r','ㅁ':'m','ㅂ':'b','ㅃ':'pp','ㅅ':'s','ㅆ':'ss','ㅇ':'','ㅈ':'j','ㅉ':'jj','ㅊ':'ch','ㅋ':'k','ㅌ':'t','ㅍ':'p','ㅎ':'h' };
  const R_JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  const R_JONG = { '':'', 'ㄱ':'k','ㄲ':'k','ㅋ':'k','ㄳ':'k','ㄺ':'k','ㄴ':'n','ㄵ':'n','ㄶ':'n','ㄷ':'t','ㅅ':'t','ㅆ':'t','ㅈ':'t','ㅊ':'t','ㅌ':'t','ㅎ':'t',
    'ㄹ':'l','ㄼ':'l','ㄽ':'l','ㄾ':'l','ㅀ':'l','ㅁ':'m','ㄻ':'m','ㅂ':'p','ㅍ':'p','ㅄ':'p','ㄿ':'p','ㅇ':'ng' };
  const ASPIRATE = { 'ㄱ':'ㅋ','ㄷ':'ㅌ','ㅈ':'ㅊ' };

  function romanizeWord(word) {
    const syl = [...word].map((ch) => {
      const idx = ch.charCodeAt(0) - 0xAC00;
      return { cho: CHO[Math.floor(idx / 588)], jung: Math.floor((idx % 588) / 28), jong: JONG[idx % 28] };
    });
    for (let i = 0; i < syl.length - 1; i++) {
      const a = syl[i], b = syl[i + 1];
      const J = a.jong, C = b.cho;
      if (!J) continue;
      if (C === 'ㅇ') { // 連音
        if (J === 'ㅇ') continue;
        if (J === 'ㅎ') a.jong = '';
        else if (J === 'ㄶ' || J === 'ㅀ') { a.jong = ''; b.cho = J === 'ㄶ' ? 'ㄴ' : 'ㄹ'; }
        else if (SPLIT[J]) { a.jong = SPLIT[J][0]; b.cho = SPLIT[J][1]; }
        else {
          a.jong = '';
          b.cho = (J === 'ㄷ' && b.jung === 20) ? 'ㅈ' : (J === 'ㅌ' && b.jung === 20) ? 'ㅊ' : J; // 口蓋音化
        }
        continue;
      }
      if (J === 'ㅎ' || J === 'ㄶ' || J === 'ㅀ') { // ㅎ 的送氣化／脫落
        const base = J === 'ㅎ' ? '' : J === 'ㄶ' ? 'ㄴ' : 'ㄹ';
        if (ASPIRATE[C]) { b.cho = ASPIRATE[C]; a.jong = base; }
        else if (C === 'ㄴ') a.jong = base || 'ㄴ';
        else a.jong = base;
        continue;
      }
      const s = R_JONG[J];
      if (b.cho === 'ㄹ') {
        if (s === 'n' || s === 'l') a.jong = 'ㄹ'; // 流音化
        else b.cho = 'ㄴ';
      }
      if (b.cho === 'ㄴ' || b.cho === 'ㅁ') { // 鼻音化
        if (s === 'k') a.jong = 'ㅇ';
        else if (s === 't') a.jong = 'ㄴ';
        else if (s === 'p') a.jong = 'ㅁ';
        else if (s === 'l' && b.cho === 'ㄴ') b.cho = 'ㄹ';
      }
    }
    let out = '';
    syl.forEach((x, i) => {
      const prevL = i > 0 && R_JONG[syl[i - 1].jong] === 'l';
      out += (x.cho === 'ㄹ' && prevL ? 'l' : R_CHO[x.cho]) + R_JUNG[x.jung] + R_JONG[x.jong];
    });
    return out;
  }

  // 將整段文字轉成羅馬拼音；非韓文字元（空白、標點）保留
  function romanize(str) {
    return str.replace(/[\uAC00-\uD7A3]+/g, romanizeWord);
  }

  global.Hangul = { CHO, JUNG, JONG, KEYMAP, JAMO_KEY, compose, toKeys, expand, isConsonant, isVowel, romanize };
  if (typeof module !== 'undefined') module.exports = global.Hangul;
})(typeof window !== 'undefined' ? window : globalThis);
