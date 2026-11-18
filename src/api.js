import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { categories, day, encode, hashPassword, now, parse, priorities, roles, statuses, surveyFields, surveyJoin, surveyStats, types, verifyPassword } from './store.js';
import { sentimentValues, summaryFields } from './analysis.js';

const managers = ['Edu Lead', 'System Admin'];
const reviewers = ['Edu Lead', 'Admin Lead', 'System Admin'];
const issueManagers = [...reviewers, 'Director'];
const adminCategories = ['Organization', 'Infrastructure'];
const publicUser = 'id,name,email,role,groupId,createdAt';
const questionTypes = ['Rating', 'Text', 'Single Choice', 'Multiple Choice'];
const tokenHash = token => createHash('sha256').update(token).digest('hex');

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function check(ok, message, status = 400) {
  if (!ok) throw new HttpError(status, message);
}
const permit = (user, allowed) => check(allowed.includes(user.role), 'You do not have access to this action.', 403);
function string(value, max, label, optional = false) {
  check(typeof value === 'string' && value.trim().length <= max && (optional || value.trim()), `Enter a valid ${label}.`);
  return value.trim();
}
function choice(value, allowed, label) {
  check(allowed.includes(value), `Select a valid ${label}.`);
  return value;
}
function integer(value, min, max, label) {
  check(Number.isInteger(value) && value >= min && value <= max, `Enter a valid ${label}.`);
  return value;
}
function date(value, label) {
  check(typeof value === 'string' && value.length <= 35 && Number.isFinite(Date.parse(value)), `Enter a valid ${label}.`);
  return new Date(value).toISOString();
}
function calendarDate(value, label) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && date(value, label).slice(0, 10) === value, `Enter a valid ${label}.`);
  return value;
}
function surveyValues(body, store) {
  const title = string(body.title, 180, 'title');
  const description = string(body.description ?? '', 2500, 'description', true);
  const type = choice(body.type, types, 'survey type');
  const groupId = integer(body.groupId, 1, Number.MAX_SAFE_INTEGER, 'group');
  const lecturerId = integer(body.lecturerId, 1, Number.MAX_SAFE_INTEGER, 'lecturer');
  check(store.get('SELECT id FROM groups WHERE id=?', groupId), 'Group not found.');
  check(store.get("SELECT id FROM users WHERE id=? AND role='Lecturer'", lecturerId), 'Lecturer not found.');
  const start = date(body.startDate, 'start date');
  const end = date(body.endDate, 'end date');
  check(start < end, 'End date must be after start date.');
  const minimum = integer(body.minimum, 3, 10000, 'minimum response count (at least 3)');
  const reminder = integer(body.reminderHours, 0, 720, 'reminder interval');
  check(typeof body.anonymous === 'boolean', 'Select an anonymity mode.');
  check(Array.isArray(body.questions) && body.questions.length > 0 && body.questions.length <= 30, 'Add between 1 and 30 questions.');
  const questions = body.questions.map(q => {
    check(q && typeof q === 'object', 'Invalid question.');
    const kind = choice(q.type, questionTypes, 'question type');
    const question = {
      id: randomUUID(), text: string(q.text, 450, 'question'), type: kind,
      category: choice(q.category, categories, 'category'), required: q.required !== false,
    };
    if (['Single Choice', 'Multiple Choice'].includes(kind)) {
      check(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 12, 'Add 2 to 12 choices.');
      question.options = q.options.map(option => string(option, 150, 'choice'));
      check(new Set(question.options).size === question.options.length, 'Choices must be unique.');
    }
    return question;
  });
  return [title, description, type, groupId, lecturerId, encode(questions), start, end, minimum, reminder, Number(body.anonymous)];
}

