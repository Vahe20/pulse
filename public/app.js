const root = document.querySelector('#app');
const notice = document.querySelector('#toast');
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  surveys: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6m-6 4h6m-6 4h3"/>',
  insights: '<path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zm6 13 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  issues: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  reports: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7m-7 4h7"/>',
  admin: '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2m1-15a3 3 0 0 1 0 6m1 3a4 4 0 0 1 4 4v2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  logout: '<path d="M10 17l5-5-5-5m5 5H3m11-8h6v16h-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  trend: '<path d="m3 17 6-6 4 4 7-8m-5 0h5v5"/>',
  alert: '<path d="M10 4 3 17a2 2 0 0 0 2 3h14a2 2 0 0 0 2-3L14 4a2 2 0 0 0-4 0zm2 5v4m0 3h.01"/>',
  star: '<path d="m12 3 2.8 5.9 6.5.9-4.7 4.6 1.1 6.5-5.7-3.1-5.7 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] ?? ''}</svg>`;
const wordmark = '<span class="wordmark"><img src="/favicon.svg" width="34" height="34" alt="">Pulse<span class="brand-dot">.</span></span>';
const roles = { manage: ['Edu Lead', 'System Admin'], review: ['Edu Lead', 'Admin Lead', 'System Admin'], issue: ['Edu Lead', 'Admin Lead', 'Director', 'System Admin'] };
const state = { user: null, demo: false, options: {}, filters: {}, issueFilter: '', mod: 0 };
const can = permission => roles[permission]?.includes(state.user?.role);
const shortDate = value => value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined }).format(new Date(value)) : '—';
const fullDate = value => value ? new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
const formatScore = value => value == null ? '—' : value.toFixed(1);
const formatRate = value => value == null ? '—' : `${Number(value.toFixed(1))}%`;
const slug = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const badge = value => `<span class="badge ${slug(value)}"><i></i>${esc(value)}</span>`;
const btn = (text, action, symbol, style = 'secondary') => `<button type="button" class="button ${style}" data-action="${esc(action)}">${symbol ? icon(symbol) : ''}${esc(text)}</button>`;
const link = (text, href, symbol = 'arrow') => `<a class="text-link" href="#${href}">${esc(text)}${icon(symbol)}</a>`;
const empty = text => `<div class="empty">${esc(text)}</div>`;
const roleStudent = () => state.user?.role === 'Student';
const operational = category => ['Organization', 'Infrastructure'].includes(category);
const navItems = [['overview', 'Overview'], ['surveys', 'Surveys'], ['insights', 'AI Insights'], ['issues', 'Issue Tracker'], ['reports', 'Reports']];
const summaryLabels = { positives: 'What’s working', problems: 'Main problems', recurring: 'Recurring feedback', critical: 'Critical observations', recommendations: 'Recommendations' };

async function api(path, method = 'GET', payload) {
  const res = await fetch('/api' + path, { method, ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error ?? 'Request failed.');
    error.status = res.status;
    throw error;
  }
  return data;
}
let toastTimer;
function toast(text, error = false) {
  notice.textContent = text;
  notice.className = error ? 'show error' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { notice.className = ''; }, 4200);
}
function page() {
  const [view, id] = (location.hash.slice(1) || (roleStudent() ? 'surveys' : 'overview')).split('/');
  return [view, id && Number(id)];
}
const go = path => { location.hash = path; };
function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(value => value[0]).join('');
}

function shell(content, view) {
  const user = state.user;
  const items = roleStudent() ? [['surveys', 'My surveys']] : [...navItems];
  if (user.role === 'System Admin') items.push(['admin', 'Administration']);
  const nav = items.map(([id, text]) => `<a href="#${id}" class="nav-item ${view === id || (view.startsWith(id) && id === 'surveys') ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}>${icon(id)}${text}</a>`).join('');
  const current = items.find(([id]) => view.startsWith(id))?.[1] ?? (view === 'notifications' ? 'Notifications' : 'Workspace');
  root.innerHTML = `<div class="layout">
    <aside class="sidebar" id="nav-panel"><a class="brand" href="#${roleStudent() ? 'surveys' : 'overview'}">${wordmark}</a>
      <div class="workspace"><span class="workspace-icon">A</span><div><strong>Academy</strong><small>Workspace</small></div></div>
      <nav aria-label="Workspace"><div class="nav-caption">WORKSPACE</div>${nav}</nav>
      <div class="sidebar-bottom"><a href="#notifications" class="nav-item ${view === 'notifications' ? 'active' : ''}">${icon('bell')} Notifications</a>
      <div class="account"><span class="avatar">${esc(initials(user.name))}</span><div><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small></div><button class="icon-button signout" type="button" title="Sign out" aria-label="Sign out" data-action="logout">${icon('logout')}</button></div></div>
    </aside>
    <div class="main"><header class="topbar"><div class="breadcrumbs"><button type="button" class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-controls="nav-panel" aria-expanded="false">${icon('menu')}</button><span>Workspace</span>${icon('chevron')}<strong>${esc(current)}</strong></div>
    <div class="top-actions"><a class="icon-button" aria-label="Notifications" title="Notifications" href="#notifications">${icon('bell')}${state.unread ? '<i class="notification-dot"></i>' : ''}</a><span class="top-separator"></span><span class="avatar small" title="${esc(user.name)}">${esc(initials(user.name))}</span></div></header>
    <main class="content" id="main-content">${content}</main></div>
    <dialog id="dialog"></dialog>
  </div>`;
}

function login() {
  root.innerHTML = `<div class="login-screen"><section class="login-brand">${wordmark}<div><p class="login-overline">STUDENT FEEDBACK WORKSPACE</p><h1>Listen.<br>Learn.<br>Improve.</h1><p>Collect feedback, understand what matters, and follow through on improvements.</p></div><div class="login-wave"></div></section><main class="login-form"><div>
    <h2>Sign in to Pulse</h2><p>Use your academy account to access your workspace.</p>
    <form id="login-form"><label>Email<input name="email" type="email" required autocomplete="username" placeholder="you@academy.edu"></label><label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Enter your password"></label><button class="button primary" type="submit">Sign in ${icon('arrow')}</button></form>
    ${state.demo ? `<div class="demo-box"><strong>Try the demo workspace</strong><div>${[['director', 'Director'], ['edu', 'Edu Lead'], ['ops', 'Admin Lead'], ['student', 'Student'], ['lecturer', 'Lecturer'], ['admin', 'System Admin']].map(([value, title]) => btn(title, 'demo:' + value)).join('')}</div></div>` : ''}
  </div></main></div>`;
}

