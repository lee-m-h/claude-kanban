// ========== 테마 관리 ==========

const THEME_KEY = 'kanban-theme';
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '🖥️', light: '☀️', dark: '🌙' };
const THEME_LABELS = { system: '시스템', light: '라이트', dark: '다크' };

let systemDarkMql = null;

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(saved);

  // 시스템 테마 변경 감지
  systemDarkMql = window.matchMedia('(prefers-color-scheme: dark)');
  systemDarkMql.addEventListener('change', () => {
    const current = localStorage.getItem(THEME_KEY) || 'system';
    if (current === 'system') {
      // CSS @media가 자동 처리하지만, JS로도 동기화
      updateThemeButton('system');
    }
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeButton(theme);
}

function updateThemeButton(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.textContent = THEME_ICONS[theme] || '🖥️';
    btn.title = `테마: ${THEME_LABELS[theme] || '시스템'} (클릭하여 변경)`;
  }
}

function cycleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'system';
  const idx = THEME_ORDER.indexOf(current);
  const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
  applyTheme(next);
}

// 즉시 테마 초기화 (FOUC 방지)
initTheme();

// ========== 프로젝트 설정 ==========

// 프로젝트 설정 (서버에서 동적 로드)
let projects = {};

// 현재 선택된 프로젝트 (필터용)
let currentProjectFilter = 'all';
let allTickets = []; // 전체 티켓 저장

// 모달 제어
function openNewTicket() {
  // 폼 초기화
  document.getElementById('newTicketForm').reset();
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="feature"]').classList.add('active');
  document.getElementById('ticketJiraKey').value = '';
  document.getElementById('newTicketModal').classList.add('active');
}

function closeModal() {
  document.getElementById('newTicketModal').classList.remove('active');
}

function closeLogModal() {
  document.getElementById('logModal').classList.remove('active');
}

// 현재 보고 있는 로그의 티켓 ID 저장
let currentLogTicketId = null;
let logPollInterval = null;

function closeLogSidePanel() {
  document.getElementById('logSidePanel').classList.remove('active');
  if (logPollInterval) {
    clearInterval(logPollInterval);
    logPollInterval = null;
  }
  currentLogTicketId = null;
}

// 사이드 패널에서 모달로 펼쳐보기
function expandLogToModal() {
  if (currentLogTicketId) {
    viewLogInModal(currentLogTicketId);
  }
}

// 모달에서 로그 보기 (전체화면)
async function viewLogInModal(ticketId) {
  try {
    const response = await fetch(`${API_BASE}/tasks/${ticketId}/log`);
    const data = await response.json();
    
    const modalContent = document.querySelector('#logModal .modal-content');
    const logOutput = document.querySelector('#logModal .log-output');
    const modalHeader = document.querySelector('#logModal .modal-header h2');
    
    modalContent.classList.add('modal-fullscreen');
    modalHeader.textContent = `📝 작업 로그 - #${ticketId}`;
    logOutput.innerHTML = formatLog(data.log);
    
    if (data.isRunning) {
      logOutput.innerHTML += `\n<span class="log-info">⏳ 작업 진행중... (${data.runTime}초)</span>`;
    }
    
    document.getElementById('logModal').classList.add('active');
    
  } catch (error) {
    console.error('로그 조회 실패:', error);
    alert('로그를 불러올 수 없습니다.');
  }
}

function viewLog(ticketId) {
  // 사이드 패널에 로그 표시
  showLogInSidePanel(ticketId);
}

// 사이드 패널에 로그 표시
async function showLogInSidePanel(ticketId) {
  currentLogTicketId = ticketId;
  const sidePanel = document.getElementById('logSidePanel');
  const logOutput = document.getElementById('logSideOutput');
  const logTitle = document.getElementById('logSideTitle');
  
  sidePanel.classList.add('active');
  logTitle.textContent = `📝 #${ticketId}`;
  logOutput.innerHTML = '<span class="log-info">로딩 중...</span>';
  
  // 기존 폴링 중지
  if (logPollInterval) {
    clearInterval(logPollInterval);
  }
  
  const updateSideLog = async () => {
    try {
      const response = await fetch(`${API_BASE}/tasks/${ticketId}/log`);
      const data = await response.json();
      
      logOutput.innerHTML = formatLog(data.log);
      
      if (data.isRunning) {
        logOutput.innerHTML += `\n<span class="log-info">⏳ 작업 진행중... (${data.runTime}초)</span>`;
      } else {
        logOutput.innerHTML += `\n<span class="log-success">✅ 작업 완료!</span>`;
        if (logPollInterval) {
          clearInterval(logPollInterval);
          logPollInterval = null;
        }
      }
      
      // 스크롤 맨 아래로
      const container = document.querySelector('.log-side-content');
      container.scrollTop = container.scrollHeight;
      
    } catch (error) {
      console.error('로그 조회 실패:', error);
      logOutput.innerHTML = '<span class="log-error">로그를 불러올 수 없습니다.</span>';
    }
  };
  
  // 즉시 한번 실행
  await updateSideLog();
  
  // 실시간 폴링 시작 (작업 중인 경우)
  try {
    const response = await fetch(`${API_BASE}/tasks/${ticketId}/log`);
    const data = await response.json();
    if (data.isRunning) {
      logPollInterval = setInterval(updateSideLog, 2000);
    }
  } catch (e) {}
}

async function openSettings() {
  const modal = document.getElementById('settingsModal');
  modal.classList.add('active');
  // 기본 탭으로 초기화
  switchSettingsTab('projects');
  await loadProjectList();
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('active');
}

// 설정 탭 전환
function switchSettingsTab(tabName) {
  // 탭 버튼 활성화
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.settings-tab[data-tab="${tabName}"]`).classList.add('active');
  
  // 탭 콘텐츠 전환
  document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
  
  if (tabName === 'projects') {
    document.getElementById('settingsTabProjects').classList.add('active');
  } else if (tabName === 'environment') {
    document.getElementById('settingsTabEnvironment').classList.add('active');
    loadEnvironmentSettings();
  }
}

// 환경설정 로드
async function loadEnvironmentSettings() {
  try {
    const response = await fetch(`${API_BASE}/settings`);
    const data = await response.json();
    
    document.getElementById('settingsNvmBin').value = data.claudeCli?.nvmBin || '';
    document.getElementById('settingsCliFlags').value = (data.claudeCli?.flags || []).join(' ');
    document.getElementById('settingsJiraHost').value = data.jira?.host || '';
    document.getElementById('settingsJiraEmail').value = data.jira?.email || '';
    document.getElementById('settingsJiraToken').value = data.jira?.apiToken || '';
    document.getElementById('settingsPort').value = data.server?.port || 4001;
  } catch (error) {
    console.error('환경설정 로드 실패:', error);
  }
}

// 환경설정 저장
async function saveEnvironmentSettings() {
  const newSettings = {
    claudeCli: {
      nvmBin: document.getElementById('settingsNvmBin').value.trim(),
      flags: ['--dangerously-skip-permissions', '--print']
    },
    jira: {
      host: document.getElementById('settingsJiraHost').value.trim(),
      email: document.getElementById('settingsJiraEmail').value.trim(),
      apiToken: document.getElementById('settingsJiraToken').value.trim()
    },
    server: {
      port: parseInt(document.getElementById('settingsPort').value, 10) || 4001
    }
  };
  
  try {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('✅ 환경설정이 저장되었습니다!');
    } else {
      alert(`❌ 저장 실패: ${result.error}`);
    }
  } catch (error) {
    console.error('환경설정 저장 실패:', error);
    alert('❌ 환경설정 저장 실패! 서버 연결을 확인하세요.');
  }
}

// 데이터 초기화
async function resetAllData() {
  if (!confirm('⚠️ 모든 티켓 데이터가 삭제됩니다.\n정말 초기화할까요?')) return;
  if (!confirm('🚨 되돌릴 수 없습니다! 계속할까요?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/reset`, { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      showNotification('🗑️ 데이터가 초기화되었습니다.');
      closeSettingsModal();
      renderTickets([]);
    }
  } catch (error) {
    alert('❌ 초기화 실패!');
  }
}

