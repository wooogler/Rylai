# RYLAI

**청소년 온라인 그루밍 예방 교육 시스템**

RYLAI는 AI 기반의 실시간 시뮬레이션을 통해 청소년들이 온라인 그루밍(Cybergrooming) 전술을 인식하고 대응하는 방법을 배울 수 있는 교육용 웹 애플리케이션입니다.

## 주요 기능

- 🤖 **다양한 AI 모델 지원** - OpenRouter를 통해 5개의 AI 모델 선택 가능
- 📊 **7단계 그루밍 시뮬레이션** - 실제 그루밍 과정을 단계별로 학습
- 💡 **실시간 피드백** - 대화 중 즉각적인 교육 피드백 제공
- 👨‍🏫 **교육자 포털** - 맞춤형 시나리오 생성 및 관리
- 👪 **학부모 포털** - 자녀의 학습 진행상황 모니터링
- 🔒 **안전한 학습 환경** - 통제된 환경에서의 안전한 교육

## 빠른 시작

### 로컬 개발 환경

```bash
# 1. 저장소 클론
git clone <repository-url>
cd Rylai

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env.local
# .env.local 파일을 열어 OpenRouter 또는 OpenAI API 키 입력

# 4. 데이터베이스 마이그레이션
npm run db:migrate

# 5. 개발 서버 시작
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### Docker로 서버에 배포

```bash
# 1. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력

# 2. Docker 컨테이너 실행
docker-compose up -d

# 3. 상태 확인
curl http://localhost:3000/api/health
```

## 상세 가이드

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - 로컬 개발 및 리눅스 서버 배포 가이드 (한국어)
- **[README.md](README.md)** - 프로젝트 전체 문서 (영어)
- **[CLAUDE.md](CLAUDE.md)** - 개발자 가이드 및 아키텍처 (영어)

## 로그인 정보

| 사용자 유형 | 비밀번호 | 용도 |
|------------|---------|-----|
| 교육자/관리자 | `rylai2025` | 시나리오 생성 및 관리 |
| 학습자 | `user2025` | 교육자가 만든 시나리오 학습 |
| 학부모 | `parent2025` | 자녀 학습 진행상황 조회 (읽기 전용) |

## 기술 스택

- **프레임워크**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **상태 관리**: Zustand with persist middleware
- **데이터베이스**: SQLite with Drizzle ORM
- **AI**: OpenRouter (5개 모델 지원: GPT-4o, Mistral 7B, Grok 4.1, Gemini 2.0, DeepSeek V3.2)
- **배포**: Docker + Docker Compose

## 지원되는 AI 모델

채팅 화면에서 다음 모델들을 선택할 수 있습니다:

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

## 환경 변수

| 변수명 | 필수 | 기본값 | 설명 |
|-------|-----|-------|------|
| `DATABASE_URL` | 아니오 | `./data/rylai.db` | SQLite 데이터베이스 파일 경로 |
| `OPENROUTER_API_KEY` | 필수 | - | OpenRouter API 키 (5개 모델 지원) |
| `OPENAI_API_KEY` | 아니오 | - | OpenAI API 키 (직접 OpenAI 사용 시) |
| `NEXT_PUBLIC_USE_LOCAL_API` | 아니오 | `false` | 로컬 Mistral-7B 사용 여부 |

**참고**: `OPENROUTER_API_KEY`는 필수입니다. OpenRouter는 모든 5개 지원 모델에 접근하는 데 필요합니다.

### OpenRouter API 키 받기

1. [OpenRouter](https://openrouter.ai/) 회원가입
2. 계정에 크레딧 추가
3. 대시보드에서 API 키 생성
4. `.env.local` (또는 `.env`) 파일에 키 추가

## 그루밍 단계

애플리케이션은 7단계의 온라인 그루밍 과정을 시뮬레이션합니다:

0. **자유 대화** - 단계 제약 없음
1. **친밀감 형성** - 친분 쌓기, 사진 요청
2. **관계 형성** - 취미와 학교생활 대화
3. **위험 평가** - 감독 여부 확인
4. **배타성** - 감정적 유대 및 비밀 공유
5. **성적 내용** - 부적절한 콘텐츠 도입
6. **마무리** - 오프라인 만남 계획

## 개발 명령어

```bash
# 개발 서버 (Turbopack)
npm run dev

# 로컬 API로 개발
npm run dev:local

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start

# 데이터베이스 마이그레이션
npm run db:migrate

# 데이터베이스 GUI (Drizzle Studio)
npm run db:studio

# 린트
npm run lint
```

## Docker 관리

```bash
# 시작
docker-compose up -d

# 중지
docker-compose down

# 로그 보기
docker-compose logs -f

# 재시작
docker-compose restart

# 재빌드 (코드 변경 후)
docker-compose up -d --build

# 데이터베이스 백업
docker cp rylai-app:/app/data/rylai.db ./backup-$(date +%Y%m%d).db

# 완전 삭제 (주의: 데이터베이스 포함)
docker-compose down -v
```

## 프로덕션 배포 체크리스트

- [ ] 기본 비밀번호 변경
- [ ] HTTPS 설정 (nginx/caddy 리버스 프록시)
- [ ] 방화벽 규칙 설정
- [ ] 정기 데이터베이스 백업 설정
- [ ] 로그 및 헬스 엔드포인트 모니터링
- [ ] 의존성 업데이트 유지

## 문제 해결

### 데이터베이스가 잠겼을 때

```bash
# SQLite는 한 번에 하나의 쓰기만 허용
# 잠시 기다렸다가 재시도
docker-compose restart
```

### API 키 오류

1. `.env` 파일에 올바른 API 키가 있는지 확인
2. OpenRouter/OpenAI 계정에 크레딧이 있는지 확인
3. 컨테이너 재시작: `docker-compose restart`

### 포트가 이미 사용 중

```bash
# docker-compose.yml에서 포트 변경
# ports:
#   - "8080:3000"
```

## 라이선스

[라이선스 정보를 여기에 추가하세요]

## 감사의 말

- [Next.js](https://nextjs.org)로 구축
- [OpenRouter](https://openrouter.ai)의 AI 제공
- [Drizzle ORM](https://orm.drizzle.team)의 데이터베이스

---

더 자세한 정보는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.