const heading = (title, detail, actions = '') => `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(detail)}</p></div><div class="heading-actions">${actions}</div></div>`;
function options(values, selected, placeholder) {
  return (placeholder == null ? '' : `<option value="">${esc(placeholder)}</option>`) + (values ?? []).map(item => {
    const value = typeof item === 'object' ? item.id : item;
    const name = typeof item === 'object' ? item.name : item;
    return `<option value="${esc(value)}" ${String(selected ?? '') === String(value) ? 'selected' : ''}>${esc(name)}</option>`;
  }).join('');
}
const select = (title, name, values, selected, placeholder, required = false) => `<label>${esc(title)}<select name="${esc(name)}" ${required ? 'required' : ''}>${options(values, selected, placeholder)}</select></label>`;
const input = (title, name, value = '', type = 'text', extra = '') => `<label>${esc(title)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label>`;
const textarea = (title, name, value = '', extra = '') => `<label>${esc(title)}<textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`;
const query = () => new URLSearchParams(Object.entries(state.filters).filter(([, value]) => value)).toString();
const filterForm = () => `<form id="filters" class="filter-bar"><div class="filter-title">${icon('filter')} Filters</div>
  ${select('Course', 'course', state.options.courses, state.filters.course, 'All courses')}
  ${select('Group', 'group', state.options.groups, state.filters.group, 'All groups')}
  ${select('Lecturer', 'lecturer', state.options.lecturers, state.filters.lecturer, 'All lecturers')}
  ${select('Survey type', 'type', state.options.types, state.filters.type, 'All types')}
  ${select('Issue status', 'status', state.options.statuses, state.filters.status, 'All statuses')}
  <details class="dates" ${state.filters.from || state.filters.to ? 'open' : ''}><summary>${icon('calendar')} Date range</summary>
    <div class="date-inputs">${input('From', 'from', state.filters.from, 'date')}${input('To', 'to', state.filters.to, 'date')}</div></details>
  ${Object.values(state.filters).some(Boolean) ? btn('Clear', 'clear-filters') : ''}</form>`;
const metric = (name, value, text, symbol, color) => `<article class="metric"><div class="metric-top"><span class="metric-icon ${color}">${icon(symbol)}</span><span>${esc(name)}</span></div><strong>${esc(value)}</strong><small>${esc(text)}</small></article>`;
const dueLabel = item => {
  if (['Resolved', 'Closed'].includes(item.status)) return shortDate(item.dueDate);
  const local = new Date();
  const today = new Date(local - local.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const upcoming = new Date(Date.parse(today) + 3 * 86400000).toISOString().slice(0, 10);
  return `<span class="${item.dueDate < today ? 'overdue' : item.dueDate <= upcoming ? 'due-soon' : ''}">${shortDate(item.dueDate)}${item.dueDate < today ? ' · Overdue' : item.dueDate <= upcoming ? ' · Due soon' : ''}</span>`;
};
const issueTable = rows => rows.length ? `<div class="table-scroll"><table><thead><tr><th>Issue</th><th>Priority</th><th>Status</th><th>Owner</th><th>Due date</th></tr></thead><tbody>${rows.map(i => `<tr><td><a href="#issues/${i.id}">${esc(i.title)}</a><small>${esc(i.category)}</small></td><td>${badge(i.priority)}</td><td>${badge(i.status)}</td><td><span class="table-person"><i class="avatar tiny">${esc(initials(i.assignee))}</i>${esc(i.assignee)}</span></td><td>${dueLabel(i)}</td></tr>`).join('')}</tbody></table></div>` : empty('No issues match this view.');

function graph(entries) {
  if (!entries.length) return empty('Scores will appear after enough students respond.');
  const points = entries.slice(-10);
  const from = 43, to = 574;
  const xs = points.map((_, i) => points.length === 1 ? (from + to) / 2 : from + (to - from) * i / (points.length - 1));
  const ys = points.map(point => 22 + (5 - point.score) * 38);
  const curve = xs.map((x, i) => i ? `C ${(xs[i - 1] + x) / 2} ${ys[i - 1]} ${(xs[i - 1] + x) / 2} ${ys[i]} ${x} ${ys[i]}` : `M ${x} ${ys[i]}`).join(' ');
  return `<svg class="chart" viewBox="0 0 610 210" role="img" aria-label="${esc('Satisfaction over time. ' + points.map(p => `${shortDate(p.date)} ${formatScore(p.score)}`).join(', '))}">
    <defs><linearGradient id="score-fill" x2="0" y2="1"><stop stop-color="#7658f5" stop-opacity=".23"/><stop offset="1" stop-color="#7658f5" stop-opacity=".015"/></linearGradient></defs>
    ${[5, 4, 3, 2, 1].map((n, i) => `<text x="4" y="${26 + i * 38}">${n}.0</text><path d="M43 ${22+i*38}H574" class="gridline"/>`).join('')}
    ${points.length > 1 ? `<path d="${curve} L ${xs.at(-1)} 174 H ${xs[0]} Z" fill="url(#score-fill)"/><path d="${curve}" class="chart-line"/>` : ''}
    ${xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="4.6"><title>${esc(points[i].name)} · ${formatScore(points[i].score)}/5</title></circle>${points.length <= 6 || i % 2 === 0 || i === points.length - 1 ? `<text x="${x}" y="199" text-anchor="middle">${esc(shortDate(points[i].date))}</text>` : ''}`).join('')}
  </svg>`;
}

function scoreBars(scores) {
  return scores.length ? `<div class="score-bars">${scores.map((row, i) => `<div class="score-row"><div><strong>${esc(row.category)}</strong><span>${formatScore(row.score)} <small>/ 5</small></span></div><div class="track"><span class="bar b${i % 5}" style="width:${row.score * 20}%"></span></div></div>`).join('')}</div>` : empty('No scores available.');
}

const trendRows = entries => entries.length ? `<div class="table-scroll"><table><thead><tr><th>Criterion</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>${entries.map(i => `<tr><td><strong>${esc(i.category)}</strong><small>${esc(i.survey)}</small></td><td>${i.mentions ? i.before : formatScore(i.before)}</td><td>${i.mentions ? i.after : formatScore(i.after)}</td><td><span class="${i.change < 0 ? 'overdue' : 'positive-text'}">${i.change >= 0 ? '+' : ''}${i.change.toFixed(1)}</span> ${i.critical ? badge('Attention required') : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('A comparison requires matching criteria and sufficient responses.');
const card = (title, subtitle, contents, action = '') => `<section class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${action}</div>${contents}</section>`;
const themeRows = themes => themes.length ? `<div class="theme-list">${themes.map(t => `<div class="theme-row"><span class="metric-icon purple">${icon('insights')}</span><div><strong>${esc(t.name)}</strong><p>${esc(t.description)}</p></div><span class="mention">${t.count} mentions</span></div>`).join('')}</div>` : empty('No published themes for the latest survey.');

function coverage(rows) {
  return rows.length ? `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Survey type / criteria</th><th>Responses</th><th>Score</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.name)}</strong></td><td title="${esc(r.criteria.join('\n'))}">${esc(r.type)} · ${r.criteria.length} criteria</td><td>${r.responses} of ${r.invited}</td><td>${formatScore(r.score)} / 5</td></tr>`).join('')}</tbody></table></div>` : empty('No comparable cohorts in the selected date range.');
}
function dashboard(data, report) {
  state.dashboard = data;
  const actions = report ? btn('CSV', 'export-csv', 'download') + btn('Print / PDF', 'export-pdf', 'reports', 'primary')
    : `<a href="#reports" class="button secondary">${icon('download')} Export report</a>${can('manage') ? btn('New survey', 'new-survey', 'plus', 'primary') : ''}`;
  const flags = data.trends.filter(t => t.critical);
  return heading(report ? 'Reports' : 'Overview', report ? 'Compare survey results and export the current view.' : 'Monitor student feedback, survey performance, and follow-up actions.', actions) +
    filterForm() +
    `<section class="metrics" aria-label="Key metrics">
      ${metric('Total surveys', data.surveys, 'Across selected cohorts', 'surveys', 'purple')}
      ${metric('Response rate', formatRate(data.responseRate), `${data.count} of ${data.invited} invitations`, 'trend', 'mint')}
      ${metric('Satisfaction score', data.score == null ? '—' : `${formatScore(data.score)} / 5`, 'Average rating', 'star', 'gold')}
      ${metric('Open issues', data.open, 'Awaiting resolution', 'alert', 'rose')}
      ${metric('Resolved issues', data.resolved, 'Resolved and closed', 'check', 'blue')}
      ${metric('Critical trends', data.critical, `Drops of ${data.threshold}+ points`, 'trend', 'lavender')}
    </section>` +
    `<div class="grid-two chart-grid">${card('Satisfaction over time', 'Average rating by survey', graph(data.timeline), '<span class="legend"><i></i>Satisfaction score</span>')}
    ${card('Scores by category', 'Average across selected surveys', scoreBars(data.scores))}</div>` +
    (report ? card('Historical comparison', 'Matching criteria within the same group and survey type', trendRows(data.trends)) +
      `<div class="grid-two">${card('Group comparison', 'Matching survey type and rating criteria', coverage(data.groups))}
        ${card('Lecturer comparison', 'Sample size and coverage shown for each cohort', coverage(data.lecturers))}</div>` :
      `${card('Recent issues', 'Track follow-up work from student feedback', issueTable(data.recentIssues), link('View all issues', 'issues'))}
      <div class="grid-two">${card('Latest feedback themes', data.latest, themeRows(data.themes), link('AI Insights', 'insights'))}
        ${card('Trends to watch', 'Rating drops that meet your attention threshold', flags.length ? trendRows(flags.slice(0, 5)) : empty('No significant drops in the selected surveys.'))}</div>`);
}