// Claude CLI 경로 자동 감지
async function detectClaudeCliPath() {
  const resultDiv = document.getElementById('detectResult');
  resultDiv.innerHTML = '<span class="detect-loading">🔍 감지 중...</span>';
  
  try {
    const response = await fetch(`${API_BASE}/settings/detect-claude`);
    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      resultDiv.innerHTML = '<span class="detect-empty">❌ Claude CLI를 찾을 수 없습니다.</span>';
      return;
    }
    
    resultDiv.innerHTML = data.candidates.map((c, i) => `
      <div class="detect-candidate" onclick="selectDetectedPath('${c.nvmBin}')">
        <span class="detect-method">${c.method}</span>
        <span class="detect-path">${c.nvmBin}</span>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('자동 감지 실패:', error);
    resultDiv.innerHTML = '<span class="detect-empty">❌ 감지 실패</span>';
  }
}

function selectDetectedPath(nvmBin) {
  document.getElementById('settingsNvmBin').value = nvmBin;
  document.getElementById('detectResult').innerHTML = `<span class="detect-selected">✅ 선택됨: ${nvmBin}</span>`;
}

async function loadProjectList() {
  try {
    const response = await fetch(`${API_BASE}/projects`);
    const projectsList = await response.json();
    
    const container = document.getElementById('projectList');
    container.innerHTML = projectsList.map(p => `
      <div class="project-item" data-id="${p.id}">
        <div class="project-item-info">
          <div class="project-item-name">📦 ${p.id}</div>
          <div class="project-item-path">${p.path}</div>
        </div>
        <button class="btn btn-delete" onclick="deleteProject('${p.id}')">🗑️ 삭제</button>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('프로젝트 목록 로드 실패:', error);
  }
}

async function addProject() {
  const id = document.getElementById('newProjectId').value.trim();
  const projectPath = document.getElementById('newProjectPath').value.trim();
  
  if (!id || !projectPath) {
    alert('프로젝트 ID와 경로를 모두 입력해주세요!');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id, path: projectPath, description: '' })
    });
    
    if (response.ok) {
      document.getElementById('newProjectId').value = '';
      document.getElementById('newProjectPath').value = '';
      await loadProjectList();
      await loadProjectsToSelects(); // 셀렉트박스 동기화
      showNotification(`✅ 프로젝트 '${id}' 추가됨!`);
    } else {
      const error = await response.json();
      alert(`❌ 오류: ${error.error}`);
    }
  } catch (error) {
    console.error('프로젝트 추가 실패:', error);
    alert('❌ 프로젝트 추가 실패!');
  }
}

async function deleteProject(projectId) {
  if (!confirm(`'${projectId}' 프로젝트를 삭제할까요?`)) return;
  
  try {
    const response = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadProjectList();
      await loadProjectsToSelects(); // 셀렉트박스 동기화
      showNotification(`🗑️ 프로젝트 '${projectId}' 삭제됨`);
    }
  } catch (error) {
    console.error('프로젝트 삭제 실패:', error);
  }
}

// 타입 버튼 선택
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// 폼 제출 (실제 서버에 저장)
document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const projectId = document.getElementById('ticketProject').value;
  const title = document.getElementById('ticketTitle').value;
  const desc = document.getElementById('ticketDesc').value;
  const successCriteria = document.getElementById('ticketSuccessCriteria').value;
  const type = document.querySelector('.type-btn.active').dataset.type;
  const jiraKey = document.getElementById('ticketJiraKey').value;
  const sessionId = document.getElementById('ticketSessionId').value.trim();
  
  if (!projectId) {
    alert('프로젝트를 선택해주세요!');
    return;
  }
  
  if (!title.trim()) {
    alert('제목을 입력해주세요!');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        type,
        title,
        description: desc,
        successCriteria: successCriteria || null,
        priority: 'medium',
        jiraKey: jiraKey || null,
        sessionId: sessionId || null
      })
    });
    
    const newTicket = await response.json();
    console.log('✅ 티켓 생성:', newTicket);
    
    // 전체 티켓 목록에 추가하고 다시 렌더링
    allTickets.unshift(newTicket);
    renderTickets();
    
    closeModal();
    e.target.reset();
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.type-btn[data-type="feature"]').classList.add('active');
    
    showNotification(`✅ 티켓 #${newTicket.id} 생성됨!`);
    
  } catch (error) {
    console.error('티켓 생성 실패:', error);
    alert('❌ 티켓 생성 실패! 서버 연결을 확인하세요.');
  }
});

// UI에 티켓 추가
function addTicketToUI(ticket) {
  const backlogColumn = document.querySelector('[data-status="backlog"] .tickets');
  
  const typeLabels = {
    feature: { emoji: '🆕', class: 'type-feature', text: '신규' },
    bug: { emoji: '🐛', class: 'type-bug', text: '버그' },
    improvement: { emoji: '✏️', class: 'type-improvement', text: '개선' },
    check: { emoji: '🔍', class: 'type-check', text: '확인' }
  };
  
  const priorityLabels = {
    critical: { emoji: '🔥', class: 'priority-critical', text: '긴급' },
    high: { emoji: '🔴', class: 'priority-high', text: '높음' },
    medium: { emoji: '🟡', class: 'priority-medium', text: '중간' },
    low: { emoji: '🟢', class: 'priority-low', text: '낮음' }
  };
  
  const typeInfo = typeLabels[ticket.type] || typeLabels.feature;
  const priorityInfo = priorityLabels[ticket.priority] || priorityLabels.medium;
  
  const ticketHtml = `
    <div class="ticket" data-id="${ticket.id}" data-type="${ticket.type}">
      <div class="ticket-header">
        <span class="ticket-type ${typeInfo.class}">${typeInfo.emoji} ${typeInfo.text}</span>
        <span class="ticket-id">#${ticket.id}</span>
      </div>
      <h3 class="ticket-title">${ticket.title}</h3>
      ${ticket.description ? `<p class="ticket-desc">${ticket.description}</p>` : ''}
      <div class="ticket-meta">
        <span class="priority ${priorityInfo.class}">${priorityInfo.emoji} ${priorityInfo.text}</span>
      </div>
      <div class="ticket-actions">
        <button class="btn btn-start" onclick="startTask('${ticket.id}')">▶️ 작업시작</button>
      </div>
    </div>
  `;
  
  backlogColumn.insertAdjacentHTML('afterbegin', ticketHtml);
  updateCounts();
}

