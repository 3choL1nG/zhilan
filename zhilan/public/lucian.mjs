// Lucian UX/UI Prompt #039 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#039
// Lucian UX/UI Prompt #070 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#070

export function initTabs(root) {
  var tabs = Array.prototype.slice.call(root.querySelectorAll('.u039-tab'));
  var pill = root.querySelector('.u039-pill');
  var panel = root.querySelector('.u039-panel');
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DATA = [[["判断题", "基础练习", "300", "#e0e9ff"], ["单选题", "基础练习", "300", "#c8daff"], ["多选题", "基础练习", "300", "#dce6f5"], ["扩展题", "拓展练习", "300", "#edf0f4"]], [["判断题", "标准题库", "300", "#dce6ff"], ["练习目标", "巩固知识点", "专练", "#e5edf7"], ["练习进度", "按题型练习", "0", "#ebeff6"], ["完整题库", "现有原题", "示例", "#c8daff"]], [["单选题", "标准题库", "300", "#dce6ff"], ["练习目标", "巩固知识点", "专练", "#e5edf7"], ["练习进度", "按题型练习", "0", "#ebeff6"], ["完整题库", "现有原题", "示例", "#c8daff"]], [["多选题", "标准题库", "300", "#dce6ff"], ["练习目标", "巩固知识点", "专练", "#e5edf7"], ["练习进度", "按题型练习", "0", "#ebeff6"], ["完整题库", "现有原题", "示例", "#c8daff"]]];
  var progress={};try{progress=JSON.parse(root.dataset.progress||'{}');}catch{}
  DATA[0][3][1]=root.dataset.ready==='true'?'系统组卷可用':'按题型练习';
  ['j','s','m'].forEach(function(type,index){DATA[index+1][2][1]='已练原题';DATA[index+1][2][2]=String(progress[type]||0);DATA[index+1][3][0]='练习入口';DATA[index+1][3][1]='按题型开始练习';DATA[index+1][3][2]='可练';});
  var cur = 0, list = null;
  function movePill(animate) {
    var t = tabs[cur];
    if (!animate) pill.style.transition = 'none';
    pill.style.setProperty('--x', t.offsetLeft + 'px');
    pill.style.setProperty('--w', t.offsetWidth + 'px');
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
  }
  function make(i) {
    var ul = document.createElement('ul');
    ul.className = 'u039-list';
    ul.innerHTML = DATA[i].map(function (r, k) {
      return '<li class="u039-row" style="transition-delay:' + (k * 45) + 'ms"><span class="u039-art" style="--g:' + r[3] + '" aria-hidden="true">' + ["01","02","03","04"][k] + '</span><span><b>' + r[0] + '' + '</b><small>' + r[1] + '</small></span><em>' + r[2] + '</em></li>';
    }).join('');
    return ul;
  }
  function select(i, focus) {
    if (i === cur && list) return;
    var dir = i > cur ? 1 : -1;
    cur = i;
    tabs.forEach(function (t, k) { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    if (focus) tabs[i].focus();
    movePill(true);
    var next = make(i), old = list;
    list = next;
    if (!old || rm) { if (old) old.remove(); panel.appendChild(next); return; }
    Array.prototype.forEach.call(next.children, function (r) { r.style.transform = 'translateX(' + (dir * 70) + '%)'; r.style.opacity = '0'; });
    panel.appendChild(next);
    void next.offsetWidth;
    Array.prototype.forEach.call(next.children, function (r) { r.style.transform = ''; r.style.opacity = ''; });
    Array.prototype.forEach.call(old.children, function (r) { r.style.transform = 'translateX(' + (-dir * 60) + '%)'; r.style.opacity = '0'; });
    setTimeout(function () { old.remove(); }, 700);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(i); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); select((i + d + tabs.length) % tabs.length, true); }
    });
  });
  var uid = 'u039-' + Math.random().toString(36).slice(2, 7);
  panel.id = uid;
  tabs.forEach(function (t) { t.setAttribute('aria-controls', uid); });
  list = make(0);
  panel.appendChild(list);
  tabs.forEach(function (t, k) { t.tabIndex = k === 0 ? 0 : -1; });
  movePill(false);
  new ResizeObserver(function(){movePill(false);}).observe(root);
  window.refreshPill = function(){movePill(false);};
}

