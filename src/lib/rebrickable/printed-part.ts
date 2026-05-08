/**
 * Rebrickable 用零件编号中的 `pr` 段标识「带印刷的变体」
 *（例如素色 3001 与印刷版 3001pr0001），与贴纸等其它分类无关。
 */
const printedVariantPartNum = /[0-9a-zA-Z]pr[0-9a-zA-Z]/;

export function isPrintedVariantPartNum(partNum: string): boolean {
  return printedVariantPartNum.test(partNum.trim());
}
