// 위험 작업 차단 훅 (PreToolUse). CLAUDE.md 운영 규칙을 글이 아니라 실행 단계에서 막는다.
// 입력: stdin JSON { tool_name, tool_input }. 막을 때는 permissionDecision 'deny', 사용자 확인이 필요하면 'ask'.
const fs = require('fs');

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

// 셸 명령 규칙: [정규식, 결정, 이유]
// 실행 위치(줄 처음, ; & | ( 뒤, npx 뒤)의 명령만 본다 — PR 본문·echo 안의 글자는 걸지 않는다
const AT_CMD = String.raw`(?:^|[;&|(]\s*|\bnpx(?:\.cmd)?\s+(?:-y\s+)?)`;
const SHELL_RULES = [
  [new RegExp(AT_CMD + String.raw`wrangler(?:\.cmd)?\s+(?:pages\s+)?(?:deploy|publish)\b`, 'im'), 'deny',
    'Cloudflare 배포 금지: Worker 운영 소스는 영업운영시스템/deploy-source, 화면은 main 병합 시 자동 배포 (CLAUDE.md 5절)'],
  [new RegExp(AT_CMD + String.raw`firebase(?:\.cmd)?\s+(?:database:(?:set|update|remove|push)|deploy)\b`, 'im'), 'deny',
    '운영 Firebase 직접 쓰기·배포 금지: 데이터 수정은 사용자가 앱 화면에서'],
  // [^\n;&|]* : 한 명령 안에서만 본다 (뒤에 이어진 gh pr create --base main 같은 것과 섞지 않게)
  [/\bgit\b[^\n;&|]*\bconfig\b[^\n;&|]*--(global|system)\b(?![^\n;&|]*--(get|list)\b)(?![^\n;&|]*\s-l\b)/i, 'deny',
    '전역 git 설정 변경 금지: 필요하면 git -c 옵션으로 한 번만'],
  [/\bSet-ExecutionPolicy\b/i, 'deny',
    'PowerShell 실행 정책 변경 금지: npx.cmd 를 쓰세요'],
  [/\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*(--force\b|\s-f\b|\s\+\S)/i, 'deny',
    '강제 push 금지'],
  [/\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*\s(origin\s+)?(\S+:)?(main|master)\b/i, 'deny',
    'main 직접 push 금지: 브랜치 + PR 로'],
  [/\bgh\b[^\n;&|]*\bpr\s+merge\b/i, 'ask',
    'PR 병합은 사용자가 직접 요청했을 때만: 승인해 주세요'],
];

// 스크립트 파일에 운영 DB 쓰기 코드가 들어가는지 (앱 소스 src/ 는 제외)
const DB_HANDLE = /\bdatabase\s*\(|\bgetDatabase\s*\(|\.ref\s*\(/;
const DB_WRITE = /\.(set|update|remove|push|transaction|setWithPriority)\s*\(/;

function checkShell(cmd) {
  for (const [re, decision, reason] of SHELL_RULES) {
    if (re.test(cmd)) decide(decision, reason);
  }
}

function checkFile(input) {
  const file = String(input.file_path || '').replace(/\\/g, '/');
  if (!/\.(m?js|cjs|ts)$/i.test(file)) return;
  if (/\/src\//.test(file) || /\/\.claude\/hooks\//.test(file)) return;
  const text = String(input.content ?? input.new_string ?? '');
  if (DB_HANDLE.test(text) && DB_WRITE.test(text)) {
    decide('deny', '스크립트로 운영 Firebase 쓰기 금지: 읽기 전용(once/get)만 쓰고, 수정은 사용자가 앱 화면에서');
  }
}

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let payload;
try { payload = JSON.parse(raw.replace(/^﻿/, '')); } catch { process.exit(0); }
const tool = payload.tool_name || '';
const input = payload.tool_input || {};

if (tool === 'Bash' || tool === 'PowerShell') checkShell(String(input.command || ''));
else if (tool === 'Write' || tool === 'Edit') checkFile(input);
process.exit(0);