// API 서버 주소
const API_BASE = 'http://localhost:4001/api';

// 작업 시작 (실제 Claude CLI 호출)
async function startTask(ticketId) {
  const ticket = document.querySelector(`[data-id="${ticketId}"]`);
  const title = ticket.querySelector('.ticket-title').textContent;
  const desc = ticket.querySelector('.ticket-desc')?.textContent || '';
  
  // 티켓에서 프로젝트 정보 가져오기
  const projectId = ticket.dataset.project;
  const projectInfo = projects[projectId];
  
  const confirmed = confirm(`🚀 작업을 시작할까요?\n\n티켓: ${title}\n프로젝트: ${projectId}\n경로: ${projectInfo?.path}\n\nClaude가 실제로 작업을 시작합니다!`);
  
  if (!confirmed) return;
  
  try {
    // 서버에 작업 시작 요청
    const response = await fetch(`${API_BASE}/tasks/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId: String(ticketId).padStart(3, '0'),
        projectId: projectId,
        title,
        description: desc
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      alert(`❌ 오류: ${result.error}`);
      return;
    }
    
    console.log('✅ 작업 시작:', result);
    
    // UI 업데이트 - 진행중으로 이동
    const inProgressColumn = document.querySelector('[data-status="in-progress"] .tickets');
    
    ticket.classList.add('working');
    ticket.dataset.realTicketId = result.ticketId;
    ticket.querySelector('.ticket-actions').innerHTML = `
      <button class="btn btn-pause" onclick="stopTask('${result.ticketId}')">⏹️ 중지</button>
      <button class="btn btn-log" onclick="viewLog('${result.ticketId}')">📝 로그</button>
    `;
    
    // 프로그레스 바 추가
    const progressHtml = `
      <div class="ticket-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
        <span class="progress-text">🤖 Claude 작업중...</span>
      </div>
    `;
    ticket.querySelector('.ticket-meta').insertAdjacentHTML('afterend', progressHtml);
    
    inProgressColumn.appendChild(ticket);
    updateCounts();
    
    // 실시간 로그 폴링 시작
    pollTaskStatus(result.ticketId, ticket);
    
  } catch (error) {
    console.error('작업 시작 실패:', error);
    alert(`❌ 서버 연결 실패!\n\n서버가 실행 중인지 확인하세요:\nnode server.js`);
  }
}

// 작업 상태 폴링
async function pollTaskStatus(ticketId, ticketElement) {
  const checkStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/tasks/${ticketId}/log`);
      const data = await response.json();
      
      if (!data.isRunning) {
        // 작업 완료 - 리뷰대기로 이동
        clearInterval(pollInterval);
        moveToReviewReal(ticketId, ticketElement);
        return;
      }
      
      // 진행 상태 업데이트
      const progressText = ticketElement.querySelector('.progress-text');
      if (progressText) {
        progressText.textContent = `🤖 Claude 작업중... (${data.runTime}초)`;
      }
      
    } catch (error) {
      console.error('상태 확인 실패:', error);
    }
  };
  
  const pollInterval = setInterval(checkStatus, 2000);
  checkStatus(); // 즉시 한번 실행
}

// 리뷰대기로 이동 (실제)
function moveToReviewReal(ticketId, ticketElement) {
  const reviewColumn = document.querySelector('[data-status="review"] .tickets');
  
  ticketElement.classList.remove('working');
  ticketElement.classList.add('review');
  
  // 프로그레스 바 제거
  const progress = ticketElement.querySelector('.ticket-progress');
  if (progress) progress.remove();
  
  // 버튼 변경 (확인 타입은 완료/재요청)
  const isCheckType = ticketElement.dataset.type === 'check';
  ticketElement.querySelector('.ticket-actions').innerHTML = isCheckType ? `
    <button class="btn btn-approve btn-icon-only" onclick="completeTask('${ticketId}')" title="완료">✅</button>
    <button class="btn btn-reject btn-icon-only" onclick="rejectTask('${ticketId}')" title="재요청">🔄</button>
    <button class="btn btn-icon-only" onclick="viewChanges('${ticketId}')" title="변경파일">📂</button>
    <button class="btn btn-icon-only" onclick="viewLog('${ticketId}')" title="로그">📝</button>
  ` : `
    <button class="btn btn-approve btn-icon-only" onclick="approveTask('${ticketId}')" title="승인">✅</button>
    <button class="btn btn-reject btn-icon-only" onclick="rejectTask('${ticketId}')" title="재요청">🔄</button>
    <button class="btn btn-icon-only" onclick="viewChanges('${ticketId}')" title="변경파일">📂</button>
    <button class="btn btn-icon-only" onclick="viewLog('${ticketId}')" title="로그">📝</button>
  `;
  
  reviewColumn.appendChild(ticketElement);
  updateCounts();
  
  showNotification('🎉 Claude 작업 완료! 리뷰해주세요.');
}

// 작업 중지
async function stopTask(ticketId) {
  if (!confirm('⏹️ 작업을 중지할까요?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/tasks/${ticketId}/stop`, {
      method: 'POST'
    });
    
    const result = await response.json();
    console.log('작업 중지:', result);
    
    // UI 업데이트 - 재시작 버튼 표시
    const ticket = document.querySelector(`[data-id="${ticketId}"]`);
    if (ticket) {
      ticket.classList.remove('working');
      ticket.classList.add('stopped');
      
      // 프로그레스 바 제거
      const progress = ticket.querySelector('.ticket-progress');
      if (progress) progress.remove();
      
      // 버튼 변경
      ticket.querySelector('.ticket-actions').innerHTML = `
        <button class="btn btn-pause" onclick="restartTask('${ticketId}')">▶️ 재시작</button>
        <button class="btn btn-log" onclick="viewLog('${ticketId}')">📝 로그</button>
      `;
    }
    
    showNotification('⏹️ 작업이 중지되었습니다.');
    
  } catch (error) {
    console.error('작업 중지 실패:', error);
  }
}

