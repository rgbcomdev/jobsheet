const STAGE_RULE_GROUPS: {
  stage: string;
  pattern: RegExp;
  exceptPattern?: RegExp;
}[] = [
  {
    stage: "제작중",
    pattern: /번역|내레이션|영문|중문|일어|오디오/,
    exceptPattern: /국문\s*수정/,
  },
  { stage: "시안", pattern: /서치|시나리오|기획|내용정리|레퍼런스/ },
  { stage: "본작업", pattern: /편집|모델링|모션|촬영/ },
  { stage: "수정중", pattern: /수정/ },
];

export function suggestVideoStage(note: string): string | null {
  if (!note) return null;
  const producing = STAGE_RULE_GROUPS[0];
  if (
    producing.pattern.test(note) &&
    !(producing.exceptPattern && producing.exceptPattern.test(note))
  ) {
    return "제작중";
  }
  let bestIndex = Infinity;
  let bestStage: string | null = null;
  for (let g = 1; g < STAGE_RULE_GROUPS.length; g++) {
    const { stage, pattern } = STAGE_RULE_GROUPS[g];
    const re = new RegExp(pattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(note))) {
      if (m.index < bestIndex) {
        bestIndex = m.index;
        bestStage = stage;
      }
    }
  }
  return bestStage;
}

const DESIGN_TEAM_MISMATCH_PATTERN =
  /모델링|텍스처|라이팅(?!\s*수정)|렌더링|3D|모션그래픽|촬영\s*(영상|타임테이블)|내레이션|더빙/;

export function findDesignTeamMismatch(note: string): string | null {
  if (!note) return null;
  const m = note.match(DESIGN_TEAM_MISMATCH_PATTERN);
  return m ? m[0] : null;
}

export function stageRuleWarning(
  owner: string,
  note: string,
  stage: string,
  employees: Record<string, string[]>
): string | null {
  const videoTeam = employees["영상"] || [];
  const designTeam = employees["디자인"] || [];
  if (videoTeam.includes(owner)) {
    const suggested = suggestVideoStage(note);
    if (suggested && suggested !== stage) {
      return `⚠ 규칙상 "${suggested}"이(가) 권장됩니다 (지금 선택: "${stage}")`;
    }
    return null;
  }
  if (designTeam.includes(owner)) {
    const mismatch = findDesignTeamMismatch(note);
    if (mismatch) {
      return `⚠ "${mismatch}"은(는) 영상팀 전용 작업 키워드입니다. 담당자·카테고리를 다시 확인해주세요.`;
    }
  }
  return null;
}
