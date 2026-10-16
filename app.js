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
  const fmt = n => (n === '' || n === null || n === undefined) ? '-' : (Math.round(Number(n) * 100) / 100).toFixed(1);

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
    S.token = null; S.me = null; S.data = null; sess.del();
    renderLogin(expired ? '登入已逾時，請重新登入' : '');
  }

  function renderWho() {
    who.innerHTML = `<span>${esc(S.me.name)}</span><button type="button" id="logoutBtn">登出</button>`;
    document.getElementById('logoutBtn').onclick = () => logout(false);
  }

  // ───── 首頁 ─────
  async function loadHome(month) {
    app.innerHTML = '<p class="muted center pad">載入中…</p>';
    try {
      S.data = await api('bootstrap', { month: month || S.month });
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
    if (S.tab === 'eval' && !hasEval && hasReview) S.tab = 'queue';
    const done = d.toEvaluate.filter(p => p.status !== '未填寫' && p.status !== '退回').length;
    const tabs = [];
    if (hasEval) tabs.push(['eval', '我要評核', d.toEvaluate.length - done]);
    if (hasReview) { tabs.push(['queue', '待我覆核', d.queue.length]); tabs.push(['history', '覆核紀錄', d.history.length]); }

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
            <div class="right">${pill(p.status)}</div>
          </button>`).join('')}</div>`).join('')}`;
  }

  function renderReviewList(list, isQueue) {
    if (!list.length) return `<div class="empty">${isQueue ? '目前沒有待你覆核的評核 👍' : '這個月還沒有覆核紀錄'}</div>`;
    return `<div class="list">${list.map(r => `
      <button class="row" data-rec="${esc(r.id)}">
        <div><div class="name">${esc(r.name)}</div>
          <div class="sub">${esc(r.month)}・${esc(r.branch)}・${esc(r.role)}・評核人 ${esc(r.rater)}${r.submittedAt ? '・' + esc(r.submittedAt) : ''}</div></div>
        <div class="right"><span class="pts">${r.total !== '' ? '總分 ' + esc(r.total) + '・' : ''}點值 ${fmt(r.points)}</span>${pill(r.status)}</div>
      </button>`).join('')}</div>`;
  }

  // ───── 計算（與後端相同規則，僅供預覽） ─────
  function calc(role, scores) {
    const b = S.data.bank[role];
    const filled = scores.filter(s => s !== null && s !== undefined).length;
    if (b.type === 'staff') {
      const flt = scores.reduce((a, s, i) => a + (s ? b.questions[i].pts[s - 1] : 0), 0);
      return {
        filled, n: b.questions.length, points: Math.max(0, Math.round((1 + flt) * 100) / 100), total: null,
        needComment: scores.some(s => s === 5 || (s !== null && s <= 2)),
        why: '有題目給 5 分或 1–2 分，請具體說明事實（必填）',
      };
    }
    const total = scores.reduce((a, s) => a + (s || 0), 0);
    let points = 1;
    if (total <= 0) points = 0;
    else for (const t of b.tiers) { if (total >= t[0]) { points = t[1]; break; } }
    return {
      filled, n: b.questions.length, points, total,
      needComment: filled === b.questions.length && (total >= 90 || total < 70),
      why: '總分 90 分以上或 70 分以下，請具體說明事實（必填）',
    };
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
    let scores = rec ? rec.scores.slice() : bank.questions.map(() => null);
    let comment = rec ? rec.comment : '';
    const draft = editable ? store.get(draftKey) : null;
    if (draft && draft.scores && draft.scores.length === bank.questions.length) { scores = draft.scores; comment = draft.comment || ''; }

    renderForm({
      person: p, bank, scores, comment, editable, draftKey,
      banner: p.status === '退回' ? `<div class="banner red">退回原因：${esc(p.returnReason)}</div>`
        : (!editable && rec ? `<div class="banner info">這筆評核目前狀態為「${esc(rec.status)}」，已進入覆核流程，無法修改。</div>` : '')
        + (draft && editable ? '<div class="banner info">已載入上次未送出的草稿。</div>' : ''),
    });
  }

  function questionHTML(bank, q, i, s, ro) {
    if (bank.type === 'staff') {
      const opts = [5, 4, 3, 2, 1].map(v => {
        const pt = q.pts[v - 1];
        return `<button type="button" class="opt" data-q="${i}" data-v="${v}" aria-pressed="${s === v}" ${ro ? 'disabled' : ''}>
          <span class="sc">${v}</span><span class="tx">${esc(q.crit[v - 1])}</span><span class="pt">點值 ${pt > 0 ? '+' : ''}${pt}</span></button>`;
      }).join('');
      return `<div class="q" id="q${i}"><div class="q-title">${i + 1}. ${esc(q.name)}</div><div class="opts">${opts}</div></div>`;
    }
    const chips = Array.from({ length: q.max + 1 }, (_, v) => q.max - v).map(v =>
      `<button type="button" class="chip" data-q="${i}" data-v="${v}" aria-pressed="${s === v}" ${ro ? 'disabled' : ''}>${v}</button>`).join('');
    return `<div class="q" id="q${i}"><div class="q-title">${i + 1}. ${esc(q.name)} <small>滿分 ${q.max}</small></div>
      <div class="chips">${chips}</div>
      <ul class="guide">${q.guide.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
  }

  function questionsHTML(bank, scores, ro) {
    let html = '', lastCat = null;
    bank.questions.forEach((q, i) => {
      if (q.cat !== lastCat) { html += `<div class="cat">${esc(q.cat)}</div>`; lastCat = q.cat; }
      html += questionHTML(bank, q, i, scores[i], ro);
    });
    return html;
  }

  function renderForm(o) {
    const { person: p, bank, editable } = o;
    let scores = o.scores, comment = o.comment;
    app.innerHTML = `
      <button class="back" id="back">← 返回名單</button>
      <div class="head-card"><h2>${esc(p.name)}</h2>
        <div class="sub">${esc(S.month)}・${esc(p.branch)}・${esc(p.role)}・${esc(p.empId)}</div></div>
      ${o.banner || ''}
      <div class="${editable ? '' : 'ro'}">${questionsHTML(bank, scores, !editable)}</div>
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
      const c = calc(p.role, scores);
      document.getElementById('stat').innerHTML =
        `已填 <b>${c.filled}</b> / ${c.n}　` + (c.total !== null ? `總分 <b>${c.total}</b>　` : '') + `核算點值 <b>${c.filled === c.n ? fmt(c.points) : '-'}</b>`;
      const hint = document.getElementById('cHint');
      hint.className = 'hint' + (c.needComment ? ' req' : '');
      hint.textContent = c.needComment ? c.why : (editable ? '選填。給 5 分或 1–2 分時必填。' : '');
      const btn = document.getElementById('submit');
      if (btn) btn.disabled = c.filled < c.n || (c.needComment && comment.trim().length < 5);
      if (editable) store.set(o.draftKey, { scores, comment });
    };

    if (editable) {
      app.querySelectorAll('[data-q]').forEach(b => {
        b.onclick = () => {
          const i = Number(b.dataset.q), v = Number(b.dataset.v);
          scores[i] = v;
          app.querySelectorAll(`[data-q="${i}"]`).forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === v)));
          document.getElementById('q' + i).classList.remove('missing');
          update();
        };
      });
      document.getElementById('comment').oninput = e => { comment = e.target.value; update(); };
      document.getElementById('submit').onclick = async () => {
        const firstMissing = scores.findIndex(s => s === null);
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
          toast(`已送出：${p.name}，核算點值 ${fmt(out.points)}（${out.status}）`);
          await loadHome(S.month);
        } catch (err) {
          toast(err.message, true); btn.disabled = false; btn.textContent = '送出評核';
        }
      };
    }
    update();
  }

  // ───── 覆核 ─────
  async function openReview(id) {
    app.innerHTML = '<p class="muted center pad">載入中…</p>';
    let rec;
    try { rec = (await api('record', { id })).record; } catch (err) { toast(err.message, true); return renderHome(); }
    const bank = S.data.bank[rec.role];
    const canAct = S.data.queue.some(q => q.id === id);
    const c = calc(rec.role, rec.scores);
    app.innerHTML = `
      <button class="back" id="back">← 返回</button>
      <div class="head-card"><h2>${esc(rec.name)} ${pill(rec.status)}</h2>
        <div class="sub">${esc(rec.month)}・${esc(rec.branch)}・${esc(rec.role)}・評核人 ${esc(rec.rater)}・送出 ${esc(rec.submittedAt)}</div></div>
      <div class="ro">${questionsHTML(bank, rec.scores, true)}</div>
      <div class="comment-box"><div class="field" style="margin-top:0">主管紀實</div>
        <div class="readonly-text">${esc(rec.comment) || '（無）'}</div>
        ${canAct ? `<label class="field" for="reason">退回原因（退回時必填）</label>
          <textarea class="input" id="reason" placeholder="例如：遲到次數請附打卡紀錄"></textarea>` : ''}
      </div>
      <div class="dock"><div class="dock-inner">
        <div class="stat">${c.total !== null ? `總分 <b>${c.total}</b>　` : ''}核算點值 <b>${fmt(rec.points)}</b></div>
        <div class="actions">${canAct ? `<button class="btn danger" id="ret">退回</button><button class="btn" id="ok">${rec.status === '待核定' ? '核定' : '覆核通過'}</button>` : ''}</div>
      </div></div>`;
    document.getElementById('back').onclick = () => renderHome();
    if (!canAct) return;
    const act = async (action) => {
      const reason = document.getElementById('reason').value.trim();
      if (action === 'return' && reason.length < 2) { toast('請填寫退回原因', true); document.getElementById('reason').focus(); return; }
      app.querySelectorAll('.dock .btn').forEach(b => { b.disabled = true; });
      try {
        const out = await api(action, { id, reason });
        toast(`${rec.name}：${out.status}`);
        await loadHome(S.month);
      } catch (err) {
        toast(err.message, true); app.querySelectorAll('.dock .btn').forEach(b => { b.disabled = false; });
      }
    };
    document.getElementById('ok').onclick = () => act('approve');
    document.getElementById('ret').onclick = () => act('return');
  }

  // ───── 啟動 ─────
  const saved = sess.get();
  if (saved && saved.token) { S.token = saved.token; S.me = saved.me; loadHome(); }
  else renderLogin();
})();
