export function queryFactory(url: string) {
  return (payload: object) => ({
    url,
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  })
}
