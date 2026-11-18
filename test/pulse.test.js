import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createPulse } from '../src/server.js';
import { day } from '../src/store.js';

async function fixture(t, config = {}) {
  const runtime = createPulse({ demo: true, database: ':memory:', interval: 60000, ...config });
  const { server } = runtime;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', cookie, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body && JSON.stringify(body),
    });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
  }
  async function login(name) {
    const result = await request('/api/login', { method: 'POST', body: { email: name + '@pulse.test', password: 'PulseDemo2026!' } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(result.cookie);
    return (path, body, method = body ? 'POST' : 'GET') => request('/api' + path, { method, body, cookie: result.cookie });
  }
  return { ...runtime, base, request, login };
}

test('staff analytics, filters, browser assets, and role isolation', async t => {
  const { login, request, base } = await fixture(t);
  assert.equal((await request('/api/dashboard')).status, 401);
  assert.match(await (await fetch(base)).text(), /Pulse/);
  assert.match((await fetch(base + '/app.js')).headers.get('content-type'), /javascript/);
  const director = await login('director');
  const { data } = await director('/dashboard');
  assert.equal(data.surveys, 6);
  assert.equal(data.critical, 1);
  assert.equal(data.open, 3);
  assert.equal(data.resolved, 2);
  assert.ok(data.lecturers.length >= 2);
  assert.equal((await director('/dashboard?group=2')).data.surveys, 1);
  assert.equal((await director('/surveys/5')).data.survey.responseRate, 87.5);
  assert.equal((await director('/admin')).status, 403);
  const lecturer = await login('lecturer');
  assert.equal((await lecturer('/surveys/4')).status, 404);
  assert.ok((await lecturer('/surveys')).data.every(s => s.groupId === 1));
  const student = await login('student');
  assert.equal((await student('/dashboard')).status, 403);
  assert.equal((await student('/surveys/4')).status, 404);
  assert.equal((await student('/issues')).status, 403);
  const admin = await login('admin');
  assert.equal((await admin('/admin/courses', { name: 'Data Science' })).status, 200);
  const adminData = (await admin('/admin')).data;
  const courseId = adminData.courses.find(course => course.name === 'Data Science').id;
  assert.equal((await admin('/admin/groups', { name: 'Data 01', courseId })).status, 200);
  const groupId = (await admin('/admin')).data.groups.find(group => group.name === 'Data 01').id;
  assert.equal((await admin('/admin/users', { name: 'New student', email: 'new@pulse.test', role: 'Student', groupId, password: 'ExampleLongPassword!' })).status, 200);
  assert.equal((await admin('/admin/settings', { threshold: 1 }, 'PUT')).status, 200);
  assert.equal((await director('/dashboard')).data.critical, 0);
});

test('schedule, invitations, reminders, drafts, validated responses and anonymous storage', async t => {
  const { login, jobs, store } = await fixture(t);
  const edu = await login('edu');
  const student = await login('student');
  const second = await login('student-1-23');
  const config = (await edu('/options')).data;
  const payload = {
    title: 'Acceptance survey', description: 'Four kinds of questions', type: 'Mid-course', groupId: 1,
    lecturerId: config.lecturers[0].id, startDate: day(1), endDate: day(3), minimum: 3, anonymous: true, reminderHours: 1,
    questions: [
      { type: 'Rating', category: 'Lectures', text: 'Lecture quality' },
      { type: 'Text', category: 'Practice', text: 'Feedback' },
      { type: 'Single Choice', category: 'Organization', text: 'Schedule', options: ['Yes', 'No'] },
      { type: 'Multiple Choice', category: 'Materials', text: 'Resources', options: ['Notes', 'Slides'] },
    ],
  };
  const draft = await edu('/surveys', payload);
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  const route = '/surveys/' + draft.data.id;
  assert.equal((await edu(route + '/publish', {})).status, 200);
  assert.equal((await edu(route)).data.survey.status, 'Scheduled');
  assert.equal((await student(route)).status, 404);
  store.run('UPDATE surveys SET startDate=? WHERE id=?', day(-1), draft.data.id);
  jobs.tick();
  assert.ok((await student('/notifications')).data.some(n => n.surveyId === draft.data.id && n.type === 'Invitation'));
  const s = (await student(route)).data;
  const [rating, text, single, multi] = s.questions.map(q => q.id);
  const answers = { [rating]: 5, [text]: 'Please add more practice', [single]: 'Yes', [multi]: ['Notes', 'Slides'] };
  assert.equal((await student(route + '/draft', { answers: { [rating]: 5 } })).status, 200);
  assert.equal((await student(route)).data.draft[rating], 5);
  assert.equal((await student(route + '/answer', { answers: { ...answers, [rating]: 9 } })).status, 400);
  const results = await Promise.all([student(route + '/answer', { answers }), student(route + '/answer', { answers })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await student(route)).data.completed, true);
  store.run('UPDATE invitations SET lastReminder=? WHERE surveyId=?', day(-1), draft.data.id);
  jobs.tick();
  jobs.tick();
  assert.equal((await student('/notifications')).data.filter(n => n.surveyId === draft.data.id && n.type === 'Reminder').length, 0);
  assert.equal((await second('/notifications')).data.filter(n => n.surveyId === draft.data.id && n.type === 'Reminder').length, 1);
  const summary = (await edu(route)).data;
  assert.equal(summary.survey.responses, 1);
  assert.equal(summary.survey.invited, 24);
  assert.equal(summary.survey.pending, 23);
  assert.equal(summary.stats.average, null);
  assert.deepEqual(summary.participation, []);
  assert.equal((await edu(route + '/analysis', {})).status, 409);
  const response = store.get('SELECT studentId,submittedAt FROM responses WHERE surveyId=?', draft.data.id);
  assert.equal(response.studentId, null);
  assert.equal(response.submittedAt, null);
});

test('analysis queue, human review, theme-linked issue and follow-up', async t => {
  const { login, jobs, store } = await fixture(t);
  const edu = await login('edu');
  const director = await login('director');
  const ops = await login('ops');
  const run = await edu('/surveys/5/analysis', {});
  assert.equal(run.status, 200, JSON.stringify(run.data));
  assert.equal((await edu('/surveys/5/analysis', {})).status, 409);
  await jobs.analyzeNext();
  const { analysis } = (await edu('/surveys/5')).data;
  assert.equal(analysis.status, 'Review');
  assert.equal(analysis.result.source, 'Local rules');
  assert.equal(analysis.result.comments.length, 21);
  assert.ok(analysis.result.comments.every(c => !('text' in c)));
  assert.equal((await director('/surveys/5')).data.analysis.id, 1);
  const themes = analysis.result.themes.map(t => t.category === 'Practice' ? { ...t, name: 'Exam practice sessions' } : t);
  assert.equal((await edu('/analyses/' + analysis.id, { publish: true, themes, updatedAt: analysis.updatedAt }, 'PUT')).status, 200);
  const published = (await director('/surveys/5')).data.published;
  const theme = published.themes.find(t => t.name === 'Exam practice sessions');
  assert.ok(theme);
  assert.equal(published.comments, undefined);
  const owner = (await edu('/options')).data.staff.find(u => u.role === 'Edu Lead');
  const body = { title: 'Add exam practice', description: 'Review and add exercises', category: 'Practice',
    surveyId: 5, themeId: theme.id, priority: 'High', assigneeId: owner.id, dueDate: day(5).slice(0, 10), status: 'Assigned', followupId: 6 };
  assert.equal((await ops('/issues', body)).status, 403);
  const issue = await edu('/issues', body);
  assert.equal(issue.status, 200, JSON.stringify(issue.data));
  const path = '/issues/' + issue.data.id;
  const detail = (await edu(path)).data;
  assert.equal(detail.issue.themeName, theme.name);
  assert.equal((await edu(path, { ...body, status: 'Resolved', updatedAt: detail.issue.updatedAt }, 'PUT')).status, 200);
  assert.equal((await edu(path)).data.history[0].changes.status.to, 'Resolved');
  assert.equal((await ops(path)).status, 404);
  const scores = store.all('SELECT id FROM users WHERE groupId=1 LIMIT 5');
  for (const [index, student] of scores.entries()) {
    store.run('INSERT INTO invitations(surveyId,studentId,completed) VALUES (6,?,1)', student.id);
    store.run('INSERT INTO responses VALUES (?,6,NULL,?,NULL)', 'followup-' + index, JSON.stringify({ practice: 5 }));
  }
  const followup = (await edu(path)).data.followup;
  assert.equal(followup[0].after, 5);
  assert.ok(followup[0].change > 0);
});

test('configured provider receives no account IDs and its response is validated', async t => {
  let sent;
  const provider = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    sent = JSON.parse(JSON.parse(raw).messages[1].content);
    const result = {
      themes: [{ id: 'practice', name: 'Additional practice', description: 'Students asked for practice.', category: 'Practice', sentiment: 'Neutral', confidence: .93 }],
      comments: sent.map(c => ({ id: c.id, themeId: 'practice', sentiment: 'Neutral', confidence: .93 })),
      summary: { positives: 'Clear lectures', problems: 'Practice', recurring: 'Exam exercises', critical: 'None identified', recommendations: 'Add practice' },
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  t.after(() => new Promise(resolve => provider.close(resolve)));
  const { login, jobs } = await fixture(t, { allowExternal: true, provider: { url: `http://127.0.0.1:${provider.address().port}`, key: 'test', model: 'mock' } });
  const edu = await login('edu');
  await edu('/surveys/5/analysis', {});
  await jobs.analyzeNext();
  assert.equal(sent.length, 21);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['category', 'id', 'text']);
  const { analysis } = (await edu('/surveys/5')).data;
  assert.equal(analysis.result.source, 'LLM');
  assert.equal(analysis.result.themes[0].count, 21);
});
