# RYLAI

**청소년 온라인 그루밍 예방 교육 시스템**

RYLAI는 AI 기반의 실시간 시뮬레이션을 통해 청소년들이 온라인 그루밍(Cybergrooming) 전술을 인식하고 대응하는 방법을 배울 수 있는 교육용 웹 애플리케이션입니다.

## 주요 기능

- 🤖 **AI 가해자 시뮬레이션** - VT Custom(StagePilot), 그루밍 단계 자동 예측
- 📊 **7단계 그루밍 시뮬레이션** - 실제 그루밍 과정을 단계별로 학습
- 💡 **실시간 피드백** - 대화 중 즉각적인 교육 피드백 제공
- 👨‍🏫 **교육자 포털** - 맞춤형 시나리오 생성 및 관리, 수업 링크 배포
- 🔐 **아이디(username) + 비밀번호 계정** - 교육자는 `/`에서, 학생은 교육자의 수업 링크에서 가입 (이메일 미수집)
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
# .env.local 파일을 열어 SESSION_SECRET, ADMIN_PASSCODE, OPENAI_API_KEY 입력

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

아이디(username) + 비밀번호로 가입합니다(이메일 미수집). 계정 유형에 따라 가입하는 위치가 다릅니다.

| 사용자 유형 | 가입 위치 | 용도 |
|------------|---------|-----|
| 교육자/관리자 | 루트 페이지 `/`, 교육자 passcode(`ADMIN_PASSCODE`) **필수** | 시나리오 생성 및 관리 |
| 학습자/학생 | 교육자의 수업 링크 `/<교육자아이디>` (선택적으로 `?code=<접속코드>`)에서만 | 해당 교육자의 시나리오 학습 |

비밀번호는 bcrypt로 해싱되고, 세션은 HMAC 서명된 httpOnly 쿠키를 사용합니다.

**학습자는 수업 링크로 시작합니다.** 교육자마다 자신의 아이디로 만들어진 링크
(`https://<호스트>/<교육자아이디>`)가 있으며, 관리자 페이지의 배포(Distribution) 탭에서 복사해
학생에게 전달합니다. 이 링크가 학생의 가입 페이지이자 나중에 다시 돌아와 로그인하는 페이지이며,
여기서 교육자가 작성한 환영 화면(있는 경우)을 거쳐 첫 시나리오로 이동합니다. 교육자를 목록에서
고르는 페이지는 더 이상 없습니다.

**학생 계정은 교육자 단위로 구분됩니다.** 같은 아이디를 서로 다른 교육자 밑에 각각 가입시킬 수
있으며, 이 둘은 각자 가입이 필요한 완전히 별개의 계정이고 학습 기록도 따로 저장됩니다. 한 번 만든
계정을 다른 교육자의 수업으로 옮길 수는 없습니다.

**가입 방식 제어.** 기본값은 수업 링크만 있으면 누구나 가입할 수 있는 상태입니다. 교육자가 이
설정을 끄면 교육자가 발급한 1회용 접속 코드가 있어야 가입할 수 있으며, 코드는
`/<교육자아이디>?code=<접속코드>` 형태의 초대 링크로 배포됩니다. 코드는 발급한 수업에서만
사용할 수 있습니다.

## 기술 스택

- **프레임워크**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **상태 관리**: Zustand with persist middleware
- **데이터베이스**: SQLite with Drizzle ORM
- **인증**: 아이디(username) + 비밀번호 (bcryptjs, 최소 8자), Zod 검증, HMAC 서명 httpOnly 쿠키
- **AI**: 가해자 채팅은 VT Custom(StagePilot), 피드백은 OpenAI Responses API
- **배포**: Docker + Docker Compose

## AI 모델

모델 선택 기능은 없으며, 두 가지 역할로 고정되어 있습니다:

- **가해자 채팅**: VT Custom(StagePilot) 세션 기반 엔드포인트
  (`https://rylai.cs.vt.edu/llm`). 그루밍 단계를 자동 예측하며 API 키가 필요 없습니다.
- **피드백**: OpenAI **Responses API**, 단일 모델(`FEEDBACK_MODEL`, 기본 `gpt-5.5`).
  `OPENAI_API_KEY`가 필요합니다.

피드백 모델은 환경 변수 `FEEDBACK_MODEL`로 변경할 수 있습니다.

## 환경 변수

| 변수명 | 필수 | 기본값 | 설명 |
|-------|-----|-------|------|
| `DATABASE_URL` | 아니오 | `./data/rylai.db` | SQLite 데이터베이스 파일 경로 |
| `SESSION_SECRET` | 예(운영) | 개발용 기본값 | 세션 쿠키 서명 키 |
| `ADMIN_PASSCODE` | 예 | - | 교육자(관리자) 가입용 passcode |
| `OPENAI_API_KEY` | 예 | - | 피드백 생성용 OpenAI API 키 |
| `FEEDBACK_MODEL` | 아니오 | `gpt-5.5` | 피드백 모델 (키에서 사용 가능한 모델) |

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

- [ ] 강력한 `SESSION_SECRET` 설정 (예: `openssl rand -hex 32`)
- [ ] 기본값이 아닌 `ADMIN_PASSCODE` 설정
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

1. `.env` 파일에 올바른 `OPENAI_API_KEY`가 있는지 확인
2. OpenAI 계정에 크레딧/쿼터가 있는지 확인 (피드백 생성에 필요)
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
- [OpenAI](https://openai.com)의 AI 제공
- [Drizzle ORM](https://orm.drizzle.team)의 데이터베이스

---

더 자세한 정보는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.