function surveyList(rows, insights = false) {
  if (insights) return heading('AI Insights', 'Review themes and summaries generated from student feedback.') +
    (rows.length ? `<div class="survey-grid">${rows.filter(s => s.status !== 'Draft').map(s => `<a class="survey-tile panel" href="#insights/${s.id}"><span class="metric-icon purple">${icon('insights')}</span>
      <h2>${esc(s.title)}</h2><p>${esc(s.groupName)} · ${s.responses} responses</p><span class="text-link">View analysis ${icon('arrow')}</span></a>`).join('') || empty('Publish a survey to see AI insights.')}</div>` : empty('No surveys are available.'));
  return heading(roleStudent() ? 'My surveys' : 'Surveys', roleStudent() ? 'Share feedback on your courses.' : 'Create surveys and track participation.',
    can('manage') ? btn('New survey', 'new-survey', 'plus', 'primary') : '') +
    (rows.length ? `<section class="panel"><div class="table-scroll"><table><thead><tr><th>Survey</th><th>Status</th>${roleStudent() ? '' : '<th>Responses</th>'}<th>Closes</th><th></th></tr></thead>
      <tbody>${rows.map(s => `<tr><td><a href="#surveys/${s.id}">${esc(s.title)}</a><small>${esc([s.groupName, s.type, s.anonymous ? 'Anonymous' : 'Identified'].filter(Boolean).join(' · '))}</small></td>
      <td>${badge(s.completed ? 'Submitted' : s.status)}</td>${roleStudent() ? '' : `<td>${s.responses} / ${s.invited} <small>${formatRate(s.responseRate)}</small></td>`}
      <td>${shortDate(s.endDate)}</td><td>${link(roleStudent() && !s.completed && s.status === 'Active' ? 'Open survey' : 'Details', 'surveys/' + s.id)}</td></tr>`).join('')}</tbody></table></div></section>` : empty(roleStudent() ? 'You have no survey invitations yet.' : 'Create a survey to start collecting feedback.'));
}

