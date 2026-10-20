(function (root) {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[\s\u200b]+/g, '').replace(/,/g, '.').replace(/[−–]/g, '-').replace(/^\+?∞$/, 'infinity');
  function grade(task, supplied) {
    const answers = Array.isArray(supplied) ? supplied.map(String) : [];
    if (task.type === 'single' || task.type === 'multiple') {
      const a = [...new Set(answers)].sort(), b = [...task.answer].sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    if (answers.length !== task.answer.length) return false;
    if (task.type === 'number') return task.fields.every((f, i) => {
      const raw = normalize(answers[i]);
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return false;
      return Math.abs(Number(raw) - f.value) <= f.tolerance + 1e-9;
    });
    return task.answer.every((v, i) => normalize(v) === normalize(answers[i]));
  }
  function shuffle(items, random = Math.random) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function latest(attempts) {
    const map = {};
    for (const a of attempts) if (!map[a.taskId] || map[a.taskId].at <= a.at) map[a.taskId] = a;
    return map;
  }
  function pool(tasks, selected, mode, attempts, days = 7, now = Date.now(), bookmarks = []) {
    const last = latest(attempts);
    return tasks.filter(t => selected.includes(t.topic) &&
      (mode !== 'wrong' || (last[t.id] && !last[t.id].correct)) &&
      (mode !== 'old' || !last[t.id] || Date.parse(last[t.id].at) < now - days * 86400000) &&
      (mode !== 'new' || !last[t.id]) && (mode !== 'saved' || bookmarks.includes(t.id)));
  }
  const api = { normalize, grade, shuffle, latest, pool };
  if (typeof module !== 'undefined') module.exports = api;
  else root.TIIK = api;
})(typeof window !== 'undefined' ? window : globalThis);
