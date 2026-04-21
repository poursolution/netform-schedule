#!/bin/bash
# VPS 업데이트 스크립트 — install.sh 이후 코드 갱신 시 사용
# 사용법: SSH 접속 후 이 스크립트 실행
#   ssh -i ~/.ssh/kapt_vps ubuntu@13.209.81.200 \
#     "cd ~/kapt-playwright-server && bash deploy.sh"
#
# 또는 한 줄로:
#   curl -fsSL https://raw.githubusercontent.com/poursolution/netform-schedule/main/playwright-server/deploy.sh | bash

set -e

APP_DIR="${APP_DIR:-$HOME/kapt-playwright-server}"
BRANCH="${BRANCH:-main}"

echo "=== 1. 코드 갱신 ($BRANCH 브랜치) ==="
cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# install.sh가 playwright-server/* 만 옮겼을 가능성 — sparse 케이스 대응
if [ ! -f server.js ] && [ -f playwright-server/server.js ]; then
  echo "(서브디렉토리 구조 감지 — playwright-server/* 사용)"
  cp -rf playwright-server/* .
fi

echo "=== 2. npm install (변경사항 있을 때만 빠름) ==="
npm install --omit=dev 2>&1 | tail -5

echo "=== 3. .env JANDI 변수 확인 ==="
if [ -f .env ]; then
  for v in JANDI_EMAIL JANDI_PASSWORD JANDI_TEAM; do
    if grep -q "^$v=" .env; then
      echo "  ✓ $v 설정됨"
    else
      echo "  ⚠️  $v 미설정 — 수동 추가 필요:"
      echo "      echo '$v=...' >> $APP_DIR/.env"
    fi
  done
else
  echo "  ⚠️  .env 파일 없음 — install.sh 다시 실행하거나 수동 생성"
fi

echo "=== 4. 서비스 재시작 ==="
sudo systemctl restart kapt-playwright
sleep 2

echo "=== 5. 헬스체크 ==="
curl -sS http://localhost:8080/health | head -20 || echo "(헬스체크 실패 — journalctl -u kapt-playwright -n 50 으로 로그 확인)"

echo ""
echo "=== ✅ 배포 완료 ==="
echo ""
echo "잔디 채널 discovery 테스트:"
echo "  curl -X POST http://localhost:8080/admin/jandi-channels-list \\"
echo "    -H \"Authorization: Bearer \$(grep AUTH_TOKEN .env | cut -d= -f2)\""
echo ""
echo "잔디 채널 파일 수집 테스트:"
echo "  curl -X POST http://localhost:8080/admin/jandi-channel-fetch \\"
echo "    -H \"Authorization: Bearer \$(grep AUTH_TOKEN .env | cut -d= -f2)\" \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"channelName\":\"입찰 공고(POUR공법)\",\"monthsBack\":12}'"