function studentSurvey(s) {
  if (s.completed || s.status !== 'Active') return heading(s.title, s.description, link('My surveys', 'surveys')) +
    card(s.completed ? 'Feedback submitted' : 'Survey closed', '', empty(s.completed ? 'Thanks for sharing your feedback.' : 'This survey is no longer accepting responses.'));
  const controls = s.questions.map(q => {
    const value = s.draft[q.id];
    const name = `answer-${q.id}`;
    let field;
    if (q.type === 'Text') field = `<textarea aria-label="${esc(q.text)}" placeholder="Enter your feedback" rows="4" maxlength="4000" name="${name}" ${q.required ? 'required' : ''}>${esc(value)}</textarea>`;
    else {
      const choices = q.type === 'Rating' ? [1, 2, 3, 4, 5] : q.options;
      field = `<div class="answer-choices ${q.type === 'Rating' ? 'rating-choices' : ''}">${choices.map(v => `<label><input type="${q.type === 'Multiple Choice' ? 'checkbox' : 'radio'}" name="${name}" value="${esc(v)}" ${v === value || Array.isArray(value) && value.includes(v) ? 'checked' : ''} ${q.required && q.type !== 'Multiple Choice' ? 'required' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
    }
    return `<fieldset class="question"><legend>${esc(q.text)}${q.required ? '<span aria-label="required"> *</span>' : ''}</legend><p>${esc(q.type)}</p>${field}</fieldset>`;
  }).join('');
  return heading(s.title, s.description, link('My surveys', 'surveys')) + `<section class="panel form-panel">
    <div class="survey-meta">${badge(s.anonymous ? 'Anonymous' : 'Identified')} Closes ${fullDate(s.endDate)}</div>
    <form id="response-form">${controls}<div class="form-actions">${btn('Save draft', 'save-response')}<button class="button primary" type="submit">Submit feedback ${icon('arrow')}</button></div></form></section>`;
}

function insightsView(detail) {
  const { survey, analysis, published } = detail;
  const status = analysis?.status;
  const canRun = can('review') && survey.responses >= survey.minimum && !['Queued', 'Processing'].includes(status);
  const actions = (canRun ? btn(analysis ? 'Run analysis again' : 'Run analysis', 'run-analysis', 'insights', 'primary') : '') + link('Survey details', 'surveys/' + survey.id);
  const result = status === 'Review' && can('review') ? analysis.result : published;
  let content = '';
  if (['Queued', 'Processing', 'Failed'].includes(status)) content += `<div class="banner">${badge(status)} ${esc(analysis.error ?? 'Analysis runs in the background. This view updates automatically.')}</div>`;
  if (!result) content += card('Survey analysis', '', empty(survey.responses < survey.minimum ? `Results unlock at ${survey.minimum} responses.` : 'Run an analysis to generate themes and a summary.'));
  else if (status === 'Review' && can('review')) {
    content += `<form id="review-form" class="review-form"><div class="banner">${badge('Needs review')} Review suggestions before publishing. Source: ${esc(result.source)}.</div>
      ${card('Survey summary', '', `<div class="edit-grid">${Object.entries(summaryLabels).map(([key, title]) => textarea(title, 'sum-' + key, result.summary[key], 'required maxlength="2400"')).join('')}</div>`)}
      ${card('Suggested themes', 'Check categories, sentiment, and classifications.', result.themes.map((t, index) => `<div class="review-theme"><div class="review-theme-head"><strong>${t.count} mentions</strong>${t.confidence < .7 ? badge('Low confidence') : badge(t.sentiment)} <span>${Math.round(t.confidence * 100)}% confidence</span></div><div class="edit-grid">
        ${input('Name', 'theme-name-' + index, t.name, 'text', 'required maxlength="160"')}${select('Category', 'theme-category-' + index, state.options.categories, t.category)}
        ${textarea('Description', 'theme-description-' + index, t.description, 'required maxlength="800"')}${select('Sentiment', 'theme-sentiment-' + index, ['Positive', 'Neutral', 'Negative'], t.sentiment)}</div></div>`).join('') || empty('No text comments were submitted.'))}
      ${result.comments?.length ? card('Comment classifications', survey.anonymous ? 'Anonymous comment text is restricted. You can correct the assigned theme and sentiment.' : 'Correct the assigned theme and sentiment.', `<div class="review-comments">${result.comments.map((c, index) => `<div class="review-comment"><div><strong>Comment ${index + 1}</strong> ${c.confidence < .7 ? badge('Low confidence') : ''}${c.text ? `<p>${esc(c.text)}</p>` : ''}</div>
        ${select('Theme', 'comment-theme-' + index, result.themes.map(t => ({ id: t.id, name: t.name })), c.themeId)}
        ${select('Sentiment', 'comment-sentiment-' + index, ['Positive', 'Neutral', 'Negative'], c.sentiment)}</div>`).join('')}</div>`) : ''}
      <div class="form-actions"><button class="button secondary" type="submit" value="save">Save review</button><button class="button primary" type="submit" value="publish">Publish analysis</button></div></form>`;
  } else {
    content += card('Survey summary', `Published · ${result.source}`, `<div class="summary-grid">${Object.entries(summaryLabels).map(([key, title]) => `<div><h3>${esc(title)}</h3><p>${esc(result.summary[key])}</p></div>`).join('')}</div>`);
    content += card('Extracted themes', '', result.themes.map((t, index) => `<div class="theme-row spacious"><span class="metric-icon purple">${icon('insights')}</span><div><strong>${esc(t.name)}</strong><p>${esc(t.description)}</p><div class="theme-tags">${badge(t.sentiment)}${t.confidence < .7 ? badge('Low confidence') : ''}<span class="mention">${t.count} mentions</span></div></div>
      ${can('issue') && (state.user.role !== 'Admin Lead' || ['Organization', 'Infrastructure'].includes(t.category)) && (state.user.role !== 'Edu Lead' || !['Organization', 'Infrastructure'].includes(t.category)) ? btn('Create issue', 'theme-issue:' + index, 'plus') : ''}</div>`).join('') || empty('No text themes were identified.'));
  }
  return heading(survey.title, 'Themes, sentiment, and summary', actions) + content;
}

function surveyDetails(detail) {
  const { survey: s, stats, published, participation, trends } = detail;
  const actions = can('manage') && s.status === 'Draft' ? btn('Edit draft', 'edit-survey') + btn('Publish survey', 'publish-survey', 'arrow', 'primary')
    : `<a href="#insights/${s.id}" class="button primary">${icon('insights')} View AI insights</a>`;
  const score = s.responses >= s.minimum ? formatScore(stats.average) : '—';
  return heading(s.title, [s.groupName, s.courseName, s.lecturerName].join(' · '), actions) +
    `<div class="banner">${badge(s.status)} ${badge(s.anonymous ? 'Anonymous' : 'Identified')} <span>${fullDate(s.startDate)} – ${fullDate(s.endDate)}</span></div>
    <div class="metrics survey-metrics">${metric('Invited', s.invited, 'Target group invitations', 'admin', 'purple')}${metric('Response rate', formatRate(s.responseRate), `${s.responses} responses · ${s.pending} pending`, 'trend', 'mint')}${metric('Average rating', score, `Minimum ${s.minimum} responses`, 'star', 'gold')}</div>` +
    (s.description ? card('Survey description', '', `<p class="panel-copy">${esc(s.description)}</p>`) : '') +
    `<div class="grid-two">${card('Average ratings', '', scoreBars(stats.ratings.filter(r => r.count >= s.minimum).map(r => ({ category: r.category, score: r.sum / r.count }))))}
    ${card('Historical comparison', '', trendRows(trends))}</div>` +
    (stats.choiceResults.length ? card('Choice results', '', `<div class="summary-grid">${stats.choiceResults.map(q => `<div><h3>${esc(q.question)}</h3>${q.options.map(o => `<p>${esc(o.option)} · ${o.count}</p>`).join('')}</div>`).join('')}</div>`) : '') +
    card('Published themes', '', themeRows(published?.themes ?? [])) +
    (participation.length ? card('Invitation status', '', `<div class="table-scroll"><table><thead><tr><th>Student</th><th>Status</th></tr></thead><tbody>${participation.map(row => `<tr><td>${esc(row.name)}</td><td>${badge(row.completed ? 'Submitted' : 'Pending')}</td></tr>`).join('')}</tbody></table></div>`) : '') +
    card('Questions', '', `<ol class="question-list">${s.questions.map(q => `<li>${esc(q.text)} <small>${esc(q.type)} · ${esc(q.category)}</small></li>`).join('')}</ol>`);
}

function issuesPage(rows) {
  const visible = rows.filter(i => !state.issueFilter || i.status === state.issueFilter);
  return heading('Issue tracker', 'Assign owners, track deadlines, and verify improvements.', can('issue') ? btn('New issue', 'new-issue', 'plus', 'primary') : '') +
    `<div class="issue-tabs" aria-label="Issue status">${['', ...(state.options.statuses ?? [])].map(s => `<button type="button" class="${s === state.issueFilter ? 'active' : ''}" data-action="issue-filter:${esc(s)}" aria-pressed="${s === state.issueFilter}">${esc(s || 'All issues')}</button>`).join('')}</div>` +
    card('Issues', `${visible.length} shown`, issueTable(visible));
}

function issueDetails({ issue: item, history, followup }) {
  const statusOnly = state.user.role === 'Lecturer' || state.user.role === 'Edu Lead' && operational(item.category) ||
    state.user.role === 'Admin Lead' && !operational(item.category);
  const edits = can('issue') && !statusOnly ? btn('Edit issue', 'edit-issue', null, 'primary') : '';
  return heading(item.title, item.category, edits + link('All issues', 'issues')) +
    card('Issue details', '', `<div class="detail-grid"><div><span>Status</span>${badge(item.status)}</div><div><span>Priority</span>${badge(item.priority)}</div>
    <div><span>Owner</span><strong>${esc(item.assignee)}</strong></div><div><span>Due date</span><strong>${dueLabel(item)}</strong></div>
    <div><span>Source survey</span><a href="#surveys/${item.surveyId}">${esc(item.surveyTitle)}</a></div><div><span>Related theme</span><strong>${esc(item.themeName ?? '—')}</strong></div></div>
    ${item.description ? `<p class="panel-copy">${esc(item.description)}</p>` : ''}
    ${statusOnly ? `<form id="owner-status" class="inline-form">${select('Update status', 'status', ['Assigned', 'In Progress', 'Resolved'], item.status, 'Select status', true)}<button class="button primary" type="submit">Save status</button></form>` : ''}`) +
    card('Follow-up', item.followupTitle ?? '', followup === null ? empty('Link a later survey of the same group to verify improvement.') : trendRows(followup)) +
    card('Activity', '', `<div class="activity">${history.map(event => `<article><span class="avatar tiny">${esc(initials(event.actor))}</span><div><strong>${esc(event.actor)}</strong> <small>${fullDate(event.createdAt)}</small>
      ${event.changes.created ? '<p>Created the issue.</p>' : Object.entries(event.changes).map(([key, change]) => `<p>${esc(({ assigneeId: 'Owner', surveyId: 'Source survey', followupId: 'Follow-up survey', dueDate: 'Due date', analysisId: 'Analysis', themeId: 'Theme' })[key] ?? key)}: ${esc(change.from ?? '—')} → ${esc(change.to ?? '—')}</p>`).join('')}</div></article>`).join('')}</div>`);
}

function adminView(data) {
  return heading('Administration', 'Manage people, groups, courses, and trend settings.', btn('Add user', 'admin-user', 'plus', 'primary')) +
    `<div class="grid-two">${card('Courses', '', `<form id="admin-course" class="inline-form">${input('Course name', 'name', '', 'text', 'required')}<button class="button secondary" type="submit">Add course</button></form><ul class="simple-list">${data.courses.map(c => `<li>${esc(c.name)}</li>`).join('')}</ul>`)}
      ${card('Groups', '', `<form id="admin-group" class="inline-form">${input('Group name', 'name', '', 'text', 'required')}${select('Course', 'courseId', data.courses, null, 'Select course', true)}<button class="button secondary" type="submit">Add group</button></form><ul class="simple-list">${data.groups.map(g => `<li>${esc(g.name)} <small>${esc(data.courses.find(c => c.id === g.courseId)?.name)}</small></li>`).join('')}</ul>`)}</div>` +
    card('Trend settings', 'Flag decreases that meet or exceed this threshold.', `<form id="admin-settings" class="inline-form">${input('Score drop threshold', 'threshold', data.threshold, 'number', 'required min=".01" max="4" step=".01"')}<button class="button secondary" type="submit">Save threshold</button></form>`) +
    card('Users', `${data.users.length} accounts`, `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Group</th><th></th></tr></thead>
      <tbody>${data.users.map(u => `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(data.groups.find(g => g.id === u.groupId)?.name ?? '—')}</td><td>${btn('Edit', 'admin-user:' + u.id)}</td></tr>`).join('')}</tbody></table></div>`);
}

