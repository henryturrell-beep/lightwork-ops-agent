// ─── JSONBin.io cloud storage ─────────────────────────────────────────────────
// Set VITE_JSONBIN_BIN_ID and VITE_JSONBIN_API_KEY in your .env file.
// Create a bin at https://jsonbin.io — paste the bin ID and master key below.

const BIN_ID  = import.meta.env.VITE_JSONBIN_BIN_ID  ?? 'PLACEHOLDER_BIN_ID'
const API_KEY = import.meta.env.VITE_JSONBIN_API_KEY ?? 'PLACEHOLDER_API_KEY'
const BASE    = `https://api.jsonbin.io/v3/b/${BIN_ID}`

export async function loadData() {
  const res = await fetch(`${BASE}/latest`, {
    headers: { 'X-Master-Key': API_KEY },
  })
  if (!res.ok) throw new Error(`JSONBin load failed: ${res.status}`)
  const json = await res.json()
  return json.record?.commitments ?? []
}

export async function saveData(commitments) {
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': API_KEY,
    },
    body: JSON.stringify({ commitments }),
  })
  if (!res.ok) throw new Error(`JSONBin save failed: ${res.status}`)
}