function answersFor(questions, answers, draft) {
  check(answers && typeof answers === 'object' && !Array.isArray(answers), 'Provide answers.');
  const result = {};
  for (const q of questions) {
    const value = answers[q.id];
    const empty = value == null || value === '' || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
    if (empty) {
      check(draft || !q.required, `Answer this question: ${q.text}`);
      continue;
    }
    if (q.type === 'Rating') result[q.id] = integer(value, 1, 5, 'rating');
    if (q.type === 'Text') result[q.id] = string(value, 4000, 'comment');
    if (q.type === 'Single Choice') result[q.id] = choice(value, q.options, 'answer');
    if (q.type === 'Multiple Choice') {
      check(Array.isArray(value) && value.length <= q.options.length && new Set(value).size === value.length, 'Choose valid options.');
      result[q.id] = value.map(option => choice(option, q.options, 'answer'));
    }
  }
  return result;
}

const rate = (count, total) => total ? count / total * 100 : null;
const average = entries => {
  const count = entries.reduce((total, item) => total + item.count, 0);
  return count ? entries.reduce((total, item) => total + item.sum, 0) / count : null;
};
const ratingKey = r => encode([r.category, r.criterion.trim().replace(/\s+/g, ' ').toLowerCase()]);
const ratingSignature = item => encode([item.type, ...item.questions.filter(q => q.type === 'Rating')
  .map(q => ratingKey({ category: q.category, criterion: q.text })).sort()]);
const adminCategory = category => adminCategories.includes(category);
const safeSurvey = survey => ({ ...survey, questions: parse(survey.questions), anonymous: Boolean(survey.anonymous), responseRate: rate(survey.responses, survey.invited), pending: survey.invited - survey.responses });
const issueSelect = `SELECT i.*, u.name assignee, s.title surveyTitle, f.title followupTitle
  FROM issues i JOIN users u ON u.id=i.assigneeId JOIN surveys s ON s.id=i.surveyId
  LEFT JOIN surveys f ON f.id=i.followupId`;

