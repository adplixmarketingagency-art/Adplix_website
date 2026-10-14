export function sortNewest(items, getDate = (item) => item?.createdAt) {
  return [...(Array.isArray(items) ? items : [])]
    .map((item, index) => ({ item, index, time: Date.parse(getDate(item) || '') }))
    .sort((a, b) => {
      if (Number.isFinite(a.time) && Number.isFinite(b.time) && a.time !== b.time) return b.time - a.time
      if (Number.isFinite(a.time) !== Number.isFinite(b.time)) return Number.isFinite(b.time) ? 1 : -1
      return a.index - b.index
    })
    .map(({ item }) => item)
}
