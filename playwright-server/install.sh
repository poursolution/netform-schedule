#!/bin/bash
# Oracle Cloud Seoul (Ubuntu 22.04 ARM 또는 x86) 설치 스크립트
# SSH 접속 후 이 스크립트 실행

set -e

echo "=== 1. 시스템 업데이트 ==="
sudo apt update
sudo apt install -y curl wget git build-essential

echo "=== 2. Node.js 20 LTS 설치 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "=== 3. Playwright 의존성 (Chromium 실행용) ==="
sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2 fonts-noto-cjk

echo "=== 4. 앱 소스 준비 ==="
APP_DIR="$HOME/kapt-playwright-server"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git pull || true
else
  git clone https://github.com/poursolution/netform-schedule.git "$APP_DIR-tmp"
  mv "$APP_DIR-tmp/playwright-server" "$APP_DIR"
  rm -rf "$APP_DIR-tmp"
  cd "$APP_DIR"
fi

echo "=== 5. npm install + Playwright Chromium 다운로드 ==="
npm install
npx playwright install chromium

echo "=== 6. AUTH_TOKEN 생성 ==="
if [ ! -f .env ]; then
  TOKEN=$(openssl rand -hex 32)
  echo "AUTH_TOKEN=$TOKEN" > .env
  echo "PORT=8080" >> .env
  echo ""
  echo "✅ 생성된 AUTH_TOKEN (Cloudflare Worker에 등록 필요):"
  echo "$TOKEN"
  echo ""
fi

echo "=== 7. systemd 서비스 등록 (자동 재시작) ==="
SERVICE_FILE="/etc/systemd/system/kapt-playwright.service"
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=K-APT Playwright Verification Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable kapt-playwright
sudo systemctl restart kapt-playwright

echo "=== 8. 방화벽 포트 개방 (8080) ==="
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

echo ""
echo "=== ✅ 설치 완료 ==="
echo ""
echo "서버 상태 확인:"
echo "  sudo systemctl status kapt-playwright"
echo ""
echo "로그 확인:"
echo "  sudo journalctl -u kapt-playwright -f"
echo ""
echo "헬스체크 테스트:"
echo "  curl http://localhost:8080/health"
echo ""
echo "외부 접속용 public IP 확인:"
echo "  curl -s ifconfig.me"
echo ""
echo "⚠️ Oracle Cloud 콘솔에서도 8080 포트 Ingress 규칙 추가 필요!"
echo "   VCN → Security Lists → Add Ingress Rule (TCP 8080)"
