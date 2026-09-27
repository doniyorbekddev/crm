# code-runner — o'quvchi kodi uchun sandbox xizmati

Arxitektura, tahdid modeli va infra talablari: [`docs/code-sandbox.md`](../docs/code-sandbox.md).
Bu xizmat **CRM serverida emas**, alohida serverda ishlaydi (2026-09-27 qarori). Unda CRM bazasi, CRM sirlari
yoki boshqa kalitlar **bo'lmaydi** — faqat `CODE_RUNNER_TOKEN`.

## Runner serverni tayyorlash (Ubuntu 24.04)

```bash
# 1) Docker Engine
curl -fsSL https://get.docker.com | sh

# 2) gVisor (runsc) — konteyner va host yadrosi orasidagi qatlam
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install && sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world          # tekshiruv

# 3) Tasvirlar (versiya qotirilgan)
docker pull node:24-alpine && docker pull python:3.13-alpine

# 4) Xizmat foydalanuvchisi va kod
sudo useradd --system --create-home --home-dir /opt/code-runner --groups docker coderunner
# Runtime bog'liqlik yo'q (faqat Node standart modullari) — repo'da yig'ib, dist/ ni ko'chiring:
#   (repo ildizida)  npm run build -w @crm/code-runner
#   scp -r code-runner/dist code-runner/package.json code-runner/.env.example code-runner/deploy runner:/opt/code-runner/
cd /opt/code-runner && cp .env.example .env && chmod 600 .env     # CODE_RUNNER_TOKEN (≥ 32 belgi), RUNTIME=runsc
sudo apt-get install -y nodejs                                     # Node 22.12+ (yoki NodeSource 24)

# 5) systemd
sudo cp deploy/code-runner.service /etc/systemd/system/ && sudo systemctl enable --now code-runner
curl -s localhost:4100/health
```

## Tarmoq

- Port `4100` **faqat CRM server IP'siga** ochiq: `ufw allow from <CRM_IP> to any port 4100 proto tcp`, qolgani yopiq.
- Transport: WireGuard (ichki tarmoq) yoki nginx + TLS. Token ochiq internetdan yuborilmasin.
- CRM `.env`: `CODE_RUNNER_URL=https://runner.markaz.uz` (yoki `http://10.0.0.2:4100` WireGuard ichida),
  `CODE_RUNNER_TOKEN=<o'sha token>`.

## Tekshirish

```bash
npm test          # §41 xavfsizlik testlari haqiqiy konteynerlarda (Docker bo'lmasa o'tkazib yuboriladi)
CODE_RUNNER_RUNTIME=runsc npm test   # runner serverda — gVisor bilan
```

## Chegaralar (har test)

vaqt 5 s (so'rovda 0.5–10 s), xotira 128 MB (swap yo'q), CPU 0.5, jarayonlar 64, chiqish 64 KB, fayl 1 MB,
`/tmp` 16 MB (noexec), tarmoq yo'q, root yo'q, imtiyozlar yo'q; kod ≤ 64 KB, testlar ≤ 10.
