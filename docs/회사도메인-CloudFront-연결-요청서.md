# 회사 도메인 하위 경로 연결 요청서 — CloudFront → Vercel

> 받는 분: `mkt.rememberapp.co.kr` CloudFront 배포를 관리하는 회사 AWS 담당자
> 요청: `mkt.rememberapp.co.kr/leadgen/communicator` 경로를 사내 업무 도구 **MICE 커뮤니케이터**(Vercel 호스팅)로 연결
> 정본: 설계서 v2.9.2 §18a-2 · 작성 2026-09-25

## 1. 왜 필요한가

- 지금 이 경로는 **S3에 올려 둔 정적 사본**(2026-09-21 업로드)을 보여 준다. 화면 샘플일 뿐이라 로그인·파일 저장(Drive)·견적 서버 기능이 돌지 않고,
  하위 주소를 새로고침하면 403이 난다.
- 실제 앱은 Vercel에서 돈다(서버 함수 포함). 이 경로의 요청을 Vercel로 넘기면 회사 주소 그대로 실제 앱이 열린다.
- **도메인·DNS는 바꾸지 않는다.** CloudFront 배포에 동작(Behavior) 1개를 더하는 작업이다.

## 2. 요청 작업 (CloudFront 배포: `mkt.rememberapp.co.kr`)

### ① 원본(Origin) 추가

| 항목 | 값 |
|---|---|
| Origin domain | `communicator-rho.vercel.app` |
| Protocol | **HTTPS only** (443) |
| Minimum origin SSL protocol | TLSv1.2 |
| Origin path | (비움) |
| Custom headers | 없음 |

### ② 동작(Behavior) 추가

| 항목 | 값 | 이유 |
|---|---|---|
| Path pattern | `/leadgen/communicator*` | 끝 슬래시 없는 주소까지 포함 |
| 우선순위 | 기본(`*`) 동작보다 **위** | 기존 S3 동작이 먼저 잡지 않게 |
| Origin | ①의 원본 | |
| Viewer protocol policy | Redirect HTTP to HTTPS | |
| Allowed HTTP methods | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE | 파일 업로드(PUT)·저장(POST) |
| Cache policy | **`CachingDisabled`**(관리형) | 로그인·데이터 화면 — 캐시하면 다른 사람 화면이 섞일 수 있다 |
| Origin request policy | **`AllViewerExceptHostHeader`**(관리형) | 쿼리·헤더(Authorization·Range·Content-Type)는 넘기고, **Host는 넘기지 않는다**(Vercel이 자기 주소로 받아야 응답한다) |
| Response headers policy | 없음 | 앱이 보안 헤더를 직접 보낸다 |
| Compress objects | 켬(선택) | |

### ③ 캐시 무효화

- `/leadgen/communicator*` — 기존 정적 사본 캐시를 지운다.

### ④ (전환 확인 뒤) 기존 S3 객체 정리

- S3의 `leadgen/communicator/` 객체는 ②가 가려서 더는 서빙되지 않는다. 전환이 확인되면 지워도 된다(급하지 않음).

## 3. 확인해 주실 것 (있으면 알려 주세요)

- **배포 수준의 사용자 지정 오류 응답**(예: 403/404 → 다른 페이지)이 있는지. 있으면 이 경로의 서버 응답(404 JSON 등)까지 바뀌어
  앱 오류 처리가 깨진다 — 이 경로만 예외로 둘 방법을 함께 정해야 한다.
- 이 배포에 붙은 **WAF 규칙**이 PUT/POST 본문(최대 약 4MB 조각)을 막지 않는지.

## 4. 순서 (앱 쪽과 맞물림)

1. **앱 쪽 먼저**(우리 작업): Vercel 환경 변수 `VITE_BASE_PATH=/leadgen/communicator/` + `DRIVE_OAUTH_REDIRECT_URI` 설정 → 재배포.
   이 전에 CloudFront를 바꾸면 화면 자산 경로가 맞지 않아 빈 화면이 된다.
2. **CloudFront 작업**(이 요청서 ①~③).
3. **확인**(아래 5).

## 5. 작업 후 확인 (누구나 브라우저로)

| 주소 | 기대 |
|---|---|
| `https://mkt.rememberapp.co.kr/leadgen/communicator/api/drive` | JSON 응답(`{"configured":…}`) — 403 HTML이 아님 |
| `https://mkt.rememberapp.co.kr/leadgen/communicator/home` 을 **새로고침** | 앱 화면(403 아님) |
| 응답 헤더 | `x-vercel-id` 또는 `server: Vercel` 이 보임 |

## 6. 되돌리기

- ②에서 추가한 동작을 삭제하면 즉시 원래(S3 정적 사본)로 돌아간다. 원본(①)은 남겨도 무해하다.

## 7. 참고

- 앱이 보내는 `Strict-Transport-Security`(includeSubDomains) 헤더가 이 도메인에도 전달된다 — `mkt.rememberapp.co.kr`와 그 하위 도메인은
  HTTPS로만 접속하게 된다(이미 HTTPS라면 영향 없음).
- 파일 업로드는 4MB 조각으로 나눠 보내고, 파일 보기는 최대 100MB까지 스트리밍한다 — CloudFront 기본 한도 안이다.
