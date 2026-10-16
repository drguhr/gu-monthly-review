/* 顧家醫療 月考核線上填寫 — 前端（GitHub Pages） */
(function () {
  'use strict';
  const API = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  const app = document.getElementById('app');
  const who = document.getElementById('who');
  const S = { token: null, me: null, data: null, month: null, tab: 'eval' };

  // ───── 小工具 ─────
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無法儲存時略過 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const sess = {
    get() { try { return JSON.parse(sessionStorage.getItem('gu_session')); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem('gu_session', JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del() { try { sessionStorage.removeItem('gu_session'); } catch (e) { /* ignore */ } },
  };
  let toastTimer;
  function toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  async function api(action, body) {
    if (!API || API.indexOf('請貼上') >= 0) throw new Error('尚未設定 API 網址（config.js）');
    const res = await fetch(API, {
      method: 'POST', // text/plain 避免跨網域預檢，Apps Script 才收得到
      body: JSON.stringify(Object.assign({ action: action, token: S.token }, body || {})),
    });
    const out = await res.json();
    if (!out.ok) {
      if (out.code === 'AUTH') { logout(true); }
      throw new Error(out.error || '發生錯誤');
    }
    return out;
  }

  // ───── 登入 ─────
  function renderLogin(msg) {
    who.innerHTML = '';
    app.innerHTML = `
      <form class="login" id="loginForm" autocomplete="on">
        <h1>月考核填寫</h1>
        <p>請輸入人資提供的帳號與 PIN 碼</p>
        <label class="field" for="acc">帳號</label>
        <input class="input" id="acc" name="username" autocomplete="username" required autocapitalize="characters">
        <label class="field" for="pin">PIN 碼</label>
        <input class="input" id="pin" name="password" type="password" inputmode="numeric" autocomplete="current-password" required>
        <button class="btn block" type="submit" id="loginBtn">登入</button>
        <div class="err" id="loginErr">${esc(msg || '')}</div>
      </form>`;
    document.getElementById('loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      btn.disabled = true; btn.textContent = '登入中…';
      try {
        const out = await api('login', { account: document.getElementById('acc').value.trim(), pin: document.getElementById('pin').value });
        S.token = out.token; S.me = out.me; sess.set({ token: S.token, me: S.me });
        await loadHome();
      } catch (err) {
        document.getElementById('loginErr').textContent = err.message;
        btn.disabled = false; btn.textContent = '登入';
      }
    });
  }

  function logout(expired) {
    if (S.token && !expired) api('logout').catch(() => {});
    S.token = null; S.me = null; S.data = null; S.month = null; S.tab = 'eval'; sess.del();
    renderLogin(expired ? '登入已逾時，請重新登入' : '');
  }

  function renderWho() {
    who.innerHTML = `<span>${esc(S.me.name)}</span><button type="button" id="logoutBtn">登出</button>`;
    document.getElementById('logoutBtn').onclick = () => logout(false);
  }

  // ───── 首頁 ─────
  async function loadHome(month) {
    app.innerHTML = '<p class="muted center pad">載入中…</p>';
    const tokenAtStart = S.token;
    try {
      const data = await api('bootstrap', { month: month || S.month });
      if (S.token !== tokenAtStart) return; // 載入途中已登出或換帳號
      S.data = data;
      S.month = S.data.month; S.me = S.data.me;
      renderWho(); renderHome();
    } catch (err) {
      if (S.token) app.innerHTML = `<div class="empty">${esc(err.message)}<br><br><button class="btn" id="retry">重新整理</button></div>`;
      const r = document.getElementById('retry'); if (r) r.onclick = () => loadHome();
    }
  }

  function pill(status) { return `<span class="pill s-${esc(status)}">${esc(status)}</span>`; }

  function renderHome() {
    const d = S.data;
    const hasEval = d.toEvaluate.length > 0;
    const hasReview = d.queue.length > 0 || d.history.length > 0;
    const done = d.toEvaluate.filter(p => p.status !== '未填寫' && p.status !== '退回').length;
    const tabs = [];
    if (hasEval) tabs.push(['eval', '我要評核', d.toEvaluate.length - done]);
    if (hasReview) { tabs.push(['queue', '待我覆核', d.queue.length]); tabs.push(['history', '覆核紀錄', d.history.length]); }
    if (tabs.length && !tabs.some(t => t[0] === S.tab)) S.tab = tabs[0][0];

    let body = '';
    if (!tabs.length) body = '<div class="empty">這個月份沒有需要你評核或覆核的人員。<br>如果名單有誤，請聯絡人資。</div>';
    else if (S.tab === 'eval') body = renderEvalList(done);
    else body = renderReviewList(S.tab === 'queue' ? d.queue : d.history, S.tab === 'queue');

    app.innerHTML = `
      <div class="toolbar">
        <h2>${esc(S.month)} 月考核</h2>
        <select class="input" id="monthSel" aria-label="選擇月份">${d.months.map(m =>
          `<option ${m === S.month ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      </div>
      ${tabs.length > 1 ? `<div class="tabs" role="tablist">${tabs.map(t =>
        `<button class="tab" role="tab" data-tab="${t[0]}" aria-selected="${S.tab === t[0]}">${t[1]}<span class="count">${t[2]}</span></button>`).join('')}</div>` : ''}
      ${body}`;
    document.getElementById('monthSel').onchange = e => loadHome(e.target.value);
    app.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { S.tab = b.dataset.tab; renderHome(); }; });
    app.querySelectorAll('[data-emp]').forEach(b => { b.onclick = () => openEval(b.dataset.emp); });
    app.querySelectorAll('[data-rec]').forEach(b => { b.onclick = () => openReview(b.dataset.rec); });
  }

  function renderEvalList(done) {
    const list = S.data.toEvaluate;
    const pct = list.length ? Math.round(done / list.length * 100) : 0;
    const groups = {};
    list.forEach(p => { const k = p.branch + '｜' + p.role; (groups[k] = groups[k] || []).push(p); });
    return `
      <div class="progress"><span>已完成 ${done} / ${list.length}</span><div class="bar"><span style="width:${pct}%"></span></div></div>
      ${Object.keys(groups).map(k => `
        <div class="group-title">${esc(k)}</div>
        <div class="list">${groups[k].map(p => `
          <button class="row" data-emp="${esc(p.empId)}">
            <div><div class="name">${esc(p.name)}</div>
              <div class="sub">${esc(p.empId)}・${esc(p.role)}</div>
              ${p.returnReason ? `<div class="note">退回：${esc(p.returnReason)}</div>` : ''}</div>
            <div class="right">${p.adjusted ? '<span class="adj-tag">已調整</span>' : ''}${pill(p.status)}</div>
          </button>`).join('')}</div>`).join('')}`;
  }

  function renderReviewList(list, isQueue) {
    if (!list.length) return `<div class="empty">${isQueue ? '目前沒有待你覆核的評核 👍' : '這個月還沒有覆核紀錄'}</div>`;
    return `<div class="list">${list.map(r => `
      <button class="row" data-rec="${esc(r.id)}">
        <div><div class="name">${esc(r.name)}</div>
          <div class="sub">${esc(r.month)}・${esc(r.branch)}・${esc(r.role)}・評核人 ${esc(r.rater)}${r.submittedAt ? '・' + esc(r.submittedAt) : ''}</div></div>
        <div class="right">${r.adjusted ? '<span class="adj-tag">已調整</span>' : ''}${pill(r.status)}</div>
      </button>`).join('')}</div>`;
  }

  // ───── 填寫進度與紀實規則（網頁端只檢查填寫進度） ─────
  function check(role, scores) {
    const b = S.data.bank[role];
    const filled = scores.filter(v => v !== null && v !== undefined).length;
    if (b.type === 'staff') {
      return { filled, n: b.questions.length,
        needComment: scores.some(v => v === 5 || (v !== null && v !== undefined && v <= 2)),
        why: '有題目給 5 分或 1–2 分，請具體說明事實（必填）' };
    }
    return { filled, n: b.questions.length, needComment: false, why: '', optional: '選填，可作為紀錄。' };
  }

  // ───── 評核表單 ─────
  async function openEval(empId) {
    const p = S.data.toEvaluate.find(x => x.empId === empId);
    let rec = null;
    if (p.recordId) {
      app.innerHTML = '<p class="muted center pad">載入中…</p>';
      try { rec = (await api('record', { id: p.recordId })).record; } catch (err) { toast(err.message, true); return renderHome(); }
    }
    const draftKey = 'gu_draft_' + S.me.account + '_' + S.month + '_' + empId;
    const bank = S.data.bank[p.role];
    const editable = p.editable;
    // 可編輯時從評核人自己的原始分數開始；唯讀時顯示最後（覆核後）分數
    let scores = rec ? (editable ? rec.raterScores : rec.scores).slice() : bank.questions.map(() => null);
    let comment = rec ? rec.comment : '';
    const draft = editable ? store.get(draftKey) : null;
    if (draft && draft.scores && draft.scores.length === bank.questions.length) { scores = draft.scores; comment = draft.comment || ''; }

    let banner = '';
    if (p.status === '退回') banner = `<div class="banner red">退回原因：${esc(p.returnReason)}</div>`;
    else if (!editable && rec) banner = `<div class="banner info">這筆評核目前狀態為「${esc(rec.status)}」，已進入覆核流程，無法修改。</div>`;
    if (rec && !editable) banner += adjustBanner(rec);
    if (draft && editable) banner += '<div class="banner info">已載入上次未送出的草稿。</div>';

    renderForm({ person: p, bank, scores, comment, editable, draftKey, banner,
      marks: rec && !editable ? marksFor(rec) : {} });
  }

  /** 覆核人調整過的題目：{題號: '說明文字'} */
  function marksFor(rec) {
    const m = {};
    if (!rec.adjustments || !rec.adjustments.length) return m;
    rec.scores.forEach((v, i) => {
      const steps = [];
      let prev = rec.raterScores[i];
      rec.adjustments.forEach(a => {
        if (a.scores && a.scores[i] !== prev) { steps.push(`${a.by}調整為 ${a.scores[i]}`); prev = a.scores[i]; }
      });
      if (steps.length) m[i] = `評核人原評 ${rec.raterScores[i]} 分 → ` + steps.join(' → ');
    });
    return m;
  }

  function adjustBanner(rec) {
    if (!rec.adjustments || !rec.adjustments.length) return '';
    return rec.adjustments.map(a =>
      `<div class="banner amber"><b>${esc(a.by)}調整了分數</b>（標示「已調整」的題目）<br>說明：${esc(a.note)}</div>`).join('');
  }

  function questionHTML(bank, q, i, s, ro, mark) {
    const tag = mark ? `<span class="adj-tag">已調整</span>` : '';
    const note = mark ? `<div class="adj-note">${esc(mark)}</div>` : '';
    if (bank.type === 'staff') {
      const opts = [5, 4, 3, 2, 1].map(v =>
        `<button type="button" class="opt" data-q="${i}" data-v="${v}" aria-pressed="${s === v}" ${ro ? 'disabled' : ''}>
          <span class="sc">${v}</span><span class="tx">${esc(q.crit[v - 1])}</span></button>`).join('');
      return `<div class="q${mark ? ' adjusted' : ''}" id="q${i}"><div class="q-title">${i + 1}. ${esc(q.name)}${tag}</div>${note}<div class="opts">${opts}</div></div>`;
    }
    const chips = Array.from({ length: q.max + 1 }, (_, v) => q.max - v).map(v =>
      `<button type="button" class="chip" data-q="${i}" data-v="${v}" aria-pressed="${s === v}" ${ro ? 'disabled' : ''}>${v}</button>`).join('');
    return `<div class="q${mark ? ' adjusted' : ''}" id="q${i}"><div class="q-title">${i + 1}. ${esc(q.name)} <small>滿分 ${q.max}</small>${tag}</div>${note}
      <div class="chips">${chips}</div>
      ${ro ? '' : `<ul class="guide">${q.guide.map(g => `<li>${esc(g)}</li>`).join('')}</ul>`}</div>`;
  }

  function questionsHTML(bank, scores, ro, marks) {
    let html = '', lastCat = null;
    bank.questions.forEach((q, i) => {
      if (q.cat !== lastCat) { html += `<div class="cat">${esc(q.cat)}</div>`; lastCat = q.cat; }
      html += questionHTML(bank, q, i, scores[i], ro, (marks || {})[i]);
    });
    return html;
  }

  /** 綁定選分按鈕；onPick(i, v) 每次選分後呼叫 */
  function bindPicks(scores, onPick) {
    app.querySelectorAll('[data-q]').forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.q), v = Number(b.dataset.v);
        scores[i] = v;
        app.querySelectorAll(`[data-q="${i}"]`).forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === v)));
        document.getElementById('q' + i).classList.remove('missing');
        onPick(i, v);
      };
    });
  }

  function renderForm(o) {
    const { person: p, bank, editable } = o;
    const scores = o.scores;
    let comment = o.comment;
    app.innerHTML = `
      <button class="back" id="back">← 返回名單</button>
      <div class="head-card"><h2>${esc(p.name)}</h2>
        <div class="sub">${esc(S.month)}・${esc(p.branch)}・${esc(p.role)}・${esc(p.empId)}</div></div>
      ${o.banner || ''}
      <div class="${editable ? '' : 'ro'}">${questionsHTML(bank, scores, !editable, o.marks)}</div>
      <div class="comment-box">
        <label class="field" for="comment" style="margin-top:0">主管紀實</label>
        ${editable ? `<textarea class="input" id="comment" maxlength="1000" placeholder="請寫具體事實，例如日期、事件、次數">${esc(comment)}</textarea>`
          : `<div class="readonly-text">${esc(comment) || '（無）'}</div>`}
        <div class="hint" id="cHint"></div>
      </div>
      <div class="dock"><div class="dock-inner">
        <div class="stat" id="stat"></div>
        <div class="actions">${editable ? '<button class="btn" id="submit">送出評核</button>' : ''}</div>
      </div></div>`;
    document.getElementById('back').onclick = () => renderHome();

    const update = () => {
      const c = check(p.role, scores);
      document.getElementById('stat').innerHTML = editable ? `已填 <b>${c.filled}</b> / ${c.n}` : '';
      const hint = document.getElementById('cHint');
      hint.className = 'hint' + (c.needComment && editable ? ' req' : '');
      hint.textContent = !editable ? '' : c.needComment ? c.why : (c.optional || '選填。給 5 分或 1–2 分時必填。');
      const btn = document.getElementById('submit');
      if (btn) btn.disabled = c.filled < c.n || (c.needComment && comment.trim().length < 5);
      if (editable) store.set(o.draftKey, { scores, comment });
    };

    if (editable) {
      bindPicks(scores, update);
      document.getElementById('comment').oninput = e => { comment = e.target.value; update(); };
      document.getElementById('submit').onclick = async () => {
        const firstMissing = scores.findIndex(v => v === null || v === undefined);
        if (firstMissing >= 0) {
          document.getElementById('q' + firstMissing).classList.add('missing');
          document.getElementById('q' + firstMissing).scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const btn = document.getElementById('submit');
        btn.disabled = true; btn.textContent = '送出中…';
        try {
          const out = await api('submit', { month: S.month, empId: p.empId, scores, comment });
          store.del(o.draftKey);
          toast(`已送出：${p.name}（${out.status}）`);
          await loadHome(S.month);
        } catch (err) {
          toast(err.message, true); btn.disabled = false; btn.textContent = '送出評核';
        }
      };
    }
    update();
  }

  // ───── 覆核（可直接調整分數） ─────
  async function openReview(id) {
    app.innerHTML = '<p class="muted center pad">載入中…</p>';
    let rec;
    try { rec = (await api('record', { id })).record; } catch (err) { toast(err.message, true); return renderHome(); }
    const canAct = S.data.queue.some(q => q.id === id);
    renderReview(rec, canAct, false);
  }

  function renderReview(rec, canAct, adjusting) {
    const bank = S.data.bank[rec.role];
    const base = rec.scores.slice();          // 目前版本（評核人或上一關調整後）
    const scores = rec.scores.slice();         // 這次覆核要送出的版本
    const approveLabel = rec.status === '待核定' ? '核定' : '覆核通過';
    app.innerHTML = `
      <button class="back" id="back">← 返回</button>
      <div class="head-card"><h2>${esc(rec.name)} ${pill(rec.status)}</h2>
        <div class="sub">${esc(rec.month)}・${esc(rec.branch)}・${esc(rec.role)}・評核人 ${esc(rec.rater)}・送出 ${esc(rec.submittedAt)}</div></div>
      ${adjustBanner(rec)}
      ${adjusting ? '<div class="banner info"><b>調整模式</b>：直接點選你認為正確的分數，改過的題目會標示出來。送出時需填寫調整說明，評核人的原始分數仍會保留。</div>' : ''}
      <div class="${adjusting ? '' : 'ro'}" id="qs">${questionsHTML(bank, scores, !adjusting, marksFor(rec))}</div>
      <div class="comment-box"><div class="field" style="margin-top:0">主管紀實（評核人）</div>
        <div class="readonly-text">${esc(rec.comment) || '（無）'}</div>
        ${canAct ? `<label class="field" for="note">${adjusting ? '調整說明（必填）' : '退回原因（退回時必填）'}</label>
          <textarea class="input" id="note" placeholder="${adjusting ? '例如：第 8 題本月有一次耗材缺失，改為 3 分' : '例如：遲到次數請附打卡紀錄'}"></textarea>` : ''}
      </div>
      <div class="dock"><div class="dock-inner">
        <div class="stat" id="stat"></div>
        <div class="actions">${!canAct ? '' : adjusting
          ? `<button class="btn ghost" id="cancelAdj">取消調整</button><button class="btn" id="ok">送出調整並${approveLabel}</button>`
          : `<button class="btn danger" id="ret">退回</button><button class="btn ghost" id="adj">調整分數</button><button class="btn" id="ok">${approveLabel}</button>`}</div>
      </div></div>`;
    document.getElementById('back').onclick = () => renderHome();
    if (!canAct) return;

    const changed = () => scores.filter((v, i) => v !== base[i]).length;
    const update = () => {
      if (!adjusting) return;
      document.getElementById('stat').innerHTML = `已調整 <b>${changed()}</b> 題`;
    };
    if (adjusting) {
      bindPicks(scores, (i, v) => {
        const el = document.getElementById('q' + i);
        el.classList.toggle('adjusted', v !== base[i]);
        let n = el.querySelector('.adj-mine');
        if (v !== base[i]) {
          if (!n) { n = document.createElement('div'); n.className = 'adj-note adj-mine'; el.querySelector('.q-title').after(n); }
          n.textContent = `原為 ${base[i]} 分 → 你調整為 ${v} 分`;
        } else if (n) n.remove();
        update();
      });
      document.getElementById('cancelAdj').onclick = () => renderReview(rec, canAct, false);
    } else {
      document.getElementById('adj').onclick = () => renderReview(rec, canAct, true);
      document.getElementById('ret').onclick = () => act('return');
    }
    document.getElementById('ok').onclick = () => act('approve');
    update();

    async function act(action) {
      const note = document.getElementById('note').value.trim();
      if (action === 'return' && note.length < 2) { toast('請填寫退回原因', true); document.getElementById('note').focus(); return; }
      if (action === 'approve' && adjusting && changed() && note.length < 2) { toast('請填寫調整說明', true); document.getElementById('note').focus(); return; }
      app.querySelectorAll('.dock .btn').forEach(b => { b.disabled = true; });
      try {
        const body = action === 'return' ? { id: rec.id, reason: note }
          : (adjusting ? { id: rec.id, scores, note } : { id: rec.id });
        const out = await api(action, body);
        toast(`${rec.name}：${out.status}${out.adjusted ? '（已調整分數）' : ''}`);
        await loadHome(S.month);
      } catch (err) {
        toast(err.message, true); app.querySelectorAll('.dock .btn').forEach(b => { b.disabled = false; });
      }
    }
  }

  // ───── 啟動 ─────
  const saved = sess.get();
  if (saved && saved.token) { S.token = saved.token; S.me = saved.me; loadHome(); }
  else renderLogin();
})();
