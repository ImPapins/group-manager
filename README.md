# 공유 일정 및 목표 관리 시스템 (Shared Calendar & Goals)

아이디 기반 그룹 생성, 기존 일정이 표시되는 달력 기반 일정 등록, 그리고 주간/월간 목표 체크리스트를 지원하는 웹 애플리케이션입니다.

---

## 🚀 빠른 시작 (로컬 실행)

### 1. 패키지 설치
```bash
npm install
```

### 2. 로컬 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000` (또는 터미널에 표시된 포트)로 접속합니다.

### 3. 프로덕션 빌드 및 미리보기
```bash
npm run build
npm run preview
```

---

## 🌐 Netlify 배포 가이드

이 프로젝트는 Netlify에 원클릭으로 바로 배포할 수 있도록 `netlify.toml`과 `public/_redirects` 설정이 완료되어 있습니다.

### 방법 1: GitHub 연동을 통한 자동 배포 (권장)
1. **GitHub 저장소 생성 및 푸시**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit for shared calendar"
   git branch -M main
   git remote add origin https://github.com/<사용자명>/<저장소이름>.git
   git push -u origin main
   ```
2. **Netlify 접속**: [Netlify](https://www.netlify.com/)에 로그인합니다.
3. **새 사이트 추가**: `Add new site` > `Import an existing project` > `GitHub` 선택.
4. **저장소 선택**: 방금 푸시한 저장소를 선택합니다.
5. **빌드 설정 확인**:
   - **Build command**: `npm run build` (`netlify.toml`에 의해 자동 감지됨)
   - **Publish directory**: `dist` (`netlify.toml`에 의해 자동 감지됨)
6. **Deploy**: `Deploy site` 버튼을 클릭하면 수십 초 내로 배포가 완료됩니다!

### 방법 2: Netlify CLI 직접 배포
```bash
# Netlify CLI 설치
npm install -g netlify-cli

# 빌드
npm run build

# 배포
netlify deploy --prod --dir=dist
```

---

## ⚙️ 환경 설정 및 Firebase 안내

- 기본적으로 프로젝트 루트의 `firebase-applet-config.json` 파일을 통해 Firestore 데이터베이스와 바로 연동됩니다.
- 필요 시 Netlify 사이트 설정(`Site configuration` > `Environment variables`)에서 아래의 환경 변수를 개별 지정할 수도 있습니다:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_DATABASE_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`

---

## 📁 주요 폴더 구조
```
├── public/
│   └── _redirects              # Netlify SPA 라우팅 리다이렉트 규칙
├── src/
│   ├── components/             # 달력, 기간 선택기, 모달 등 UI 컴포넌트
│   ├── context/                # 일정 및 목표 전역 상태 관리
│   ├── utils/                  # 날짜 계산 및 연결 헬퍼 함수
│   ├── firebase.ts             # Firebase Firestore 초기화 설정
│   └── types.ts                # TypeScript 타입 정의
├── netlify.toml                # Netlify 빌드 및 라우팅 설정
├── package.json
└── vite.config.ts
```
