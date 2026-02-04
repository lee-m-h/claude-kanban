const express = require('express');
const { spawn, execSync } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// 전역 에러 핸들러 - 서버 크래시 방지
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 데이터 파일 경로
const DATA_DIR = path.join(__dirname, 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ========== 설정 관리 ==========

const DEFAULT_SETTINGS = {
  claudeCli: {
    nvmBin: '',
    flags: ['--dangerously-skip-permissions', '--print']
  },
  jira: {
    host: '',
    email: '',
    apiToken: ''
  },
  server: {
    port: 4001
  }
};

// 설정 로드 (메모리에 캐시)
let settings = loadSettings();

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      // 기본값과 병합 (누락된 키 보완)
      return mergeDeep(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), data);
    }
  } catch (err) {
    console.error('설정 파일 로드 실패:', err.message);
  }
  // 파일이 없거나 에러 시 기본값으로 생성
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettings(newSettings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
  settings = newSettings;
}

function mergeDeep(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// 설정값 가져오기 (환경변수 > settings.json > 기본값)
function getConfig() {
  const nvmBin = process.env.NVM_BIN || settings.claudeCli.nvmBin || DEFAULT_SETTINGS.claudeCli.nvmBin;
  // node는 현재 프로세스의 node를 사용 (가장 확실)
  const nodePath = process.execPath;
  // Claude CLI: 설정된 nvmBin 기반 또는 자동 감지
  let claudeCli = '';

  // 1) 설정된 nvmBin 기반
  if (nvmBin) {
    const fromNvm = path.resolve(nvmBin, '..', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(fromNvm)) claudeCli = fromNvm;
  }

  // 2) process.execPath 기반
  if (!claudeCli) {
    const nodeDir = path.dirname(process.execPath);
    const guess = path.join(nodeDir, '..', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(guess)) claudeCli = guess;
  }

  // 3) which claude 로 자동 감지
  if (!claudeCli) {
    try {
      const whichResult = execSync('which claude 2>/dev/null', { encoding: 'utf8' }).trim();
      if (whichResult && fs.existsSync(whichResult)) {
        // claude 바이너리가 심볼릭 링크인 경우 실제 cli.js 경로 추적
        const realPath = fs.realpathSync(whichResult);
        if (realPath.endsWith('.js')) {
          claudeCli = realPath;
        } else {
          // 바이너리 옆의 cli.js 탐색
          const binDir = path.dirname(realPath);
          const cliFromBin = path.join(binDir, '..', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
          if (fs.existsSync(cliFromBin)) claudeCli = cliFromBin;
        }
      }
    } catch (e) {}
  }

  // 4) 일반적인 경로 후보들
  if (!claudeCli) {
    const homeDir = process.env.HOME || require('os').homedir();
    const commonPaths = [
      path.join(homeDir, '.local', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
      path.join(homeDir, '.nvm', 'versions', 'node'),  // nvm 디렉터리 탐색용
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
      '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    ];
    for (const p of commonPaths) {
      if (p.includes('.nvm/versions/node') && fs.existsSync(p)) {
        // nvm: 최신 버전부터 탐색
        try {
          const versions = fs.readdirSync(p).sort().reverse();
          for (const ver of versions) {
            const cliPath = path.join(p, ver, 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
            if (fs.existsSync(cliPath)) { claudeCli = cliPath; break; }
          }
        } catch (e) {}
      } else if (fs.existsSync(p)) {
        claudeCli = p;
      }
      if (claudeCli) break;
    }
  }

  if (!claudeCli) {
    console.warn('⚠️ Claude CLI를 찾을 수 없습니다. 설정에서 경로를 지정하거나 npm i -g @anthropic-ai/claude-code 로 설치해주세요.');
  }
  const claudeFlags = settings.claudeCli.flags || DEFAULT_SETTINGS.claudeCli.flags;

  const jiraHost = process.env.JIRA_HOST || settings.jira.host || DEFAULT_SETTINGS.jira.host;
  const jiraEmail = process.env.JIRA_EMAIL || settings.jira.email || '';
  const jiraApiToken = process.env.JIRA_API_TOKEN || settings.jira.apiToken || '';
  const jiraAuth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

  const port = parseInt(process.env.PORT, 10) || settings.server.port || DEFAULT_SETTINGS.server.port;

  return { nvmBin, nodePath, claudeCli, claudeFlags, jiraHost, jiraEmail, jiraApiToken, jiraAuth, port };
}

// Claude CLI 자동 감지
function detectClaudeCli() {
  const candidates = [];

  // 1. which claude
  try {
    const whichResult = execSync('which claude 2>/dev/null', { encoding: 'utf8' }).trim();
    if (whichResult) {
      const binDir = path.dirname(whichResult);
      candidates.push({ nvmBin: binDir, method: 'which claude', path: whichResult });
    }
  } catch (e) {}

  // 2. 일반적인 nvm 경로들
  const homeDir = process.env.HOME || require('os').homedir();
  const nvmDir = path.join(homeDir, '.nvm/versions/node');
  try {
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir).sort().reverse();
      for (const ver of versions) {
        const binPath = path.join(nvmDir, ver, 'bin');
        const cliPath = path.join(nvmDir, ver, 'lib/node_modules/@anthropic-ai/claude-code/cli.js');
        if (fs.existsSync(cliPath)) {
          candidates.push({ nvmBin: binPath, method: `nvm ${ver}`, path: cliPath });
        }
      }
    }
  } catch (e) {}

  // 3. 글로벌 npm
  try {
    const npmRoot = execSync('npm root -g 2>/dev/null', { encoding: 'utf8' }).trim();
    const globalCli = path.join(npmRoot, '@anthropic-ai/claude-code/cli.js');
    if (fs.existsSync(globalCli)) {
      candidates.push({ nvmBin: path.dirname(path.dirname(npmRoot)), method: 'npm global', path: globalCli });
    }
  } catch (e) {}

  return candidates;
}

const PORT = getConfig().port;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 실행 중인 작업들
const runningTasks = new Map();

// 프로젝트 설정 로드
function loadProjects() {
  if (!fs.existsSync(PROJECTS_FILE)) {
    const defaultData = { projects: [] };
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
}

// 티켓 데이터 로드
function loadTickets() {
  if (!fs.existsSync(TICKETS_FILE)) {
    const defaultData = { tickets: [], nextId: 1 };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
}

// 티켓 데이터 저장
function saveTickets(data) {
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2));
}

// 프로젝트 목록 조회
app.get('/api/projects', (req, res) => {
  const data = loadProjects();
  res.json(data.projects);
});

// 프로젝트 추가
app.post('/api/projects', (req, res) => {
  const { id, name, path: projectPath, description } = req.body;
  
  if (!id || !projectPath) {
    return res.status(400).json({ error: 'ID와 경로는 필수입니다.' });
  }
  
  const data = loadProjects();
  
  // 중복 체크
  if (data.projects.find(p => p.id === id)) {
    return res.status(400).json({ error: '이미 존재하는 프로젝트 ID입니다.' });
  }
  
  data.projects.push({
    id,
    name: name || id,
    path: projectPath,
    description: description || ''
  });
  
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true, id });
});

// 프로젝트 삭제
app.delete('/api/projects/:id', (req, res) => {
  const data = loadProjects();
  const index = data.projects.findIndex(p => p.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  data.projects.splice(index, 1);
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
  
  res.json({ success: true });
});

// 티켓 목록 조회
app.get('/api/tickets', (req, res) => {
  const data = loadTickets();
  res.json(data.tickets);
});

// 티켓 생성
app.post('/api/tickets', (req, res) => {
  const data = loadTickets();
  const newTicket = {
    id: String(data.nextId).padStart(3, '0'),
    ...req.body,
    status: 'backlog',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  data.tickets.push(newTicket);
  data.nextId++;
  saveTickets(data);
  
  res.json(newTicket);
});

// 티켓 삭제
app.delete('/api/tickets/:id', (req, res) => {
  const data = loadTickets();
  const index = data.tickets.findIndex(t => t.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  
  // 로그 파일 삭제
  const logFile = path.join(DATA_DIR, 'logs', `ticket-${req.params.id}.log`);
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
  
  data.tickets.splice(index, 1);
  saveTickets(data);
  
  res.json({ success: true });
});

// 티켓 상태 업데이트
app.patch('/api/tickets/:id', (req, res) => {
  const data = loadTickets();
  const ticket = data.tickets.find(t => t.id === req.params.id);
  
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  
  Object.assign(ticket, req.body, { updatedAt: new Date().toISOString() });
  saveTickets(data);
  
  res.json(ticket);
});

// 🚀 Claude CLI로 작업 시작
app.post('/api/tasks/start', (req, res) => {
  const { ticketId, projectId, title, description } = req.body;
  
  // 프로젝트 경로 가져오기
  const projects = loadProjects();
  const project = projects.projects.find(p => p.id === projectId);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  // 티켓 상태 업데이트
  const ticketsData = loadTickets();
  const ticket = ticketsData.tickets.find(t => t.id === ticketId);
  if (ticket) {
    ticket.status = 'in-progress';
    ticket.startedAt = new Date().toISOString();
    saveTickets(ticketsData);

    // Jira 이슈가 연결되어 있으면 '진행 중'으로 전환
    if (ticket.jiraKey) {
      transitionJiraIssue(ticket.jiraKey, 'in-progress')
        .then(r => r && console.log(`[Jira] ${ticket.jiraKey} → 진행 중`))
        .catch(e => console.error(`[Jira] 전환 실패:`, e.message));
    }
  }
  
  // 티켓 유형별 지시사항
  const typeInstructions = {
    feature: `## 지시사항 (🆕 신규 기능)
1. 새로운 기능을 구현해주세요.
2. 필요한 파일을 생성/수정하세요.
3. 작업 완료 후 변경사항을 요약해주세요.
4. Git 커밋은 하지 마세요 (리뷰 후 진행).`,
    
    bug: `## 지시사항 (🐛 버그 수정)
1. 먼저 버그의 원인을 분석해주세요.
2. 원인을 파악한 후 수정해주세요.
3. 수정 내용과 원인을 설명해주세요.
4. Git 커밋은 하지 마세요 (리뷰 후 진행).`,
    
    improvement: `## 지시사항 (✏️ 개선/리팩토링)
1. 기존 코드를 분석해주세요.
2. 개선점을 파악하고 리팩토링해주세요.
3. 변경 전/후를 비교 설명해주세요.
4. Git 커밋은 하지 마세요 (리뷰 후 진행).`,
    
    check: `## 지시사항 (🔍 확인/분석)
1. 요청된 내용을 확인/분석해주세요.
2. ⚠️ 파일을 수정하지 마세요! 분석만 해주세요.
3. 분석 결과를 상세히 설명해주세요.
4. 필요시 개선 제안을 해주세요 (수정은 하지 말고).`
  };
  
  const ticketType = ticket?.type || 'feature';
  const instructions = typeInstructions[ticketType] || typeInstructions.feature;
  
  const config = getConfig();

  // Jira 정보 (있는 경우)
  let jiraInfo = '';
  if (ticket?.jiraKey) {
    jiraInfo = `
## Jira 티켓
- 키: ${ticket.jiraKey}
- URL: https://${config.jiraHost}/browse/${ticket.jiraKey}
`;
  }
  
  // Claude CLI 프롬프트 구성
  const prompt = `
프로젝트: ${project.name}
경로: ${project.path}
${jiraInfo}
## 작업 요청
제목: ${title}
설명: ${description}

${instructions}
`.trim();

  // 로그 파일 생성
  const logFile = path.join(DATA_DIR, 'logs', `ticket-${ticketId}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`[${new Date().toISOString()}] 🚀 작업 시작: ${title}\n`);
  logStream.write(`[${new Date().toISOString()}] 📂 프로젝트: ${project.path}\n`);
  logStream.write(`[${new Date().toISOString()}] 🤖 Claude 호출 중...\n\n`);

  // 세션 ID 관리 (같은 티켓은 같은 세션 유지)
  let claudeArgs = [config.claudeCli, ...config.claudeFlags, '-p', prompt];
  
  // 기존 세션 ID가 있으면 resume, 없으면 새 세션 생성
  if (ticket && ticket.sessionId) {
    // 기존 세션 이어가기
    claudeArgs = [config.claudeCli, '--resume', ticket.sessionId, ...config.claudeFlags, '-p', prompt];
    logStream.write(`[${new Date().toISOString()}] 🔄 기존 세션 이어가기: ${ticket.sessionId}\n`);
  } else {
    // 새 세션 ID 생성
    const newSessionId = crypto.randomUUID();
    claudeArgs = [config.claudeCli, '--session-id', newSessionId, ...config.claudeFlags, '-p', prompt];
    
    // 티켓에 세션 ID 저장
    if (ticket) {
      ticket.sessionId = newSessionId;
      saveTickets(ticketsData);
    }
    logStream.write(`[${new Date().toISOString()}] 🆕 새 세션 생성: ${newSessionId}\n`);
  }
  
  const claude = spawn(config.nodePath, claudeArgs, {
    cwd: project.path,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  // 실행 중인 작업에 저장
  runningTasks.set(ticketId, {
    process: claude,
    logFile,
    startTime: Date.now()
  });

  let output = '';
  let logEnded = false;
  
  const safeLogWrite = (text) => {
    if (!logEnded) {
      try { logStream.write(text); } catch (e) {}
    }
  };
  
  const safeLogEnd = () => {
    if (!logEnded) {
      logEnded = true;
      try { logStream.end(); } catch (e) {}
    }
  };

  claude.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    safeLogWrite(text);
    console.log(`[Ticket ${ticketId}] ${text}`);
  });

  claude.on('error', (err) => {
    console.error(`[Ticket ${ticketId}] Spawn error:`, err);
    safeLogWrite(`[ERROR] Spawn failed: ${err.message}\n`);
    safeLogEnd();
    runningTasks.delete(ticketId);
  });

  claude.stderr.on('data', (data) => {
    const text = data.toString();
    safeLogWrite(`[ERROR] ${text}`);
    console.error(`[Ticket ${ticketId} ERROR] ${text}`);
  });

  claude.on('close', (code) => {
    safeLogWrite(`\n[${new Date().toISOString()}] ✅ 작업 완료 (exit code: ${code})\n`);
    safeLogEnd();
    
    // 티켓 상태를 리뷰대기로 변경
    const data = loadTickets();
    const t = data.tickets.find(t => t.id === ticketId);
    if (t) {
      t.status = 'review';
      t.completedAt = new Date().toISOString();
      t.claudeOutput = output.slice(-2000); // 마지막 2000자만 저장
      saveTickets(data);
    }
    
    runningTasks.delete(ticketId);
    console.log(`[Ticket ${ticketId}] 작업 완료!`);
  });

  res.json({ 
    success: true, 
    message: 'Claude 작업이 시작되었습니다.',
    ticketId,
    logFile
  });
});

// 작업 로그 조회
app.get('/api/tasks/:ticketId/log', (req, res) => {
  const logFile = path.join(DATA_DIR, 'logs', `ticket-${req.params.ticketId}.log`);
  
  if (!fs.existsSync(logFile)) {
    return res.json({ log: '로그가 없습니다.' });
  }
  
  const log = fs.readFileSync(logFile, 'utf8');
  const task = runningTasks.get(req.params.ticketId);
  
  res.json({ 
    log,
    isRunning: !!task,
    runTime: task ? Math.floor((Date.now() - task.startTime) / 1000) : null
  });
});

// 작업 중지
app.post('/api/tasks/:ticketId/stop', (req, res) => {
  const task = runningTasks.get(req.params.ticketId);
  
  if (task) {
    task.process.kill('SIGTERM');
    runningTasks.delete(req.params.ticketId);
  }
  
  // 티켓 상태는 in-progress 유지 (중지됨 상태)
  const data = loadTickets();
  const ticket = data.tickets.find(t => t.id === req.params.ticketId);
  if (ticket) {
    ticket.status = 'in-progress';
    ticket.stopped = true;
    saveTickets(data);
  }
  
  res.json({ success: true, message: '작업이 중지되었습니다.' });
});

// 실행 중인 작업 목록
app.get('/api/tasks/running', (req, res) => {
  const running = [];
  runningTasks.forEach((task, ticketId) => {
    running.push({
      ticketId,
      runTime: Math.floor((Date.now() - task.startTime) / 1000)
    });
  });
  res.json(running);
});

// ✅ 승인 - Claude에게 커밋/푸시 요청
app.post('/api/tasks/:ticketId/approve', async (req, res) => {
  const { ticketId } = req.params;
  
  const ticketsData = loadTickets();
  const ticket = ticketsData.tickets.find(t => t.id === ticketId);
  
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  
  const projects = loadProjects();
  const project = projects.projects.find(p => p.id === ticket.projectId);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  // 티켓 상태를 진행중으로
  ticket.status = 'in-progress';
  ticket.approving = true;
  saveTickets(ticketsData);
  
  // Claude에게 커밋/푸시 요청
  const prompt = `
## 승인 요청

변경 사항을 커밋하고 푸시해주세요.

### 티켓 정보
- 제목: ${ticket.title}
- 설명: ${ticket.description || '없음'}

### 지시사항
1. 현재 변경사항을 확인하세요.
2. 적절한 커밋 메시지를 작성해서 커밋하세요.
3. 원격 저장소에 푸시하세요.
4. 완료되면 결과를 알려주세요.
`.trim();

  const config = getConfig();

  // 로그 파일
  const logFile = path.join(DATA_DIR, 'logs', `ticket-${ticketId}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n[${new Date().toISOString()}] ✅ 승인 - 커밋/푸시 요청\n`);

  let claudeArgs = [config.claudeCli, ...config.claudeFlags, '-p', prompt];
  
  if (ticket.sessionId) {
    claudeArgs = [config.claudeCli, '--resume', ticket.sessionId, ...config.claudeFlags, '-p', prompt];
    logStream.write(`[${new Date().toISOString()}] 🔄 기존 세션 이어가기: ${ticket.sessionId}\n`);
  }
  
  let logEnded = false;
  const safeLogWrite = (text) => {
    if (!logEnded) try { logStream.write(text); } catch (e) {}
  };
  const safeLogEnd = () => {
    if (!logEnded) { logEnded = true; try { logStream.end(); } catch (e) {} }
  };
  
  const claude = spawn(config.nodePath, claudeArgs, {
    cwd: project.path,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  runningTasks.set(ticketId, {
    process: claude,
    logFile,
    startTime: Date.now()
  });

  claude.stdout.on('data', (data) => {
    safeLogWrite(data.toString());
  });

  claude.stderr.on('data', (data) => {
    safeLogWrite(`[ERROR] ${data.toString()}`);
  });

  claude.on('error', (err) => {
    safeLogWrite(`[ERROR] ${err.message}\n`);
    safeLogEnd();
    runningTasks.delete(ticketId);
  });

  claude.on('close', (code) => {
    safeLogWrite(`\n[${new Date().toISOString()}] ✅ 커밋/푸시 완료\n`);
    safeLogEnd();
    
    // 티켓 상태를 완료로
    const data = loadTickets();
    const t = data.tickets.find(t => t.id === ticketId);
    if (t) {
      t.status = 'done';
      t.completedAt = new Date().toISOString();
      t.approving = false;
      saveTickets(data);

      // Jira 이슈가 연결되어 있으면 '완료'로 전환
      if (t.jiraKey) {
        transitionJiraIssue(t.jiraKey, 'done')
          .then(r => r && console.log(`[Jira] ${t.jiraKey} → 완료`))
          .catch(e => console.error(`[Jira] 전환 실패:`, e.message));
      }
    }
    
    runningTasks.delete(ticketId);
  });

  res.json({ 
    success: true, 
    message: 'Claude가 커밋/푸시를 진행합니다.'
  });
});

// 🔄 재요청 - 추가 요청사항과 함께 다시 작업
app.post('/api/tasks/:ticketId/rework', async (req, res) => {
  const { ticketId } = req.params;
  const { additionalRequest } = req.body;
  
  const ticketsData = loadTickets();
  const ticket = ticketsData.tickets.find(t => t.id === ticketId);
  
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  
  const projects = loadProjects();
  const project = projects.projects.find(p => p.id === ticket.projectId);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  // 티켓 상태를 진행중으로
  ticket.status = 'in-progress';
  ticket.reworkCount = (ticket.reworkCount || 0) + 1;
  ticket.lastReworkRequest = additionalRequest;
  saveTickets(ticketsData);
  
  // 재작업 프롬프트
  const prompt = `
## 재작업 요청 (${ticket.reworkCount}번째)

이전 작업에 대한 수정 요청입니다:
${additionalRequest}

## 원래 티켓 정보
제목: ${ticket.title}
설명: ${ticket.description || '없음'}

이전 작업 내용을 기반으로 수정해주세요.
`.trim();

  const config = getConfig();

  // 로그 파일
  const logFile = path.join(DATA_DIR, 'logs', `ticket-${ticketId}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n[${new Date().toISOString()}] 🔄 재작업 요청 #${ticket.reworkCount}\n`);
  logStream.write(`[${new Date().toISOString()}] 📝 요청: ${additionalRequest}\n`);

  // Claude CLI 실행 (세션 유지)
  let claudeArgs = [config.claudeCli, ...config.claudeFlags, '-p', prompt];
  
  if (ticket.sessionId) {
    claudeArgs = [config.claudeCli, '--resume', ticket.sessionId, ...config.claudeFlags, '-p', prompt];
    logStream.write(`[${new Date().toISOString()}] 🔄 기존 세션 이어가기: ${ticket.sessionId}\n`);
  }
  
  const claude = spawn(config.nodePath, claudeArgs, {
    cwd: project.path,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  runningTasks.set(ticketId, {
    process: claude,
    logFile,
    startTime: Date.now()
  });

  claude.stdout.on('data', (data) => {
    logStream.write(data.toString());
  });

  claude.stderr.on('data', (data) => {
    logStream.write(`[ERROR] ${data.toString()}`);
  });

  claude.on('close', (code) => {
    logStream.write(`\n[${new Date().toISOString()}] ✅ 재작업 완료\n`);
    logStream.end();
    
    const data = loadTickets();
    const t = data.tickets.find(t => t.id === ticketId);
    if (t) {
      t.status = 'review';
      saveTickets(data);
    }
    
    runningTasks.delete(ticketId);
  });

  res.json({ 
    success: true, 
    message: '재작업이 시작되었습니다.',
    reworkCount: ticket.reworkCount
  });
});

// ========== 환경설정 API ==========

// GET /api/settings — 현재 설정 반환 (apiToken 마스킹)
app.get('/api/settings', (req, res) => {
  const masked = JSON.parse(JSON.stringify(settings));
  if (masked.jira && masked.jira.apiToken) {
    const token = masked.jira.apiToken;
    masked.jira.apiToken = token.length > 4
      ? token.slice(0, 4) + '*'.repeat(Math.min(token.length - 4, 20))
      : token ? '****' : '';
  }
  res.json(masked);
});

// PUT /api/settings — 설정 저장 (즉시 반영)
app.put('/api/settings', (req, res) => {
  try {
    const incoming = req.body;

    // apiToken이 마스킹 상태면 기존값 유지
    if (incoming.jira && incoming.jira.apiToken && incoming.jira.apiToken.includes('*')) {
      incoming.jira.apiToken = settings.jira.apiToken;
    }

    // 기본값과 병합
    const newSettings = mergeDeep(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), incoming);
    saveSettings(newSettings);

    res.json({ success: true, message: '설정이 저장되었습니다.' });
  } catch (err) {
    console.error('설정 저장 실패:', err);
    res.status(500).json({ error: '설정 저장 실패: ' + err.message });
  }
});

// GET /api/settings/detect-claude — Claude CLI 경로 자동 감지
app.get('/api/settings/detect-claude', (req, res) => {
  const candidates = detectClaudeCli();
  res.json({ candidates });
});

// 데이터 초기화
app.post('/api/reset', (req, res) => {
  try {
    // 실행 중인 작업 모두 종료
    for (const [id, task] of runningTasks) {
      if (task.process) task.process.kill();
    }
    runningTasks.clear();
    
    // 티켓 초기화
    fs.writeFileSync(TICKETS_FILE, JSON.stringify({ tickets: [], nextId: 1 }, null, 2));
    
    // 로그 파일 전체 삭제
    const logsDir = path.join(DATA_DIR, 'logs');
    if (fs.existsSync(logsDir)) {
      fs.readdirSync(logsDir).forEach(f => fs.unlinkSync(path.join(logsDir, f)));
    }
    
    res.json({ success: true, message: '모든 데이터가 초기화되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Jira 연동 API ==========

// Jira API 호출 헬퍼
async function jiraFetch(endpoint, options = {}) {
  const config = getConfig();
  const url = `https://${config.jiraHost}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${config.jiraAuth}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response.json();
}

// Jira 이슈 상태 전환 헬퍼
// targetStatus: 전환하려는 상태 이름 (예: '진행 중', 'In Progress', '완료', 'Done')
async function transitionJiraIssue(jiraKey, targetStatus) {
  const config = getConfig();
  if (!config.jiraHost || !jiraKey) return null;

  try {
    // 1) 사용 가능한 전환 목록 조회
    const transitions = await jiraFetch(`/rest/api/3/issue/${jiraKey}/transitions`);
    if (!transitions.transitions) return null;

    // 2) 대상 상태와 매칭되는 전환 찾기
    const statusAliases = {
      'in-progress': ['진행 중', 'in progress', '진행중', 'start progress'],
      'review': ['리뷰', 'review', 'in review', '검토', '리뷰 대기'],
      'done': ['완료', 'done', 'closed', 'resolved', '해결됨', '종료'],
    };

    const aliases = statusAliases[targetStatus] || [targetStatus];
    const transition = transitions.transitions.find(t =>
      aliases.some(a => t.name.toLowerCase().includes(a.toLowerCase()) ||
                        t.to?.name?.toLowerCase().includes(a.toLowerCase()))
    );

    if (!transition) {
      console.log(`[Jira] ${jiraKey}: '${targetStatus}' 전환을 찾을 수 없음. 가능한 전환:`,
        transitions.transitions.map(t => `${t.name} → ${t.to?.name}`));
      return null;
    }

    // 3) 전환 실행
    const result = await jiraFetch(`/rest/api/3/issue/${jiraKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transition.id } })
    });

    console.log(`[Jira] ${jiraKey}: '${transition.name}' → '${transition.to?.name}' 전환 완료`);
    return { transitionName: transition.name, toStatus: transition.to?.name };
  } catch (err) {
    console.error(`[Jira] ${jiraKey} 상태 전환 실패:`, err.message);
    return null;
  }
}

// 내 미완료 이슈 목록
app.get('/api/jira/issues', async (req, res) => {
  try {
    const result = await jiraFetch('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql: 'assignee=currentUser() AND statusCategory!=Done ORDER BY updated DESC',
        maxResults: 50,
        fields: ['summary', 'status', 'issuetype', 'priority', 'project', 'description']
      })
    });
    
    const issues = result.issues?.map(issue => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      type: issue.fields.issuetype?.name,
      priority: issue.fields.priority?.name,
      project: issue.fields.project?.name,
      projectKey: issue.fields.project?.key,
      description: issue.fields.description?.content?.[0]?.content?.[0]?.text || ''
    })) || [];
    
    res.json(issues);
  } catch (error) {
    console.error('Jira 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// Jira 이슈를 티켓으로 가져오기
app.post('/api/jira/import', async (req, res) => {
  const { issues } = req.body; // [{key, summary, type, priority, project, description}]
  
  const ticketsData = loadTickets();
  const imported = [];
  
  for (const issue of issues) {
    // 이미 가져온 이슈인지 확인
    const existing = ticketsData.tickets.find(t => t.jiraKey === issue.key);
    if (existing) {
      continue;
    }
    
    // 타입 매핑
    const typeMap = {
      '버그': 'bug',
      'Bug': 'bug',
      '작업': 'feature',
      'Task': 'feature',
      '스토리': 'feature',
      'Story': 'feature',
      '개선': 'improvement',
      'Improvement': 'improvement',
      '에픽': 'feature',
      'Epic': 'feature'
    };
    
    // 우선순위 매핑
    const priorityMap = {
      'Highest': 'critical',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Lowest': 'low'
    };
    
    const newTicket = {
      id: String(ticketsData.nextId).padStart(3, '0'),
      jiraKey: issue.key,
      projectId: null, // 나중에 프로젝트 연결
      type: typeMap[issue.type] || 'feature',
      title: `[${issue.key}] ${issue.summary}`,
      description: issue.description || '',
      priority: priorityMap[issue.priority] || 'medium',
      status: 'backlog',
      jiraProject: issue.project,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    ticketsData.tickets.push(newTicket);
    ticketsData.nextId++;
    imported.push(newTicket);
  }
  
  saveTickets(ticketsData);
  
  res.json({ 
    success: true, 
    imported: imported.length,
    tickets: imported
  });
});

// Jira 연결 테스트
app.get('/api/jira/test', async (req, res) => {
  try {
    const result = await jiraFetch('/rest/api/3/myself');
    res.json({ 
      connected: true, 
      user: result.displayName,
      email: result.emailAddress
    });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

app.listen(PORT, () => {
  const config = getConfig();
  console.log(`🦊 Claude Kanban 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   프로젝트 수: ${loadProjects().projects.length}`);
  console.log(`   티켓 수: ${loadTickets().tickets.length}`);
  console.log(`   Jira: ${config.jiraEmail ? '설정됨' : '미설정'}`);
  console.log(`   Claude CLI: ${config.claudeCli}`);
  console.log(`   설정 파일: ${SETTINGS_FILE}`);
});
