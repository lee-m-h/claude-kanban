# 🦊 Claude Kanban

AI 코딩 에이전트(Claude Code)를 활용한 칸반 기반 프로젝트 매니저

![Claude Kanban](https://img.shields.io/badge/Claude-Kanban-orange?style=flat-square)

## 개요

Claude Kanban은 **Claude Code CLI**를 칸반 보드 형태로 관리하는 도구입니다.
티켓을 생성하면 Claude가 자동으로 코딩 작업을 수행하고, 리뷰 → 승인 → 커밋/푸시까지 한 화면에서 관리할 수 있습니다.

### 워크플로우

```
📋 백로그 → 🔄 진행중 (Claude 작업) → 👀 리뷰대기 → ✅ 완료
```

## 설치

### 필수 조건

- **Node.js** v18 이상
- **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`)
- **Anthropic API Key** 환경변수 설정

### 설치 방법

```bash
git clone https://github.com/lee-m-h/claude-kanban.git
cd claude-kanban
npm install
node server.js
```

브라우저에서 `http://localhost:4001` 접속

### 초기 설정

1. ⚙️ 설정 버튼 클릭
2. **환경설정** 탭에서:
   - Claude CLI 경로 → 🔍 자동감지 (대부분 자동으로 잡힘)
   - Jira 연동 (선택사항)
3. **프로젝트** 탭에서 작업할 프로젝트 추가

## 사용법

### 티켓 생성
- `Ctrl + N` 또는 **+ 새 티켓** 버튼
- 프로젝트 선택 → 유형 선택 → 제목/설명 입력 → 생성

### 티켓 유형

| 유형 | 설명 | Claude 동작 |
|------|------|-------------|
| 🆕 신규 | 새로운 기능 개발 | 파일 생성/수정 |
| 🐛 버그 | 버그 수정 | 원인 분석 → 수정 |
| ✏️ 개선 | 리팩토링/개선 | 기존 코드 분석 → 개선 |
| 🔍 확인 | 코드 확인/분석 | **읽기만** (수정 안 함) |

### 작업 흐름

1. **백로그**에서 ▶️ 작업시작 → Claude가 자동으로 코딩
2. 완료되면 **리뷰대기**로 이동 → 결과 확인
3. ✅ 승인 → Claude가 커밋/푸시 → **완료**
4. 🔄 재요청 → 추가 요구사항 입력 → 재작업

### 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl + N` | 새 티켓 생성 |
| `Cmd + Enter` | 모달 제출 (생성/재요청) |
| `ESC` | 모달 닫기 |

## 테마

🖥️ 시스템 (기본) → ☀️ 라이트 → 🌙 다크 순환

헤더의 테마 버튼으로 전환

## Jira 연동

환경설정에서 Jira Host, Email, API Token을 입력하면:
- 📥 Jira 버튼으로 이슈 가져오기
- 티켓 생성 시 Jira 이슈 연결

## 메뉴바 앱 (macOS)

```bash
cd menubar-app
npm install
npm start
```

메뉴바에서 서버 시작/중지, 브라우저 열기 가능

## 프로젝트 구조

```
claude-kanban/
├── server.js          # Express 서버 + Claude CLI 실행
├── index.html         # 메인 UI
├── app.js             # 프론트엔드 로직
├── style.css          # 스타일 (라이트/다크 테마)
├── favicon.svg        # 🦊 파비콘
├── data/              # 데이터 (gitignore)
│   ├── settings.json  # 환경설정
│   ├── projects.json  # 프로젝트 목록
│   ├── tickets.json   # 티켓 데이터
│   └── logs/          # 작업 로그
└── menubar-app/       # macOS 메뉴바 앱
```

## 라이센스

MIT