export function createApi(store, worker, config) {
  const { all, get, run, transaction } = store;
  const loginAttempts = new Map();
  const dummyHash = hashPassword(randomUUID());
  const cookie = (value, age) => `pulse_session=${value}; Max-Age=${age}; HttpOnly; SameSite=Strict; Path=/${config.secureCookie ? '; Secure' : ''}`;
  const userToken = headers => (headers.cookie ?? '').match(/(?:^|;\s*)pulse_session=([a-f\d]{64})(?:;|$)/)?.[1];
  const listSurveys = () => all(`SELECT ${surveyFields} ${surveyJoin} ORDER BY s.startDate DESC, s.id DESC`);
  const published = id => get("SELECT * FROM analyses WHERE surveyId=? AND status='Published' ORDER BY id DESC LIMIT 1", id);
  const visibleSurvey = (user, survey) => user.role !== 'Student' &&
    (user.role !== 'Lecturer' || survey.lecturerId === user.id && survey.status !== 'Draft');
  const requireSurvey = (user, id) => {
    const survey = get(`SELECT ${surveyFields} ${surveyJoin} WHERE s.id=?`, id);
    check(survey && visibleSurvey(user, survey), 'Survey not found.', 404);
    return survey;
  };
  const visibleIssue = (user, issue) => {
    if (user.role === 'Admin Lead') return adminCategory(issue.category) || issue.assigneeId === user.id;
    if (user.role === 'Edu Lead') return !adminCategory(issue.category) || issue.assigneeId === user.id;
    if (user.role === 'Lecturer') return issue.assigneeId === user.id &&
      Boolean(get('SELECT id FROM surveys WHERE id=? AND lecturerId=?', issue.surveyId, user.id));
    return ['Director', 'System Admin'].includes(user.role);
  };
  const availableStats = survey => survey.responses >= survey.minimum
    ? surveyStats(store, survey) : { ratings: [], choiceResults: [], average: null, count: 0, sum: 0 };
  const threshold = () => Number(get("SELECT value FROM settings WHERE key='dropThreshold'").value);

  function trends(series, allSeries = series) {
    const matches = [];
    for (const recent of series) {
      const previous = allSeries.find(item => item.groupId === recent.groupId && item.lecturerId === recent.lecturerId &&
        item.type === recent.type && item.endDate <= recent.startDate && item.stats.count &&
        item.stats.ratings.some(r => recent.stats.ratings.some(current => ratingKey(current) === ratingKey(r))));
      if (!previous) continue;
      for (const rating of recent.stats.ratings) {
        const old = previous.stats.ratings.find(item => ratingKey(item) === ratingKey(rating));
        if (!old || rating.count < recent.minimum || old.count < previous.minimum) continue;
        const before = old.sum / old.count;
        const after = rating.sum / rating.count;
        const change = after - before;
        matches.push({ category: rating.category, criterion: rating.criterion, before, after, change,
          survey: recent.title, previous: previous.title, surveyId: recent.id, critical: change <= -threshold() + 1e-9 });
      }
    }
    return matches;
  }

  function dashboard(user, params) {
    permit(user, roles.filter(role => role !== 'Student'));
    const issueStatus = params.get('status');
    if (issueStatus) choice(issueStatus, statuses, 'status');
    const visible = listSurveys().filter(s => visibleSurvey(user, s) && s.status !== 'Draft');
    const series = visible.map(s => ({ ...safeSurvey(s), stats: availableStats(s) }));
    const filtered = series.filter(s => {
      if (params.get('from') && s.startDate.slice(0, 10) < calendarDate(params.get('from'), 'start date')) return false;
      if (params.get('to') && s.startDate.slice(0, 10) > calendarDate(params.get('to'), 'end date')) return false;
      return [['course', s.courseId], ['group', s.groupId], ['lecturer', s.lecturerId], ['type', s.type]].every(([key, value]) => !params.get(key) || params.get(key) === String(value));
    });
    const issues = all(`${issueSelect} ORDER BY i.createdAt DESC, i.id DESC`).filter(i =>
      visibleIssue(user, i) && filtered.some(s => s.id === i.surveyId) && (!issueStatus || i.status === issueStatus));
    const rated = filtered.filter(s => s.stats.count);
    const latest = rated[0];
    const selectedTrends = trends(rated, series);
    const analysis = latest && published(latest.id);
    const count = filtered.reduce((total, s) => total + s.responses, 0);
    const invited = filtered.reduce((total, s) => total + s.invited, 0);
    const eligible = rated.filter(s => s.stats.ratings.length === s.questions.filter(q => q.type === 'Rating').length);
    const compare = (field, label) => Object.values(Object.groupBy(eligible, ratingSignature)).flatMap(cohort => {
      const entities = Object.entries(Object.groupBy(cohort, s => s[field]));
      if (entities.length < 2) return [];
      return entities.map(([, matches]) => ({
        name: matches[0][label], type: matches[0].type, criteria: matches[0].stats.ratings.map(rating => rating.criterion),
        score: average(matches.map(s => s.stats)),
        responses: matches.reduce((total, s) => total + s.responses, 0),
        invited: matches.reduce((total, s) => total + s.invited, 0),
      }));
    });
    const closed = issues.filter(i => ['Resolved', 'Closed'].includes(i.status));
    return {
      surveys: filtered.length, count, invited, responseRate: rate(count, invited), score: average(rated.map(s => s.stats)),
      open: issues.length - closed.length, resolved: closed.length,
      critical: selectedTrends.filter(t => t.critical).length, threshold: threshold(),
      recentIssues: issues.slice(0, 5), trends: selectedTrends, latest: latest?.title,
      scores: categories.map(category => ({ category, score: average(rated.flatMap(s => s.stats.ratings.filter(r => r.category === category))) })).filter(r => r.score !== null),
      timeline: [...rated].reverse().map(s => ({ name: s.title, date: s.startDate, score: s.stats.average })),
      themes: analysis ? parse(analysis.result).themes : [],
      groups: compare('groupId', 'groupName'),
      lecturers: ['Director', 'System Admin', 'Edu Lead'].includes(user.role) ? compare('lecturerId', 'lecturerName') : [],
    };
  }

  function issueData(user, body, previous) {
    const survey = requireSurvey(user, integer(body.surveyId, 1, Number.MAX_SAFE_INTEGER, 'source survey'));
    check(survey.status !== 'Draft', 'Select a published survey.');
    const category = choice(body.category, categories, 'category');
    if (user.role === 'Edu Lead') check(!adminCategory(category), 'Edu Lead can manage educational issues.', 403);
    if (user.role === 'Admin Lead') check(adminCategory(category), 'Admin Lead can manage administrative issues.', 403);
    const owner = get("SELECT id FROM users WHERE id=? AND role<>'Student'", integer(body.assigneeId, 1, Number.MAX_SAFE_INTEGER, 'owner'));
    check(owner, 'Choose a staff owner.');
    const due = calendarDate(body.dueDate, 'due date');
    const followup = body.followupId == null ? null : requireSurvey(user, integer(body.followupId, 1, Number.MAX_SAFE_INTEGER, 'follow-up survey'));
    check(!followup || (followup.groupId === survey.groupId && followup.startDate >= survey.endDate), 'Select a later survey of the same group.');
    let analysisId = null;
    let themeId = null;
    if (body.themeId) {
      const preserve = previous && previous.surveyId === survey.id && previous.themeId === body.themeId;
      const analysis = preserve ? get('SELECT * FROM analyses WHERE id=?', previous.analysisId) : published(survey.id);
      check(analysis && parse(analysis.result).themes.some(theme => theme.id === body.themeId), 'Select a published theme.');
      analysisId = analysis.id;
      themeId = body.themeId;
    }
    return {
      title: string(body.title, 180, 'title'), description: string(body.description ?? '', 3500, 'description', true),
      category, surveyId: survey.id, analysisId, themeId, priority: choice(body.priority, priorities, 'priority'),
      assigneeId: owner.id, dueDate: due, status: choice(body.status ?? 'Open', statuses, 'status'), followupId: followup?.id ?? null,
    };
  }

  return async function api(method, url, headers, body, ip, response) {
    const path = url.pathname.replace(/\/$/, '');
    const token = userToken(headers);
    if (path === '/api/login' && method === 'POST') {
      const email = string(body.email, 254, 'email').toLowerCase();
      const password = string(body.password, 250, 'password');
      const time = Date.now();
      for (const [key, value] of loginAttempts) if (value.until < time) loginAttempts.delete(key);
      const attempt = loginAttempts.get(ip) ?? { count: 0, until: time + 60000 };
      check(attempt.count < 25, 'Too many sign-in attempts. Try again in one minute.', 429);
      const account = get('SELECT * FROM users WHERE email=?', email);
      if (!verifyPassword(password, account?.password ?? dummyHash) || !account) {
        loginAttempts.set(ip, { ...attempt, count: attempt.count + 1 });
        throw new HttpError(401, 'Invalid email or password.');
      }
      const session = randomBytes(32).toString('hex');
      if (token) run('DELETE FROM sessions WHERE token=?', tokenHash(token));
      run('DELETE FROM sessions WHERE expiresAt<=?', now());
      run('INSERT INTO sessions VALUES (?,?,?)', tokenHash(session), account.id, day(1));
      response.setHeader('Set-Cookie', cookie(session, 86400));
      return { user: get(`SELECT ${publicUser} FROM users WHERE id=?`, account.id) };
    }

    const session = token && get('SELECT userId FROM sessions WHERE token=? AND expiresAt>?', tokenHash(token), now());
    check(session, 'Sign in to continue.', 401);
    const user = get(`SELECT ${publicUser} FROM users WHERE id=?`, session.userId);
    if (path === '/api/logout' && method === 'POST') {
      run('DELETE FROM sessions WHERE token=?', tokenHash(token));
      response.setHeader('Set-Cookie', cookie('', 0));
      return { ok: true };
    }
    if (path === '/api/me' && method === 'GET') return { user };
    if (path === '/api/options' && method === 'GET') {
      permit(user, roles.filter(role => role !== 'Student'));
      const surveys = listSurveys().filter(s => visibleSurvey(user, s));
      const restricted = user.role === 'Lecturer';
      const groups = all('SELECT * FROM groups ORDER BY name').filter(group => !restricted || surveys.some(s => s.groupId === group.id));
      const courses = all('SELECT * FROM courses ORDER BY name').filter(course => !restricted || groups.some(g => g.courseId === course.id));
      return { groups, courses, lecturers: all("SELECT id,name FROM users WHERE role='Lecturer' ORDER BY name").filter(u => !restricted || u.id === user.id),
        staff: issueManagers.includes(user.role) ? all("SELECT id,name,role FROM users WHERE role<>'Student' ORDER BY name") : [],
        types, categories, statuses, priorities, questionTypes, roles };
    }
    if (path === '/api/notifications' && method === 'GET') return all(`SELECT n.id,n.surveyId,n.type,n.createdAt,n.readAt,s.title
      FROM notices n JOIN surveys s ON s.id=n.surveyId WHERE n.userId=? ORDER BY n.id DESC LIMIT 100`, user.id);
    if (path === '/api/notifications/read' && method === 'POST') {
      run('UPDATE notices SET readAt=? WHERE userId=? AND readAt IS NULL', now(), user.id);
      return { ok: true };
    }
    if (path === '/api/dashboard' && method === 'GET') return dashboard(user, url.searchParams);
    if (path === '/api/surveys' && method === 'GET') {
      if (user.role === 'Student') return all(`SELECT s.id,s.title,s.description,s.type,s.startDate,s.endDate,s.anonymous,s.status,i.completed
        FROM surveys s JOIN invitations i ON i.surveyId=s.id WHERE i.studentId=? ORDER BY s.startDate DESC`, user.id);
      return listSurveys().filter(s => visibleSurvey(user, s)).map(s => {
        const { questions, ...rest } = safeSurvey(s);
        return rest;
      });
    }
    if (path === '/api/surveys' && method === 'POST') {
      permit(user, managers);
      const result = run(`INSERT INTO surveys(title,description,type,groupId,lecturerId,questions,startDate,endDate,minimum,reminderHours,anonymous,status,createdBy)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'Draft',?)`, ...surveyValues(body, store), user.id);
      return { id: Number(result.lastInsertRowid) };
    }

    const surveyRoute = path.match(/^\/api\/surveys\/(\d+)(?:\/(publish|answer|draft|analysis))?$/);
    if (surveyRoute) {
      const id = Number(surveyRoute[1]);
      const action = surveyRoute[2];
      if (user.role === 'Student') {
        const invitation = get('SELECT * FROM invitations WHERE surveyId=? AND studentId=?', id, user.id);
        check(invitation, 'Survey not found.', 404);
        const s = get('SELECT * FROM surveys WHERE id=?', id);
        const questions = parse(s.questions);
        if (!action && method === 'GET') return {
          id, title: s.title, description: s.description, questions, startDate: s.startDate, endDate: s.endDate,
          anonymous: Boolean(s.anonymous), status: s.status, completed: Boolean(invitation.completed), draft: parse(invitation.draft ?? '{}'),
        };
        if (method === 'POST' && ['draft', 'answer'].includes(action)) {
          check(s.status === 'Active' && s.endDate > now(), 'This survey is closed.', 409);
          const values = answersFor(questions, body.answers, action === 'draft');
          transaction(() => {
            if (action === 'draft') {
              check(run('UPDATE invitations SET draft=? WHERE surveyId=? AND studentId=? AND completed=0', encode(values), id, user.id).changes, 'You already submitted this survey.', 409);
              return;
            }
            check(run('UPDATE invitations SET completed=1,draft=NULL WHERE surveyId=? AND studentId=? AND completed=0', id, user.id).changes, 'You already submitted this survey.', 409);
            run('INSERT INTO responses VALUES (?,?,?,?,?)', randomUUID(), id, s.anonymous ? null : user.id, encode(values), s.anonymous ? null : now());
          });
          return { ok: true };
        }
      } else {
        const survey = requireSurvey(user, id);
        if (!action && method === 'GET') {
          const version = reviewers.includes(user.role) ? get('SELECT * FROM analyses WHERE surveyId=? ORDER BY id DESC LIMIT 1', id) : published(id);
          const publicVersion = survey.responses >= survey.minimum ? published(id) : undefined;
          const safeVersion = version && { id: version.id, status: version.status, error: version.error, updatedAt: version.updatedAt,
            result: survey.responses >= survey.minimum && version.result ? parse(version.result) : null };
          if (safeVersion?.result && !reviewers.includes(user.role)) delete safeVersion.result.comments;
          const result = publicVersion && parse(publicVersion.result);
          if (result) delete result.comments;
          const participation = managers.includes(user.role) && !survey.anonymous
            ? all('SELECT u.name,i.completed FROM invitations i JOIN users u ON u.id=i.studentId WHERE surveyId=? ORDER BY u.name', id) : [];
          return { survey: safeSurvey(survey), stats: availableStats(survey), analysis: safeVersion,
            published: result, participation, trends: trends([{ ...safeSurvey(survey), stats: availableStats(survey) }],
              listSurveys().filter(s => visibleSurvey(user, s)).map(s => ({ ...safeSurvey(s), stats: availableStats(s) }))) };
        }
        if (!action && method === 'PUT') {
          permit(user, managers);
          check(run(`UPDATE surveys SET title=?,description=?,type=?,groupId=?,lecturerId=?,questions=?,startDate=?,endDate=?,minimum=?,reminderHours=?,anonymous=?,updatedAt=?
            WHERE id=? AND status='Draft'`, ...surveyValues(body, store), now(), id).changes, 'Only draft surveys can be edited.', 409);
          return { id };
        }
        if (action === 'publish' && method === 'POST') {
          permit(user, managers);
          check(survey.endDate > now(), 'Set an end date in the future.');
          check(run("UPDATE surveys SET status='Scheduled',updatedAt=? WHERE id=? AND status='Draft'", now(), id).changes, 'Survey has already been published.', 409);
          worker.tick();
          return { ok: true };
        }
        if (action === 'analysis' && method === 'POST') {
          permit(user, reviewers);
          check(survey.responses >= survey.minimum, 'The survey has not reached its minimum response threshold.', 409);
          transaction(() => {
            check(!get("SELECT id FROM analyses WHERE surveyId=? AND status IN ('Queued','Processing')", id), 'Analysis is already running.', 409);
            run("INSERT INTO analyses(surveyId,status,createdAt,updatedAt) VALUES (?,'Queued',?,?)", id, now(), now());
          });
          return { status: 'Queued' };
        }
      }
    }

    const review = path.match(/^\/api\/analyses\/(\d+)$/);
    if (review && method === 'PUT') {
      permit(user, reviewers);
      const id = Number(review[1]);
      const job = get('SELECT * FROM analyses WHERE id=?', id);
      check(job?.status === 'Review', 'This analysis is unavailable for review.', 409);
      requireSurvey(user, job.surveyId);
      const result = parse(job.result);
      check(body.publish === true || body.publish === false, 'Choose save or publish.');
      if (Array.isArray(body.themes)) {
        check(body.themes.length === result.themes.length, 'Review each theme.');
        result.themes = result.themes.map(theme => {
          const edited = body.themes.find(item => item?.id === theme.id);
          check(edited, 'Missing theme.');
          return { ...theme, name: string(edited.name, 160, 'theme name'), description: string(edited.description, 800, 'description'),
            category: choice(edited.category, categories, 'category'), sentiment: choice(edited.sentiment, sentimentValues, 'sentiment') };
        });
      }
      if (body.summary) result.summary = Object.fromEntries(summaryFields.map(key => [key, string(body.summary[key], 2400, key)]));
      if (Array.isArray(body.comments)) {
        check(body.comments.length === result.comments.length, 'Review each comment assignment.');
        result.comments.forEach(comment => {
          const edited = body.comments.find(item => item?.id === comment.id);
          check(edited, 'Missing comment.');
          comment.themeId = choice(edited.themeId, result.themes.map(theme => theme.id), 'theme');
          comment.sentiment = choice(edited.sentiment, sentimentValues, 'sentiment');
        });
        result.themes.forEach(theme => { theme.count = result.comments.filter(comment => comment.themeId === theme.id).length; });
      }
      const version = string(body.updatedAt, 35, 'review version');
      check(run('UPDATE analyses SET status=?,result=?,updatedAt=? WHERE id=? AND updatedAt=? AND status=\'Review\'',
        body.publish ? 'Published' : 'Review', encode(result), now(), id, version).changes, 'The review changed. Reload it and try again.', 409);
      return { ok: true };
    }

    if (path === '/api/issues' && method === 'GET') {
      permit(user, [...issueManagers, 'Lecturer']);
      return all(`${issueSelect} ORDER BY i.createdAt DESC,i.id DESC`).filter(issue => visibleIssue(user, issue));
    }
    if (path === '/api/issues' && method === 'POST') {
      permit(user, issueManagers);
      const data = issueData(user, body);
      return transaction(() => {
        const stamp = now();
        const id = Number(run(`INSERT INTO issues(title,description,category,surveyId,analysisId,themeId,priority,assigneeId,dueDate,status,followupId,createdBy,createdAt,updatedAt)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...Object.values(data), user.id, stamp, stamp).lastInsertRowid);
        run('INSERT INTO history(issueId,userId,changes,createdAt) VALUES (?,?,?,?)', id, user.id, encode({ created: data }), stamp);
        return { id };
      });
    }
    const issue = path.match(/^\/api\/issues\/(\d+)$/);
    if (issue) {
      const id = Number(issue[1]);
      const item = get(`${issueSelect} WHERE i.id=?`, id);
      check(item && visibleIssue(user, item), 'Issue not found.', 404);
      if (method === 'GET') {
        const history = all('SELECT h.*,u.name actor FROM history h JOIN users u ON u.id=h.userId WHERE issueId=? ORDER BY h.id DESC', id)
          .map(row => ({ ...row, changes: parse(row.changes) }));
        let followup = null;
        if (item.followupId) {
          const source = requireSurvey(user, item.surveyId);
          const next = get(`SELECT ${surveyFields} ${surveyJoin} WHERE s.id=?`, item.followupId);
          if (!visibleSurvey(user, next)) return { issue: { ...item, followupId: null, followupTitle: null }, history, followup };
          followup = trends([{ ...safeSurvey(next), type: source.type, stats: availableStats(next) }],
            [{ ...safeSurvey(source), stats: availableStats(source) }]).filter(t => t.category === item.category);
          const oldAnalysis = item.analysisId && get('SELECT result FROM analyses WHERE id=?', item.analysisId);
          const oldTheme = oldAnalysis && parse(oldAnalysis.result).themes.find(theme => theme.id === item.themeId);
          const nextAnalysis = published(next.id);
          if (oldTheme && nextAnalysis && next.responses >= next.minimum) {
            const nextTheme = parse(nextAnalysis.result).themes.find(theme => theme.category === oldTheme.category && theme.name.toLowerCase() === oldTheme.name.toLowerCase());
            if (nextTheme) followup.push({ category: oldTheme.name, before: oldTheme.count, after: nextTheme.count, change: nextTheme.count - oldTheme.count, mentions: true, previous: source.title, survey: next.title });
          }
        }
        const origin = item.analysisId && get('SELECT result FROM analyses WHERE id=?', item.analysisId);
        const theme = origin && parse(origin.result).themes.find(value => value.id === item.themeId);
        return { issue: { ...item, themeName: theme?.name }, history, followup };
      }
      if (method === 'PUT') {
        permit(user, [...issueManagers, 'Lecturer']);
        let data;
        const statusOnly = user.role === 'Lecturer' || user.role === 'Edu Lead' && adminCategory(item.category) ||
          user.role === 'Admin Lead' && !adminCategory(item.category);
        if (statusOnly) {
          check(item.assigneeId === user.id, 'This issue is assigned to another user.', 403);
          data = { status: choice(body.status, ['Assigned', 'In Progress', 'Resolved'], 'status') };
        } else data = issueData(user, body, item);
        const version = string(body.updatedAt, 35, 'issue version');
        const changes = Object.fromEntries(Object.entries(data).filter(([key, value]) => item[key] !== value)
          .map(([key, value]) => [key, { from: item[key], to: value }]));
        if (Object.keys(changes).length) transaction(() => {
          const stamp = now();
          check(run(`UPDATE issues SET ${Object.keys(data).map(key => `${key}=?`).join(',')},updatedAt=? WHERE id=? AND updatedAt=?`,
            ...Object.values(data), stamp, id, version).changes, 'The issue changed. Reload and try again.', 409);
          run('INSERT INTO history(issueId,userId,changes,createdAt) VALUES (?,?,?,?)', id, user.id, encode(changes), stamp);
        });
        return { id };
      }
    }

    if (path === '/api/admin' && method === 'GET') {
      permit(user, ['System Admin']);
      return { users: all(`SELECT ${publicUser} FROM users ORDER BY id`), courses: all('SELECT * FROM courses ORDER BY name'), groups: all('SELECT * FROM groups ORDER BY name'), threshold: threshold() };
    }
    if (path === '/api/admin/settings' && method === 'PUT') {
      permit(user, ['System Admin']);
      check(typeof body.threshold === 'number' && body.threshold > 0 && body.threshold <= 4, 'Choose a threshold between 0 and 4.');
      run("UPDATE settings SET value=? WHERE key='dropThreshold'", String(body.threshold));
      return { ok: true };
    }
    if (path === '/api/admin/courses' && method === 'POST') {
      permit(user, ['System Admin']);
      run('INSERT INTO courses(name) VALUES (?)', string(body.name, 100, 'course name'));
      return { ok: true };
    }
    if (path === '/api/admin/groups' && method === 'POST') {
      permit(user, ['System Admin']);
      check(Number.isInteger(body.courseId) && get('SELECT id FROM courses WHERE id=?', body.courseId), 'Select a course.');
      run('INSERT INTO groups(name,courseId) VALUES (?,?)', string(body.name, 100, 'group name'), body.courseId);
      return { ok: true };
    }
    const userRoute = path.match(/^\/api\/admin\/users(?:\/(\d+))?$/);
    if (userRoute && ['POST', 'PUT'].includes(method)) {
      permit(user, ['System Admin']);
      const id = userRoute[1] ? Number(userRoute[1]) : null;
      check((method === 'PUT') === Boolean(id), 'Invalid user action.');
      const name = string(body.name, 100, 'name');
      const email = string(body.email, 254, 'email').toLowerCase();
      check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email.');
      const role = choice(body.role, roles, 'role');
      check(id !== user.id || role === user.role, 'You cannot remove your own administrator role.');
      const group = body.groupId ?? null;
      check(role === 'Student' ? Number.isInteger(group) && get('SELECT id FROM groups WHERE id=?', group) : group === null, 'Select a group for a student.');
      const password = body.password ? string(body.password, 250, 'password') : '';
      check(id && !password || password.length >= 12, 'Password must have at least 12 characters.');
      if (id) transaction(() => {
        const old = get('SELECT * FROM users WHERE id=?', id);
        check(old, 'User not found.', 404);
        if (old.role !== role) {
          check(!get('SELECT id FROM surveys WHERE lecturerId=?', id) && !get('SELECT id FROM issues WHERE assigneeId=?', id) &&
            !get('SELECT studentId FROM invitations WHERE studentId=?', id), 'This user has survey or issue history. Keep the existing role.');
        }
        run('UPDATE users SET name=?,email=?,role=?,groupId=?,password=? WHERE id=?', name, email, role, group, password ? hashPassword(password) : old.password, id);
        if (old.role !== role || password || old.email !== email) run('DELETE FROM sessions WHERE userId=?', id);
      });
      else run('INSERT INTO users(name,email,password,role,groupId) VALUES (?,?,?,?,?)', name, email, hashPassword(password), role, group);
      return { ok: true };
    }
    throw new HttpError(404, 'Endpoint not found.');
  };
}
