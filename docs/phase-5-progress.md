# Phase 5 final 진행 기록

기준일: 2026-09-13 (Asia/Seoul)

## 상태

- `IMPLEMENTED_AND_VERIFIED`: 학생 복수 period 신청, 멘토의 원자적 Confirm & Accept,
  학교 공통 시간 snapshot, 역할별 dashboard, 학생 관리/취소 링크, 상태 처리, confirmation-only
  recipient outbox, Resend adapter, 서명 검증 webhook
- `BLOCKED_CONFIGURATION`: 운영 학교 시간·장소·지정 Teacher 값은 추측하지 않고 빈 상태로 둠.
  승인된 sender/provider 설정이 없어 `EMAIL_MODE` 기본값은 `disabled`
- `BLOCKED_AUTH`: 승인된 운영 계정 세션 및 승인된 실제 메일 수신자가 없어 운영 역할별 mutation과
  실제 provider 접수/전달 테스트는 수행하지 않음
- `NOT_IN_SCOPE`: reminder, 접수/취소/완료/no-show/escalation/status 이메일, Google Calendar,
  채팅, AI 분류, 상세 상담 기록

## 구현 결과

- 개인 Mentor Availability 메뉴와 UI를 제거하고 기존 availability/sessions URL은 역할별 My Cases로
  전환했다. 과거 availability/slot/session 데이터와 테이블은 삭제하지 않았다.
- 학생은 희망 날짜와 `break`, `lunch_1`, `lunch_2` 중 복수 period를 제출한다. Worker와 DB가
  형식·범위·과거 날짜·중복 제출을 검증한다.
- 수락 전 queue RPC는 category, 날짜, period, 신청시각, 비식별 ID만 반환한다.
- Confirm & Accept RPC가 actor role, 요청/period, 학교 설정, 지정 Teacher, mentor 충돌을 검사하고
  session snapshot, accepted 상태, 고유 event, 수신자별 outbox, action history를 한 transaction으로
  기록한다.
- 이메일 종류는 `PEER_SESSION_CONFIRMED` 하나뿐이다. 학생, 실제 담당 mentor, snapshot된 지정
  Teacher 주소를 DB가 결정하며 CC/BCC 필드는 존재하지 않는다. 동일 실제 주소는 event 안에서
  중복 생성되지 않는다.
- outbox는 queued/processing/submitted/delivered/retrying/failed/suppressed/uncertain을 구분하고,
  lease·batch·최대 5회 retry·Retry-After·24시간 provider idempotency 한계를 반영한다.
- 학생 bearer credential은 학생 template에만 들어가며 request/session/schedule version/expiry로
  서명된다. GET은 상태를 변경하지 않고 취소는 POST와 DB 재검증을 거친다.
- completed/no-show는 상담 종료 후 담당 mentor 또는 Teacher만 처리하며, Teacher correction은 사유를
  action history에 남긴다. 상태 변경은 추가 이메일을 생성하지 않는다.
- Concern 권한과 원문 불변성, escalation의 제한 접근을 기존 회귀 테스트로 유지했다.

## 로컬 검증

- local migration replay: 성공 (8개 migration을 빈 로컬 DB에 순서대로 적용)
- DB lint: 성공, schema warning/error 0
- pgTAP: 4 files, 117 tests, PASS
- HTTP/RPC 동시성·권한·outbox: 34 checks, PASS
- confirmation template/provider fake tests: 5 tests, PASS
- browser: 23 checks, PASS (1440px desktop, 실제 CSS viewport 390px mobile, 역할별 로그인 포함)
- TypeScript: PASS
- ESLint: PASS, 기존 UI Fast Refresh warning 6건
- production build: PASS; SWAG Supabase ref만 포함하고 local/test fixture 값이 없음을 scan
- build fail-fast: 필수 Vite 변수 없이 validator가 의도대로 실패함을 확인

## 원격/배포 식별자

- Supabase project ref: `ezjvfrdakzyoaijucqij`
- applied migrations: `20260913000100`, `20260913000200` (remote history 일치, post-push lint 0)
- Git commit: 배포 단계에서 기록 예정
- Cloudflare Worker version: 배포 단계에서 기록 예정

## 남은 운영 설정

Teacher가 `/teacher/peer-support`에서 실제 Break/1st Lunch/2nd Lunch 시작·종료, 적용 요일,
승인된 장소/안내, 지정 감독 Teacher를 입력해야 한다. Worker에는 승인된 provider가 있을 때만
`EMAIL_FROM`, 선택적 `EMAIL_REPLY_TO`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`을 server-only로
설정하고 마지막에 `EMAIL_MODE=live`로 전환한다. 승인 수신자 없이 테스트 메일을 보내지 않는다.
`EMAIL_DISPATCH_SECRET`과 `STUDENT_LINK_SECRET`은 기존 Worker encrypted secret으로 등록했으며
임시 원본 파일은 삭제했다. provider/sender secret은 존재하지 않아 실제 발송은 계속 비활성 상태다.

## Rollback 주의

원격 DB reset, 기존 row 삭제, 적용 migration 편집, enum 역변환을 하지 않는다. 문제가 생기면 intake와
email mode를 닫아 새 mutation/발송을 멈추고, SWAG build 변수로 확인된 이전 Worker version을
재배포한 뒤 forward-only corrective migration을 작성한다. outbox/action/provider 이력은 보존한다.
