export function sortArchiveItemsByCost(items, getCost = item => item?.cost) {
  return [...items].sort((left, right) => {
    const leftValue = getCost(left);
    const rightValue = getCost(right);
    const leftCost = leftValue == null ? NaN : Number(leftValue);
    const rightCost = rightValue == null ? NaN : Number(rightValue);
    const normalizedLeft = Number.isFinite(leftCost) ? leftCost : Infinity;
    const normalizedRight = Number.isFinite(rightCost) ? rightCost : Infinity;
    return normalizedLeft - normalizedRight;
  });
}