export function initToasts(root) {
  var zone = root.querySelector('.u070-zone'), empty = root.querySelector('.u070-empty'), live = root.querySelector('.u070-live');
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ICON = { ok: '<svg viewBox="0 0 18 18"><path d="M4 9.4l3.2 3.2L14 5.6"/></svg>', err: '<svg viewBox="0 0 18 18"><path d="M9 5v5M9 13h.01"/></svg>', info: '<svg viewBox="0 0 18 18"><path d="M3.5 4.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>', wait: '<i></i>' };
  var K = {
    ok: ['var(--ux-mint)', '保存完成', '已保存在当前浏览器'],
    err: ['var(--ux-danger)', '操作未完成', '请检查后重试', '关闭'],
    info: ['var(--ux-accent)', '练习提示', '当前页面操作反馈', '查看'],
    wait: ['var(--ux-warn)', '正在处理', '请稍候']
  };
  var list = [], open = false, DUR = 4500, seq = 0;
  function layout() {
    var acc = 0;
    list.forEach(function (t, i) {
      var el = t.el;
      el.classList.toggle('back', !open && i > 0);
      if (open) { el.style.setProperty('--y', -acc + 'px'); el.style.setProperty('--s', 1); el.style.setProperty('--o', 1); acc += el.offsetHeight + 8; }
      else { el.style.setProperty('--y', -(i * 14) + 'px'); el.style.setProperty('--s', (1 - i * 0.06).toFixed(2)); el.style.setProperty('--o', i > 2 ? 0 : 1); }
      el.style.zIndex = 50 - i;
      el.inert = !open && i > 0;
    });
    empty.style.opacity = list.length ? '0' : '1';
  }
  function remove(t, dir) {
    var i = list.indexOf(t);
    if (i < 0) return;
    list.splice(i, 1);
    t.el.classList.add('leave');
    if (dir) { t.el.style.setProperty('--dir', dir); t.el.classList.add('side'); }
    setTimeout(function () { t.el.remove(); }, 450);
    layout();
  }
  function push(k, title, body) {
    var d = title ? [K[k][0], title, body || '操作状态已更新。'] : K[k], el = document.createElement('div');
    el.className = 'u070-t enter';
    el.style.setProperty('--c', d[0]);
    el.setAttribute('role', k === 'err' ? 'alert' : 'status');
    el.innerHTML = '<span class="u070-ic" aria-hidden="true">' + ICON[k] + '</span><span class="u070-tx"><b></b><small></small></span>' + (d[3] ? '<button class="u070-act" type="button"></button>' : '') + '<button class="u070-x" type="button" aria-label="关闭通知"><svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg></button><span class="u070-bar" aria-hidden="true"></span>';
    el.querySelector('b').textContent = d[1]; el.querySelector('small').textContent = d[2];
    if (d[3]) el.querySelector('.u070-act').textContent = d[3];
    var t = { el: el, left: DUR, id: ++seq, k: k };
    zone.appendChild(el);
    list.unshift(t);
    void el.offsetWidth;
    el.classList.remove('enter');
    layout();
    live.textContent = d[1];
    el.querySelector('.u070-x').addEventListener('click', function () { remove(t); });
    if (d[3]) el.querySelector('.u070-act').addEventListener('click', function () { remove(t); if (k === 'err') push('wait'); });
    if (k === 'wait') {
      t.left = Infinity;
      setTimeout(function () {
        if (!root.isConnected || list.indexOf(t) < 0) return;
        el.style.setProperty('--c', K.ok[0]);
        el.querySelector('.u070-ic').innerHTML = ICON.ok;
        el.querySelector('b').textContent = 'All saved';
        el.querySelector('small').textContent = 'All 3 files uploaded';
        live.textContent = 'All saved';
        t.left = DUR;
      }, rm ? 300 : 1800);
    }
    var sx = 0, dx = 0, down = false;
    el.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; down = true; sx = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
    el.addEventListener('pointermove', function (e) { if (!down) return; dx = e.clientX - sx; el.style.setProperty('--dx', dx + 'px'); el.style.setProperty('--o', Math.max(0.2, 1 - Math.abs(dx) / 260)); });
    var end = function () { if (!down) return; down = false; el.classList.remove('drag'); if (Math.abs(dx) > 90) remove(t, dx > 0 ? 1 : -1); else { el.style.setProperty('--dx', '0px'); layout(); } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  var last = performance.now();
  (function loop(now) {
    if (!root.isConnected) return;
    var dt = now - last; last = now;
    if (!open) list.slice().forEach(function (t, i) {
      if (i > 0 || t.left === Infinity) return;
      t.left -= dt;
      t.el.style.setProperty('--left', Math.max(0, t.left / DUR).toFixed(3));
      if (t.left <= 0) remove(t);
    });
    requestAnimationFrame(loop);
  })(last);
  function setOpen(v) { if (open === v) return; open = v; layout(); }
  zone.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') setOpen(true); });
  zone.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !zone.contains(document.activeElement)) setOpen(false); });
  zone.addEventListener('focusin', function () { setOpen(true); });
  zone.addEventListener('focusout', function (e) { if (!zone.contains(e.relatedTarget)) setOpen(false); });
  zone.addEventListener('click', function (e) { if (!e.target.closest('button') && list.length > 1) setOpen(!open); });
  root.querySelectorAll('.u070-btns button').forEach(function (b) { b.addEventListener('click', function () { push(b.getAttribute('data-k')); }); });
  window.notifyA = push;
}
