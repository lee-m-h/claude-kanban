const { app, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');

let tray = null;
let serverProcess = null;
let isServerRunning = false;

const SERVER_PORT = 4001;

// 서버 경로 - 고정 경로 사용 (개발/프로덕션 모두)
const KANBAN_ROOT = '/Users/myoungha/clawd/kanban-prototype';
const SERVER_PATH = path.join(KANBAN_ROOT, 'server.js');
const SERVER_CWD = KANBAN_ROOT;

// 서버 시작
function startServer() {
  if (isServerRunning) return;
  
  serverProcess = spawn('node', [SERVER_PATH], {
    cwd: SERVER_CWD,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
    if (data.toString().includes('실행 중')) {
      isServerRunning = true;
      updateTray();
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });
  
  serverProcess.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    isServerRunning = false;
    serverProcess = null;
    updateTray();
  });
  
  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    isServerRunning = false;
    updateTray();
  });
}

// 서버 중지
function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    isServerRunning = false;
    serverProcess = null;
    updateTray();
  }
}

// 브라우저에서 열기
function openInBrowser() {
  shell.openExternal(`http://localhost:${SERVER_PORT}`);
}

// 트레이 아이콘 업데이트
function updateTray() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🦊 Claude Kanban',
      enabled: false
    },
    { type: 'separator' },
    {
      label: isServerRunning ? '✅ 서버 실행 중' : '⏹️ 서버 중지됨',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🌐 브라우저에서 열기',
      click: openInBrowser,
      enabled: isServerRunning
    },
    { type: 'separator' },
    {
      label: isServerRunning ? '⏹️ 서버 중지' : '▶️ 서버 시작',
      click: isServerRunning ? stopServer : startServer
    },
    { type: 'separator' },
    {
      label: '❌ 종료',
      click: () => {
        stopServer();
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip(isServerRunning ? 'Claude Kanban - 실행 중' : 'Claude Kanban - 중지됨');
}

// 트레이 아이콘 생성
function createTray() {
  // 아이콘 파일 사용 (모든 OS 호환)
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true); // macOS 메뉴바 스타일
  
  tray = new Tray(icon);
  if (process.platform === 'darwin') tray.setTitle('🦊');
  updateTray();
  
  // 클릭 시 메뉴 표시
  tray.on('click', () => {
    tray.popUpContextMenu();
  });
}

// 앱 시작
app.whenReady().then(() => {
  // 독에 표시 안 함
  app.dock?.hide();
  
  createTray();
  startServer(); // 자동으로 서버 시작
});

// 모든 창이 닫혀도 앱 유지
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  stopServer();
});
