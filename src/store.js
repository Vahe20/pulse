import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const roles = ['Student', 'Lecturer', 'Edu Lead', 'Admin Lead', 'Director', 'System Admin'];
export const categories = ['Lectures', 'Practice', 'Materials', 'Organization', 'Infrastructure'];
export const statuses = ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
export const priorities = ['Low', 'Medium', 'High', 'Critical'];
export const types = ['Mid-course', 'End-course', 'Pulse check'];
export const now = () => new Date().toISOString();
export const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString();
export const parse = JSON.parse;
export const encode = JSON.stringify;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, courseId INTEGER NOT NULL REFERENCES courses(id));
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL, groupId INTEGER REFERENCES groups(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, userId INTEGER NOT NULL REFERENCES users(id), expiresAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expiresAt);
    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, type TEXT NOT NULL,
      groupId INTEGER NOT NULL REFERENCES groups(id), lecturerId INTEGER NOT NULL REFERENCES users(id),
      questions TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL,
      minimum INTEGER NOT NULL, reminderHours INTEGER NOT NULL, anonymous INTEGER NOT NULL,
      status TEXT NOT NULL, createdBy INTEGER NOT NULL REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invitations (
      surveyId INTEGER REFERENCES surveys(id), studentId INTEGER REFERENCES users(id),
      completed INTEGER NOT NULL DEFAULT 0, lastReminder TEXT, draft TEXT,
      PRIMARY KEY(surveyId, studentId)
    );
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY, surveyId INTEGER NOT NULL REFERENCES surveys(id),
      studentId INTEGER REFERENCES users(id), answers TEXT NOT NULL, submittedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS responses_survey ON responses(surveyId);
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY, userId INTEGER NOT NULL REFERENCES users(id),
      surveyId INTEGER NOT NULL REFERENCES surveys(id), type TEXT NOT NULL,
      createdAt TEXT NOT NULL, readAt TEXT
    );
    CREATE INDEX IF NOT EXISTS notices_user ON notices(userId, createdAt);
    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY, surveyId INTEGER NOT NULL REFERENCES surveys(id), status TEXT NOT NULL,
      result TEXT, error TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analyses_survey ON analyses(surveyId, id);
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
      surveyId INTEGER NOT NULL REFERENCES surveys(id), analysisId INTEGER REFERENCES analyses(id), themeId TEXT,
      priority TEXT NOT NULL, assigneeId INTEGER NOT NULL REFERENCES users(id),
      dueDate TEXT NOT NULL, status TEXT NOT NULL, followupId INTEGER REFERENCES surveys(id),
      createdBy INTEGER NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY, issueId INTEGER NOT NULL REFERENCES issues(id),
      userId INTEGER NOT NULL REFERENCES users(id), changes TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO settings VALUES ('dropThreshold', '0.4');
  `);
  return {
    db,
    get: (sql, ...args) => db.prepare(sql).get(...args),
    all: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    transaction(work) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export const surveyFields = `s.*, g.name groupName, c.id courseId, c.name courseName, u.name lecturerName,
  (SELECT count(*) FROM invitations WHERE surveyId = s.id) invited,
  (SELECT count(*) FROM invitations WHERE surveyId = s.id AND completed = 1) responses`;
export const surveyJoin = `FROM surveys s JOIN groups g ON g.id=s.groupId
  JOIN courses c ON c.id=g.courseId JOIN users u ON u.id=s.lecturerId`;

export function surveyStats(store, survey) {
  const questions = parse(survey.questions);
  const rows = store.all('SELECT answers FROM responses WHERE surveyId=?', survey.id).map(row => parse(row.answers));
  const ratings = questions.filter(q => q.type === 'Rating').map(q => {
    const values = rows.map(row => row[q.id]).filter(Number.isInteger);
    return { criterion: q.text, category: q.category, count: values.length, sum: values.reduce((a, b) => a + b, 0) };
  }).filter(rating => rating.count >= survey.minimum);
  const choiceResults = questions.filter(q => ['Single Choice', 'Multiple Choice'].includes(q.type)).map(q => ({
    question: q.text,
    count: rows.filter(row => row[q.id] != null).length,
    options: q.options.map(option => ({ option, count: rows.filter(row => row[q.id] === option || (Array.isArray(row[q.id]) && row[q.id].includes(option))).length })),
  })).filter(result => result.count >= survey.minimum);
  const sum = ratings.reduce((total, rating) => total + rating.sum, 0);
  const count = ratings.reduce((total, rating) => total + rating.count, 0);
  return { ratings, choiceResults, sum, count, average: count ? sum / count : null };
}

export function seed(store, { demo, email, password }) {
  if (store.get('SELECT id FROM users LIMIT 1')) return;
  if (!demo && (!email || !password || password.length < 12)) {
    throw new Error('Set PULSE_ADMIN_EMAIL and PULSE_ADMIN_PASSWORD (12+ characters), or set PULSE_DEMO=1.');
  }
  store.transaction(() => {
    const { run, get } = store;
    const shared = hashPassword(demo ? 'PulseDemo2026!' : password);
    const add = (name, address, role, group = null) =>
      Number(run('INSERT INTO users(name,email,password,role,groupId) VALUES (?,?,?,?,?)', name, address, shared, role, group).lastInsertRowid);
    add('System Admin', demo ? 'admin@pulse.test' : email.trim().toLowerCase(), 'System Admin');
    if (!demo) return;
    const director = add('Maya Thompson', 'director@pulse.test', 'Director');
    const edu = add('Alex Morgan', 'edu@pulse.test', 'Edu Lead');
    const ops = add('Jordan Lee', 'ops@pulse.test', 'Admin Lead');
    const lecturer = add('Sam Rivera', 'lecturer@pulse.test', 'Lecturer');
    const secondLecturer = add('Taylor Chen', 'taylor@pulse.test', 'Lecturer');
    run("INSERT INTO courses VALUES (1,'Python Development'),(2,'Web Engineering')");
    run("INSERT INTO groups VALUES (1,'Python 12',1),(2,'Web 08',2)");
    const students = [[], []];
    for (let group = 1; group <= 2; group++) {
      for (let n = 1; n <= 24; n++) {
        const address = group === 1 && n === 24 ? 'student@pulse.test' : `student-${group}-${n}@pulse.test`;
        students[group - 1].push(add(`Student ${group}.${n}`, address, 'Student', group));
      }
    }
    const questions = [
      { id: 'lectures', text: 'How do you rate the quality of lectures?', type: 'Rating', category: 'Lectures', required: true },
      { id: 'practice', text: 'How do you rate the practical sessions?', type: 'Rating', category: 'Practice', required: true },
      { id: 'materials', text: 'How do you rate the learning materials?', type: 'Rating', category: 'Materials', required: true },
      { id: 'organization', text: 'How do you rate course organization?', type: 'Rating', category: 'Organization', required: true },
      { id: 'feedback', text: 'What could we improve?', type: 'Text', category: 'Organization', required: false },
    ];
    const snippets = [
      'We need more practice before exams.', 'Please add more practice exercises and exam preparation.',
      'The laboratory Wi-Fi keeps disconnecting.', 'Wi-Fi in the lab is unreliable.',
      'The lectures are clear and engaging.', 'I like how clear the lectures are.',
      'The materials are helpful and well organized.', 'More hands-on practice would help.',
    ];
    for (const [id, name, type, group, teacher, start, end, count, scores] of [
      [1, 'Python 12 · First pulse check', 'Pulse check', 1, lecturer, -78, -69, 18, [4.1, 4.0, 3.7, 3.9]],
      [2, 'Python 12 · Course feedback', 'Mid-course', 1, lecturer, -51, -43, 19, [4.4, 4.1, 4.1, 4.0]],
      [3, 'Python 12 · October feedback', 'Mid-course', 1, lecturer, -30, -22, 20, [4.5, 4.3, 4.2, 4.0]],
      [4, 'Web 08 · Mid-course feedback', 'Mid-course', 2, secondLecturer, -20, -12, 19, [4.3, 4.4, 4.0, 4.1]],
      [5, 'Python 12 · Mid-course survey', 'Mid-course', 1, lecturer, -9, 6, 21, [4.6, 3.8, 4.4, 4.2]],
      [6, 'Python 12 · Follow-up survey', 'End-course', 1, lecturer, 12, 24, 0, []],
    ]) {
      run('INSERT INTO surveys(id,title,description,type,groupId,lecturerId,questions,startDate,endDate,minimum,reminderHours,anonymous,status,createdBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, name, 'Help us improve your learning experience. Your feedback is anonymous.', type, group, teacher, encode(questions), day(start), day(end), 5, 48, 1, end < 0 ? 'Closed' : start > 0 ? 'Scheduled' : 'Active', edu);
      if (start > 0) continue;
      students[group - 1].forEach((student, index) => {
        run('INSERT INTO invitations(surveyId,studentId,completed,lastReminder) VALUES (?,?,?,?)', id, student, Number(index < count), now());
        if (index < count) {
          const answers = Object.fromEntries(questions.slice(0, 4).map((q, i) => [
            q.id, Math.floor(scores[i]) + Number((index * 5 + i * 3) % count < Math.round((scores[i] % 1) * count)),
          ]));
          answers.feedback = snippets[index % snippets.length];
          run('INSERT INTO responses VALUES (?,?,?,?,NULL)', randomBytes(16).toString('hex'), id, null, encode(answers));
        } else if (end > 0) {
          run('INSERT INTO notices(userId,surveyId,type,createdAt) VALUES (?,?,?,?)', student, id, 'Invitation', day(start));
        }
      });
    }
    const themes = [
      { id: 'practice', name: 'More hands-on practice', description: 'Students want additional exercises and exam preparation.', category: 'Practice', sentiment: 'Negative', confidence: 0.94, count: 8 },
      { id: 'wifi', name: 'Lab Wi-Fi reliability', description: 'Intermittent connection issues interrupt lab work.', category: 'Infrastructure', sentiment: 'Negative', confidence: 0.92, count: 6 },
      { id: 'lectures', name: 'Clear, engaging lectures', description: 'Students appreciate the clarity of lectures.', category: 'Lectures', sentiment: 'Positive', confidence: 0.89, count: 5 },
    ];
    run('INSERT INTO analyses VALUES (1,?,?,?,?,?,?)', 5, 'Published', encode({
      source: 'Demo', themes, comments: [],
      summary: { positives: 'Students value clear lectures and helpful learning materials.', problems: 'More hands-on practice and reliable lab Wi-Fi.', recurring: 'Requests for exercises before exams.', critical: 'Check the reported lab connection failures.', recommendations: 'Add a practice session and investigate access-point reliability.' },
    }), null, day(-2), day(-2));
    [
      ['Add more hands-on practice sessions', 'Practice', 'High', 'In Progress', edu, 3, 'practice'],
      ['Resolve lab Wi-Fi interruptions', 'Infrastructure', 'High', 'Assigned', ops, -1, 'wifi'],
      ['Publish exam preparation resources', 'Materials', 'Medium', 'Open', edu, 8],
      ['Improve course onboarding guide', 'Organization', 'Low', 'Resolved', ops, 0],
      ['Refresh lecture slide examples', 'Lectures', 'Medium', 'Closed', lecturer, -5],
    ].forEach(([title, category, priority, status, owner, due, theme]) => {
      const id = run('INSERT INTO issues(title,description,category,surveyId,analysisId,themeId,priority,assigneeId,dueDate,status,followupId,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        title, '', category, theme ? 5 : 3, theme ? 1 : null, theme ?? null, priority, owner, day(due).slice(0, 10), status, theme ? 6 : null, director, day(-2), day(-2)).lastInsertRowid;
      run('INSERT INTO history(issueId,userId,changes,createdAt) VALUES (?,?,?,?)', id, director, encode({ created: title, status, assigneeId: owner }), day(-2));
    });
  });
}
