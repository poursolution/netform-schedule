import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';

import {
  aggregateQuarterlyReport,
  generateExcelBlob,
  SETTLEMENT_ASSIGNEES,
} from '../src/utils/quarterlyReport.js';

async function readGeneratedWorkbook(report, opts) {
  const blob = await generateExcelBlob(report, opts);
  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  return XLSX.read(await blob.arrayBuffer(), {
    type: 'array',
    cellFormula: true,
    cellStyles: true,
  });
}

test('empty-quarter Excel remains valid and shows all assignees as zero', async () => {
  const report = aggregateQuarterlyReport({ ptSchedules: [] }, 2026, 2);
  const workbook = await readGeneratedWorkbook(report);
  const sheet = workbook.Sheets.pt;

  assert.deepEqual(workbook.SheetNames, ['pt']);
  assert.equal(sheet['!ref'], 'A1:S8');
  assert.equal(sheet.J8.v, '합계');
  assert.equal(sheet.K8.v, 0);
  assert.equal(sheet.L8.v, 0);
  assert.equal(sheet.M8.v, 0);
  assert.equal(sheet.N8.v, 0);
  assert.equal(sheet.K2.f, 'COUNTIF($G$2:$G$2,J2)');
  assert.equal(sheet.M2.f, 'COUNTIF($R$2:$R$2,J2)');
  assert.equal(SETTLEMENT_ASSIGNEES.length, 6);
});

test('Excel detail and summary stay consistent for duplicate assignee input', async () => {
  const report = aggregateQuarterlyReport({
    ptSchedules: [{
      id: 'duplicate-assignee',
      date: '2026-05-16',
      siteName: '=위험문자도 텍스트로 저장',
      workType: '옥상',
      ptAssignee: '한준엽/한준엽',
      result: '승',
      kaptVerified: { status: 'verified' },
      settlement: { 한준엽: { requested: true } },
    }],
  }, 2026, 2);
  const workbook = await readGeneratedWorkbook(report);
  const sheet = workbook.Sheets.pt;

  assert.equal(report.totals.ptCount, 1);
  assert.equal(report.totals.weekendCount, 1);
  assert.equal(sheet.C2.t, 's');
  assert.equal(sheet.C2.v, '=위험문자도 텍스트로 저장');
  assert.equal(sheet.K4.v, 1);
  assert.equal(sheet.L4.v, 500000);
  assert.equal(sheet.M4.v, 1);
  assert.equal(sheet.N4.v, 1.5);
});

test('amount-excluded Excel contains no monetary values or SUMIF formula', async () => {
  const report = aggregateQuarterlyReport({
    ptSchedules: [{
      id: 'no-amount',
      date: '2026-05-11',
      siteName: '금액 제외 테스트',
      ptAssignee: '한준엽',
      result: '승',
      kaptVerified: { status: 'verified' },
      settlement: { 한준엽: { requested: true } },
    }],
  }, 2026, 2);
  const workbook = await readGeneratedWorkbook(report, { includeAmounts: false });
  const sheet = workbook.Sheets.pt;

  assert.equal(sheet.L1.v, '정산금액(제외)');
  assert.equal(sheet.F2.v, '');
  assert.equal(sheet.L4.v, '');
  assert.equal(sheet.L4.f, undefined);
  assert.equal(sheet.L8.v, '');
  assert.equal(sheet.L8.f, undefined);
});
