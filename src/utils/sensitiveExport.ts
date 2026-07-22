const DEFAULT_SENSITIVE_DETAILS = [
  '현장 메모와 조치 내용',
  '주소, 연락처, 대상물 정보',
  '사진과 위치 기록',
];

export function buildSensitiveExportMessage(actionLabel: string, details = DEFAULT_SENSITIVE_DETAILS): string {
  const detailLines = details.map(detail => `- ${detail}`).join('\n');
  return [
    `${actionLabel}에는 민감정보가 포함될 수 있습니다.`,
    '',
    '포함 가능 정보:',
    detailLines,
    '',
    '공유 대상과 저장 위치를 확인한 뒤 진행하세요.',
    '계속하시겠습니까?',
  ].join('\n');
}
