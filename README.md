# visit-counter

특정 페이지의 방문자 수를 세어 SVG 배지로 보여 주는 작은 서비스입니다. 키 하나당 카운터 하나이고, **같은 방문자는
하루(한국 시간 기준)에 한 번만** 셉니다. 새로고침한다고 숫자가 올라가지 않습니다.

<a href="https://counter.kimhwan.kr?key=visit-counter-readme"><img src="https://counter.kimhwan.kr?key=visit-counter-readme" alt="방문자"></a>

## 사용 방법

```html
<img src="https://counter.kimhwan.kr/?key=자신의키값" />
```

| 파라미터     | 설명                                         |
| ------------ | -------------------------------------------- |
| `key` (필수) | 카운터를 구분하는 키. 1~512자.               |
| `title`      | 왼쪽 라벨. 기본 `방문자`, 최대 32자.         |
| `color`      | 오른쪽 배경색(hex, `#` 없이). 기본 `79c83d`. |

배지에는 `오늘 방문자 / 전체 방문자` 가 표시됩니다. 노션에서는 `/embed` 로 위 URL 을 넣으면 됩니다.

JSON 이 필요하면:

| 메서드 | 경로                          | 동작                                                     |
| ------ | ----------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/v1/counters/{key}`      | 현재 숫자 조회(세지 않음) → `{ key, day, total, today }` |
| `POST` | `/api/v1/counters/{key}/hits` | 방문을 세고 숫자 반환 → `{ ..., counted }`               |
| `GET`  | `/healthz`                    | 상태와 배포 버전                                         |

## 구조

```
src/
  index.ts            시작점: 설정 → DB → 서비스 → HTTP 서버, 정리 타이머, graceful shutdown
  config.ts           환경변수(zod 검증)
  app.ts              HTTP 라우트(Hono)
  badge/svg.ts        배지 SVG 렌더링
  counter/service.ts  규칙: 방문자·키·날짜당 1회, 합계는 줄지 않음
  counter/repository.ts  SQLite 접근(prepared statement)
  counter/day.ts      시간대 기준 날짜 키
  db/database.ts      SQLite 열기(WAL) + 마이그레이션
  db/migrations.ts    스키마 버전
  http/client-ip.ts   신뢰하는 프록시 헤더에서 방문자 주소 추출
  scripts/            import-legacy(v1 MongoDB 데이터 이전), backup(온라인 스냅샷)
test/                 vitest
deploy/               VM 에서 쓰는 compose.yaml, deploy.sh, backup.sh
```

- **스택**: Node 22, TypeScript, [Hono](https://hono.dev), SQLite([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)), zod, vitest, ESLint, Prettier.
- **DB**: 파일 하나(`data/visit-counter.db`, WAL 모드). 테이블은 `counters`(키별 합계), `daily_counts`(키·날짜별 방문자 수, 영구),
  `visits`(중복 제거용 `(key, day, sha256(salt+ip))`, 7일 뒤 삭제). 원본 IP 는 저장하지 않습니다. 방문 1건은 한 트랜잭션 안에서
  중복 검사·합계 증가가 함께 일어납니다.
- **방문자 주소**: `TRUSTED_PROXY=true` 일 때 nginx 가 넣는 `X-Real-IP`(Cloudflare 를 거치면 `CF-Connecting-IP` 기준) → `X-Forwarded-For` 순.

## 개발

```bash
npm install
npm run dev          # http://localhost:8080/?key=test  (DB 는 ./data/)
npm test             # 단위 테스트
npm run lint && npm run typecheck && npm run format:check
npm run build && npm start
```

환경변수: `PORT`(8080) `HOST`(0.0.0.0) `DATA_DIR`(./data) `TIMEZONE`(Asia/Seoul) `TRUSTED_PROXY`(false)
`VISIT_RETENTION_DAYS`(7) `APP_VERSION`(dev).

## 배포

GitHub `main` 에 push → Jenkins(`build.kimhwan.kr`, 잡 `visit-counter`) → `docker build --target test` 로 검사 →
이미지 `akon47/visit-counter:<빌드번호>` 푸시 → VM(10.10.10.220)에 `deploy/` 복사 후 `deploy.sh`(compose pull/up) →
`/healthz` 의 버전으로 확인. 외부 공개는 nginx 관문(LXC 101)이 `counter.kimhwan.kr` 을 이 VM 으로 프록시합니다.

VM 쪽: `/srv/visit-counter/{compose.yaml,deploy.sh,backup.sh,data/}`. 백업은 `backup.sh` 가 매일 `data/backups/` 에
스냅샷을 남깁니다(14일 보관). 수동 배포는 `APP_TAG=<태그> ./deploy.sh`.

## v1 데이터 이전

v1(MongoDB) 의 `visitors` 컬렉션을 JSON(배열 또는 줄 단위)으로 내보낸 뒤 VM 에서:

```bash
docker compose run --rm -v "$PWD/legacy:/legacy:ro" app node dist/scripts/import-legacy.js /legacy/visitors.json
```

문서마다 일반 방문과 같은 규칙으로 다시 재생합니다. 처리한 문서의 `_id` 를 `legacy_imported` 표에 기록하므로 같은 파일을
다시 돌리거나(중복 제거 행이 정리된 뒤라도) 옛 문서를 포함한 더 새로운 export 를 돌려도 새 문서만 더해집니다.