// 작업 재시작
async function restartTask(ticketId) {
  // 티켓 정보 가져오기
  const ticket = document.querySelector(`[data-id="${ticketId}"]`);
  const title = ticket.querySelector('.ticket-title').textContent;
  const desc = ticket.querySelector('.ticket-desc')?.textContent || '';
  const projectId = ticket.dataset.project;
  
  if (!confirm(`▶️ 작업을 재시작할까요?\n\n티켓: ${title}`)) return;
  
  try {
    const response = await fetch(`${API_BASE}/tasks/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId,
        projectId,
        title,
        description: desc
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      alert(`❌ 오류: ${result.error}`);
      return;
    }
    
    // UI 업데이트
    ticket.classList.remove('stopped');
    ticket.classList.add('working');
    
    ticket.querySelector('.ticket-actions').innerHTML = `
      <button class="btn btn-pause" onclick="stopTask('${ticketId}')">⏹️ 중지</button>
      <button class="btn btn-log" onclick="viewLog('${ticketId}')">📝 로그</button>
    `;
    
    // 프로그레스 바 추가
    const meta = ticket.querySelector('.ticket-meta');
    meta.insertAdjacentHTML('afterend', `
      <div class="ticket-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
        <span class="progress-text">🤖 Claude 작업중...</span>
      </div>
    `);
    
    showNotification('▶️ 작업이 재시작되었습니다!');
    
    // 상태 폴링 시작
    pollTaskStatus(ticketId, ticket);
    
  } catch (error) {
    console.error('재시작 실패:', error);
    alert('❌ 재시작 실패!');
  }
}

// 로그 보기 (사이드 패널에 표시 - 위에서 정의됨)

// 📂 변경 파일 보기
async function viewChanges(ticketId) {
  const sidePanel = document.getElementById('logSidePanel');
  const logOutput = document.getElementById('logSideOutput');
  const logTitle = document.getElementById('logSideTitle');

  sidePanel.classList.add('active');
  logTitle.textContent = `📂 변경 파일 - #${ticketId}`;
  logOutput.innerHTML = '<span class="log-info">변경 파일 확인 중...</span>';

  try {
    const response = await fetch(`${API_BASE}/tasks/${ticketId}/changes`);
    const data = await response.json();

    if (!data.hasChanges) {
      logOutput.innerHTML = '<span class="log-info">📭 변경된 파일이 없습니다.</span>';
      return;
    }

    // 파일 목록
    const statusEmoji = { modified: '✏️', added: '🆕', deleted: '🗑️', untracked: '❓', renamed: '🔄' };
    const fileList = data.files.map(f =>
      `<span class="log-${f.status === 'deleted' ? 'error' : f.status === 'added' ? 'success' : 'claude'}">${statusEmoji[f.status] || '📄'} ${f.status.padEnd(10)} ${f.path}</span>`
    ).join('\n');

    // diff 요약
    let diffHtml = '';
    if (data.diff) {
      diffHtml = '\n\n' + data.diff
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .split('\n')
        .map(line => {
          if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="log-success">${line}</span>`;
          if (line.startsWith('-') && !line.startsWith('---')) return `<span class="log-error">${line}</span>`;
          if (line.startsWith('@@')) return `<span class="log-info">${line}</span>`;
          if (line.startsWith('diff ')) return `\n<span class="log-warning"><strong>${line}</strong></span>`;
          return line;
        })
        .join('\n');
    }

    logOutput.innerHTML = `<strong>📂 변경된 파일 (${data.files.length}개)</strong>\n${'─'.repeat(40)}\n${fileList}\n\n<strong>📊 요약</strong>\n${'─'.repeat(40)}\n${data.summary}${diffHtml}`;

  } catch (error) {
    console.error('변경 파일 조회 실패:', error);
    logOutput.innerHTML = '<span class="log-error">변경 파일을 불러올 수 없습니다.</span>';
  }
}

// 로그 포맷팅
function formatLog(log) {
  if (!log) return '<span class="log-info">로그가 없습니다.</span>';
  
  return log
    .replace(/\[ERROR\]/g, '<span class="log-error">[ERROR]</span>')
    .replace(/✅/g, '<span class="log-success">✅</span>')
    .replace(/🚀/g, '<span class="log-info">🚀</span>')
    .replace(/🤖/g, '<span class="log-claude">🤖</span>')
    .replace(/⚠️/g, '<span class="log-warning">⚠️</span>')
    .replace(/📂/g, '<span class="log-info">📂</span>');
}

// 프로그레스 시뮬레이션
function simulateProgress(ticketId) {
  const ticket = document.querySelector(`[data-id="${ticketId}"]`);
  const progressFill = ticket.querySelector('.progress-fill');
  const progressText = ticket.querySelector('.progress-text');
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 100) progress = 100;
    
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `Claude 작업중... ${Math.round(progress)}%`;
    
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => moveToReview(ticketId), 1000);
    }
  }, 2000);
}

// 리뷰대기로 이동
function moveToReview(ticketId) {
  const ticket = document.querySelector(`[data-id="${ticketId}"]`);
  const reviewColumn = document.querySelector('[data-status="review"] .tickets');
  
  ticket.classList.remove('working');
  ticket.classList.add('review');
  
  // 프로그레스 바 제거
  const progress = ticket.querySelector('.ticket-progress');
  if (progress) progress.remove();
  
  // PR 링크 추가
  const meta = ticket.querySelector('.ticket-meta');
  meta.innerHTML += '<a href="#" class="pr-link">🔗 PR #' + (128 + Math.floor(Math.random() * 10)) + '</a>';
  
  // 버튼 변경 (확인 타입은 완료/재요청)
  const isCheckType2 = ticket.dataset.type === 'check';
  ticket.querySelector('.ticket-actions').innerHTML = isCheckType2 ? `
    <button class="btn btn-approve" onclick="completeTask(${ticketId})">✅ 완료</button>
    <button class="btn btn-reject" onclick="rejectTask(${ticketId})">🔄 재요청</button>
  ` : `
    <button class="btn btn-approve" onclick="approveTask(${ticketId})">✅ 승인</button>
    <button class="btn btn-reject" onclick="rejectTask(${ticketId})">🔄 재요청</button>
  `;
  
  reviewColumn.appendChild(ticket);
  updateCounts();
  
  // 알림
  showNotification('🎉 작업 완료! PR이 생성되었습니다.');
}

// ✅ 완료 (확인 타입) - 커밋 없이 바로 완료로 이동
async function completeTask(ticketId) {
  if (!confirm('✅ 확인 완료 처리할까요?')) return;
  
  const ticket = document.querySelector(`[data-id="${ticketId}"]`);
  if (!ticket) return;
  
  // 서버에도 완료 알림 (에러 무시)
  try {
    await fetch(`${API_BASE}/tasks/${ticketId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {}
  
  // 바로 완료로 이동
  moveToDone(ticketId, ticket);
  showNotification('✅ 확인 완료!');
}

// 작업 일시정지
function pauseTask(ticketId) {
  alert('⏸️ 작업이 일시정지되었습니다.\n\n다시 시작하려면 ▶️ 버튼을 클릭하세요.');
}

// ✅ 승인 - Claude에게 커밋/푸시 요청
async function approveTask(ticketId) {
  if (!confirm('✅ 승인하고 커밋/푸시를 진행할까요?')) return;
  
  const ticket = document.querySelector(`[data-id="${ticketId}"]`);
  
  try {
    const response = await fetch(`${API_BASE}/tasks/${ticketId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      alert(`❌ 오류: ${result.error}`);
      return;
    }

    // 변경사항 없으면 바로 완료
    if (result.skippedCommit) {
      moveToDone(ticketId, ticket);
      showNotification('✅ 변경사항 없이 완료 처리됨');
      return;
    }
    
    // 진행중 컬럼으로 이동 (Claude가 커밋 중)
    const inProgressColumn = document.querySelector('[data-status="in-progress"] .tickets');
    
    ticket.classList.remove('review');
    ticket.classList.add('working');
    
    ticket.querySelector('.ticket-actions').innerHTML = `
      <button class="btn btn-log" onclick="viewLog('${ticketId}')">📝 로그</button>
    `;
    
    // 프로그레스 바 추가
    const meta = ticket.querySelector('.ticket-meta');
    meta.insertAdjacentHTML('afterend', `
      <div class="ticket-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 80%"></div>
        </div>
        <span class="progress-text">🤖 커밋/푸시 중...</span>
      </div>
    `);
    
    inProgressColumn.appendChild(ticket);
    updateCounts();
    
    showNotification('✅ Claude가 커밋/푸시를 진행합니다.');
    
    // 완료 폴링
    pollApproveStatus(ticketId, ticket);
    
  } catch (error) {
    console.error('승인 실패:', error);
    alert('❌ 승인 처리 실패! 서버 연결을 확인하세요.');
  }
}

// 승인 완료 폴링
function pollApproveStatus(ticketId, ticketElement) {
  const checkStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/tasks/${ticketId}/log`);
      const data = await response.json();
      
      if (!data.isRunning) {
        // 완료 - done으로 이동
        clearInterval(pollInterval);
        moveToDone(ticketId, ticketElement);
        return;
      }
    } catch (error) {
      console.error('상태 확인 실패:', error);
    }
  };
  
  const pollInterval = setInterval(checkStatus, 2000);
  checkStatus();
}

// 완료로 이동
function moveToDone(ticketId, ticketElement) {
  const doneColumn = document.querySelector('[data-status="done"] .tickets');
  
  ticketElement.classList.remove('working');
  ticketElement.classList.add('done');
  
  // 프로그레스 바 제거
  const progress = ticketElement.querySelector('.ticket-progress');
  if (progress) progress.remove();
  
  // 버튼 제거
  const actions = ticketElement.querySelector('.ticket-actions');
  if (actions) actions.remove();
  
  const meta = ticketElement.querySelector('.ticket-meta');
  meta.innerHTML = `<span class="completed-date">완료: ${new Date().toISOString().split('T')[0]}</span><span class="log-icon" onclick="viewLog('${ticketId}')" title="로그 보기">📝</span>`;
  
  const desc = ticketElement.querySelector('.ticket-desc');
  if (desc) desc.remove();
  
  doneColumn.insertBefore(ticketElement, doneColumn.firstChild);
  updateCounts();
  
  showNotification('🎉 커밋/푸시 완료!');
}

// 🔄 재요청 - 추가 요청사항 입력 후 재작업
async function rejectTask(ticketId) {
  // 재요청 모달 열기
  openReworkModal(ticketId);
}

function openReworkModal(ticketId) {
  // 동적으로 모달 생성
  let modal = document.getElementById('reworkModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'reworkModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>🔄 재요청</h2>
          <button class="close-btn" onclick="closeReworkModal()">&times;</button>
        </div>
        <form id="reworkForm">
          <div class="form-group">
            <label for="reworkRequest">수정 요청사항</label>
            <textarea id="reworkRequest" rows="6" placeholder="어떤 부분을 수정해야 하는지 자세히 작성해주세요.&#10;&#10;예:&#10;- 버튼 색상을 파란색으로 변경&#10;- 에러 처리 추가&#10;- 함수명 변경"></textarea>
          </div>
          <input type="hidden" id="reworkTicketId" value="">
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeReworkModal()">취소</button>
            <button type="submit" class="btn btn-primary">🔄 재요청</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    
    // 폼 제출 이벤트
    document.getElementById('reworkForm').addEventListener('submit', handleReworkSubmit);
  }
  
  document.getElementById('reworkTicketId').value = ticketId;
  document.getElementById('reworkRequest').value = '';
  modal.classList.add('active');
}

function closeReworkModal() {
  const modal = document.getElementById('reworkModal');
  if (modal) modal.classList.remove('active');
}

async function handleReworkSubmit(e) {
  e.preventDefault();
  
  const ticketId = document.getElementById('reworkTicketId').value;
  const additionalRequest = document.getElementById('reworkRequest').value;
  
  if (!additionalRequest.trim()) {
    alert('수정 요청사항을 입력해주세요!');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/tasks/${ticketId}/rework`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additionalRequest })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      alert(`❌ 오류: ${result.error}`);
      return;
    }
    
    closeReworkModal();
    
    // UI 업데이트 - 진행중으로 이동
    const ticket = document.querySelector(`[data-id="${ticketId}"]`);
    const inProgressColumn = document.querySelector('[data-status="in-progress"] .tickets');
    
    ticket.classList.remove('review');
    ticket.classList.add('working');
    
    ticket.querySelector('.ticket-actions').innerHTML = `
      <button class="btn btn-pause" onclick="stopTask('${ticketId}')">⏹️ 중지</button>
      <button class="btn btn-log" onclick="viewLog('${ticketId}')">📝 로그</button>
    `;
    
    // 재요청 횟수 표시
    let badge = ticket.querySelector('.rework-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'rework-badge';
      ticket.querySelector('.ticket-header').appendChild(badge);
    }
    badge.textContent = `🔄 ${result.reworkCount}`;
    
    inProgressColumn.appendChild(ticket);
    updateCounts();
    
    showNotification(`🔄 재작업 시작! (${result.reworkCount}번째)`);
    
    // 상태 폴링 시작
    pollTaskStatus(ticketId, ticket);
    
  } catch (error) {
    console.error('재요청 실패:', error);
    alert('❌ 재요청 실패! 서버 연결을 확인하세요.');
  }
}

// 카운트 업데이트
function updateCounts() {
  document.querySelectorAll('.column').forEach(column => {
    const count = column.querySelectorAll('.ticket').length;
    column.querySelector('.count').textContent = count;
  });
}

// 알림 표시
function showNotification(message) {
  // 간단한 알림 (추후 toast로 개선)
  console.log(message);
}

// 프로젝트 변경
document.getElementById('projectSelect').addEventListener('change', (e) => {
  currentProject = e.target.value;
  console.log('프로젝트 변경:', currentProject);
  // 실제 구현에서는 해당 프로젝트의 티켓을 로드
});

// ESC 키로 모달 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeLogModal();
    closeReworkModal();
    closeSettingsModal();
  }
  // Ctrl+N → 새 티켓
  if ((e.key === 'n' || e.key === 'N' || e.key === 'ㅜ') && e.ctrlKey) {
    e.preventDefault();
    openNewTicket();
    return;
  }
  // Cmd+Enter (Mac) / Ctrl+Enter → 모달 제출
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    // 새 티켓 모달
    const newTicketModal = document.getElementById('newTicketModal');
    if (newTicketModal.classList.contains('active')) {
      e.preventDefault();
      document.getElementById('newTicketForm').dispatchEvent(new Event('submit', { cancelable: true }));
      return;
    }
    // 재요청 모달
    const reworkForm = document.getElementById('reworkForm');
    if (reworkForm) {
      e.preventDefault();
      reworkForm.dispatchEvent(new Event('submit', { cancelable: true }));
      return;
    }
  }
});

// 모달 외부 클릭시 닫기
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
});

// 페이지 로드시 티켓 불러오기
async function loadTicketsFromServer() {
  try {
    const response = await fetch(`${API_BASE}/tickets`);
    allTickets = await response.json();
    
    // 최신순 정렬 (updatedAt 또는 createdAt 기준)
    allTickets.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return dateB - dateA; // 최신이 위로
    });
    
    renderTickets();
    console.log(`✅ ${allTickets.length}개 티켓 로드 완료 (최신순)`);
    
  } catch (error) {
    console.error('티켓 로드 실패:', error);
  }
}

// 티켓 렌더링 (필터 적용)
function renderTickets() {
  // 기존 티켓들 제거
  document.querySelectorAll('.tickets').forEach(col => col.innerHTML = '');
  
  // 필터 적용
  let filteredTickets = allTickets;
  if (currentProjectFilter !== 'all') {
    filteredTickets = allTickets.filter(t => t.projectId === currentProjectFilter);
  }
  
  // 티켓들을 상태별로 분류해서 추가
  filteredTickets.forEach(ticket => {
    const column = document.querySelector(`[data-status="${getColumnStatus(ticket.status)}"] .tickets`);
    if (column) {
      column.insertAdjacentHTML('beforeend', createTicketHtml(ticket));
    }
  });
  
  updateCounts();
}

// 프로젝트 필터 변경
function filterByProject() {
  currentProjectFilter = document.getElementById('projectSelect').value;
  renderTickets();
  console.log(`🔍 필터: ${currentProjectFilter}`);
}

// 상태 매핑
function getColumnStatus(status) {
  const statusMap = {
    'backlog': 'backlog',
    'in-progress': 'in-progress',
    'review': 'review',
    'done': 'done'
  };
  return statusMap[status] || 'backlog';
}

// 티켓 HTML 생성
function createTicketHtml(ticket) {
  const typeLabels = {
    feature: { emoji: '🆕', class: 'type-feature', text: '신규' },
    bug: { emoji: '🐛', class: 'type-bug', text: '버그' },
    improvement: { emoji: '✏️', class: 'type-improvement', text: '개선' },
    check: { emoji: '🔍', class: 'type-check', text: '확인' }
  };
  
  const priorityLabels = {
    critical: { emoji: '🔥', class: 'priority-critical', text: '긴급' },
    high: { emoji: '🔴', class: 'priority-high', text: '높음' },
    medium: { emoji: '🟡', class: 'priority-medium', text: '중간' },
    low: { emoji: '🟢', class: 'priority-low', text: '낮음' }
  };
  
  const typeInfo = typeLabels[ticket.type] || typeLabels.feature;
  const priorityInfo = priorityLabels[ticket.priority] || priorityLabels.medium;
  
  let actionsHtml = '';
  let extraClass = '';
  
  if (ticket.status === 'backlog') {
    actionsHtml = `
      <button class="btn btn-start" onclick="startTask('${ticket.id}')">▶️ 작업시작</button>
      <button class="btn btn-delete-small" onclick="deleteTicket('${ticket.id}')" title="삭제">🗑️</button>
    `;
  } else if (ticket.status === 'in-progress') {
    if (ticket.stopped) {
      extraClass = 'stopped';
      actionsHtml = `
        <button class="btn btn-pause" onclick="restartTask('${ticket.id}')">▶️ 재시작</button>
        <button class="btn btn-log" onclick="viewLog('${ticket.id}')">📝 로그</button>
        <button class="btn btn-delete-small" onclick="deleteTicket('${ticket.id}')" title="삭제">🗑️</button>
      `;
    } else {
      extraClass = 'working';
      actionsHtml = `
        <button class="btn btn-pause" onclick="stopTask('${ticket.id}')">⏹️ 중지</button>
        <button class="btn btn-log" onclick="viewLog('${ticket.id}')">📝 로그</button>
        <button class="btn btn-delete-small" onclick="deleteTicket('${ticket.id}')" title="삭제">🗑️</button>
      `;
    }
  } else if (ticket.status === 'review') {
    extraClass = 'review';
    const isCheck = ticket.type === 'check';
    actionsHtml = isCheck ? `
      <button class="btn btn-approve btn-icon-only" onclick="completeTask('${ticket.id}')" title="완료">✅</button>
      <button class="btn btn-reject btn-icon-only" onclick="rejectTask('${ticket.id}')" title="재요청">🔄</button>
      <button class="btn btn-icon-only" onclick="viewChanges('${ticket.id}')" title="변경파일">📂</button>
      <button class="btn btn-icon-only" onclick="viewLog('${ticket.id}')" title="로그">📝</button>
      <button class="btn btn-icon-only" onclick="deleteTicket('${ticket.id}')" title="삭제">🗑️</button>
    ` : `
      <button class="btn btn-approve btn-icon-only" onclick="approveTask('${ticket.id}')" title="승인">✅</button>
      <button class="btn btn-reject btn-icon-only" onclick="rejectTask('${ticket.id}')" title="재요청">🔄</button>
      <button class="btn btn-icon-only" onclick="viewChanges('${ticket.id}')" title="변경파일">📂</button>
      <button class="btn btn-icon-only" onclick="viewLog('${ticket.id}')" title="로그">📝</button>
      <button class="btn btn-icon-only" onclick="deleteTicket('${ticket.id}')" title="삭제">🗑️</button>
    `;
  } else if (ticket.status === 'done') {
    extraClass = 'done';
  }
  
  // 프로젝트명 짧게 표시
  const shortProject = ticket.projectId ? ticket.projectId.replace('-homepage', '').replace('ec-oms-', '') : '';
  
  return `
    <div class="ticket ${extraClass}" data-id="${ticket.id}" data-type="${ticket.type}" data-project="${ticket.projectId}">
      <div class="ticket-header">
        <span class="ticket-type ${typeInfo.class}">${typeInfo.emoji} ${typeInfo.text}</span>
        <span class="ticket-id">#${ticket.id}</span>
        ${shortProject ? `<span class="ticket-project">📦 ${shortProject}</span>` : ''}
      </div>
      <h3 class="ticket-title">${ticket.title}</h3>
      ${ticket.description ? `<p class="ticket-desc">${ticket.description}</p>` : ''}
      <div class="ticket-meta">
        ${ticket.status === 'done' && ticket.completedAt ? `<span class="completed-date">완료: ${ticket.completedAt.split('T')[0]}</span><span class="log-icon" onclick="viewLog('${ticket.id}')" title="로그 보기">📝</span><span class="log-icon" onclick="deleteTicket('${ticket.id}')" title="삭제">🗑️</span>` : ''}
      </div>
      ${actionsHtml ? `<div class="ticket-actions">${actionsHtml}</div>` : ''}
    </div>
  `;
}

// 페이지 로드시 실행
loadProjectsToSelects();
loadTicketsFromServer();

console.log('🦊 Claude Kanban 초기화 완료!');

// ========== Jira 연동 ==========

let jiraIssues = [];

function openJiraModal() {
  document.getElementById('jiraModal').classList.add('active');
  loadJiraIssues();
}

function closeJiraModal() {
  document.getElementById('jiraModal').classList.remove('active');
}

async function loadJiraIssues() {
  const list = document.getElementById('jiraIssueList');
  const status = document.getElementById('jiraStatus');
  
  list.innerHTML = '<div class="jira-loading">🔄 Jira 이슈 불러오는 중...</div>';
  
  try {
    // 연결 테스트
    const testRes = await fetch(`${API_BASE}/jira/test`);
    const testData = await testRes.json();
    
    if (!testData.connected) {
      status.textContent = '❌ Jira 연결 실패';
      list.innerHTML = '<div class="jira-empty">Jira 연결을 확인해주세요.</div>';
      return;
    }
    
    status.textContent = `✅ ${testData.user}`;
    status.classList.add('connected');
    
    // 이슈 목록 가져오기
    const res = await fetch(`${API_BASE}/jira/issues`);
    jiraIssues = await res.json();
    
    if (jiraIssues.length === 0) {
      list.innerHTML = '<div class="jira-empty">📭 미완료 이슈가 없습니다.</div>';
      return;
    }
    
    // 이미 가져온 이슈 체크
    const existingKeys = allTickets.filter(t => t.jiraKey).map(t => t.jiraKey);
    
    list.innerHTML = jiraIssues.map(issue => {
      const isImported = existingKeys.includes(issue.key);
      return `
        <label class="jira-issue ${isImported ? 'imported' : ''}" data-key="${issue.key}">
          <input type="checkbox" 
            name="jira-issue"
            value="${issue.key}"
            ${isImported ? 'disabled checked' : ''}>
          <div class="jira-issue-info">
            <div class="jira-issue-header">
              <span class="jira-issue-key">${issue.key}</span>
              <span class="jira-issue-type">${issue.type}</span>
              <span class="jira-issue-project">${issue.project}</span>
            </div>
            <div class="jira-issue-summary">${issue.summary}</div>
            <div class="jira-issue-meta">
              <span>📊 ${issue.status}</span>
              <span>🎯 ${issue.priority}</span>
              ${isImported ? '<span>✅ 이미 가져옴</span>' : ''}
            </div>
          </div>
        </label>
      `;
    }).join('');
    
    // 체크박스 변경 이벤트
    list.querySelectorAll('input[name="jira-issue"]').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('.jira-issue').classList.toggle('selected', cb.checked);
      });
    });
    
  } catch (error) {
    console.error('Jira 로드 실패:', error);
    status.textContent = '❌ 오류 발생';
    list.innerHTML = '<div class="jira-empty">Jira 연결에 실패했습니다.</div>';
  }
}

function toggleJiraIssue(key, fromCheckbox = false) {
  const checkbox = document.getElementById(`jira-${key}`);
  const issueEl = document.querySelector(`.jira-issue[data-key="${key}"]`);
  
  if (!checkbox || checkbox.disabled) return;
  
  // 체크박스 직접 클릭이 아니면 체크 상태 변경
  if (!fromCheckbox) {
    checkbox.checked = !checkbox.checked;
  }
  issueEl.classList.toggle('selected', checkbox.checked);
}

async function importSelectedIssues() {
  const checkboxes = document.querySelectorAll('input[name="jira-issue"]:checked:not(:disabled)');
  const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
  const selected = jiraIssues.filter(issue => selectedKeys.includes(issue.key));
  
  if (selected.length === 0) {
    alert('가져올 이슈를 선택해주세요!');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/jira/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues: selected })
    });
    
    const result = await res.json();
    
    if (result.success) {
      showNotification(`✅ ${result.imported}개 이슈를 가져왔습니다!`);
      closeJiraModal();
      
      // 티켓 목록 새로고침
      await loadTicketsFromServer();
    }
    
  } catch (error) {
    console.error('가져오기 실패:', error);
    alert('이슈 가져오기에 실패했습니다.');
  }
}

function refreshJiraIssues() {
  loadJiraIssues();
}

// 티켓 삭제
async function deleteTicket(ticketId) {
  if (!confirm('🗑️ 이 티켓을 삭제할까요?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      // UI에서 제거
      const ticket = document.querySelector(`[data-id="${ticketId}"]`);
      if (ticket) ticket.remove();
      
      // 전체 목록에서도 제거
      allTickets = allTickets.filter(t => t.id !== ticketId);
      updateCounts();
      
      showNotification('🗑️ 티켓이 삭제되었습니다.');
    }
  } catch (error) {
    console.error('삭제 실패:', error);
    alert('❌ 삭제 실패!');
  }
}

// Jira 이슈 연결 모달 (티켓 생성용)
let selectedJiraForLink = null;

function openJiraLinkModal() {
  // 기존 Jira 모달 재활용
  document.getElementById('jiraModal').classList.add('active');
  document.getElementById('jiraModal').dataset.mode = 'link';
  loadJiraIssuesForLink();
}

async function loadJiraIssuesForLink() {
  const list = document.getElementById('jiraIssueList');
  const status = document.getElementById('jiraStatus');
  
  list.innerHTML = '<div class="jira-loading">🔄 Jira 이슈 불러오는 중...</div>';
  
  try {
    const testRes = await fetch(`${API_BASE}/jira/test`);
    const testData = await testRes.json();
    
    if (!testData.connected) {
      status.textContent = '❌ Jira 연결 실패';
      list.innerHTML = '<div class="jira-empty">Jira 연결을 확인해주세요.</div>';
      return;
    }
    
    status.textContent = `✅ ${testData.user}`;
    status.classList.add('connected');
    
    const res = await fetch(`${API_BASE}/jira/issues`);
    jiraIssues = await res.json();
    
    if (jiraIssues.length === 0) {
      list.innerHTML = '<div class="jira-empty">📭 미완료 이슈가 없습니다.</div>';
      return;
    }
    
    // 라디오 버튼으로 단일 선택
    list.innerHTML = jiraIssues.map(issue => `
      <label class="jira-issue" data-key="${issue.key}">
        <input type="radio" name="jira-link" value="${issue.key}">
        <div class="jira-issue-info">
          <div class="jira-issue-header">
            <span class="jira-issue-key">${issue.key}</span>
            <span class="jira-issue-type">${issue.type}</span>
            <span class="jira-issue-project">${issue.project}</span>
          </div>
          <div class="jira-issue-summary">${issue.summary}</div>
          <div class="jira-issue-meta">
            <span>📊 ${issue.status}</span>
            <span>🎯 ${issue.priority}</span>
          </div>
        </div>
      </label>
    `).join('');
    
    list.querySelectorAll('input[name="jira-link"]').forEach(rb => {
      rb.addEventListener('change', () => {
        list.querySelectorAll('.jira-issue').forEach(el => el.classList.remove('selected'));
        rb.closest('.jira-issue').classList.add('selected');
      });
    });
    
  } catch (error) {
    console.error('Jira 로드 실패:', error);
    list.innerHTML = '<div class="jira-empty">Jira 연결에 실패했습니다.</div>';
  }
}

// 선택 항목 가져오기 버튼 동작 수정
const originalImport = importSelectedIssues;
async function importSelectedIssues() {
  const modal = document.getElementById('jiraModal');
  
  if (modal.dataset.mode === 'link') {
    // 티켓 생성에서 연결하기
    const selected = document.querySelector('input[name="jira-link"]:checked');
    if (!selected) {
      alert('연결할 이슈를 선택해주세요!');
      return;
    }
    
    const issue = jiraIssues.find(i => i.key === selected.value);
    document.getElementById('ticketJiraKey').value = issue.key;
    document.getElementById('ticketTitle').value = issue.summary;
    document.getElementById('ticketDesc').value = issue.description || '';
    
    selectedJiraForLink = issue;
    modal.dataset.mode = '';
    closeJiraModal();
  } else {
    // 기존: 백로그로 가져오기
    const checkboxes = document.querySelectorAll('input[name="jira-issue"]:checked:not(:disabled)');
    const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
    const selected = jiraIssues.filter(issue => selectedKeys.includes(issue.key));
    
    if (selected.length === 0) {
      alert('가져올 이슈를 선택해주세요!');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/jira/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues: selected })
      });
      
      const result = await res.json();
      
      if (result.success) {
        showNotification(`✅ ${result.imported}개 이슈를 가져왔습니다!`);
        closeJiraModal();
        await loadTicketsFromServer();
      }
    } catch (error) {
      console.error('가져오기 실패:', error);
      alert('이슈 가져오기에 실패했습니다.');
    }
  }
}

// ========== 폴더 탐색기 ==========

let currentBrowsePath = '';

// ========== 세션 선택 ==========

async function openSessionPicker() {
  const projectId = document.getElementById('ticketProject').value;
  if (!projectId) {
    alert('프로젝트를 먼저 선택해주세요!');
    return;
  }

  const modal = document.getElementById('sessionPickerModal');
  const content = document.getElementById('sessionPickerContent');
  modal.classList.add('active');
  content.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary)">🔄 세션 불러오는 중...</div>';

  try {
    const response = await fetch(`${API_BASE}/sessions/${projectId}`);
    const sessions = await response.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      content.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary)">📭 이 프로젝트의 세션이 없습니다.</div>';
      return;
    }

    const projectName = projects[projectId]?.name || projectId;
    content.innerHTML = `<div class="session-picker-project">📦 ${projectName}</div>` +
      sessions.map(s => {
        const date = new Date(s.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const shortId = s.sessionId.slice(0, 8);
        return `
          <div class="session-picker-item" onclick="selectSession('${s.sessionId}')">
            <div class="session-picker-title">${s.firstMessage || '(내용 없음)'}</div>
            ${s.summary ? `<div class="session-picker-summary">${s.summary}</div>` : ''}
            <div class="session-picker-meta">
              <span class="session-picker-id">${shortId}...</span>
              <span class="session-picker-date">${date}</span>
            </div>
          </div>
        `;
      }).join('');

  } catch (error) {
    console.error('세션 로드 실패:', error);
    content.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary)">❌ 세션 불러오기 실패</div>';
  }
}

function selectSession(sessionId) {
  document.getElementById('ticketSessionId').value = sessionId;
  closeSessionPicker();
}

function closeSessionPicker() {
  document.getElementById('sessionPickerModal').classList.remove('active');
}

// ========== 폴더 탐색 ==========

async function openFolderBrowser() {
  document.getElementById('folderBrowserModal').classList.add('active');

  const inputPath = document.getElementById('newProjectPath').value.trim();
  await browseTo(inputPath || '');
}

function closeFolderBrowser() {
  document.getElementById('folderBrowserModal').classList.remove('active');
}

async function browseTo(targetPath) {
  const list = document.getElementById('folderBrowserList');
  const pathDisplay = document.getElementById('folderBrowserPath');

  list.innerHTML = '<div class="folder-browser-loading">📂 불러오는 중...</div>';

  try {
    const url = targetPath
      ? `${API_BASE}/browse?path=${encodeURIComponent(targetPath)}`
      : `${API_BASE}/browse`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      list.innerHTML = `<div class="folder-browser-empty">❌ ${data.error}</div>`;
      return;
    }

    currentBrowsePath = data.current;
    pathDisplay.textContent = data.current;

    if (data.folders.length === 0) {
      list.innerHTML = '<div class="folder-browser-empty">📭 하위 폴더가 없습니다.</div>';
      return;
    }

    list.innerHTML = data.folders.map(folder => `
      <div class="folder-browser-item" onclick="browseTo('${(data.current + '/' + folder).replace(/'/g, "\\'")}')">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${folder}</span>
      </div>
    `).join('');

  } catch (error) {
    console.error('폴더 탐색 실패:', error);
    list.innerHTML = '<div class="folder-browser-empty">❌ 서버 연결 실패</div>';
  }
}

function browseParent() {
  if (!currentBrowsePath || currentBrowsePath === '/') return;
  const parent = currentBrowsePath.split('/').slice(0, -1).join('/') || '/';
  browseTo(parent);
}

function selectFolder() {
  if (currentBrowsePath) {
    document.getElementById('newProjectPath').value = currentBrowsePath;
    closeFolderBrowser();
  }
}

// 프로젝트 목록을 셀렉트박스에 로드
async function loadProjectsToSelects() {
  try {
    const response = await fetch(`${API_BASE}/projects`);
    const projectsList = await response.json();
    
    // 상단 필터 셀렉트
    const filterSelect = document.getElementById('projectSelect');
    filterSelect.innerHTML = '<option value="all">📦 전체 프로젝트</option>';
    
    // 티켓 생성 모달 셀렉트
    const ticketSelect = document.getElementById('ticketProject');
    ticketSelect.innerHTML = '<option value="">프로젝트 선택...</option>';
    
    projectsList.forEach(p => {
      filterSelect.insertAdjacentHTML('beforeend', `<option value="${p.id}">📦 ${p.id}</option>`);
      ticketSelect.insertAdjacentHTML('beforeend', `<option value="${p.id}">${p.id}</option>`);
    });
    
    // projects 객체도 업데이트
    projectsList.forEach(p => {
      projects[p.id] = p;
    });
    
    console.log(`✅ ${projectsList.length}개 프로젝트 로드`);
    
  } catch (error) {
    console.error('프로젝트 로드 실패:', error);
  }
}
