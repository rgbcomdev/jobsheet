export const STAGES = ["시안", "본작업", "수정중", "제작중"] as const;
export type Stage = (typeof STAGES)[number];

export const CATEGORIES = [
  "홈페이지",
  "전자카탈로그",
  "종이카탈로그",
  "브랜드",
  "시각",
  "SNS",
  "모션영상",
  "3D영상",
  "촬영영상",
  "내부업무",
] as const;

export const SUBTYPES = ["디자인", "퍼블"] as const;
export const HAS_SUBTYPE = new Set(["홈페이지", "전자카탈로그"]);

/** 전체 프로젝트: 디자인/퍼블 구역 분리 대상 */
export const SPLIT_DESIGN_PUBLISH = new Set([
  "홈페이지",
  "관리자홈페이지",
  "전자카탈로그",
]);

/** 전체 프로젝트 정렬용 카테고리 순서 */
export const FULL_CATEGORY_ORDER = [
  "홈페이지",
  "관리자홈페이지",
  "전자카탈로그",
  "종이카탈로그",
  "브랜드",
  "시각",
  "SNS",
  "내부업무",
  "RGB내부업무",
  "RGB외부업무",
  "3D영상",
  "촬영영상",
  "모션영상",
] as const;

export const LEAVE_TYPES = [
  "연차",
  "오전반차",
  "오후반차",
  "오전반반차",
  "오후반반차",
] as const;

export const LEAVE_LABEL_SHORT: Record<string, string> = {
  연차: "연차",
  반차: "반차",
  오전반차: "오전반차",
  오후반차: "오후반차",
  반반차: "반반차",
  오전반반차: "오전반반차",
  오후반반차: "오후반반차",
};

export const GRADE_ORDER: Record<string, number> = {
  팀장: 0,
  차장: 1,
  과장: 2,
  대리과장: 3,
  대리: 4,
  주임: 5,
  사원: 6,
};

export const DEFAULT_GRADE_DAILY_RATE: Record<string, number> = {
  팀장: 65,
  차장: 60,
  과장: 55,
  대리과장: 50,
  대리: 45,
  주임: 40,
  사원: 35,
};

/** 홈페이지·전자카탈로그 견적 디자인/퍼블 고정 배분 */
export const FIXED_ESTIMATE_SPLIT_RATIO: Record<
  string,
  { designPct: number; publishPct: number }
> = {
  홈페이지: { designPct: 70, publishPct: 30 },
  전자카탈로그: { designPct: 70, publishPct: 30 },
};

export const GRADE_OPTIONS_FOR_ESTIMATE = [
  "사원",
  "주임",
  "대리",
  "대리과장",
  "과장",
  "차장",
  "팀장",
] as const;

export const DESIGN_KEYWORDS = ["디자인"];
export const PUBLISH_KEYWORDS = ["퍼블리싱", "퍼블", "유지보수"];
export const STAGE_FALLBACK_ROLE: Record<string, string> = {
  시안: "디자인",
  본작업: "디자인",
  수정중: "디자인",
  제작중: "퍼블",
};

export const STAGE_TO_SUMMARY_ROW: Record<string, string> = {
  시안: "시안",
  본작업: "본작업",
  수정중: "수정",
  제작중: "본작업",
};

export const STAGE_RANK: Record<string, number> = {
  시안: 1,
  본작업: 2,
  수정중: 3,
  제작중: 4,
};

export const STAGE_BADGE_TEXT: Record<string, string> = {
  시안: "시안",
  본작업: "본작",
  수정중: "수정",
  제작중: "제작",
};

export const MAJORS = ["디자인", "동영상"] as const;

export const DEFAULT_PROJECT_TYPES_BY_MAJOR: Record<string, string[]> = {
  디자인: [
    "홈페이지",
    "전자카탈로그",
    "종이카탈로그",
    "브랜드",
    "시각",
    "SNS",
    "RGB내부업무",
    "RGB외부업무",
  ],
  동영상: [
    "3D영상",
    "촬영영상",
    "모션영상",
    "RGB내부업무",
    "RGB외부업무",
  ],
};

export const DESIGN_GRID: [number, number][] = [
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 2],
  [3, 1],
  [3, 2],
  [3, 3],
];

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

export const TASK_STAGE_SUFFIX =
  /[_\s]*(시안|본작업|수정|수정중|제작중|전체작업|기획|미팅|회의|발주|서치)+\s*(및\s*(발주|수정))?\s*$/;

export function computeProject(category: string, subtype?: string) {
  return HAS_SUBTYPE.has(category) && subtype
    ? `${category} · ${subtype}`
    : category;
}

export function leaveKey(name: string, dateStr: string) {
  return `${name}|||${dateStr}`;
}

export function projectKey(company: string, project: string) {
  return `${company}|||${project}`;
}
