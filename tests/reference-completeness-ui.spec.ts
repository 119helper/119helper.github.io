import { expect, test } from '@playwright/test';

test('ERG와 중증도 분류는 판본·국내 SOP 대조 한계를 상시 표시한다', async ({ page }) => {
  await page.goto('/#calculator?subId=hazmat_calc');
  await expect(page.getByText('교육용 시각화 · 공식 수치 대조 미완료')).toBeVisible();
  await expect(page.getByRole('link', { name: '공식 ERG 확인' })).toHaveAttribute(
    'href',
    /phmsa\.dot\.gov\/training\/hazmat\/erg/,
  );

  await page.goto('/?tab=triage');
  await expect(page.getByText(/국내 기관 SOP 대조 미완료/)).toBeVisible();
  await expect(page.getByText(/국내 현장의 성인·소아 연령 경계/)).toBeVisible();
});

test('장비와 심신건강 참고자료는 검증되지 않은 단일 기준·절단점을 판정하지 않는다', async ({ page }) => {
  await page.goto('/?tab=checklist');
  await expect(page.getByText('공통 점검 참고표 · 장비별 공식 점검표 대조 미완료')).toBeVisible();
  await expect(page.getByText(/단일 잔압 수치를 모든 공기호흡기에 적용하지 않습니다/)).toBeVisible();
  await expect(page.getByText(/250bar/)).toHaveCount(0);

  await page.goto('/?tab=safety-monitor');
  await page.getByRole('button', { name: '심신건강' }).click();
  await expect(page.getByText(/검증된 선별도구나 진단·위험도 판정이 아닙니다/)).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText('비검증 참고 점수')).toBeVisible();
  await expect(page.getByText(/검증된 임상 절단점이 없습니다/)).toBeVisible();
});