function notificationView(rows) {
  return heading('Notifications', 'Survey invitations and reminders.', rows.some(n => !n.readAt) ? btn('Mark all as read', 'read-notices', 'check') : '') +
    card('Inbox', '', rows.length ? `<div class="theme-list">${rows.map(n => `<div class="theme-row"><span class="metric-icon purple">${icon('bell')}</span>
      <div><strong>${esc(n.type)} · ${esc(n.title)}</strong><p>${fullDate(n.createdAt)}</p></div>
      ${n.readAt ? '' : badge('Unread')}${link('View survey', 'surveys/' + n.surveyId)}</div>`).join('')}</div>` : empty('Your inbox is empty.'));
}

const formData = form => Object.fromEntries(new FormData(form));
const dialog = () => document.querySelector('dialog');
const localDateTime = value => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const dialogSubmit = text => `<div class="form-actions">${btn('Cancel', 'close-dialog')}<button type="submit" class="button primary">${esc(text)}</button></div>`;
function showDialog(title, form, fields, submit) {
  const box = dialog();
  box.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" aria-label="Close dialog" data-action="close-dialog">${icon('close')}</button></div>
    <form id="${form}" class="dialog-form">${fields}${dialogSubmit(submit)}</form>`;
  box.setAttribute('aria-labelledby', 'dialog-title');
  box.showModal();
}
function questionFields(q = {}) {
  const kind = q.type ?? 'Rating';
  const template = document.createElement('template');
  template.innerHTML = `<section class="question-editor"><div class="question-editor-head"><strong>Question</strong>${btn('Remove', 'remove-question')}</div>
    ${input('Prompt', 'prompt', q.text, 'text', 'required maxlength="450"')}
    <div class="edit-grid">${select('Type', 'question-type', state.options.questionTypes, kind)}${select('Category', 'question-category', state.options.categories, q.category ?? 'Lectures')}</div>
    <div class="question-options" ${kind.includes('Choice') ? '' : 'hidden'}>${textarea('Choices (one per line)', 'choices', q.options?.join('\n'))}</div>
    <label class="checkbox"><input type="checkbox" name="required" ${q.required === false ? '' : 'checked'}> Required question</label></section>`;
  return template.content.firstElementChild;
}
function surveyDialog(s) {
  showDialog(s ? 'Edit survey draft' : 'New survey', 'survey-form', `<div class="edit-grid">
    ${input('Title', 'title', s?.title, 'text', 'required maxlength="180"')}${select('Survey type', 'type', state.options.types, s?.type)}
    ${select('Target group', 'groupId', state.options.groups.map(g => ({ ...g, name: `${g.name} · ${state.options.courses.find(c => c.id === g.courseId)?.name ?? ''}` })), s?.groupId, 'Select group', true)}
    ${select('Target lecturer', 'lecturerId', state.options.lecturers, s?.lecturerId, 'Select lecturer', true)}
    ${input('Start date', 'startDate', localDateTime(s?.startDate ?? Date.now()), 'datetime-local', 'required')}
    ${input('End date', 'endDate', localDateTime(s?.endDate ?? Date.now() + 604800000), 'datetime-local', 'required')}
    ${input('Minimum responses', 'minimum', s?.minimum ?? 5, 'number', 'required min="3" max="10000"')}
    ${input('Reminder interval in hours (0 to turn off)', 'reminderHours', s?.reminderHours ?? 48, 'number', 'required min="0" max="720"')}</div>
    ${textarea('Description', 'description', s?.description, 'maxlength="2500"')}
    <label class="checkbox"><input type="checkbox" name="anonymous" ${s?.anonymous === false ? '' : 'checked'}> Collect responses anonymously</label>
    <div id="question-editors"></div><div>${btn('Add question', 'add-question', 'plus')}</div>`, 'Save draft');
  const form = dialog().querySelector('form');
  form.dataset.id = s?.id ?? '';
  const questions = s?.questions ?? [{ text: '', type: 'Rating', category: 'Lectures' }];
  form.querySelector('#question-editors').append(...questions.map(questionFields));
}

async function issueDialog(item = {}, theme) {
  const rows = (await api('/surveys')).filter(s => s.status !== 'Draft');
  const categories = state.options.categories.filter(c => state.user.role === 'Edu Lead' ? !['Organization', 'Infrastructure'].includes(c)
    : state.user.role === 'Admin Lead' ? ['Organization', 'Infrastructure'].includes(c) : true);
  const source = rows.find(s => s.id === (item.surveyId ?? theme?.surveyId)) ?? rows[0];
  const later = s => rows.filter(r => s && r.groupId === s.groupId && r.startDate >= s.endDate);
  showDialog(item.id ? 'Edit issue' : 'New issue', 'issue-form', `${input('Title', 'title', item.title ?? theme?.name, 'text', 'required maxlength="180"')}
    ${textarea('Description', 'description', item.description ?? theme?.description, 'maxlength="3500"')}
    <div class="edit-grid">
    ${select('Category', 'category', categories, item.category ?? theme?.category)}
    ${select('Priority', 'priority', state.options.priorities, item.priority ?? 'Medium')}
    ${select('Source survey', 'surveyId', rows.map(s => ({ id: s.id, name: s.title })), source?.id, 'Select survey', true)}
    ${select('Related theme', 'themeId', [], null, 'No theme')}
    ${select('Owner', 'assigneeId', state.options.staff, item.assigneeId, 'Select owner', true)}
    ${input('Due date', 'dueDate', item.dueDate, 'date', 'required')}
    ${select('Status', 'status', state.options.statuses, item.status ?? 'Open')}
    ${select('Follow-up survey', 'followupId', later(source).map(s => ({ id: s.id, name: s.title })), item.followupId, 'No follow-up')}</div>`, item.id ? 'Save changes' : 'Create issue');
  const form = dialog().querySelector('form');
  form.dataset.id = item.id ?? '';
  form.dataset.updatedAt = item.updatedAt ?? '';
  const loadThemes = async (id, selected) => {
    const select = form.elements.themeId;
    select.disabled = true;
    const published = id ? (await api('/surveys/' + id)).published : null;
    const themes = published?.themes.map(t => ({ id: t.id, name: t.name })) ?? [];
    if (id === item.surveyId && item.themeId && !themes.some(t => t.id === item.themeId)) themes.push({ id: item.themeId, name: item.themeName ?? 'Original theme' });
    if (Number(form.elements.surveyId.value) === (id ?? 0)) {
      select.innerHTML = options(themes, selected, 'No theme');
      select.disabled = false;
    }
  };
  form.elements.surveyId.addEventListener('change', async () => {
    const id = Number(form.elements.surveyId.value);
    form.elements.followupId.innerHTML = options(later(rows.find(r => r.id === id)).map(s => ({ id: s.id, name: s.title })), null, 'No follow-up');
    try { await loadThemes(id); } catch (error) { toast(error.message, true); }
  });
  await loadThemes(source?.id, item.themeId ?? theme?.id);
}
function userDialog(user) {
  showDialog(user ? 'Edit user' : 'Add user', 'user-form', `
    ${input('Name', 'name', user?.name, 'text', 'required maxlength="100"')}
    ${input('Email', 'email', user?.email, 'email', 'required maxlength="254"')}
    ${select('Role', 'role', state.options.roles, user?.role)}
    ${select('Group (students)', 'groupId', state.admin.groups, user?.groupId, 'Select group')}
    ${input(user ? 'New password (optional)' : 'Password', 'password', '', 'password', `${user ? '' : 'required'} minlength="12" autocomplete="new-password"`)}`, 'Save user');
  dialog().querySelector('form').dataset.id = user?.id ?? '';
}
async function signIn(email, password) {
  state.user = (await api('/login', 'POST', { email, password })).user;
  state.filters = {};
  state.options = roleStudent() ? {} : await api('/options');
  state.unread = (await api('/notifications')).some(n => !n.readAt);
  const target = roleStudent() ? 'surveys' : 'overview';
  if (location.hash === '#' + target) await render();
  else go(target);
}

let poll;
async function render() {
  clearTimeout(poll);
  const renderId = ++state.mod;
  if (!state.user) return login();
  const [view, id] = page();
  const old = document.querySelector('#main-content');
  if (!old) shell('<p class="loading" role="status">Loading workspace…</p>', view);
  try {
    let content;
    let detail;
    if (roleStudent() && !['surveys', 'notifications'].includes(view)) { go('surveys'); return; }
    if (view === 'overview' || view === 'reports') {
      const data = await api('/dashboard?' + query());
      if (renderId !== state.mod) return;
      content = dashboard(data, view === 'reports');
    } else if (['surveys', 'insights'].includes(view)) {
      if (id) {
        detail = await api('/surveys/' + id);
        if (renderId !== state.mod) return;
        content = roleStudent() ? studentSurvey(detail) : view === 'insights' ? insightsView(detail) : surveyDetails(detail);
        if (view === 'insights' && ['Queued', 'Processing'].includes(detail.analysis?.status)) poll = setTimeout(render, 2500);
      } else content = surveyList(await api('/surveys'), view === 'insights');
    } else if (view === 'issues') {
      if (id) {
        detail = await api('/issues/' + id);
        content = issueDetails(detail);
      } else content = issuesPage(await api('/issues'));
    } else if (view === 'admin' && state.user.role === 'System Admin') {
      const admin = await api('/admin');
      if (renderId !== state.mod) return;
      state.admin = admin;
      content = adminView(admin);
    } else if (view === 'notifications') {
      const rows = await api('/notifications');
      state.unread = rows.some(n => !n.readAt);
      content = notificationView(rows);
    } else {
      content = heading('Page unavailable', 'Select a section from the workspace navigation.');
    }
    if (renderId !== state.mod) return;
    state.detail = detail;
    shell(content, view);
  } catch (error) {
    if (renderId !== state.mod) return;
    if (error.status === 401) {
      state.user = null;
      login();
    } else shell(heading('Unable to load this page', error.message, btn('Retry', 'retry')), view);
  }
}

function responseAnswers(form) {
  const values = new FormData(form);
  return Object.fromEntries(state.detail.questions.map(q => {
    const name = 'answer-' + q.id;
    const value = values.get(name);
    return [q.id, q.type === 'Multiple Choice' ? values.getAll(name) : q.type === 'Rating' && value != null ? Number(value) : value];
  }));
}
function exportCsv() {
  const d = state.dashboard;
  const rows = [
    ['Metric', 'Value'], ['Total surveys', d.surveys], ['Response rate', formatRate(d.responseRate)], ['Responses', d.count], ['Invitations', d.invited],
    ['Average score', formatScore(d.score)], ['Open issues', d.open], ['Resolved issues', d.resolved], ['Critical trends', d.critical], [],
    ['Category', 'Average score'], ...d.scores.map(s => [s.category, formatScore(s.score)]), [],
    ['Survey', 'Date', 'Average score'], ...d.timeline.map(s => [s.name, s.date, formatScore(s.score)]), [],
    ['Category', 'Current survey', 'Previous survey', 'Previous score', 'Current score', 'Change'],
    ...d.trends.map(t => [t.category, t.survey, t.previous, formatScore(t.before), formatScore(t.after), t.change.toFixed(2)]), [],
    ['Group', 'Survey type', 'Rating criteria', 'Responses', 'Invitations', 'Score'],
    ...d.groups.map(row => [row.name, row.type, row.criteria.join('; '), row.responses, row.invited, formatScore(row.score)]), [],
    ['Lecturer', 'Survey type', 'Rating criteria', 'Responses', 'Invitations', 'Score'],
    ...d.lecturers.map(row => [row.name, row.type, row.criteria.join('; '), row.responses, row.invited, formatScore(row.score)]),
  ];
  const cell = value => {
    const text = String(value ?? '');
    return '"' + (typeof value === 'string' && /^\s*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(new Blob(['\ufeff', rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pulse-report.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

root.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const [action, value] = button.dataset.action.split(':');
  const detail = state.detail;
  button.disabled = true;
  try {
    if (action === 'demo') await signIn(value + '@pulse.test', 'PulseDemo2026!');
    if (action === 'logout') {
      await api('/logout', 'POST', {});
      state.user = null; state.unread = false; state.mod++; clearTimeout(poll); login();
    }
    if (action === 'menu') button.setAttribute('aria-expanded', String(document.querySelector('.sidebar').classList.toggle('mobile-open')));
    if (action === 'retry') await render();
    if (action === 'clear-filters') { state.filters = {}; await render(); }
    if (action === 'close-dialog') dialog().close();
    if (action === 'new-survey' || action === 'edit-survey') surveyDialog(action === 'edit-survey' ? detail.survey : null);
    if (action === 'add-question') {
      const container = document.querySelector('#question-editors');
      if (container.children.length >= 30) throw new Error('A survey can have up to 30 questions.');
      const fields = questionFields();
      container.append(fields);
      fields.querySelector('input').focus();
    }
    if (action === 'remove-question') {
      const question = button.closest('.question-editor');
      if (question.parentElement.children.length < 2) throw new Error('Keep at least one question.');
      question.remove();
    }
    if (action === 'publish-survey') {
      await api('/surveys/' + detail.survey.id + '/publish', 'POST', {});
      toast('Survey published.');
      await render();
    }
    if (action === 'save-response') {
      await api('/surveys/' + detail.id + '/draft', 'POST', { answers: responseAnswers(document.querySelector('#response-form')) });
      toast('Draft saved.');
    }
    if (action === 'run-analysis') {
      await api('/surveys/' + detail.survey.id + '/analysis', 'POST', {});
      toast('Analysis queued.');
      await render();
    }
    if (action === 'new-issue' || action === 'edit-issue') await issueDialog(action === 'edit-issue' ? detail.issue : {});
    if (action === 'theme-issue') await issueDialog({}, { ...detail.published.themes[Number(value)], surveyId: detail.survey.id });
    if (action === 'issue-filter') { state.issueFilter = value; await render(); }
    if (action === 'admin-user') userDialog(state.admin.users.find(u => u.id === Number(value)));
    if (action === 'read-notices') { await api('/notifications/read', 'POST', {}); await render(); }
    if (action === 'export-csv') exportCsv();
    if (action === 'export-pdf') window.print();
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

root.addEventListener('change', async event => {
  const field = event.target;
  if (field.form?.id === 'filters') {
    state.filters = formData(field.form);
    await render();
  }
  if (field.name === 'question-type') field.closest('.question-editor').querySelector('.question-options').hidden = !field.value.includes('Choice');
});

root.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const submitter = event.submitter;
  const values = formData(form);
  if (submitter) submitter.disabled = true;
  try {
    let detail = state.detail;
    if (form.id === 'login-form') { await signIn(values.email, values.password); return; }
    if (form.id === 'filters') return;
    if (form.id === 'survey-form') {
      const questions = [...form.querySelectorAll('.question-editor')].map(section => {
        const get = name => section.querySelector(`[name="${name}"]`);
        return { text: get('prompt').value, type: get('question-type').value, category: get('question-category').value,
          options: get('choices').value.split('\n').map(s => s.trim()).filter(Boolean), required: get('required').checked };
      });
      const id = form.dataset.id;
      const result = await api('/surveys' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', {
        ...values, questions, groupId: Number(values.groupId), lecturerId: Number(values.lecturerId),
        minimum: Number(values.minimum), reminderHours: Number(values.reminderHours),
        startDate: new Date(values.startDate).toISOString(), endDate: new Date(values.endDate).toISOString(), anonymous: values.anonymous === 'on',
      });
      dialog().close();
      toast('Survey draft saved.');
      if (!id) { go('surveys/' + result.id); return; }
    }
    if (form.id === 'response-form') {
      await api('/surveys/' + detail.id + '/answer', 'POST', { answers: responseAnswers(form) });
      toast('Feedback submitted.');
    }
    if (form.id === 'review-form') {
      const analysis = detail.analysis;
      const themes = analysis.result.themes.map((theme, i) => ({ id: theme.id, name: values['theme-name-' + i],
        description: values['theme-description-' + i], category: values['theme-category-' + i], sentiment: values['theme-sentiment-' + i] }));
      const comments = analysis.result.comments.map((c, i) => ({ id: c.id, themeId: values['comment-theme-' + i], sentiment: values['comment-sentiment-' + i] }));
      const summary = Object.fromEntries(Object.keys(summaryLabels).map(key => [key, values['sum-' + key]]));
      const publish = submitter?.value === 'publish';
      await api('/analyses/' + analysis.id, 'PUT', { themes, comments, summary, publish, updatedAt: analysis.updatedAt });
      toast(publish ? 'Analysis published.' : 'Review saved.');
    }
    if (form.id === 'issue-form') {
      const id = form.dataset.id;
      const result = await api('/issues' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', {
        ...values, surveyId: Number(values.surveyId), themeId: values.themeId || null, assigneeId: Number(values.assigneeId),
        followupId: Number(values.followupId) || null, updatedAt: form.dataset.updatedAt,
      });
      dialog().close();
      toast(id ? 'Issue updated.' : 'Issue created.');
      if (!id) { go('issues/' + result.id); return; }
    }
    if (form.id === 'owner-status') {
      await api('/issues/' + detail.issue.id, 'PUT', { status: values.status, updatedAt: detail.issue.updatedAt });
      toast('Issue status updated.');
    }
    if (form.id === 'admin-course') { await api('/admin/courses', 'POST', values); toast('Course added.'); }
    if (form.id === 'admin-group') { await api('/admin/groups', 'POST', { ...values, courseId: Number(values.courseId) }); toast('Group added.'); }
    if (form.id === 'admin-settings') { await api('/admin/settings', 'PUT', { threshold: Number(values.threshold) }); toast('Threshold saved.'); }
    if (form.id === 'user-form') {
      const id = form.dataset.id;
      await api('/admin/users' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', {
        ...values, groupId: values.role === 'Student' ? Number(values.groupId) || null : null,
      });
      dialog().close();
      toast('User saved.');
    }
    if (state.user.role === 'System Admin') state.options = await api('/options');
    await render();
  } catch (error) { toast(error.message, true); }
  finally { if (submitter) submitter.disabled = false; }
});

window.addEventListener('hashchange', render);
try {
  state.demo = (await api('/config')).demo;
  const me = await api('/me');
  state.user = me.user;
  state.options = roleStudent() ? {} : await api('/options');
  state.unread = (await api('/notifications')).some(n => !n.readAt);
  await render();
} catch { login(); }
