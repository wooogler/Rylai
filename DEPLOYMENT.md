# RYLAI 배포 가이드

이 문서는 RYLAI를 로컬에서 개발하거나 리눅스 서버에 배포하는 방법을 안내합니다.

## 목차
- [로컬 개발 환경 설정](#로컬-개발-환경-설정)
- [리눅스 서버 배포 (Docker)](#리눅스-서버-배포-docker)
- [환경 변수 설정](#환경-변수-설정)
- [문제 해결](#문제-해결)

---

## 로컬 개발 환경 설정

### 1. 사전 요구사항
- **Node.js 20 이상** ([다운로드](https://nodejs.org/))
- **npm** (Node.js와 함께 설치됨)
- **OpenRouter API 키** (권장) 또는 **OpenAI API 키**

### 2. 프로젝트 클론

```bash
git clone <repository-url>
cd Rylai
```

### 3. 의존성 설치

```bash
npm install
```

### 4. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env.local` 파일을 생성합니다:

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어서 최소한 다음 중 하나를 설정합니다:

```env
# 옵션 1: OpenRouter 사용 (권장 - 13개 이상의 모델 지원)
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here

# 옵션 2: OpenAI 직접 사용
OPENAI_API_KEY=sk-your-actual-key-here

# 옵션 3: 로컬 모델 사용 (API 키 불필요)
NEXT_PUBLIC_USE_LOCAL_API=true
```

#### OpenRouter API 키 받기 (권장)

1. [OpenRouter](https://openrouter.ai/) 회원가입
2. 계정에 크레딧 추가 (유료)
3. 대시보드에서 API 키 생성
4. `.env.local`에 키 추가

### 5. 데이터베이스 마이그레이션

```bash
npm run db:migrate
```

성공하면 `data/rylai.db` 파일이 생성됩니다.

### 6. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### 7. 로그인 정보

| 사용자 유형 | 비밀번호 | 용도 |
|------------|---------|-----|
| Admin | `rylai2025` | 시나리오 생성 및 관리 |
| Learner | `user2025` | 시나리오 학습 |
| Parent | `parent2025` | 자녀 진행상황 조회 (읽기 전용) |

---

## 리눅스 서버 배포 (Docker)

Docker를 사용하여 리눅스 서버에 배포하는 방법입니다.

### 1. 사전 요구사항

서버에 다음이 설치되어 있어야 합니다:
- **Docker** ([설치 가이드](https://docs.docker.com/engine/install/))
- **Docker Compose** ([설치 가이드](https://docs.docker.com/compose/install/))

#### Ubuntu/Debian에서 Docker 설치

```bash
# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 실행 가능)
sudo usermod -aG docker $USER

# 로그아웃 후 다시 로그인하여 그룹 변경사항 적용
```

### 2. 프로젝트 업로드

서버에 프로젝트 파일을 업로드합니다:

```bash
# 로컬에서 서버로 업로드 (scp 사용)
scp -r /path/to/Rylai user@your-server-ip:/home/user/

# 또는 서버에서 직접 클론
ssh user@your-server-ip
git clone <repository-url>
cd Rylai
```

### 3. 환경 변수 설정

서버에서 `.env` 파일을 생성합니다:

```bash
cp .env.example .env
nano .env  # 또는 vi, vim 사용
```

**최소 필수 설정:**

```env
# OpenRouter API 키 (권장)
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here

# 또는 OpenAI API 키
OPENAI_API_KEY=sk-your-actual-key-here

# 데이터베이스 경로 (기본값 사용 권장)
DATABASE_URL=/app/data/rylai.db
```

### 4. Docker 컨테이너 시작

```bash
# 컨테이너 빌드 및 시작
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 5. 상태 확인

```bash
# 컨테이너 상태 확인
docker-compose ps

# 헬스 체크
curl http://localhost:3000/api/health
```

정상 응답:
```json
{"status":"healthy","database":"connected"}
```

### 6. 방화벽 설정

포트 3000을 외부에서 접근 가능하도록 설정:

```bash
# Ubuntu/Debian (ufw 사용)
sudo ufw allow 3000
sudo ufw reload

# CentOS/RHEL (firewalld 사용)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 7. 접속

브라우저에서 `http://your-server-ip:3000` 접속

---

## HTTPS 설정 (선택사항, 프로덕션 환경 권장)

프로덕션 환경에서는 HTTPS 사용을 권장합니다.

### Nginx 리버스 프록시 설정

#### 1. Nginx 설치

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### 2. Nginx 설정 파일 생성

```bash
sudo nano /etc/nginx/sites-available/rylai
```

다음 내용 입력:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 도메인 또는 IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 3. 설정 활성화

```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/rylai /etc/nginx/sites-enabled/

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

#### 4. Let's Encrypt SSL 인증서 설치 (무료)

```bash
# Certbot 설치
sudo apt install certbot python3-certbot-nginx

# SSL 인증서 발급 및 자동 설정
sudo certbot --nginx -d your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

이제 `https://your-domain.com`으로 접속 가능합니다.

---

## 환경 변수 설정

### 필수 환경 변수

| 변수명 | 필수 여부 | 기본값 | 설명 |
|-------|---------|-------|------|
| `OPENROUTER_API_KEY` | 필수 | - | OpenRouter API 키 (5개 모델 지원) |
| `OPENAI_API_KEY` | 선택 | - | OpenAI API 키 (직접 OpenAI 사용 시) |
| `DATABASE_URL` | 선택 | `./data/rylai.db` | SQLite 데이터베이스 파일 경로 |
| `NEXT_PUBLIC_USE_LOCAL_API` | 선택 | `false` | 로컬 모델 사용 여부 |

**참고:** `OPENROUTER_API_KEY`는 필수입니다. OpenRouter는 모든 5개 지원 모델에 접근하는 데 필요합니다.

### 지원되는 AI 모델

OpenRouter를 통해 다음 5개 모델을 선택할 수 있습니다:

1. **GPT-4o** (OpenAI) - 최신 GPT-4 Omni 모델 (기본값)
   - 컨텍스트: 128K 토큰

2. **Mistral 7B Instruct** (Mistral AI)
   - 컨텍스트: 32K 토큰

3. **Grok 4.1 Fast** (xAI)
   - 컨텍스트: 131K 토큰

4. **Gemini 2.0 Flash** (Google)
   - 컨텍스트: 1M 토큰

5. **DeepSeek V3.2** (DeepSeek)
   - 컨텍스트: 65K 토큰

채팅 화면에서 드롭다운 메뉴로 모델을 선택할 수 있습니다.

---

## Docker 관리 명령어

### 기본 명령어

```bash
# 컨테이너 시작
docker-compose up -d

# 컨테이너 중지
docker-compose down

# 로그 보기 (실시간)
docker-compose logs -f

# 컨테이너 재시작
docker-compose restart

# 컨테이너 상태 확인
docker-compose ps
```

### 업데이트 및 재배포

코드 변경 후 재배포:

```bash
# 새 코드 받기
git pull

# 이미지 재빌드 및 컨테이너 재시작
docker-compose up -d --build
```

### 데이터베이스 관리

#### 백업

```bash
# 데이터베이스 백업
docker cp rylai-app:/app/data/rylai.db ./backup-$(date +%Y%m%d-%H%M%S).db
```

#### 복원

```bash
# 데이터베이스 복원
docker cp ./backup-20241210-123456.db rylai-app:/app/data/rylai.db
docker-compose restart
```

#### 완전 삭제 (주의!)

```bash
# 컨테이너와 볼륨 모두 삭제 (데이터베이스 포함)
docker-compose down -v
```

---

## 문제 해결

### 1. 컨테이너가 시작되지 않을 때

```bash
# 로그 확인
docker-compose logs

# 특정 이슈 확인
docker-compose logs rylai
```

**일반적인 원인:**
- 환경 변수가 올바르게 설정되지 않음 (`.env` 파일 확인)
- 포트 3000이 이미 사용 중 (`docker-compose.yml`에서 포트 변경)
- 디스크 공간 부족

### 2. 데이터베이스 오류

```bash
# "database is locked" 오류
# 잠시 기다렸다가 재시도하거나 컨테이너 재시작
docker-compose restart
```

### 3. API 키 오류

**증상:** "OPENROUTER_API_KEY not configured" 또는 "Failed to generate response"

**해결:**
1. `.env` 파일에 API 키가 올바르게 설정되었는지 확인
2. API 키에 크레딧이 있는지 확인 (OpenRouter 대시보드)
3. 컨테이너 재시작: `docker-compose restart`

### 4. 포트가 이미 사용 중

```bash
# 포트 3000을 사용하는 프로세스 확인
sudo lsof -i :3000

# docker-compose.yml 수정하여 다른 포트 사용
# ports:
#   - "8080:3000"  # 외부 포트를 8080으로 변경
```

### 5. 권한 오류 (Permission Denied)

```bash
# data 디렉토리 권한 확인
ls -la data/

# 권한 수정 (필요시)
sudo chown -R 1001:1001 data/
```

---

## 성능 모니터링

### 리소스 사용량 확인

```bash
# Docker 컨테이너 리소스 사용량
docker stats rylai-app

# 디스크 사용량
df -h
```

### 로그 관리

```bash
# 로그 크기 제한 (docker-compose.yml에 추가)
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

---

## 보안 권장사항 (프로덕션)

프로덕션 환경에서는 다음 보안 조치를 권장합니다:

- [ ] 기본 비밀번호 변경 (코드에서 하드코딩된 값 수정)
- [ ] HTTPS 설정 (Let's Encrypt)
- [ ] 방화벽 규칙 설정 (필요한 포트만 오픈)
- [ ] 정기적인 데이터베이스 백업 설정
- [ ] 로그 모니터링
- [ ] 의존성 업데이트 (`npm audit`)

---

## 추가 도움말

더 자세한 정보는 다음 파일들을 참고하세요:

- **README.md** - 프로젝트 개요 및 기본 사용법
- **CLAUDE.md** - 개발자 가이드 및 아키텍처 설명
- **docker-compose.yml** - Docker 설정
- **.env.example** - 환경 변수 예시

문제가 해결되지 않으면 프로젝트 메인테이너에게 문의하세요.
