# RGB 업무일지 (Next.js + Supabase)

기존 단일 HTML(`legacy/업무일지_시스템_v11.html`)을 Next.js App Router로 이전한 버전입니다.

## 기능
- 대시보드 / 개인 월간 캘린더·일지
- 통합관리 (직원·업체)
- 팀 KPI / 견적·작업시간 분석
- 엑셀·JSON 백업
- Supabase Postgres 연동 (미설정 시 `public/data/seed.json` 로컬 시드 사용)

## 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:3000

## Supabase 설정

1. SQL Editor에서 [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) 실행
2. `.env.local` 작성:

```env
NEXT_PUBLIC_SUPABASE_URL=https://sdnvdboqgxwdwviwmjit.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. 시드 적재:

```bash
npm run extract-data   # HTML → data/seed.json (이미 생성됨)
npm run seed           # seed.json → Supabase
```

4. 시드 후 앱을 새로고침하면 `source=supabase`로 로드됩니다.

> 현재 RLS는 **anon CRUD 전체 허용**(공개 운영). 추후 관리자 Auth 추가 시 정책을 읽기 공개 / 쓰기 authenticated로 교체하세요.

## Vercel 배포

1. GitHub 연동 후 [Vercel](https://vercel.com)에서 Import (`rgbcomdev/jobsheet`)
2. Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 등록
3. Deploy
4. (최초 1회) 로컬에서 `npm run seed`로 DB 시드

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run extract-data` | legacy HTML에서 seed.json 추출 |
| `npm run seed` | Supabase에 시드 업로드 |

## 보안 안내
로그인 없이 공개 모드입니다. URL을 아는 누구나 데이터를 수정할 수 있습니다. 사내 공유 용도로만 사용하고, 관리자 계정이 준비되면 Auth + RLS를 강화하세요.
