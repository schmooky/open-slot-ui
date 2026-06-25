export function getSeparatorAfter(digits: number, every: number, decimals = 0): number[] {
  if (!every || every < 1 || digits < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < digits - 1; i++) {
    const placeFromRight = digits - 1 - i;
    const integerPlace = placeFromRight - decimals;
    if (integerPlace > 0 && integerPlace % every === 0) out.push(i);
  }
  return out;
}

export function getDecimalSeparatorAfter(digits: number, decimals: number): number {
  if (decimals <= 0 || decimals >= digits) return -1;
  return digits - decimals - 1;
}

export interface LayoutResult {
  columnX: number[];
  separatorX: number[];
  totalWidth: number;
}

export function placeColumns(
  digits: number,
  digitWidth: number,
  separatorAfterColumns: number[],
  separatorWidth: number,
): LayoutResult {
  const columnX = new Array<number>(digits);
  const separatorX: number[] = [];
  let x = 0;
  let sepIdx = 0;
  for (let i = 0; i < digits; i++) {
    columnX[i] = x;
    x += digitWidth;
    if (sepIdx < separatorAfterColumns.length && separatorAfterColumns[sepIdx] === i) {
      separatorX.push(x);
      x += separatorWidth;
      sepIdx++;
    }
  }
  return { columnX, separatorX, totalWidth: x };
}

export function digitAtPlace(value: number, place: number): number {
  return Math.floor(Math.abs(value) / Math.pow(10, place)) % 10;
}

export function leadingZeroCount(value: number, digits: number, decimals = 0): number {
  const integerDigits = digits - decimals;
  if (integerDigits <= 0) return 0;
  const integerValue = Math.floor(Math.abs(value) / Math.pow(10, decimals));
  if (integerValue <= 0) return integerDigits - 1;
  let count = 0;
  for (let i = integerDigits - 1; i > 0; i--) {
    if (Math.floor(integerValue / Math.pow(10, i)) % 10 === 0) count++;
    else break;
  }
  return count;
}
